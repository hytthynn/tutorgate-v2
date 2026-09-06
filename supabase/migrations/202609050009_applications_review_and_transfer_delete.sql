-- TG-009. No historical migration is edited. Apply after 008 commits.
begin;
alter table public.applications
 add column reviewed_at timestamptz,
 add column reviewed_by uuid references public.profiles(id) on delete set null,
 add column reviewed_by_name text,
 add column approved_at timestamptz,
 add column rejected_at timestamptz,
 add column registration_delivery_status text check(registration_delivery_status in ('pending','sent','failed')),
 add column registration_delivery_at timestamptz;
alter table public.applications drop constraint applications_telegram_user_id_key,
 drop constraint applications_telegram_chat_id_key;
create unique index applications_active_telegram_user on public.applications(telegram_user_id)
 where status not in ('rejected','expired');
create unique index applications_active_telegram_chat on public.applications(telegram_chat_id)
 where status not in ('rejected','expired');
create index applications_review_queue on public.applications(role,status,created_at desc,id);

-- Legacy links must not bypass review; keep registered history unchanged.
update private.one_time_tokens set used_at=coalesce(used_at,now())
 where purpose='registration' and application_id in(select id from public.applications where status='telegram_verified');
update public.applications set status='pending_review' where status='telegram_verified';

-- Durable dedupe by application/recipient, independent of Telegram update_id.
-- Claim before sending: at-most-once attempt, including ambiguous network failures.
-- No plaintext tokens or message bodies are stored here.
create table private.application_admin_notifications (
 application_id uuid not null references public.applications(id) on delete cascade,
 admin_id uuid not null references public.profiles(id) on delete cascade,
 attempted_at timestamptz, delivered_at timestamptz, failed_at timestamptz,
 primary key(application_id,admin_id));
revoke all on private.application_admin_notifications from public,anon,authenticated;
insert into private.application_admin_notifications(application_id,admin_id)
 select a.id,p.id from public.applications a cross join public.profiles p
 where a.status='pending_review' and p.role='admin' and p.telegram_chat_id is not null;

create or replace function private.expire_old_applications() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.applications a set status='expired'
 where a.status='pending_telegram' and not exists(
   select 1 from private.one_time_tokens t where t.application_id=a.id
   and t.purpose='telegram_application' and t.used_at is null and t.expires_at>now());
 return new;
end $$;

-- Remove the old signature: there is no registration hash at confirmation time.
drop function public.confirm_telegram(bigint,text,text,text,text,text);
create function public.confirm_telegram(p_update bigint,p_hash text,p_username text,p_user text,p_chat text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t private.one_time_tokens; a public.applications; u private.telegram_updates;
begin
 perform pg_advisory_xact_lock(p_update);
 select * into u from private.telegram_updates where telegram_update_id=p_update;
 if found then
   return jsonb_build_object('status',case when u.delivered_at is null then 'send' else 'done' end,'chat_id',u.chat_id,'application_id',u.application_id);
 end if;
 -- Same lock order as registration/review: application before token.
 select * into t from private.one_time_tokens where token_hash=p_hash and purpose='telegram_application';
 if not found then return jsonb_build_object('status','invalid'); end if;
 select * into a from public.applications where id=t.application_id for update;
 select * into t from private.one_time_tokens where token_hash=p_hash and purpose='telegram_application' for update;
 if t.used_at is not null then return jsonb_build_object('status','invalid'); end if;
 if t.expires_at<=now() then
   update public.applications set status='expired' where id=a.id and status='pending_telegram';
   return jsonb_build_object('status','expired');
 end if;
 if a.status<>'pending_telegram' then return jsonb_build_object('status','invalid'); end if;
 if p_username='' then return jsonb_build_object('status','no_username'); end if;
 if a.telegram_username<>lower(p_username) then return jsonb_build_object('status','mismatch'); end if;
 if p_user is distinct from p_chat or p_user !~ '^[0-9]+$' then return jsonb_build_object('status','invalid'); end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user,0));
 if exists(select 1 from public.profiles where telegram_user_id=p_user or telegram_chat_id=p_chat)
 or exists(select 1 from public.applications where id<>a.id and status not in ('rejected','expired')
   and (telegram_user_id=p_user or telegram_chat_id=p_chat)) then return jsonb_build_object('status','linked'); end if;
 update public.applications set telegram_user_id=p_user,telegram_chat_id=p_chat,telegram_verified_at=now(),status='pending_review' where id=a.id;
 update private.one_time_tokens set used_at=now() where id=t.id;
 insert into private.telegram_updates(telegram_update_id,application_id,token_hash,chat_id) values(p_update,a.id,p_hash,p_chat);
 insert into private.application_admin_notifications(application_id,admin_id)
 select a.id,id from public.profiles where role='admin' and telegram_chat_id is not null on conflict do nothing;
 return jsonb_build_object('status','send','chat_id',p_chat,'application_id',a.id);
end $$;

-- Service-only operations: p_actor comes exclusively from server getUser(),
-- never client payload. Recheck role inside every queue/review transaction.
create function public.admin_applications(p_actor uuid,p_role text,p_bucket text,p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare statuses public.application_status[];
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin') then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_role not in ('student','tutor') or p_offset<0 or p_offset>1000000 then raise exception 'Invalid filter' using errcode='22023'; end if;
 statuses=case p_bucket when 'pending_review' then array['pending_review']::public.application_status[]
 when 'approved' then array['approved','registered']::public.application_status[]
 when 'rejected' then array['rejected']::public.application_status[] else null end;
 if statuses is null then raise exception 'Invalid filter' using errcode='22023'; end if;
 return jsonb_build_object('total',(select count(*) from public.applications where role::text=p_role and status=any(statuses)),
 'items',coalesce((select jsonb_agg(item order by created_at desc,id desc) from (
 select a.created_at,a.id,jsonb_build_object(
   'id',a.id,'role',a.role,'full_name',a.full_name,'telegram_username',a.telegram_username,
   'student_goal',a.student_goal,'teaching_experience',a.teaching_experience,
   'subjects',coalesce((select jsonb_agg(s.name order by s.name) from public.application_subjects x join public.subjects s on s.id=x.subject_id where x.application_id=a.id),'[]'::jsonb),
   'created_at',a.created_at,'telegram_verified_at',a.telegram_verified_at,'status',a.status,
   'reviewed_at',a.reviewed_at,'reviewed_by_name',a.reviewed_by_name,'registered_at',a.registered_at,
   'link_expires_at',latest.expires_at,'delivery_status',a.registration_delivery_status,
   'can_resend',a.status='approved' and (latest.expires_at is null or latest.expires_at<=now() or a.registration_delivery_status='failed' or (a.registration_delivery_status='pending' and a.registration_delivery_at<now()-interval '2 minutes'))
 ) item from public.applications a
 left join lateral(select expires_at from private.one_time_tokens where application_id=a.id and purpose='registration' and used_at is null order by created_at desc limit 1) latest on true
 where a.role::text=p_role and a.status=any(statuses) order by a.created_at desc,a.id desc limit 50 offset p_offset
 ) rows),'[]'::jsonb));
end $$;

create function public.review_application(p_actor uuid,p_id uuid,p_action text,p_hash text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.applications; reviewer text; expiry timestamptz;
begin
 select full_name into reviewer from public.profiles where id=p_actor and role='admin' for share;
 if not found then raise exception 'Forbidden' using errcode='42501'; end if;
 select * into a from public.applications where id=p_id for update;
 if not found then return jsonb_build_object('status','unavailable'); end if;
 if p_action in ('approve','reject') then
   if a.status<>'pending_review' then return jsonb_build_object('status','processed'); end if;
   if a.telegram_verified_at is null or a.telegram_user_id is null or a.telegram_chat_id is null then return jsonb_build_object('status','unavailable'); end if;
   update public.applications set status=case when p_action='approve' then 'approved'::public.application_status else 'rejected'::public.application_status end,
     reviewed_at=now(),reviewed_by=p_actor,reviewed_by_name=reviewer,
     approved_at=case when p_action='approve' then now() end,rejected_at=case when p_action='reject' then now() end
   where id=a.id;
 elsif p_action='resend' then
   if a.status<>'approved' then return jsonb_build_object('status','unavailable'); end if;
   select max(expires_at) into expiry from private.one_time_tokens where application_id=a.id and purpose='registration' and used_at is null;
   if expiry>now() and a.registration_delivery_status is distinct from 'failed'
     and not (a.registration_delivery_status='pending' and a.registration_delivery_at<now()-interval '2 minutes') then
       return jsonb_build_object('status','unavailable'); end if;
 else return jsonb_build_object('status','unavailable'); end if;
 update private.one_time_tokens set used_at=now() where application_id=a.id and purpose='registration' and used_at is null;
 if p_action<>'reject' then
   if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid token hash' using errcode='22023'; end if;
   insert into private.one_time_tokens(purpose,token_hash,application_id,expires_at) values('registration',p_hash,a.id,now()+interval '24 hours');
   update public.applications set registration_delivery_status='pending',registration_delivery_at=now() where id=a.id;
 end if;
 return jsonb_build_object('status','ok','chat_id',a.telegram_chat_id);
end $$;

create function public.application_link_delivered(p_actor uuid,p_id uuid,p_hash text,p_success boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin') then raise exception 'Forbidden' using errcode='42501'; end if;
 -- A delayed response from an older send must never overwrite a newer send.
 perform 1 from public.applications where id=p_id for update;
 update public.applications set registration_delivery_status=case when p_success then 'sent' else 'failed' end,registration_delivery_at=now()
 where id=p_id and status='approved' and exists(select 1 from private.one_time_tokens where application_id=p_id and token_hash=p_hash and purpose='registration' and used_at is null);
end $$;

create function public.application_admin_recipients(p_id uuid) returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('admin_id',n.admin_id)),'[]'::jsonb)
 from private.application_admin_notifications n join public.profiles p on p.id=n.admin_id
 where n.application_id=p_id and n.attempted_at is null and p.role='admin';
$$;
create function public.claim_application_notification(p_id uuid,p_admin uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare chat text; result jsonb;
begin
 select telegram_chat_id into chat from public.profiles where id=p_admin and role='admin';
 if not found or chat is null then return null; end if;
 update private.application_admin_notifications set attempted_at=now() where application_id=p_id and admin_id=p_admin and attempted_at is null;
 if not found then return null; end if;
 select jsonb_build_object('chat_id',chat,'role',a.role,'full_name',a.full_name,'telegram_username',a.telegram_username,
   'details',coalesce(a.student_goal,a.teaching_experience),
   'subjects',coalesce((select jsonb_agg(s.name order by s.name) from public.application_subjects x join public.subjects s on s.id=x.subject_id where x.application_id=a.id),'[]'::jsonb)) into result
 from public.applications a where a.id=p_id;
 return result;
end $$;
create function public.finish_application_notification(p_id uuid,p_admin uuid,p_success boolean) returns void language sql security definer set search_path='' as $$
 update private.application_admin_notifications set delivered_at=case when p_success then now() end,failed_at=case when not p_success then now() end
 where application_id=p_id and admin_id=p_admin and attempted_at is not null;
$$;

create or replace function public.token_status(p_hash text,p_purpose text) returns text language sql security definer set search_path='' as $$
 select case when t.used_at is not null then 'used' when t.expires_at<=now() then 'expired'
 when t.purpose='registration' and not exists(select 1 from public.applications a where a.id=t.application_id and a.status='approved' and a.telegram_verified_at is not null) then 'invalid'
 else 'valid' end from private.one_time_tokens t where t.token_hash=p_hash and t.purpose=p_purpose;
$$;
create or replace function private.register_auth_user() returns trigger language plpgsql security definer set search_path='' as $$
declare t private.one_time_tokens; a public.applications; uname text;
begin
 uname=new.raw_user_meta_data->>'username';
 select * into t from private.one_time_tokens where token_hash=new.raw_user_meta_data->>'registration_hash' and purpose='registration';
 if not found then raise exception 'Invalid registration'; end if;
 select * into a from public.applications where id=t.application_id for update;
 select * into t from private.one_time_tokens where token_hash=new.raw_user_meta_data->>'registration_hash' and purpose='registration' for update;
 if not found or t.used_at is not null or t.expires_at<=now() then raise exception 'Invalid registration'; end if;
 if a.status<>'approved' or a.telegram_verified_at is null or a.telegram_user_id is null or a.telegram_chat_id is null then raise exception 'Unapproved application'; end if;
 insert into private.auth_aliases values(new.id,uname,new.email);
 insert into public.profiles(id,role,full_name,telegram_username,telegram_user_id,telegram_chat_id)
 values(new.id,a.role,a.full_name,a.telegram_username,a.telegram_user_id,a.telegram_chat_id);
 update private.one_time_tokens set used_at=now() where id=t.id;
 update public.applications set status='registered',registered_at=now() where id=a.id;
 return new;
end $$;

revoke all on function public.confirm_telegram(bigint,text,text,text,text),
 public.admin_applications(uuid,text,text,integer),public.review_application(uuid,uuid,text,text),
 public.application_link_delivered(uuid,uuid,text,boolean),public.application_admin_recipients(uuid),
 public.claim_application_notification(uuid,uuid),public.finish_application_notification(uuid,uuid,boolean)
 from public,anon,authenticated;
grant execute on function public.confirm_telegram(bigint,text,text,text,text),
 public.admin_applications(uuid,text,text,integer),public.review_application(uuid,uuid,text,text),
 public.application_link_delivered(uuid,uuid,text,boolean),public.application_admin_recipients(uuid),
 public.claim_application_notification(uuid,uuid),public.finish_application_notification(uuid,uuid,boolean)
 to service_role;
revoke all on function private.register_auth_user(),private.expire_old_applications() from public,anon,authenticated;

-- schedule_command replacement follows: same signed history, owner checks,
-- exclusions and advisory lock; only delete branch differs from package 008.
create or replace function public.schedule_command(p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 owner_id uuid=auth.uid(); op text=p_command->>'kind'; before_state jsonb; after_state jsonb; result jsonb='{}';
 ids uuid[]; source public.lessons; row_data jsonb; restored public.lessons; expected jsonb; target jsonb;
 start_time timestamptz; anchor timestamptz; actual timestamptz; shift_minutes integer; placed boolean=false;
 duration integer; new_id uuid; created uuid[]='{}'; affected uuid[]='{}'; students uuid[];
 scope jsonb; before_payload jsonb; after_payload jsonb; off integer; rule_date date; candidate_date date; current_week date; local_day date;
begin
 if owner_id is null or not exists(select 1 from public.profiles where id=owner_id) then raise exception 'Forbidden' using errcode='42501'; end if;
 if not private.is_teacher() and op not in ('offset','restore') then raise exception 'Forbidden' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(842106001);
 perform set_config('tutorgate.restore','',true);
 if private.is_teacher() then perform private.rollover_tutor(owner_id); end if;
 before_state=private.signed_schedule_snapshot(owner_id);
 current_week=private.schedule_week(owner_id);
 select coalesce((select msk_offset_hours from public.user_schedule_preferences where user_id=owner_id),0) into off;
 select array_agg(distinct value::uuid) into ids from jsonb_array_elements_text(coalesce(p_command->'ids','[]'));
 if op in ('move','transfer','paste','color','completed','delete') then
   if coalesce(cardinality(ids),0)=0 or cardinality(ids)>20000 or (select count(*) from public.lessons where id=any(ids) and tutor_id=owner_id)<>cardinality(ids) then raise exception 'Forbidden' using errcode='42501'; end if;
   perform 1 from public.lessons where id=any(ids) order by id for update;
   if op not in ('delete') and exists(select 1 from public.lessons where id=any(ids) and inactive_reason is not null) then raise exception 'Inactive lesson' using errcode='PT005'; end if;
 end if;
 if op='restore' then
   expected=p_command->'expected'; target=p_command->'target';
   if target->>'signature' is distinct from private.sign_schedule(target->'payload') or expected->>'signature' is distinct from private.sign_schedule(expected->'payload')
    or target->'payload'->>'owner' is distinct from owner_id::text or expected->'payload'->>'owner' is distinct from owner_id::text then raise exception 'Invalid snapshot' using errcode='42501'; end if;
   if target->'payload'->'lessonIds' is distinct from expected->'payload'->'lessonIds' or target->'payload'->'studentIds' is distinct from expected->'payload'->'studentIds' or target->'payload'->'offsetChanged' is distinct from expected->'payload'->'offsetChanged' then raise exception 'Invalid scope' using errcode='42501'; end if;
   if private.scope_schedule(before_state->'payload',expected->'payload') is distinct from expected->'payload' then raise exception 'Stale history' using errcode='PT009'; end if;
   if not private.is_teacher() and (target->'payload'->'lessons'<>'[]'::jsonb or target->'payload'->'rules'<>'[]'::jsonb) then raise exception 'Forbidden' using errcode='42501'; end if;
   perform set_config('tutorgate.restore',target::text,true);
   delete from public.tutor_student_availability where tutor_id=owner_id and target->'payload'->'studentIds' ? student_id::text;
   insert into public.tutor_student_availability select * from jsonb_populate_recordset(null::public.tutor_student_availability,target->'payload'->'rules');
   if (target->'payload'->>'offsetChanged')::boolean then insert into public.user_schedule_preferences(user_id,msk_offset_hours) values(owner_id,(target->'payload'->>'offset')::integer) on conflict(user_id) do update set msk_offset_hours=excluded.msk_offset_hours; end if;
   delete from public.lessons where tutor_id=owner_id and target->'payload'->'lessonIds' ? id::text;
   for row_data in select value from jsonb_array_elements(target->'payload'->'lessons') loop
     restored=jsonb_populate_record(null::public.lessons,row_data);
     if restored.tutor_id<>owner_id or exists(select 1 from public.lessons where id=restored.id) then raise exception 'Forbidden' using errcode='42501'; end if;
     insert into public.lessons select restored.*;
     insert into public.lesson_private_notes(lesson_id,note) values(restored.id,row_data->>'note');
   end loop;
   perform set_config('tutorgate.restore','',true);
 elsif op='offset' then
   if (p_command->>'offset')::integer not between -12 and 12 then raise exception 'Invalid offset' using errcode='23514'; end if;
   insert into public.user_schedule_preferences(user_id,msk_offset_hours) values(owner_id,(p_command->>'offset')::integer) on conflict(user_id) do update set msk_offset_hours=excluded.msk_offset_hours;
   update public.lessons set starts_at=starts_at where tutor_id=owner_id;
 elsif op in ('create','edit') then
   result=public.save_schedule_lesson((p_command->>'id')::uuid,(p_command->>'studentId')::uuid,(p_command->>'subjectId')::uuid,(p_command->>'startsAt')::timestamptz,(p_command->>'durationMinutes')::integer,p_command->>'note',coalesce((p_command->>'subjectChanged')::boolean,true));
 elsif op='delete' then
   -- Capture before DELETE; exclude records deleted by this same batch.
   select coalesce(array_agg(distinct transfer_source_id),'{}'::uuid[]) into affected
   from public.lessons where id=any(ids) and tutor_id=owner_id and is_transfer_target
   and transfer_source_id is not null and not (transfer_source_id=any(ids));
   delete from public.lessons where id=any(ids) and tutor_id=owner_id;
   update public.lessons set is_transfer_target=false,transfer_source_id=null,transfer_source_starts_at=null
   where tutor_id=owner_id and is_transfer_target and transfer_source_id=any(ids);
   -- lesson_activity reapplies tutor/student availability; completed stays reset.
   -- Existing exclusion constraints reject restoration into an occupied interval
   -- and roll back the ENTIRE delete instead of leaving an orphan source.
   update public.lessons set inactive_reason=null,inactive_until=null,completed_at=null
   where tutor_id=owner_id and id=any(affected) and inactive_reason='transferred';
 elsif op='color' then
   update public.lessons set color=p_command->>'color' where id=any(ids) and tutor_id=owner_id;
 elsif op='completed' then
   update public.lessons set completed_at=case when (p_command->>'completed')::boolean then coalesce(completed_at,now()) else null end where id=any(ids) and tutor_id=owner_id;
 elsif op='availability' then
   select array_agg(distinct value::uuid) into students from jsonb_array_elements_text(p_command->'studentIds');
   if coalesce(cardinality(students),0)=0 or exists(select 1 from unnest(students) s where not exists(select 1 from public.lessons where tutor_id=owner_id and student_id=s) and not exists(select 1 from public.student_tutor_assignments where tutor_id=owner_id and student_id=s)) then raise exception 'Forbidden' using errcode='42501'; end if;
   rule_date=(p_command->>'availableFrom')::date;
   if rule_date is null then delete from public.tutor_student_availability where tutor_id=owner_id and student_id=any(students);
   else insert into public.tutor_student_availability select owner_id,s,rule_date from unnest(students) s on conflict(tutor_id,student_id) do update set available_from=excluded.available_from; end if;
   update public.lessons set starts_at=starts_at where tutor_id=owner_id and student_id=any(students);
 elsif op in ('move','transfer','paste') then
   if op='transfer' and exists(select 1 from public.lessons where id=any(ids) and is_transfer_target) then raise exception 'Repeated transfer' using errcode='PT006'; end if;
   select min(starts_at) into anchor from public.lessons where id=any(ids);
   start_time=private.snap_lesson_start(owner_id,(p_command->>'startsAt')::timestamptz);
   local_day=private.schedule_local_date(owner_id,start_time);
   if op='paste' and (local_day<current_week or local_day>=current_week+7) then raise exception 'Current week only' using errcode='PT001'; end if;
   if op='transfer' and (local_day<current_week or local_day>=current_week+14) then raise exception 'Transfer week' using errcode='PT007'; end if;
   if op='move' and local_day>=current_week+7 then raise exception 'Future week' using errcode='PT002'; end if;
   -- A subtransaction per common delta protects geometry and rolls back the whole attempted group.
   for shift_minutes in select m from generate_series(-1435,1435,5) m order by abs(m),m desc loop
    begin
     if private.schedule_local_date(owner_id,start_time+make_interval(mins=>shift_minutes))<>local_day then continue; end if;
     created='{}'; affected=ids;
     set constraints public.lessons_tutor_normal_overlap,public.lessons_student_normal_overlap,public.lessons_tutor_coral_overlap,public.lessons_student_coral_overlap deferred;
     for source in select * from public.lessons where id=any(ids) order by starts_at,id loop
       actual=source.starts_at+(start_time-anchor)+make_interval(mins=>shift_minutes);
       candidate_date=private.schedule_local_date(owner_id,actual);
       if date_trunc('week',candidate_date::timestamp)<>date_trunc('week',local_day::timestamp) then raise exception 'Group outside week' using errcode='PT008'; end if;
       duration=case when op='transfer' and cardinality(ids)=1 then coalesce((p_command->>'durationMinutes')::integer,source.duration_minutes) else source.duration_minutes end;
       if op='move' then update public.lessons set starts_at=actual where id=source.id;
       else
         if op='transfer' then update public.lessons set inactive_reason='transferred',completed_at=null where id=source.id; end if;
         insert into public.lessons(tutor_id,student_id,subject_id,starts_at,duration_minutes,color,is_transfer_target,transfer_source_id,transfer_source_starts_at)
         values(owner_id,source.student_id,source.subject_id,actual,duration,source.color,op='transfer',case when op='transfer' then source.id end,case when op='transfer' then source.starts_at end) returning id into new_id;
         insert into public.lesson_private_notes(lesson_id,note) select new_id,note from public.lesson_private_notes where lesson_id=source.id;
         created=array_append(created,new_id);
       end if;
     end loop;
     set constraints public.lessons_tutor_normal_overlap,public.lessons_student_normal_overlap,public.lessons_tutor_coral_overlap,public.lessons_student_coral_overlap immediate;
     placed=true; exit;
    exception when exclusion_violation or sqlstate 'PT008' then null;
    end;
   end loop;
   if not placed then raise exception 'No group interval' using errcode='P0002'; end if;
   result=jsonb_build_object('shifted',shift_minutes<>0,'createdIds',created);
   if op='move' and cardinality(ids)=1 then result=result||jsonb_build_object('lesson',private.lesson_dto(ids[1]),'requestedStart',start_time); end if;
 else raise exception 'Invalid command' using errcode='23514';
 end if;
 after_state=private.signed_schedule_snapshot(owner_id);
 before_payload=before_state->'payload';after_payload=after_state->'payload';
 select jsonb_build_object('lessonIds',coalesce((select jsonb_agg(coalesce(b->>'id',a->>'id') order by coalesce(b->>'id',a->>'id')) from jsonb_array_elements(before_payload->'lessons') b full join jsonb_array_elements(after_payload->'lessons') a on b->>'id'=a->>'id' where b is distinct from a),'[]'::jsonb),
 'studentIds',coalesce((select jsonb_agg(coalesce(b->>'student_id',a->>'student_id') order by coalesce(b->>'student_id',a->>'student_id')) from jsonb_array_elements(before_payload->'rules') b full join jsonb_array_elements(after_payload->'rules') a on b->>'student_id'=a->>'student_id' where b is distinct from a),'[]'::jsonb),
 'offsetChanged',before_payload->'offset' is distinct from after_payload->'offset') into scope;
 before_payload=private.scope_schedule(before_payload,scope);after_payload=private.scope_schedule(after_payload,scope);
 before_state=jsonb_build_object('payload',before_payload,'signature',private.sign_schedule(before_payload));
 after_state=jsonb_build_object('payload',after_payload,'signature',private.sign_schedule(after_payload));
 return result||jsonb_build_object('lessons',coalesce((select jsonb_agg(private.lesson_dto(id) order by id) from public.lessons where tutor_id=owner_id),'[]'::jsonb),
 'rules',coalesce((select jsonb_agg(jsonb_build_object('studentId',student_id,'availableFrom',available_from) order by student_id) from public.tutor_student_availability where tutor_id=owner_id),'[]'::jsonb),
 'offset',coalesce((select msk_offset_hours from public.user_schedule_preferences where user_id=owner_id),0),'before',before_state,'after',after_state,'replaceAll',private.is_teacher());
end $$;

commit;
