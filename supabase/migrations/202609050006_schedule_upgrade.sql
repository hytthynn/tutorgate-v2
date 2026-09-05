-- FR-02/08/09/10/13. Apply after 005; never rewrite deployed migrations.
begin;
-- Backfill before enabling the new validator (005 checks auth.uid on updates).
alter table public.lessons disable trigger validate_lesson;
alter table public.lessons add column subject_name_snapshot text;
update public.lessons l set subject_name_snapshot=s.name from public.subjects s where s.id=l.subject_id;
alter table public.lessons alter column subject_name_snapshot set not null;
alter table public.lessons alter column subject_id drop not null;
alter table public.lessons drop constraint lessons_subject_id_fkey;
alter table public.lessons drop constraint lessons_tutor_id_subject_id_fkey;
alter table public.lessons add constraint lessons_subject_id_fkey foreign key(subject_id) references public.subjects(id) on delete set null;

create function private.schedule_week(p_tutor uuid,p_now timestamptz default now()) returns date
language sql stable security definer set search_path='' as $$
 select date_trunc('week',(p_now at time zone 'UTC') + make_interval(hours=>3+coalesce((select msk_offset_hours from public.user_schedule_preferences where user_id=p_tutor),0)))::date;
$$;
create function private.schedule_local_date(p_tutor uuid,p_start timestamptz) returns date
language sql stable security definer set search_path='' as $$
 select ((p_start at time zone 'UTC') + make_interval(hours=>3+coalesce((select msk_offset_hours from public.user_schedule_preferences where user_id=p_tutor),0)))::date;
$$;
create or replace function private.validate_lesson() returns trigger language plpgsql security definer set search_path='' as $$
begin
 -- All browser writes now go through owner-checked RPCs. The trigger is also
 -- used by trusted cron and FK ON DELETE SET NULL, neither has an end-user uid.
 if tg_op='UPDATE' and new.tutor_id is distinct from old.tutor_id then
   raise exception 'Immutable tutor' using errcode='42501';
 end if;
 if not exists(select 1 from public.profiles where id=new.tutor_id and role in ('tutor','admin'))
 or not exists(select 1 from public.profiles where id=new.student_id and role='student') then
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
alter table public.lessons enable trigger validate_lesson;

create or replace function public.schedule_lesson_names(p_ids uuid[])
returns table(id uuid,student_name text,tutor_name text,subject_name text)
language sql stable security definer set search_path='' as $$
 select l.id,s.full_name,t.full_name,coalesce(sub.name,l.subject_name_snapshot) from public.lessons l
 join public.profiles s on s.id=l.student_id join public.profiles t on t.id=l.tutor_id
 left join public.subjects sub on sub.id=l.subject_id
 where l.id=any(p_ids) and (l.student_id=auth.uid() or l.tutor_id=auth.uid() or private.is_admin());
$$;

create function private.snap_lesson_start(p_tutor uuid,p_desired timestamptz) returns timestamptz
language sql stable security definer set search_path='' as $$
 with boundary as (
   select (private.schedule_local_date(p_tutor,p_desired)::timestamp - make_interval(hours=>3+coalesce((select msk_offset_hours from public.user_schedule_preferences where user_id=p_tutor),0))) at time zone 'UTC' as midnight
 ) select midnight + make_interval(mins=>least(1435,greatest(0,round(extract(epoch from (p_desired-midnight))/300)::integer*5))) from boundary;
$$;
revoke all on function private.snap_lesson_start(uuid,timestamptz) from public,anon,authenticated;

-- This helper is never callable by API roles. It sees hidden student conflicts
-- but exposes neither their IDs nor their participants, subjects or notes.
create function private.resolve_nearest_lesson_start(p_tutor uuid,p_student uuid,p_desired timestamptz,p_duration integer,p_ignore uuid default null)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare day_start timestamptz; desired_min integer; candidate timestamptz; minute integer; off integer;
begin
 if p_duration is null or p_duration not between 1 and 600 or p_desired is null or not isfinite(p_desired) then
   raise exception 'Invalid duration or date' using errcode='23514';
 end if;
 select 3+coalesce((select msk_offset_hours from public.user_schedule_preferences where user_id=p_tutor),0) into off;
 day_start=(private.schedule_local_date(p_tutor,p_desired)::timestamp - make_interval(hours=>off)) at time zone 'UTC';
 -- Clamp a 23:59 snap to 23:55: start must stay in the user's chosen day.
 desired_min=least(1435,greatest(0,round(extract(epoch from (p_desired-day_start))/300)::integer*5));
 for minute in select m from generate_series(0,1435,5) m order by abs(m-desired_min),m desc loop
   candidate=day_start+make_interval(mins=>minute);
   if not exists(select 1 from public.lessons l where l.tutor_id=p_tutor and l.id is distinct from p_ignore and l.starts_at<candidate+make_interval(mins=>p_duration) and l.ends_at>candidate)
   and not exists(select 1 from public.lessons l where l.student_id=p_student and l.id is distinct from p_ignore and l.starts_at<candidate+make_interval(mins=>p_duration) and l.ends_at>candidate) then
     return candidate;
   end if;
 end loop;
 raise exception 'No free interval' using errcode='P0002';
end $$;

create index lessons_tutor_updated on public.lessons(tutor_id,updated_at,id);
create index lessons_student_updated on public.lessons(student_id,updated_at,id);

create table public.schedule_week_rollovers (
 tutor_id uuid not null references public.profiles(id) on delete cascade,
 target_week_start date not null,
 copied_count integer not null default 0,
 skipped_count integer not null default 0,
 results jsonb not null default '[]',
 completed_at timestamptz not null default now(),
 primary key(tutor_id,target_week_start)
);
alter table public.schedule_week_rollovers enable row level security;
revoke all on public.schedule_week_rollovers from public,anon,authenticated;
grant select on public.schedule_week_rollovers to authenticated;
grant all on public.schedule_week_rollovers to service_role;
create policy rollover_owner_read on public.schedule_week_rollovers for select to authenticated using(tutor_id=auth.uid());

-- One transaction advisory lock serializes schedule writers/cron/hard-delete.
-- Conservative lock scope prevents multi-owner student races and deadlocks.
-- Resolver checks themselves use the existing tutor/student time indexes.
create function private.rollover_tutor(p_tutor uuid,p_now timestamptz default now()) returns void
language plpgsql security definer set search_path='' as $$
declare target date; off integer; boundary timestamptz; source public.lessons; actual timestamptz; new_id uuid; copied integer=0; skipped integer=0; log jsonb='[]';
begin
 perform pg_advisory_xact_lock(842106001);
 if not exists(select 1 from public.profiles where id=p_tutor and role in ('tutor','admin')) then return; end if;
 target=private.schedule_week(p_tutor,p_now);
 insert into public.schedule_week_rollovers(tutor_id,target_week_start) values(p_tutor,target) on conflict do nothing;
 if not found then return; end if;
 select 3+coalesce((select msk_offset_hours from public.user_schedule_preferences where user_id=p_tutor),0) into off;
 boundary=(target::timestamp-make_interval(hours=>off)) at time zone 'UTC';
 for source in select * from public.lessons where tutor_id=p_tutor and starts_at>=boundary-interval '7 days' and starts_at<boundary order by starts_at,id loop
   begin
     if source.subject_id is null or not exists(select 1 from public.subjects where id=source.subject_id and is_active)
     or not exists(select 1 from public.tutor_subjects where tutor_id=p_tutor and subject_id=source.subject_id)
     or not exists(select 1 from public.student_tutor_assignments where tutor_id=p_tutor and student_id=source.student_id and subject_id=source.subject_id) then
       skipped=skipped+1; log=log||jsonb_build_array(jsonb_build_object('sourceId',source.id,'reason','invalid_assignment')); continue;
     end if;
     actual=private.resolve_nearest_lesson_start(p_tutor,source.student_id,source.starts_at+interval '7 days',source.duration_minutes);
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
create function public.ensure_schedule_rollover() returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_teacher() then raise exception 'Forbidden' using errcode='42501'; end if;
 perform private.rollover_tutor(auth.uid());
end $$;
create function private.rollover_all_schedules() returns void language plpgsql security definer set search_path='' as $$
declare owner_id uuid;
begin
 for owner_id in select id from public.profiles where role in ('tutor','admin') order by id loop
   perform private.rollover_tutor(owner_id);
 end loop;
end $$;

create function private.lesson_dto(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',l.id,'tutorId',l.tutor_id,'studentId',l.student_id,'subjectId',l.subject_id,
 'studentName',s.full_name,'tutorName',t.full_name,'subjectName',coalesce(sub.name,l.subject_name_snapshot),
 'startsAt',l.starts_at,'endsAt',l.ends_at,'durationMinutes',l.duration_minutes,'color',l.color,'completed',l.completed_at is not null)
 from public.lessons l join public.profiles s on s.id=l.student_id join public.profiles t on t.id=l.tutor_id
 left join public.subjects sub on sub.id=l.subject_id where l.id=p_id;
$$;

-- Replace the old UUID-only RPC with normalized, private-note-free responses.
drop function public.save_schedule_lesson(uuid,uuid,uuid,timestamptz,integer,text);
create function public.save_schedule_lesson(p_id uuid,p_student uuid,p_subject uuid,p_start timestamptz,p_duration integer,p_note text,p_subject_changed boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result uuid; old public.lessons; actual timestamptz; subject uuid; local_day date; current_week date;
begin
 if not private.is_teacher() then raise exception 'Forbidden' using errcode='42501'; end if;
 perform private.rollover_tutor(auth.uid());
 if p_note is null or char_length(p_note)>4000 then raise exception 'Invalid note' using errcode='23514'; end if;
 local_day=private.schedule_local_date(auth.uid(),p_start); current_week=private.schedule_week(auth.uid());
 if p_id is null and (local_day<current_week or local_day>=current_week+7) then raise exception 'Current week only' using errcode='PT001'; end if;
 if p_id is not null then
   select * into old from public.lessons where id=p_id and tutor_id=auth.uid() for update;
   if not found then raise exception 'Forbidden' using errcode='42501'; end if;
   if date_trunc('week',local_day::timestamp)<>date_trunc('week',private.schedule_local_date(auth.uid(),old.starts_at)::timestamp) then raise exception 'Select a day of the lesson week' using errcode='PT003'; end if;
 end if;
 if local_day>=current_week+7 then raise exception 'Future week' using errcode='PT002'; end if;
 subject=case when p_id is not null and not p_subject_changed then old.subject_id else p_subject end;
 if (p_id is null or p_subject_changed or p_student is distinct from old.student_id) and subject is null then raise exception 'Invalid subject' using errcode='23514'; end if;
 if p_id is null or p_subject_changed or p_student is distinct from old.student_id then
   perform 1 from public.subjects where id=subject and is_active for share;
   if not found then raise exception 'Inactive subject' using errcode='23514'; end if;
   perform 1 from public.tutor_subjects where tutor_id=auth.uid() and subject_id=subject for share;
   if not found then raise exception 'Unavailable subject' using errcode='23514'; end if;
   perform 1 from public.student_tutor_assignments where tutor_id=auth.uid() and student_id=p_student and subject_id=subject for share;
   if not found then raise exception 'Invalid assignment' using errcode='23514'; end if;
 end if;
 for retry in 1..3 loop
   begin
     actual=private.resolve_nearest_lesson_start(auth.uid(),p_student,p_start,p_duration,p_id);
     if p_id is null then
       insert into public.lessons(tutor_id,student_id,subject_id,starts_at,duration_minutes) values(auth.uid(),p_student,subject,actual,p_duration) returning id into result;
     else
       update public.lessons set student_id=p_student,subject_id=subject,starts_at=actual,duration_minutes=p_duration where id=p_id returning id into result;
     end if;
     insert into public.lesson_private_notes(lesson_id,note) values(result,p_note) on conflict(lesson_id) do update set note=excluded.note;
     return jsonb_build_object('lesson',private.lesson_dto(result),'requestedStart',p_start,'shifted',actual<>private.snap_lesson_start(auth.uid(),p_start));
   exception when exclusion_violation then
     if retry=3 then raise exception 'Concurrent update' using errcode='PT004'; end if;
   end;
 end loop;
end $$;
create function public.patch_schedule_lesson(p_id uuid,p_start timestamptz default null,p_color text default null,p_completed boolean default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare old public.lessons; actual timestamptz;
begin
 if not private.is_teacher() then raise exception 'Forbidden' using errcode='42501'; end if;
 perform private.rollover_tutor(auth.uid());
 select * into old from public.lessons where id=p_id and tutor_id=auth.uid() for update;
 if not found then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_start is not null and private.schedule_local_date(auth.uid(),p_start)>=private.schedule_week(auth.uid())+7 then raise exception 'Future week' using errcode='PT002'; end if;
 for retry in 1..3 loop
   begin
     actual=case when p_start is null then old.starts_at else private.resolve_nearest_lesson_start(auth.uid(),old.student_id,p_start,old.duration_minutes,p_id) end;
     update public.lessons set starts_at=actual,color=coalesce(p_color,color),completed_at=case when p_completed is null then completed_at when p_completed then coalesce(completed_at,now()) else null end where id=p_id;
     return jsonb_build_object('lesson',private.lesson_dto(p_id),'requestedStart',p_start,'shifted',p_start is not null and private.snap_lesson_start(auth.uid(),p_start)<>actual);
   exception when exclusion_violation then
     if retry=3 then raise exception 'Concurrent update' using errcode='PT004'; end if;
   end;
 end loop;
end $$;

drop function public.delete_schedule_lessons(uuid[]);
create function public.delete_schedule_lessons(p_ids uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare ids uuid[];
begin
 if not private.is_teacher() then raise exception 'Forbidden' using errcode='42501'; end if;
 perform private.rollover_tutor(auth.uid());
 with removed as (delete from public.lessons where tutor_id=auth.uid() and id=any(p_ids) returning id)
 select coalesce(array_agg(id),'{}'::uuid[]) into ids from removed;
 return jsonb_build_object('ids',ids);
end $$;
create function public.delete_subject_hard(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Forbidden' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(842106001);
 -- Retain the creation/selection-time historical snapshot; names are live until deletion.
 delete from public.student_tutor_assignments where subject_id=p_id;
 delete from public.tutor_subjects where subject_id=p_id;
 delete from public.application_subjects where subject_id=p_id;
 delete from public.subjects where id=p_id;
end $$;
-- Prevent bypass of future-week/magnet/ownership contracts with direct table writes.
revoke insert,update,delete on public.lessons,public.lesson_private_notes from authenticated;
revoke delete on public.subjects from authenticated;
-- Tighten note reads: even admin reads only their own private notes.
drop policy note_read on public.lesson_private_notes;
create policy note_read on public.lesson_private_notes for select to authenticated using(private.is_teacher() and exists(select 1 from public.lessons where id=lesson_id and tutor_id=auth.uid()));

revoke all on function private.schedule_week(uuid,timestamptz),private.schedule_local_date(uuid,timestamptz),private.resolve_nearest_lesson_start(uuid,uuid,timestamptz,integer,uuid),private.rollover_tutor(uuid,timestamptz),private.rollover_all_schedules(),private.lesson_dto(uuid) from public,anon,authenticated;
revoke all on function public.ensure_schedule_rollover(),public.save_schedule_lesson(uuid,uuid,uuid,timestamptz,integer,text,boolean),public.patch_schedule_lesson(uuid,timestamptz,text,boolean),public.delete_schedule_lessons(uuid[]),public.delete_subject_hard(uuid) from public,anon;
grant execute on function public.ensure_schedule_rollover(),public.save_schedule_lesson(uuid,uuid,uuid,timestamptz,integer,text,boolean),public.patch_schedule_lesson(uuid,timestamptz,text,boolean),public.delete_schedule_lessons(uuid[]),public.delete_subject_hard(uuid) to authenticated;

-- Supabase supports pg_cron. PGlite / distributions without the extension still
-- execute business migrations; deploy-check MUST fail if cron is unavailable.
do $$
begin
 if exists(select 1 from pg_available_extensions where name='pg_cron') then
   create extension if not exists pg_cron;
   perform cron.schedule('tutorgate-week-rollover','*/5 * * * *','select private.rollover_all_schedules()');
 else
   raise warning 'pg_cron unavailable: enable Supabase Cron and run supabase/ops/enable_schedule_cron.sql before production';
 end if;
end $$;
commit;
