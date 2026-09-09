begin;
select pg_advisory_xact_lock(842106001);

create table public.tutor_billing_rates (
 tutor_id uuid primary key references public.profiles(id) on delete cascade,
 hourly_rate numeric(12,2) not null check(hourly_rate between 0 and 1000000),
 updated_at timestamptz not null default now(), updated_by uuid references public.profiles(id) on delete set null
);
create table public.tutor_student_billing_rates (
 tutor_id uuid references public.profiles(id) on delete cascade,
 student_id uuid references public.profiles(id) on delete cascade,
 hourly_rate numeric(12,2) not null check(hourly_rate between 0 and 1000000),
 updated_at timestamptz not null default now(), updated_by uuid references public.profiles(id) on delete set null,
 primary key(tutor_id,student_id)
);
alter table public.tutor_billing_rates enable row level security;
alter table public.tutor_student_billing_rates enable row level security;
revoke all on public.tutor_billing_rates,public.tutor_student_billing_rates from public,anon,authenticated;
grant select on public.tutor_billing_rates,public.tutor_student_billing_rates to authenticated;
create policy rate_admin_read on public.tutor_billing_rates for select to authenticated using(private.is_admin());
create policy pair_rate_admin_read on public.tutor_student_billing_rates for select to authenticated using(private.is_admin());
create function public.admin_set_tutor_rate(p_tutor uuid,p_rate numeric) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.is_admin() then raise exception 'Forbidden' using errcode='42501'; end if;
 perform 1 from public.profiles where id=p_tutor and role in ('tutor','admin') and account_status='active' for share;
 if not found then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_rate is not null and (p_rate not between 0 and 1000000 or p_rate<>round(p_rate,2)) then raise exception 'Invalid rate' using errcode='22023'; end if;
 if p_rate is null then delete from public.tutor_billing_rates where tutor_id=p_tutor;
 else insert into public.tutor_billing_rates values(p_tutor,p_rate,now(),auth.uid()) on conflict(tutor_id) do update set hourly_rate=excluded.hourly_rate,updated_at=excluded.updated_at,updated_by=excluded.updated_by; end if;
end $$;
create function public.admin_set_tutor_student_rate(p_owner uuid,p_lesson uuid,p_rate numeric) returns void language plpgsql security definer set search_path='' as $$
declare student uuid;
begin
 if auth.uid() is null or not private.is_admin() then raise exception 'Forbidden' using errcode='42501'; end if;
 perform private.schedule_require_owner(p_owner);
 select student_id into student from public.lessons where id=p_lesson and tutor_id=p_owner for share;
 if student is null then raise exception 'Forbidden' using errcode='42501'; end if;
 perform 1 from public.profiles where id=student and role='student' and account_status='active' for share;
 if not found then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_rate is not null and (p_rate not between 0 and 1000000 or p_rate<>round(p_rate,2)) then raise exception 'Invalid rate' using errcode='22023'; end if;
 if p_rate is null then delete from public.tutor_student_billing_rates where tutor_id=p_owner and student_id=student;
 else insert into public.tutor_student_billing_rates values(p_owner,student,p_rate,now(),auth.uid()) on conflict(tutor_id,student_id) do update set hourly_rate=excluded.hourly_rate,updated_at=excluded.updated_at,updated_by=excluded.updated_by; end if;
end $$;
revoke all on function public.admin_set_tutor_rate(uuid,numeric),public.admin_set_tutor_student_rate(uuid,uuid,numeric) from public,anon;
grant execute on function public.admin_set_tutor_rate(uuid,numeric),public.admin_set_tutor_student_rate(uuid,uuid,numeric) to authenticated;
create function private.effective_hourly_rate(p_tutor uuid,p_student uuid) returns numeric language sql stable security definer set search_path='' as $$
 select coalesce((select hourly_rate from public.tutor_student_billing_rates where tutor_id=p_tutor and student_id=p_student),(select hourly_rate from public.tutor_billing_rates where tutor_id=p_tutor),(select hourly_rate from public.app_settings where id=true));
$$;
alter table public.lessons add column hourly_rate_snapshot numeric(12,2) check(hourly_rate_snapshot between 0 and 1000000);
-- No historical rate ledger exists: legacy completions receive today's global rate once.
update public.lessons set hourly_rate_snapshot=private.effective_hourly_rate(tutor_id,student_id) where completed_at is not null;
create function private.capture_lesson_rate() returns trigger language plpgsql security definer set search_path='' as $$
declare restored jsonb; row_data jsonb;
begin
 if new.completed_at is null then new.hourly_rate_snapshot=null; return new; end if;
 restored=nullif(current_setting('tutorgate.restore',true),'')::jsonb;
 if restored is not null and restored->>'signature'=private.sign_schedule(restored->'payload') then
 select r into row_data from jsonb_array_elements(restored->'payload'->'lessons') r where r->>'id'=new.id::text and r->>'tutor_id'=new.tutor_id::text and r->>'student_id'=new.student_id::text and (r->>'completed_at')::timestamptz=new.completed_at;
 if row_data->>'hourly_rate_snapshot' is not null then new.hourly_rate_snapshot=(row_data->>'hourly_rate_snapshot')::numeric; return new; end if;
 end if;
 if tg_op='UPDATE' and old.completed_at is not null then new.hourly_rate_snapshot=old.hourly_rate_snapshot;
 else new.hourly_rate_snapshot=private.effective_hourly_rate(new.tutor_id,new.student_id); end if;
 return new;
end $$;
-- Runs after activity/validation triggers, which may clear completed_at.
create trigger zz_capture_lesson_rate before insert or update on public.lessons for each row execute function private.capture_lesson_rate();
alter table public.lessons add constraint lesson_completed_rate check((completed_at is null)=(hourly_rate_snapshot is null));
revoke all on function private.effective_hourly_rate(uuid,uuid),private.capture_lesson_rate() from public,anon,authenticated;

-- JSON numbers must round-trip through JavaScript without changing signed numeric scale.
create or replace function private.schedule_snapshot(p_owner uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('owner',p_owner,'lessons',coalesce((select jsonb_agg(to_jsonb(l)||jsonb_build_object('hourly_rate_snapshot',l.hourly_rate_snapshot::double precision,'note',coalesce(n.note,'')) order by l.id) from public.lessons l left join public.lesson_private_notes n on n.lesson_id=l.id where l.tutor_id=p_owner),'[]'::jsonb),
 'rules',coalesce((select jsonb_agg(to_jsonb(a) order by student_id) from public.tutor_student_availability a where tutor_id=p_owner),'[]'::jsonb),
 'offset',coalesce((select msk_offset_hours from public.user_schedule_preferences where user_id=p_owner),0));
$$;

-- Separate metadata prevents existing preference UPDATE grants from bypassing verified uploads.
create table public.schedule_backgrounds (
 owner_id uuid primary key references public.profiles(id) on delete cascade,
 storage_path text not null unique, mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm')),
 kind text not null check(kind in ('image','video')), updated_at timestamptz not null default now()
);
alter table public.schedule_backgrounds enable row level security;
revoke all on public.schedule_backgrounds from public,anon,authenticated;
create table private.schedule_background_uploads(id uuid primary key,owner_id uuid not null references public.profiles(id) on delete cascade,storage_path text not null unique,claimed_size bigint not null check(claimed_size between 1 and 7340032),expires_at timestamptz not null default now()+interval '1 hour');
create table private.schedule_background_gc(storage_path text primary key,not_before timestamptz not null default now());
revoke all on private.schedule_background_uploads,private.schedule_background_gc from public,anon,authenticated;
create function private.background_owner(p_actor uuid,p_owner uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_actor is distinct from p_owner then raise exception 'Forbidden' using errcode='42501'; end if;
 perform 1 from public.profiles where id=p_actor and role in ('tutor','admin') and account_status='active' for share;
 if not found then raise exception 'Forbidden' using errcode='42501'; end if;
end $$;
create function public.schedule_background_prepare(p_actor uuid,p_owner uuid,p_id uuid,p_size bigint) returns text language plpgsql security definer set search_path='' as $$
declare path text;
begin
 perform private.background_owner(p_actor,p_owner);
 if (select count(*) from private.schedule_background_uploads where owner_id=p_owner and expires_at>now())>=20 then raise exception 'Upload limit'; end if;
 path=p_owner::text||'/'||p_id::text;
 insert into private.schedule_background_uploads(id,owner_id,storage_path,claimed_size) values(p_id,p_owner,path,p_size);
 insert into private.schedule_background_gc values(path,now()+interval '3 hours');
 return path;
end $$;
create function public.schedule_background_upload(p_actor uuid,p_owner uuid,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.background_owner(p_actor,p_owner);
 return (select to_jsonb(u) from private.schedule_background_uploads u where id=p_id and owner_id=p_owner and expires_at>now());
end $$;
create function public.schedule_background_set(p_actor uuid,p_owner uuid,p_id uuid,p_mime text) returns void language plpgsql security definer set search_path='' as $$
declare u private.schedule_background_uploads;
begin
 perform private.background_owner(p_actor,p_owner);
 perform 1 from public.profiles where id=p_owner for update;
 if p_id is null then delete from public.schedule_backgrounds where owner_id=p_owner; return; end if;
 select * into u from private.schedule_background_uploads where id=p_id and owner_id=p_owner and expires_at>now() for update;
 if not found then raise exception 'Invalid upload' using errcode='42501'; end if;
 insert into public.schedule_backgrounds values(p_owner,u.storage_path,p_mime,case when p_mime like 'video/%' then 'video' else 'image' end,now()) on conflict(owner_id) do update set storage_path=excluded.storage_path,mime_type=excluded.mime_type,kind=excluded.kind,updated_at=excluded.updated_at;
 delete from private.schedule_background_uploads where id=p_id;
end $$;
create function public.schedule_background_read(p_owner uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.schedule_require_owner(p_owner);
 return (select to_jsonb(b) from public.schedule_backgrounds b where owner_id=p_owner);
end $$;
-- Keep the collection deadline beyond signed-upload expiry, including replacement and deletion.
create function private.schedule_background_removed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.schedule_background_gc values(old.storage_path,now()) on conflict(storage_path) do update set not_before=greatest(private.schedule_background_gc.not_before,now()); return null;
end $$;
create trigger schedule_background_removed after delete or update on public.schedule_backgrounds for each row execute function private.schedule_background_removed();
create function public.schedule_background_gc_paths() returns text[] language sql security definer set search_path='' as $$
 select coalesce(array_agg(storage_path),'{}') from (select g.storage_path from private.schedule_background_gc g where not_before<now() and not exists(select 1 from public.schedule_backgrounds b where b.storage_path=g.storage_path) and not exists(select 1 from private.schedule_background_uploads u where u.storage_path=g.storage_path and expires_at>now()) limit 100) x;
$$;
create function public.schedule_background_gc_done(p_paths text[]) returns void language sql security definer set search_path='' as $$ delete from private.schedule_background_uploads where storage_path=any(p_paths) and expires_at<now(); delete from private.schedule_background_gc where storage_path=any(p_paths); $$;
revoke all on function private.background_owner(uuid,uuid),private.schedule_background_removed() from public,anon,authenticated;
revoke all on function public.schedule_background_prepare(uuid,uuid,uuid,bigint),public.schedule_background_upload(uuid,uuid,uuid),public.schedule_background_set(uuid,uuid,uuid,text),public.schedule_background_gc_paths(),public.schedule_background_gc_done(text[]) from public,anon,authenticated;
grant execute on function public.schedule_background_prepare(uuid,uuid,uuid,bigint),public.schedule_background_upload(uuid,uuid,uuid),public.schedule_background_set(uuid,uuid,uuid,text),public.schedule_background_gc_paths(),public.schedule_background_gc_done(text[]) to service_role;
revoke all on function public.schedule_background_read(uuid) from public,anon;
grant execute on function public.schedule_background_read(uuid) to authenticated;
do $$ begin
 if to_regclass('storage.buckets') is not null then
 insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('schedule-backgrounds','schedule-backgrounds',false,7340032,array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm']) on conflict(id) do update set public=false,file_size_limit=7340032,allowed_mime_types=excluded.allowed_mime_types;
 end if;
end $$;

alter table public.chat_attachments drop constraint chat_attachments_kind_check;
alter table public.chat_attachments add constraint chat_attachments_kind_check check(kind in ('image','file','animation','sticker_static','sticker_animated','sticker_video'));


create function private.chat_runs_plain(p_runs jsonb,p_legacy boolean default false) returns text language plpgsql immutable set search_path='' as $$
declare n jsonb; m jsonb; result text='';
begin
 if jsonb_typeof(p_runs) is distinct from 'array' then raise exception 'Invalid runs' using errcode='22023'; end if;
 if jsonb_array_length(p_runs)>4000 then raise exception 'Too many runs' using errcode='22023'; end if;
 for n in select value from jsonb_array_elements(p_runs) loop
 if jsonb_typeof(n) is distinct from 'object' or n-'text'-'marks'<>'{}'::jsonb or jsonb_typeof(n->'text') is distinct from 'string' or jsonb_typeof(n->'marks') is distinct from 'array' then raise exception 'Invalid run' using errcode='22023'; end if;
 if jsonb_array_length(n->'marks')>7 then raise exception 'Invalid marks' using errcode='22023'; end if;
 for m in select value from jsonb_array_elements(n->'marks') loop
 if jsonb_typeof(m) is distinct from 'object' or m-'type'-'href'<>'{}'::jsonb or m->>'type' is null or m->>'type' not in ('bold','italic','underline','strike','code','link','blockquote') or (m->>'type'='blockquote' and not p_legacy) or (m->>'type'='link' and (coalesce(m->>'href','') !~ '^https?://[^[:space:][:cntrl:]]+$' or length(m->>'href')>2048)) then raise exception 'Invalid mark' using errcode='22023'; end if;
 end loop;
 result=result||(n->>'text');
 if char_length(result)>4000 then raise exception 'Too long' using errcode='22023'; end if;
 end loop;
 return result;
end $$;
create function private.chat_content_plain(p_content jsonb) returns text language plpgsql immutable set search_path='' as $$
declare b jsonb; item jsonb; result text=''; part text; first_block boolean=true; first_item boolean;
begin
 if jsonb_typeof(p_content)='array' then return private.chat_runs_plain(p_content,true); end if;
 if jsonb_typeof(p_content) is distinct from 'object' or p_content-'version'-'blocks'<>'{}'::jsonb or p_content->'version' is distinct from '2'::jsonb or jsonb_typeof(p_content->'blocks') is distinct from 'array' then raise exception 'Invalid document' using errcode='22023'; end if;
 if jsonb_array_length(p_content->'blocks')>500 then raise exception 'Too many blocks' using errcode='22023'; end if;
 for b in select value from jsonb_array_elements(p_content->'blocks') loop
 if b->>'type' in ('paragraph','blockquote') then
 if b-'type'-'align'-'content'<>'{}'::jsonb or (b->>'type'='paragraph' and coalesce(b->>'align','') not in ('left','center','right')) or (b->>'type'='blockquote' and b ? 'align') then raise exception 'Invalid block' using errcode='22023'; end if;
 part=private.chat_runs_plain(b->'content');
 elsif b->>'type'='code_block' then
 if b-'type'-'language'-'text'<>'{}'::jsonb or jsonb_typeof(b->'text') is distinct from 'string' or (b ? 'language' and (coalesce(b->>'language','') !~ '^[A-Za-z0-9_+#.-]{1,40}$')) then raise exception 'Invalid code' using errcode='22023'; end if;
 part=b->>'text';
 elsif b->>'type' in ('ordered_list','bullet_list') then
 if b-'type'-'items'<>'{}'::jsonb or jsonb_typeof(b->'items') is distinct from 'array' then raise exception 'Invalid list' using errcode='22023'; end if;
 if jsonb_array_length(b->'items')>500 then raise exception 'Too many items' using errcode='22023'; end if;
 part='';first_item=true;
 for item in select value from jsonb_array_elements(b->'items') loop
 if item-'content'<>'{}'::jsonb then raise exception 'Invalid item' using errcode='22023'; end if;
 if not first_item then part=part||E'\n'; end if;first_item=false;
 part=part||private.chat_runs_plain(item->'content');
 end loop;
 else raise exception 'Invalid node' using errcode='22023'; end if;
 if not first_block then result=result||E'\n'; end if;first_block=false;
 result=result||part;
 if char_length(result)>4000 then raise exception 'Too long' using errcode='22023'; end if;
 end loop;
 return result;
end $$;
create function private.chat_content_blocks(p_content jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
begin
 perform private.chat_content_plain(p_content);
 if jsonb_typeof(p_content)='array' then
 if exists(select 1 from jsonb_array_elements(p_content) r,jsonb_array_elements(r->'marks') m where m->>'type'='blockquote') then
 return jsonb_build_array(jsonb_build_object('type','blockquote','content',(select jsonb_agg(jsonb_set(r,'{marks}',coalesce((select jsonb_agg(m) from jsonb_array_elements(r->'marks') m where m->>'type'<>'blockquote'),'[]'::jsonb))) from jsonb_array_elements(p_content) r)));
 end if;
 return jsonb_build_array(jsonb_build_object('type','paragraph','align','left','content',p_content));
 end if;
 return p_content->'blocks';
end $$;
revoke all on function private.chat_runs_plain(jsonb,boolean),private.chat_content_plain(jsonb),private.chat_content_blocks(jsonb) from public,anon,authenticated;

create or replace function public.chat_send_rich(p_student uuid,p_content jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid=private.chat_require_tutor(); m public.chat_messages; txt text; n jsonb; mark jsonb;
begin
 txt=private.chat_content_plain(p_content);
 if txt is null or char_length(txt)>4000 or char_length(btrim(txt))=0 then raise exception 'Invalid text' using errcode='22023'; end if;
 m=private.chat_append(p_student,actor,'tutor',txt);
 update public.chat_messages set content=jsonb_build_object('version',2,'blocks',private.chat_content_blocks(p_content)),body=txt where id=m.id returning * into m;
 return to_jsonb(m)-'conversation_id';
end $$;

create or replace function public.chat_finalize_uploads(p_actor uuid,p_student uuid,p_content jsonb,p_files jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.chat_messages; f jsonb; u private.chat_uploads; txt text;
begin
 perform private.chat_lock_pair(p_student,p_actor);
 if jsonb_array_length(p_files) not between 1 and 10 then raise exception 'Invalid files'; end if;
 txt=private.chat_content_plain(p_content);
 if char_length(coalesce(txt,''))>4000 then raise exception 'Invalid text'; end if;
 m=private.chat_append(p_student,p_actor,'tutor',coalesce(txt,''));
 update public.chat_messages set content=jsonb_build_object('version',2,'blocks',private.chat_content_blocks(p_content)) where id=m.id returning * into m;
 for f in select value from jsonb_array_elements(p_files) loop
 select * into u from private.chat_uploads where id=(f->>'id')::uuid and actor_id=p_actor and student_id=p_student and expires_at>now() for update;
 if not found or u.claimed_size<>(f->>'size')::bigint then raise exception 'Invalid upload' using errcode='42501'; end if;
 insert into public.chat_attachments(id,message_id,storage_path,original_name,mime_type,size_bytes,kind) values(u.id,m.id,u.storage_path,u.original_name,f->>'type',(f->>'size')::bigint,case when f->>'type' in ('image/jpeg','image/png','image/gif','image/webp') then 'image' else 'file' end);
 delete from private.chat_uploads where id=u.id;
 end loop;
 return to_jsonb(m)-'conversation_id';
end $$;

create or replace function public.chat_bot_receive_rich(p_user text,p_chat text,p_update bigint,p_text text,p_reply bigint,p_content jsonb,p_file jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s uuid; t uuid; m public.chat_messages; previous uuid;
begin
 p_text=private.chat_content_plain(p_content);
 if p_update is null or p_update<0 then raise exception 'Invalid update' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('telegram-chat-update:'||p_update::text,0));
 select message_id into previous from private.telegram_chat_updates where telegram_update_id=p_update;
 if found then return jsonb_build_object('status','duplicate'); end if;
 select id into s from public.profiles where telegram_user_id=p_user and telegram_chat_id=p_chat and role='student' and account_status='active';
 if s is null then return jsonb_build_object('status','unlinked'); end if;
 if p_text is null or char_length(p_text)>4000 or (char_length(btrim(p_text))=0 and p_file is null) then return jsonb_build_object('status','invalid_text'); end if;
 if p_reply is not null then
 select c.tutor_id into t from private.telegram_message_links l join public.chat_messages msg on msg.id=l.message_id join public.chat_conversations c on c.id=msg.conversation_id
 where l.chat_id=p_chat and l.telegram_message_id=p_reply and c.student_id=s;
 if t is null then return jsonb_build_object('status','unavailable'); end if;
 else
 select tutor_id into t from private.telegram_chat_state where student_id=s;
 if t is null then return jsonb_build_object('status','choose'); end if;
 end if;
 if p_file is not null and not exists(select 1 from private.chat_uploads where id=(p_file->>'id')::uuid and actor_id=t and student_id=s and storage_path=p_file->>'path' and claimed_size=(p_file->>'size')::bigint and expires_at>now()) then return jsonb_build_object('status','unavailable'); end if;
 begin m:=private.chat_append(s,t,'student',p_text);
 exception when insufficient_privilege then
 delete from private.telegram_chat_state where student_id=s and tutor_id=t;
 return jsonb_build_object('status','unavailable'); end;
 update public.chat_messages set content=jsonb_build_object('version',2,'blocks',private.chat_content_blocks(p_content)) where id=m.id;
 if p_file is not null then
 insert into public.chat_attachments(id,message_id,storage_path,original_name,mime_type,size_bytes,kind)
 values((p_file->>'id')::uuid,m.id,p_file->>'path',p_file->>'name',p_file->>'type',(p_file->>'size')::bigint,coalesce(p_file->>'kind',case when p_file->>'type' in ('image/jpeg','image/png','image/webp','image/gif') then 'image' else 'file' end));
 delete from private.chat_uploads where id=(p_file->>'id')::uuid;
 end if;
 insert into private.telegram_chat_updates(telegram_update_id,message_id) values(p_update,m.id);
 return jsonb_build_object('status','sent','messageId',m.id,'studentId',s,'tutorId',t,'studentName',(select full_name from public.profiles where id=s),'text',m.body);
end $$;

create or replace function public.chat_bot_receive_album(p_user text,p_chat text,p_group text,p_update bigint,p_text text,p_content jsonb,p_file jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s uuid; a private.telegram_albums; m public.chat_messages; continuing boolean; total bigint; amount integer; result_text text;
begin
 p_text=private.chat_content_plain(p_content);
 select id into s from public.profiles where telegram_user_id=p_user and telegram_chat_id=p_chat and role='student' and account_status='active' for update;
 if s is null then return jsonb_build_object('status','unlinked'); end if;
 perform pg_advisory_xact_lock(hashtextextended('telegram-chat-update:'||p_update::text,0));
 if exists(select 1 from private.telegram_chat_updates where telegram_update_id=p_update) then return jsonb_build_object('status','duplicate'); end if;
 select * into a from private.telegram_albums where student_id=s and group_id=p_group for update;
 if not found or not private.chat_pair_active(s,a.tutor_id) or a.created_at<now()-interval '24 hours' then return jsonb_build_object('status','unavailable'); end if;
 if p_file is null or not exists(select 1 from private.chat_uploads where id=(p_file->>'id')::uuid and actor_id=a.tutor_id and student_id=s and storage_path=p_file->>'path' and claimed_size=(p_file->>'size')::bigint and expires_at>now()) then return jsonb_build_object('status','unavailable'); end if;
 select coalesce(sum(size_bytes),0),count(*) into total,amount from public.chat_attachments where message_id=a.message_id;
 if total+(p_file->>'size')::bigint>10485760 then return jsonb_build_object('status','too_large'); end if;
 if amount>=10 then return jsonb_build_object('status','too_many'); end if;
 continuing=a.message_id is not null;
 if continuing then
 select * into m from public.chat_messages where id=a.message_id for update;
 if char_length(m.body)+char_length(p_text)+(case when m.body<>'' and p_text<>'' then 1 else 0 end)>4000 then return jsonb_build_object('status','too_long'); end if;
 update public.chat_messages set body=body||case when body<>'' and p_text<>'' then E'\n' else '' end||p_text,
 content=jsonb_build_object('version',2,'blocks',case when body='' then '[]'::jsonb else private.chat_content_blocks(content) end||case when p_text='' then '[]'::jsonb else private.chat_content_blocks(p_content) end) where id=m.id returning * into m;
 else
 m=private.chat_append(s,a.tutor_id,'student',p_text);
 update public.chat_messages set content=jsonb_build_object('version',2,'blocks',private.chat_content_blocks(p_content)) where id=m.id;
 update private.telegram_albums set message_id=m.id where student_id=s and group_id=p_group;
 -- A different recipient selected while files were downloading must survive.
 delete from private.telegram_chat_state where student_id=s and tutor_id=a.tutor_id;
 delete from private.telegram_reply_state where student_id=s and telegram_message_id=a.reply_id;
 end if;
 insert into public.chat_attachments(id,message_id,storage_path,original_name,mime_type,size_bytes,kind)
 values((p_file->>'id')::uuid,m.id,p_file->>'path',p_file->>'name',p_file->>'type',(p_file->>'size')::bigint,coalesce(p_file->>'kind',case when p_file->>'type' in ('image/jpeg','image/png','image/webp','image/gif') then 'image' else 'file' end));
 delete from private.chat_uploads where id=(p_file->>'id')::uuid;
 insert into private.telegram_chat_updates(telegram_update_id,message_id) values(p_update,m.id);
 select m.body||E'\n📎 '||string_agg(original_name,', ' order by created_at,id) into result_text from public.chat_attachments where message_id=m.id;
 return jsonb_build_object('status','sent','messageId',m.id,'studentId',s,'tutorId',a.tutor_id,'studentName',(select full_name from public.profiles where id=s),'tutorName',(select full_name from public.profiles where id=a.tutor_id),'text',result_text,'replyTelegramId',a.reply_id,'originalText',a.original_text,'controlId',a.prompt_id,'albumContinuation',continuing);
end $$;

create or replace function private.chat_content_default() returns trigger language plpgsql set search_path='' as $$
begin
 if new.content is null then new.content=jsonb_build_object('version',2,'blocks',jsonb_build_array(jsonb_build_object('type','paragraph','align','left','content',jsonb_build_array(jsonb_build_object('text',new.body,'marks','[]'::jsonb))))); end if;
 return new;
end $$;
create function public.chat_bot_update_seen(p_update bigint) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from private.telegram_chat_updates where telegram_update_id=p_update); $$;
revoke all on function public.chat_bot_update_seen(bigint) from public,anon,authenticated;
grant execute on function public.chat_bot_update_seen(bigint) to service_role;
commit;
