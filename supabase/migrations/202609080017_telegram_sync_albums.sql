begin;
-- This guard reads private state even when a service-role client updates profiles.
alter function private.deleting_profile_locked() security definer;

create table private.telegram_albums (
 student_id uuid not null references public.profiles(id) on delete cascade,
 tutor_id uuid not null references public.profiles(id) on delete cascade,
 group_id text not null check(length(group_id) between 1 and 128),
 message_id uuid references public.chat_messages(id) on delete cascade,
 reply_id bigint, original_text text, prompt_id bigint,
 created_at timestamptz not null default now(),
 primary key(student_id,group_id)
);
alter table private.telegram_albums enable row level security;
revoke all on private.telegram_albums from public,anon,authenticated,service_role;

create function public.chat_bot_album_target(p_user text,p_chat text,p_group text,p_reply bigint,p_update bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s uuid; target jsonb; a private.telegram_albums; effective bigint; original text; prompt bigint;
begin
 select id into s from public.profiles where telegram_user_id=p_user and telegram_chat_id=p_chat and role='student' and account_status='active' for update;
 if s is null then return jsonb_build_object('status','unlinked'); end if;
 if exists(select 1 from private.telegram_chat_updates where telegram_update_id=p_update) then return jsonb_build_object('status','duplicate'); end if;
 select * into a from private.telegram_albums where student_id=s and group_id=p_group;
 if not found then
 effective=coalesce(p_reply,public.chat_bot_reply_context(p_user,p_chat));
 target=public.chat_bot_media_target(p_user,p_chat,effective);
 if target->>'status'<>'ok' then return target; end if;
 select m.body into original from private.telegram_message_links l join public.chat_messages m on m.id=l.message_id where l.chat_id=p_chat and l.telegram_message_id=effective;
 select message_id into prompt from private.telegram_control_messages where chat_id=p_chat;
 insert into private.telegram_albums(student_id,tutor_id,group_id,reply_id,original_text,prompt_id)
 values(s,(target->>'tutor')::uuid,p_group,effective,original,prompt) returning * into a;
 end if;
 if not private.chat_pair_active(s,a.tutor_id) or a.created_at<now()-interval '24 hours' then return jsonb_build_object('status','unavailable'); end if;
 return jsonb_build_object('status','ok','student',s,'tutor',a.tutor_id);
end $$;

create function public.chat_bot_receive_album(p_user text,p_chat text,p_group text,p_update bigint,p_text text,p_content jsonb,p_file jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s uuid; a private.telegram_albums; m public.chat_messages; continuing boolean; total bigint; amount integer; result_text text;
begin
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
 content=content||case when body<>'' and p_text<>'' then '[{"text":"\n","marks":[]}]'::jsonb else '[]'::jsonb end||p_content where id=m.id returning * into m;
 else
 m=private.chat_append(s,a.tutor_id,'student',p_text);
 update public.chat_messages set content=p_content where id=m.id;
 update private.telegram_albums set message_id=m.id where student_id=s and group_id=p_group;
 -- A different recipient selected while files were downloading must survive.
 delete from private.telegram_chat_state where student_id=s and tutor_id=a.tutor_id;
 delete from private.telegram_reply_state where student_id=s and telegram_message_id=a.reply_id;
 end if;
 insert into public.chat_attachments(id,message_id,storage_path,original_name,mime_type,size_bytes,kind)
 values((p_file->>'id')::uuid,m.id,p_file->>'path',p_file->>'name',p_file->>'type',(p_file->>'size')::bigint,case when p_file->>'type' in ('image/jpeg','image/png','image/webp','image/gif') then 'image' else 'file' end);
 delete from private.chat_uploads where id=(p_file->>'id')::uuid;
 insert into private.telegram_chat_updates(telegram_update_id,message_id) values(p_update,m.id);
 select m.body||E'\n📎 '||string_agg(original_name,', ' order by created_at,id) into result_text from public.chat_attachments where message_id=m.id;
 return jsonb_build_object('status','sent','messageId',m.id,'studentId',s,'tutorId',a.tutor_id,'studentName',(select full_name from public.profiles where id=s),'tutorName',(select full_name from public.profiles where id=a.tutor_id),'text',result_text,'replyTelegramId',a.reply_id,'originalText',a.original_text,'controlId',a.prompt_id,'albumContinuation',continuing);
end $$;
revoke all on function public.chat_bot_album_target(text,text,text,bigint,bigint),public.chat_bot_receive_album(text,text,text,bigint,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.chat_bot_album_target(text,text,text,bigint,bigint),public.chat_bot_receive_album(text,text,text,bigint,text,jsonb,jsonb) to service_role;
create function private.chat_purge_album_context() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.student_tutor_assignments where student_id=old.student_id and tutor_id=old.tutor_id) then delete from private.telegram_albums where student_id=old.student_id and tutor_id=old.tutor_id; end if;
 return null;
end $$;
create constraint trigger chat_purge_album_context after delete or update on public.student_tutor_assignments deferrable initially deferred for each row execute function private.chat_purge_album_context();
revoke all on function private.chat_purge_album_context() from public,anon,authenticated;
commit;
