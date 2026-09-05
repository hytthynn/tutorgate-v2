-- TutorGate MVP. Apply as the database owner using Supabase migrations.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create type public.app_role as enum ('student', 'tutor', 'admin');
create type public.application_status as enum ('pending_telegram', 'telegram_verified', 'registered', 'expired');

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 role public.app_role not null,
 full_name text not null check (length(full_name) between 2 and 150),
 telegram_username text not null,
 telegram_user_id text not null unique,
 telegram_chat_id text not null unique,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index profiles_name on public.profiles(lower(full_name));
create index profiles_telegram_name on public.profiles(telegram_username);
create table public.applications (
 id uuid primary key default gen_random_uuid(), role public.app_role not null check(role <> 'admin'),
 full_name text not null, telegram_username text not null,
 student_goal text, teaching_experience text,
 privacy_accepted_at timestamptz not null,
 status public.application_status not null default 'pending_telegram',
 telegram_user_id text unique, telegram_chat_id text unique,
 telegram_verified_at timestamptz, registered_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check ((role='student' and student_goal is not null and teaching_experience is null) or (role='tutor' and teaching_experience is not null and student_goal is null))
);
create table public.subjects (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 80),
 is_active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index subjects_name_unique on public.subjects(lower(trim(name)));
create table public.application_subjects (
 application_id uuid references public.applications(id) on delete cascade,
 subject_id uuid references public.subjects(id), primary key(application_id, subject_id)
);
create table public.tutor_subjects (
 tutor_id uuid references public.profiles(id), subject_id uuid references public.subjects(id),
 assigned_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 primary key(tutor_id, subject_id)
);
create table public.student_tutor_assignments (
 id uuid primary key default gen_random_uuid(), student_id uuid not null references public.profiles(id),
 subject_id uuid not null references public.subjects(id), tutor_id uuid not null references public.profiles(id),
 assigned_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(student_id, subject_id),
 foreign key(tutor_id, subject_id) references public.tutor_subjects(tutor_id, subject_id) on delete restrict
);
create index assignments_tutor on public.student_tutor_assignments(tutor_id);
create table public.app_settings (
 id boolean primary key default true check(id), hourly_rate numeric(12,2) not null default 0 check(hourly_rate >= 0 and hourly_rate <= 1000000),
 updated_at timestamptz not null default now(), updated_by uuid references public.profiles(id)
);
insert into public.app_settings(id) values(true);

create table private.auth_aliases (
 user_id uuid primary key references auth.users(id) on delete cascade,
 username_normalized text not null unique check(username_normalized ~ '^[a-z0-9_]{3,32}$'),
 auth_email_alias text not null unique
);
create table private.one_time_tokens (
 id uuid primary key default gen_random_uuid(),
 purpose text not null check(purpose in ('telegram_application','registration','password_reset')),
 token_hash text not null unique check(length(token_hash)=64),
 application_id uuid references public.applications(id), user_id uuid references auth.users(id) on delete cascade,
 expires_at timestamptz not null, used_at timestamptz, created_at timestamptz not null default now()
);
create table private.telegram_updates (
 telegram_update_id bigint primary key, application_id uuid not null references public.applications(id),
 token_hash text not null, chat_id text not null, delivered_at timestamptz, created_at timestamptz not null default now()
);
create table private.sessions (
 handle_hash text primary key, cookies jsonb not null, expires_at timestamptz not null,
 created_at timestamptz not null default now()
);
create index sessions_expiry on private.sessions(expires_at);
create table private.rate_limits (key text primary key, count integer not null, expires_at timestamptz not null);

create function private.touch_updated_at() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now(); return new; end $$;
create trigger profiles_touch before update on public.profiles for each row execute function private.touch_updated_at();
create trigger applications_touch before update on public.applications for each row execute function private.touch_updated_at();
create trigger subjects_touch before update on public.subjects for each row execute function private.touch_updated_at();
create trigger assignments_touch before update on public.student_tutor_assignments for each row execute function private.touch_updated_at();
create trigger settings_touch before update on public.app_settings for each row execute function private.touch_updated_at();

-- Security definer helpers prevent recursive profile RLS policies.
create function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role='admin');
$$;
create function private.can_read_profile(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select p_id=auth.uid() or private.is_admin() or exists (
 select 1 from public.student_tutor_assignments where
 (student_id=auth.uid() and tutor_id=p_id) or (tutor_id=auth.uid() and student_id=p_id));
$$;
grant usage on schema private to authenticated;
grant execute on function private.is_admin(), private.can_read_profile(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.applications enable row level security;
alter table public.subjects enable row level security;
alter table public.application_subjects enable row level security;
alter table public.tutor_subjects enable row level security;
alter table public.student_tutor_assignments enable row level security;
alter table public.app_settings enable row level security;
revoke all on all tables in schema public from anon, authenticated;
grant select on public.subjects to anon, authenticated;
-- Column grants prevent Telegram identifiers leaking to assigned peers.
grant select(id,role,full_name,created_at,updated_at) on public.profiles to authenticated;
grant select on public.tutor_subjects, public.student_tutor_assignments, public.app_settings to authenticated;
grant insert,update on public.subjects to authenticated;
grant insert,update,delete on public.tutor_subjects,public.student_tutor_assignments to authenticated;
grant update(hourly_rate,updated_by) on public.app_settings to authenticated;
create policy profile_read on public.profiles for select to authenticated using(private.can_read_profile(id));
create policy subject_read on public.subjects for select to anon,authenticated using(is_active or auth.uid() is not null);
create policy subject_insert on public.subjects for insert to authenticated with check(private.is_admin());
create policy subject_update on public.subjects for update to authenticated using(private.is_admin()) with check(private.is_admin());
create policy tutor_subject_read on public.tutor_subjects for select to authenticated using(
 private.is_admin() or tutor_id=auth.uid() or exists(select 1 from public.student_tutor_assignments a where a.student_id=auth.uid() and a.tutor_id=tutor_subjects.tutor_id and a.subject_id=tutor_subjects.subject_id));
create policy tutor_subject_write on public.tutor_subjects for all to authenticated using(private.is_admin()) with check(private.is_admin());
create policy assignment_read on public.student_tutor_assignments for select to authenticated using(private.is_admin() or student_id=auth.uid() or tutor_id=auth.uid());
create policy assignment_write on public.student_tutor_assignments for all to authenticated using(private.is_admin()) with check(private.is_admin());
create policy settings_read on public.app_settings for select to authenticated using(private.is_admin());
create policy settings_update on public.app_settings for update to authenticated using(private.is_admin()) with check(private.is_admin());

create function private.validate_assignment() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=new.student_id and role='student') then raise exception 'Invalid student'; end if;
 if not exists(select 1 from public.subjects where id=new.subject_id and is_active) then raise exception 'Inactive subject'; end if;
 if not exists(select 1 from public.profiles where id=new.tutor_id and role in ('tutor','admin')) then raise exception 'Invalid tutor'; end if;
 new.assigned_by=auth.uid();
 return new;
end $$;
create trigger validate_assignment before insert or update on public.student_tutor_assignments for each row execute function private.validate_assignment();
create function private.validate_tutor_subject() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=new.tutor_id and role in ('tutor','admin')) then raise exception 'Invalid tutor'; end if;
 if not exists(select 1 from public.subjects where id=new.subject_id and is_active) then raise exception 'Inactive subject'; end if;
 new.assigned_by=auth.uid(); return new;
end $$;
create trigger validate_tutor_subject before insert or update on public.tutor_subjects for each row execute function private.validate_tutor_subject();

-- Safe profile API. Telegram username only for the account owner or admins.
create function public.visible_profiles() returns table(id uuid,role public.app_role,full_name text,telegram_username text)
language sql stable security definer set search_path='' as $$
 select p.id,p.role,p.full_name,case when p.id=auth.uid() or private.is_admin() then p.telegram_username else null end
 from public.profiles p where private.can_read_profile(p.id);
$$;

create function public.set_tutor_subjects(p_tutor uuid,p_subjects uuid[]) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Forbidden'; end if;
 perform 1 from public.profiles where id=p_tutor and role in ('tutor','admin') for update;
 if not found then raise exception 'Invalid tutor'; end if;
 -- Keep inactive historic links; removing a subject used in assignments is RESTRICTed.
 delete from public.tutor_subjects where tutor_id=p_tutor and not(subject_id=any(p_subjects))
 and subject_id in (select id from public.subjects where is_active);
 insert into public.tutor_subjects(tutor_id,subject_id,assigned_by)
 select p_tutor,s,auth.uid() from unnest(p_subjects) s
 where not exists(select 1 from public.tutor_subjects where tutor_id=p_tutor and subject_id=s);
end $$;

-- Everything below is service-role only; private schema is NEVER exposed in PostgREST.
create function public.rate_limit(p_key text,p_limit integer,p_seconds integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 delete from private.rate_limits where expires_at < now();
 insert into private.rate_limits(key,count,expires_at) values(p_key,1,now()+make_interval(secs=>p_seconds))
 on conflict(key) do update set count=private.rate_limits.count+1 returning count into n;
 return n<=p_limit;
end $$;
create function public.session_read(p_hash text) returns jsonb language sql security definer set search_path='' as $$
 select cookies from private.sessions where handle_hash=p_hash and expires_at>now();
$$;
create function public.session_write(p_hash text,p_cookies jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 delete from private.sessions where expires_at<now();
 if jsonb_array_length(p_cookies)=0 then delete from private.sessions where handle_hash=p_hash; return; end if;
 insert into private.sessions(handle_hash,cookies,expires_at) values(p_hash,p_cookies,now()+interval '30 days')
 on conflict(handle_hash) do update set cookies=excluded.cookies,expires_at=excluded.expires_at;
end $$;
create function public.lookup_alias(p_username text) returns text language sql security definer set search_path='' as $$
 select auth_email_alias from private.auth_aliases where username_normalized=p_username;
$$;
create function public.submit_application(p_data jsonb,p_hash text) returns uuid language plpgsql security definer set search_path='' as $$
declare aid uuid; sid uuid; n integer;
begin
 n=jsonb_array_length(p_data->'subject_ids');
 if n<1 or n>30 then raise exception 'Invalid subjects'; end if;
 insert into public.applications(role,full_name,telegram_username,student_goal,teaching_experience,privacy_accepted_at)
 values((p_data->>'role')::public.app_role,p_data->>'full_name',p_data->>'telegram_username',p_data->>'student_goal',p_data->>'teaching_experience',now()) returning id into aid;
 for sid in select jsonb_array_elements_text(p_data->'subject_ids')::uuid loop
  perform 1 from public.subjects where id=sid and is_active for share;
  if not found then raise exception 'Inactive subject'; end if;
  insert into public.application_subjects values(aid,sid);
 end loop;
 insert into private.one_time_tokens(purpose,token_hash,application_id,expires_at) values('telegram_application',p_hash,aid,now()+interval '24 hours');
 return aid;
end $$;
create function public.confirm_telegram(p_update bigint,p_hash text,p_registration_hash text,p_username text,p_user text,p_chat text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t private.one_time_tokens; a public.applications; u private.telegram_updates;
begin
 perform pg_advisory_xact_lock(p_update);
 select * into u from private.telegram_updates where telegram_update_id=p_update;
 if found then return jsonb_build_object('status',case when u.delivered_at is null then 'send' else 'done' end,'chat_id',u.chat_id); end if;
 select * into t from private.one_time_tokens where token_hash=p_hash and purpose='telegram_application' for update;
 if not found or t.used_at is not null then return jsonb_build_object('status','invalid'); end if;
 if t.expires_at<=now() then
  update public.applications set status='expired' where id=t.application_id and status='pending_telegram';
  return jsonb_build_object('status','expired');
 end if;
 select * into a from public.applications where id=t.application_id for update;
 if a.status<>'pending_telegram' then return jsonb_build_object('status','invalid'); end if;
 if p_username='' then return jsonb_build_object('status','no_username'); end if;
 if a.telegram_username<>lower(p_username) then return jsonb_build_object('status','mismatch'); end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user,0));
 if exists(select 1 from public.profiles where telegram_user_id=p_user) or exists(select 1 from public.applications where telegram_user_id=p_user and id<>a.id) then return jsonb_build_object('status','linked'); end if;
 update public.applications set telegram_user_id=p_user,telegram_chat_id=p_chat,telegram_verified_at=now(),status='telegram_verified' where id=a.id;
 update private.one_time_tokens set used_at=now() where id=t.id;
 insert into private.one_time_tokens(purpose,token_hash,application_id,expires_at) values('registration',p_registration_hash,a.id,now()+interval '24 hours');
 insert into private.telegram_updates(telegram_update_id,application_id,token_hash,chat_id) values(p_update,a.id,p_registration_hash,p_chat);
 return jsonb_build_object('status','send','chat_id',p_chat);
end $$;
create function public.telegram_delivered(p_update bigint) returns void language sql security definer set search_path='' as $$
 update private.telegram_updates set delivered_at=now() where telegram_update_id=p_update;
$$;
create function public.token_status(p_hash text,p_purpose text) returns text language sql security definer set search_path='' as $$
 select case when used_at is not null then 'used' when expires_at<=now() then 'expired' else 'valid' end from private.one_time_tokens where token_hash=p_hash and purpose=p_purpose;
$$;

-- Auth insertion and registration are ONE PostgreSQL transaction. No orphan
-- Auth account or half-used registration token on uniqueness/concurrency failure.
create function private.register_auth_user() returns trigger language plpgsql security definer set search_path='' as $$
declare t private.one_time_tokens; a public.applications; uname text;
begin
 uname=new.raw_user_meta_data->>'username';
 select * into t from private.one_time_tokens where token_hash=new.raw_user_meta_data->>'registration_hash' and purpose='registration' for update;
 if not found or t.used_at is not null or t.expires_at<=now() then raise exception 'Invalid registration'; end if;
 select * into a from public.applications where id=t.application_id for update;
 if a.status<>'telegram_verified' or a.telegram_user_id is null then raise exception 'Unverified application'; end if;
 insert into private.auth_aliases values(new.id,uname,new.email);
 insert into public.profiles(id,role,full_name,telegram_username,telegram_user_id,telegram_chat_id)
 values(new.id,a.role,a.full_name,a.telegram_username,a.telegram_user_id,a.telegram_chat_id);
 update private.one_time_tokens set used_at=now() where id=t.id;
 update public.applications set status='registered',registered_at=now() where id=a.id;
 return new;
end $$;
create trigger tutorgate_registration after insert on auth.users for each row execute function private.register_auth_user();

create function public.request_reset(p_username text,p_hash text) returns text language plpgsql security definer set search_path='' as $$
declare p public.profiles;
begin
 select * into p from public.profiles where telegram_username=p_username order by created_at limit 1 for update;
 if not found then return null; end if;
 if exists(select 1 from private.one_time_tokens where user_id=p.id and purpose='password_reset' and created_at>now()-interval '2 minutes') then return null; end if;
 update private.one_time_tokens set used_at=now() where user_id=p.id and purpose='password_reset' and used_at is null;
 insert into private.one_time_tokens(purpose,token_hash,user_id,expires_at) values('password_reset',p_hash,p.id,now()+interval '30 minutes');
 return p.telegram_chat_id;
end $$;
-- Claim before calling Auth API: at-most-once even across concurrent Functions.
create function public.claim_reset(p_hash text) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid;
begin
 update private.one_time_tokens set used_at=now() where token_hash=p_hash and purpose='password_reset' and used_at is null and expires_at>now() returning user_id into uid;
 return uid;
end $$;
create function public.promote_admin(p_username text) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid;
begin
 select user_id into uid from private.auth_aliases where username_normalized=p_username;
 if uid is null then raise exception 'Registered user not found'; end if;
 update public.profiles set role='admin' where id=uid;
 return uid;
end $$;

-- Default PostgreSQL function EXECUTE is public: explicitly revoke it.
revoke all on all functions in schema public from public,anon,authenticated;
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.is_admin(),private.can_read_profile(uuid) to authenticated;
grant execute on function public.visible_profiles(),public.set_tutor_subjects(uuid,uuid[]) to authenticated;
grant execute on all functions in schema public to service_role;
grant all on all tables in schema public to service_role;
-- No public grants on private tables, even though helpers need schema USAGE.
revoke all on all tables in schema private from public,anon,authenticated;
