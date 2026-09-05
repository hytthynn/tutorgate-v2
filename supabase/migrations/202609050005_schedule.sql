-- Personal calendars and actual statistics. All times are absolute instants.
create extension if not exists btree_gist;

create function private.is_teacher() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role in ('tutor','admin'));
$$;
revoke all on function private.is_teacher() from public, anon;
grant execute on function private.is_teacher() to authenticated;

create table public.lessons (
 id uuid primary key default gen_random_uuid(),
 tutor_id uuid not null references public.profiles(id),
 student_id uuid not null references public.profiles(id),
 subject_id uuid not null references public.subjects(id),
 starts_at timestamptz not null check(isfinite(starts_at)),
 ends_at timestamptz not null,
 duration_minutes smallint not null check(duration_minutes between 1 and 600),
 color text not null default 'default' check(color in ('default','green','coral','gray','blue')),
 completed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(tutor_id,subject_id) references public.tutor_subjects(tutor_id,subject_id) on delete restrict,
 check(ends_at > starts_at),
 constraint lessons_tutor_overlap exclude using gist(tutor_id with =, tstzrange(starts_at,ends_at,'[)') with &&),
 constraint lessons_student_overlap exclude using gist(student_id with =, tstzrange(starts_at,ends_at,'[)') with &&)
);
create index lessons_tutor_time on public.lessons(tutor_id,starts_at,ends_at);
create index lessons_student_time on public.lessons(student_id,starts_at,ends_at);
create index lessons_completed_time on public.lessons(completed_at,starts_at) where completed_at is not null;

create function private.validate_lesson() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is distinct from new.tutor_id or not private.is_teacher() then
   raise exception 'Forbidden' using errcode='42501';
 end if;
 if tg_op='UPDATE' and new.tutor_id is distinct from old.tutor_id then
   raise exception 'Immutable tutor' using errcode='42501';
 end if;
 if not exists(select 1 from public.profiles where id=new.student_id and role='student') then
   raise exception 'Invalid student' using errcode='23514';
 end if;
 if not exists(select 1 from public.student_tutor_assignments where student_id=new.student_id and tutor_id=new.tutor_id) then
   raise exception 'Unassigned student' using errcode='23514';
 end if;
 if tg_op='INSERT' or new.subject_id is distinct from old.subject_id then
   if not exists(select 1 from public.subjects where id=new.subject_id and is_active) then
     raise exception 'Inactive subject' using errcode='23514';
   end if;
 end if;
 new.ends_at=new.starts_at + make_interval(mins=>new.duration_minutes);
 new.updated_at=now();
 return new;
end $$;
revoke all on function private.validate_lesson() from public,anon,authenticated;
create trigger validate_lesson before insert or update on public.lessons for each row execute function private.validate_lesson();

create table public.lesson_private_notes (
 lesson_id uuid primary key references public.lessons(id) on delete cascade,
 note text not null default '' check(char_length(note)<=4000),
 updated_at timestamptz not null default now()
);
create table public.user_schedule_preferences (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 msk_offset_hours smallint not null default 0 check(msk_offset_hours between -12 and 12),
 updated_at timestamptz not null default now()
);
create trigger notes_touch before update on public.lesson_private_notes for each row execute function private.touch_updated_at();
create trigger preferences_touch before update on public.user_schedule_preferences for each row execute function private.touch_updated_at();
alter table public.lessons enable row level security;
alter table public.lesson_private_notes enable row level security;
alter table public.user_schedule_preferences enable row level security;
revoke all on public.lessons,public.lesson_private_notes,public.user_schedule_preferences from anon,authenticated;
grant select,insert,update,delete on public.lessons,public.lesson_private_notes to authenticated;
grant select,insert,update on public.user_schedule_preferences to authenticated;
grant all on public.lessons,public.lesson_private_notes,public.user_schedule_preferences to service_role;
create policy lesson_read on public.lessons for select to authenticated using(private.is_admin() or tutor_id=auth.uid() or student_id=auth.uid());
create policy lesson_insert on public.lessons for insert to authenticated with check(private.is_teacher() and tutor_id=auth.uid());
create policy lesson_update on public.lessons for update to authenticated using(private.is_teacher() and tutor_id=auth.uid()) with check(private.is_teacher() and tutor_id=auth.uid());
create policy lesson_delete on public.lessons for delete to authenticated using(private.is_teacher() and tutor_id=auth.uid());
create policy note_read on public.lesson_private_notes for select to authenticated using(private.is_admin() or (private.is_teacher() and exists(select 1 from public.lessons where id=lesson_id and tutor_id=auth.uid())));
create policy note_insert on public.lesson_private_notes for insert to authenticated with check(private.is_teacher() and exists(select 1 from public.lessons where id=lesson_id and tutor_id=auth.uid()));
create policy note_update on public.lesson_private_notes for update to authenticated using(private.is_teacher() and exists(select 1 from public.lessons where id=lesson_id and tutor_id=auth.uid())) with check(private.is_teacher() and exists(select 1 from public.lessons where id=lesson_id and tutor_id=auth.uid()));
create policy note_delete on public.lesson_private_notes for delete to authenticated using(private.is_teacher() and exists(select 1 from public.lessons where id=lesson_id and tutor_id=auth.uid()));
create policy preference_read on public.user_schedule_preferences for select to authenticated using(user_id=auth.uid());
create policy preference_insert on public.user_schedule_preferences for insert to authenticated with check(user_id=auth.uid());
create policy preference_update on public.user_schedule_preferences for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy settings_teacher_read on public.app_settings for select to authenticated using(private.is_teacher());

-- Authenticated, SECURITY INVOKER RPC: lesson and note commit or roll back together.
-- This is a user operation under RLS, not a service-role RPC.
create function public.save_schedule_lesson(p_id uuid,p_student uuid,p_subject uuid,p_start timestamptz,p_duration integer,p_note text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid;
begin
 if not private.is_teacher() then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_id is null then
   insert into public.lessons(tutor_id,student_id,subject_id,starts_at,duration_minutes)
   values(auth.uid(),p_student,p_subject,p_start,p_duration) returning id into result;
 else
   update public.lessons set student_id=p_student,subject_id=p_subject,starts_at=p_start,duration_minutes=p_duration
   where id=p_id and tutor_id=auth.uid() returning id into result;
   if result is null then raise exception 'Not found' using errcode='42501'; end if;
 end if;
 insert into public.lesson_private_notes(lesson_id,note) values(result,p_note)
 on conflict(lesson_id) do update set note=excluded.note;
 return result;
end $$;
revoke all on function public.save_schedule_lesson(uuid,uuid,uuid,timestamptz,integer,text) from public,anon;
grant execute on function public.save_schedule_lesson(uuid,uuid,uuid,timestamptz,integer,text) to authenticated;

-- POST body avoids URL-length limits when a rectangle selects many lessons.
create function public.delete_schedule_lessons(p_ids uuid[]) returns integer
language plpgsql security invoker set search_path='' as $$
declare removed integer;
begin
 if not private.is_teacher() then raise exception 'Forbidden' using errcode='42501'; end if;
 delete from public.lessons where id=any(p_ids) and tutor_id=auth.uid();
 get diagnostics removed=row_count;
 return removed;
end $$;
revoke all on function public.delete_schedule_lessons(uuid[]) from public,anon;
grant execute on function public.delete_schedule_lessons(uuid[]) to authenticated;

-- Safe names remain readable for historical lessons after reassignment.
-- No expansion of peer profile/Telegram permissions and no notes in this API.
create function public.schedule_lesson_names(p_ids uuid[])
returns table(id uuid,student_name text,tutor_name text,subject_name text)
language sql stable security definer set search_path='' as $$
 select l.id,s.full_name,t.full_name,sub.name from public.lessons l
 join public.profiles s on s.id=l.student_id join public.profiles t on t.id=l.tutor_id
 join public.subjects sub on sub.id=l.subject_id
 where l.id=any(p_ids) and (l.student_id=auth.uid() or l.tutor_id=auth.uid() or private.is_admin());
$$;
revoke all on function public.schedule_lesson_names(uuid[]) from public,anon;
grant execute on function public.schedule_lesson_names(uuid[]) to authenticated;
