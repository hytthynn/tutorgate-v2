begin;
select pg_advisory_xact_lock(842106001);

create type public.account_status as enum ('active','blocked','deleted');
alter table public.profiles
 add column account_status public.account_status not null default 'active',
 add column blocked_at timestamptz,
 add column blocked_by uuid references public.profiles(id),
 add column deleted_at timestamptz,
 add column deleted_by uuid references public.profiles(id),
 alter column telegram_username drop not null,
 alter column telegram_user_id drop not null,
 alter column telegram_chat_id drop not null,
 add constraint profiles_identity check(account_status='deleted' or (telegram_user_id is not null and telegram_chat_id is not null));

create function private.is_active_user() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and account_status='active');
$$;
revoke all on function private.is_active_user() from public,anon;
grant execute on function private.is_active_user() to authenticated;
create or replace function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and account_status='active');
$$;
create or replace function private.is_teacher() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role in ('tutor','admin') and account_status='active');
$$;
create or replace function public.visible_profiles() returns table(id uuid,role public.app_role,full_name text,telegram_username text)
language sql stable security definer set search_path='' as $$
 select p.id,p.role,p.full_name,case when p.id=auth.uid() or private.is_admin() then p.telegram_username else null end
 from public.profiles p where private.is_active_user() and p.account_status='active' and private.can_read_profile(p.id);
$$;
create function public.admin_directory_profiles() returns table(id uuid,role public.app_role,full_name text,login text,telegram_username text,telegram_user_id text,account_status public.account_status,blocked_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Forbidden' using errcode='42501'; end if;
 return query select p.id,p.role,p.full_name,a.username_normalized,p.telegram_username,p.telegram_user_id,p.account_status,p.blocked_at
 from public.profiles p left join private.auth_aliases a on a.user_id=p.id where p.account_status<>'deleted';
end $$;
revoke all on function public.admin_directory_profiles() from public,anon;
grant execute on function public.admin_directory_profiles() to authenticated;

-- Restrictive policies also close stale JWT access to ordinary RLS tables.
do $$ declare tab text; begin
 foreach tab in array array['profiles','tutor_subjects','student_tutor_assignments','app_settings','lessons','lesson_private_notes','user_schedule_preferences','tutor_student_availability','schedule_week_rollovers'] loop
 execute format('create policy active_account on public.%I as restrictive for all to authenticated using(private.is_active_user()) with check(private.is_active_user())',tab);
 end loop;
end $$;

-- The existing command still owns placement, snapshots and all owner checks.
alter function public.schedule_command(jsonb) set schema private;
alter function private.schedule_command(jsonb) rename to schedule_command_009;
revoke all on function private.schedule_command_009(jsonb) from public,anon,authenticated;
create function public.schedule_command(p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(842106001);
 if not private.is_active_user() then raise exception 'Forbidden' using errcode='42501'; end if;
 return private.schedule_command_009(p_command);
end $$;
revoke all on function public.schedule_command(jsonb) from public,anon;
grant execute on function public.schedule_command(jsonb) to authenticated;

-- Lock participants in a stable order. This serializes new links with account changes.
create function private.check_active_participants() returns trigger language plpgsql security definer set search_path='' as $$
declare ids uuid[];
begin
 if tg_table_name='lessons' and tg_op='UPDATE' then
  if new.student_id=old.student_id and new.tutor_id=old.tutor_id and new.starts_at=old.starts_at and new.duration_minutes=old.duration_minutes then return new; end if;
 end if;
 if tg_table_name='tutor_subjects' then ids=array[new.tutor_id];
 else ids=array[new.tutor_id,new.student_id]; end if;
 perform 1 from public.profiles where id=any(ids) order by id for share;
 if exists(select 1 from public.profiles where id=any(ids) and account_status<>'active') then
  raise exception 'Account is not active' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function private.check_active_participants() from public,anon,authenticated;
create trigger active_participants before insert or update on public.student_tutor_assignments for each row execute function private.check_active_participants();
create trigger active_participants before insert on public.tutor_subjects for each row execute function private.check_active_participants();
create trigger active_participants before insert or update on public.lessons for each row execute function private.check_active_participants();

create function public.admin_change_user_role(p_user uuid,p_role public.app_role) returns void language plpgsql security definer set search_path='' as $$
declare p public.profiles; assignments integer; subjects integer; upcoming integer;
begin
 if not private.is_admin() then raise exception 'Forbidden' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(842106001);
 select * into p from public.profiles where id=p_user for update;
 if not found or p.role='admin' or p.account_status='deleted' or p_role not in ('student','tutor') or p_role is null then raise exception 'Invalid target' using errcode='42501'; end if;
 if p.role=p_role then return; end if;
 select count(*) into assignments from public.student_tutor_assignments where student_id=p_user or tutor_id=p_user;
 select count(*) into subjects from public.tutor_subjects where tutor_id=p_user;
 select count(*) into upcoming from public.lessons where (student_id=p_user or tutor_id=p_user) and ends_at>=now();
 if assignments+subjects+upcoming>0 then
  raise exception 'Сначала снимите назначения (%), предметы репетитора (%) и уберите текущие/будущие занятия (%).',assignments,subjects,upcoming using errcode='P0010';
 end if;
 delete from public.tutor_student_availability where tutor_id=p_user or student_id=p_user;
 delete from public.schedule_week_rollovers where tutor_id=p_user;
 update public.profiles set role=p_role where id=p_user;
 perform public.revoke_user_sessions(p_user);
end $$;
create function public.admin_set_user_blocked(p_user uuid,p_blocked boolean) returns void language plpgsql security definer set search_path='' as $$
declare p public.profiles;
begin
 if not private.is_admin() then raise exception 'Forbidden' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(842106001);
 select * into p from public.profiles where id=p_user for update;
 if not found or p.role='admin' or p.account_status='deleted' or p_blocked is null then raise exception 'Invalid target' using errcode='42501'; end if;
 update public.profiles set account_status=case when p_blocked then 'blocked'::public.account_status else 'active'::public.account_status end,
 blocked_at=case when p_blocked then now() end,blocked_by=case when p_blocked then auth.uid() end where id=p_user;
 if p_blocked then
  perform public.revoke_user_sessions(p_user);
  update private.one_time_tokens set used_at=now() where user_id=p_user and purpose='password_reset' and used_at is null;
 end if;
end $$;
create function public.admin_soft_delete_user(p_user uuid) returns void language plpgsql security definer set search_path='' as $$
declare p public.profiles;
begin
 if not private.is_admin() then raise exception 'Forbidden' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(842106001);
 select * into p from public.profiles where id=p_user for update;
 if not found or p.role='admin' then raise exception 'Invalid target' using errcode='42501'; end if;
 -- Idempotent so a failed Auth Admin API cleanup can be retried safely.
 if p.account_status<>'deleted' then
  update public.profiles set account_status='deleted',deleted_at=now(),deleted_by=auth.uid(),blocked_at=null,blocked_by=null,
   full_name='Удалённый пользователь',telegram_username=null,telegram_user_id=null,telegram_chat_id=null where id=p_user;
 end if;
 perform public.revoke_user_sessions(p_user);
 delete from private.auth_aliases where user_id=p_user;
 delete from private.one_time_tokens where user_id=p_user and purpose='password_reset';
 -- Atomic metadata erasure prevents PII surviving an interrupted external cleanup.
 update auth.users set raw_user_meta_data='{}'::jsonb where id=p_user;
end $$;
revoke all on function public.admin_change_user_role(uuid,public.app_role),public.admin_set_user_blocked(uuid,boolean),public.admin_soft_delete_user(uuid) from public,anon;
grant execute on function public.admin_change_user_role(uuid,public.app_role),public.admin_set_user_blocked(uuid,boolean),public.admin_soft_delete_user(uuid) to authenticated;

-- Bind and block lock the same profile: a late login cannot recreate a revoked session.
create or replace function public.bind_session(p_hash text,p_user uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.profiles where id=p_user and account_status='active' for share;
 if not found then
  delete from private.sessions where handle_hash=p_hash;
  raise exception 'Account is not active' using errcode='42501';
 end if;
 update private.sessions set user_id=p_user where handle_hash=p_hash;
end $$;
create function public.session_refresh(p_hash text,p_cookies jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if jsonb_array_length(p_cookies)=0 then delete from private.sessions where handle_hash=p_hash; return; end if;
 update private.sessions set cookies=p_cookies,expires_at=now()+interval '30 days' where handle_hash=p_hash and expires_at>now();
end $$;
revoke all on function public.session_refresh(text,jsonb) from public,anon,authenticated;
grant execute on function public.session_refresh(text,jsonb) to service_role;
create or replace function public.session_read(p_hash text) returns jsonb language sql security definer set search_path='' as $$
 select s.cookies from private.sessions s where s.handle_hash=p_hash and s.expires_at>now()
 and (s.user_id is null or exists(select 1 from public.profiles p where p.id=s.user_id and p.account_status='active'));
$$;
create or replace function public.lookup_alias(p_username text) returns text language sql security definer set search_path='' as $$
 select a.auth_email_alias from private.auth_aliases a join public.profiles p on p.id=a.user_id
 where a.username_normalized=lower(trim(p_username)) and p.account_status<>'deleted';
$$;
create or replace function public.request_reset(p_username text,p_hash text) returns text language plpgsql security definer set search_path='' as $$
declare p public.profiles;
begin
 select * into p from public.profiles where lower(telegram_username)=lower(ltrim(trim(p_username),'@')) and account_status='active' order by created_at limit 1 for update;
 if not found then return null; end if;
 if exists(select 1 from private.one_time_tokens where user_id=p.id and purpose='password_reset' and created_at>now()-interval '2 minutes') then return null; end if;
 update private.one_time_tokens set used_at=now() where user_id=p.id and purpose='password_reset' and used_at is null;
 insert into private.one_time_tokens(purpose,token_hash,user_id,expires_at) values('password_reset',p_hash,p.id,now()+interval '30 minutes');
 return p.telegram_chat_id;
end $$;
create or replace function public.claim_reset(p_hash text) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid;
begin
 select p.id into uid from public.profiles p join private.one_time_tokens t on t.user_id=p.id where t.token_hash=p_hash and p.account_status='active' for update of p;
 if uid is null then return null; end if;
 update private.one_time_tokens set used_at=now() where token_hash=p_hash and purpose='password_reset' and used_at is null and expires_at>now() returning user_id into uid;
 return uid;
end $$;
create or replace function private.rollover_tutor(p_tutor uuid,p_now timestamptz default now()) returns void
language plpgsql security definer set search_path='' as $$
declare target date; off integer; boundary timestamptz; source public.lessons; actual timestamptz; new_id uuid; copied integer=0; skipped integer=0; log jsonb='[]';
begin
 perform pg_advisory_xact_lock(842106001);
 if not exists(select 1 from public.profiles where id=p_tutor and role in ('tutor','admin') and account_status='active') then return; end if;
 target=private.schedule_week(p_tutor,p_now);
 insert into public.schedule_week_rollovers(tutor_id,target_week_start) values(p_tutor,target) on conflict do nothing;
 if not found then return; end if;
 select 3+coalesce((select msk_offset_hours from public.user_schedule_preferences where user_id=p_tutor),0) into off;
 boundary=(target::timestamp-make_interval(hours=>off)) at time zone 'UTC';
 for source in select * from public.lessons where tutor_id=p_tutor and starts_at>=boundary-interval '7 days' and starts_at<boundary and inactive_reason is distinct from 'transferred' order by starts_at,id loop
   begin
     if source.subject_id is null or not exists(select 1 from public.subjects where id=source.subject_id and is_active)
     or not exists(select 1 from public.tutor_subjects where tutor_id=p_tutor and subject_id=source.subject_id)
     or not exists(select 1 from public.student_tutor_assignments where tutor_id=p_tutor and student_id=source.student_id and subject_id=source.subject_id) then
       skipped=skipped+1; log=log||jsonb_build_array(jsonb_build_object('sourceId',source.id,'reason','invalid_assignment')); continue;
     end if;
     actual=private.resolve_nearest_lesson_start(p_tutor,source.student_id,source.starts_at+interval '7 days',source.duration_minutes,null,source.color);
     insert into public.lessons(tutor_id,student_id,subject_id,starts_at,duration_minutes,color,completed_at)
       values(p_tutor,source.student_id,source.subject_id,actual,source.duration_minutes,source.color,null) returning id into new_id;
     insert into public.lesson_private_notes(lesson_id,note) select new_id,note from public.lesson_private_notes where lesson_id=source.id;
     copied=copied+1;
     log=log||jsonb_build_array(jsonb_build_object('sourceId',source.id,'lessonId',new_id,'shifted',actual<>source.starts_at+interval '7 days'));
   exception when exclusion_violation or no_data_found or check_violation or foreign_key_violation then
     skipped=skipped+1; log=log||jsonb_build_array(jsonb_build_object('sourceId',source.id,'reason','unavailable_interval_or_assignment'));
   end;
 end loop;
 update public.schedule_week_rollovers set copied_count=copied,skipped_count=skipped,results=log,completed_at=now() where tutor_id=p_tutor and target_week_start=target;
end $$;
create or replace function private.validate_lesson() returns trigger language plpgsql security definer set search_path='' as $$
declare restore jsonb;
begin
 restore=nullif(current_setting('tutorgate.restore',true),'')::jsonb;
 if restore is not null and restore->>'signature'=private.sign_schedule(restore->'payload') and exists(select 1 from jsonb_array_elements(restore->'payload'->'lessons') r where r->>'id'=new.id::text and r->>'tutor_id'=new.tutor_id::text and r->>'student_id'=new.student_id::text and (r->>'subject_id') is not distinct from new.subject_id::text) then
 new.ends_at=new.starts_at+make_interval(mins=>new.duration_minutes); return new; end if;
 -- All browser writes now go through owner-checked RPCs. The trigger is also
 -- used by trusted cron and FK ON DELETE SET NULL, neither has an end-user uid.
 if tg_op='UPDATE' and new.tutor_id is distinct from old.tutor_id then
   raise exception 'Immutable tutor' using errcode='42501';
 end if;
 -- Unchanged historical participants remain valid after an account role change.
 if (tg_op='INSERT' or new.student_id is distinct from old.student_id or new.starts_at is distinct from old.starts_at or new.duration_minutes is distinct from old.duration_minutes) and
 (not exists(select 1 from public.profiles where id=new.tutor_id and role in ('tutor','admin'))
 or not exists(select 1 from public.profiles where id=new.student_id and role='student')) then
   raise exception 'Invalid participant' using errcode='23514';
 end if;
 if tg_op='INSERT' or new.student_id is distinct from old.student_id
 or (new.subject_id is distinct from old.subject_id and new.subject_id is not null) then
   perform 1 from public.subjects where id=new.subject_id and is_active for share;
   if not found then raise exception 'Inactive subject' using errcode='23514'; end if;
   perform 1 from public.tutor_subjects where tutor_id=new.tutor_id and subject_id=new.subject_id for share;
   if not found then raise exception 'Unavailable subject' using errcode='23514'; end if;
   perform 1 from public.student_tutor_assignments where student_id=new.student_id and tutor_id=new.tutor_id and subject_id=new.subject_id for share;
   if not found then raise exception 'Invalid assignment' using errcode='23514'; end if;
   select name into new.subject_name_snapshot from public.subjects where id=new.subject_id;
 elsif tg_op='UPDATE' then
   -- The historical snapshot is immutable unless a different valid subject is selected.
   new.subject_name_snapshot=old.subject_name_snapshot;
   if old.subject_id is not null and new.subject_id is null and exists(select 1 from public.subjects where id=old.subject_id) then
     raise exception 'Cannot clear existing subject' using errcode='23514';
   end if;
 end if;
 new.ends_at=new.starts_at+make_interval(mins=>new.duration_minutes);
 new.updated_at=now();
 return new;
end $$;
commit;
