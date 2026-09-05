-- Schedule package 008. Signed snapshots live only in the client session.
begin;
alter table public.lessons add column inactive_reason text check(inactive_reason in ('transferred','available_from')),
 add column inactive_until date, add column is_transfer_target boolean not null default false,
 add column transfer_source_id uuid, add column transfer_source_starts_at timestamptz;
create table public.tutor_student_availability (
 tutor_id uuid not null references public.profiles(id) on delete cascade,
 student_id uuid not null references public.profiles(id) on delete cascade,
 available_from date not null, primary key(tutor_id,student_id));
alter table public.tutor_student_availability enable row level security;
revoke all on public.tutor_student_availability from public,anon,authenticated;
grant select on public.tutor_student_availability to authenticated;
grant all on public.tutor_student_availability to service_role;
create policy availability_owner on public.tutor_student_availability for select to authenticated using(tutor_id=auth.uid() and private.is_teacher());
alter table public.lessons drop constraint lessons_tutor_overlap, drop constraint lessons_student_overlap;
alter table public.lessons add constraint lessons_tutor_normal_overlap exclude using gist (tutor_id with =, tstzrange(starts_at,ends_at,'[)') with &&) where (inactive_reason is null and color <> 'coral') deferrable initially immediate;
alter table public.lessons add constraint lessons_tutor_coral_overlap exclude using gist (tutor_id with =, tstzrange(starts_at,ends_at,'[)') with &&) where (inactive_reason is null and color = 'coral') deferrable initially immediate;
alter table public.lessons add constraint lessons_student_normal_overlap exclude using gist (student_id with =, tstzrange(starts_at,ends_at,'[)') with &&) where (inactive_reason is null and color <> 'coral') deferrable initially immediate;
alter table public.lessons add constraint lessons_student_coral_overlap exclude using gist (student_id with =, tstzrange(starts_at,ends_at,'[)') with &&) where (inactive_reason is null and color = 'coral') deferrable initially immediate;
create table private.schedule_signing_key (key bytea not null);
insert into private.schedule_signing_key values (sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')));
revoke all on private.schedule_signing_key from public,anon,authenticated;
create function private.sign_schedule(p jsonb) returns text language sql stable security definer set search_path='' as $$
 select encode(sha256(key||sha256(convert_to(p::text,'UTF8'))),'hex') from private.schedule_signing_key;
$$;
create function private.schedule_snapshot(p_owner uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('owner',p_owner,'lessons',coalesce((select jsonb_agg(to_jsonb(l)||jsonb_build_object('note',coalesce(n.note,'')) order by l.id) from public.lessons l left join public.lesson_private_notes n on n.lesson_id=l.id where l.tutor_id=p_owner),'[]'::jsonb),
 'rules',coalesce((select jsonb_agg(to_jsonb(a) order by student_id) from public.tutor_student_availability a where tutor_id=p_owner),'[]'::jsonb),
 'offset',coalesce((select msk_offset_hours from public.user_schedule_preferences where user_id=p_owner),0));
$$;
create function private.signed_schedule_snapshot(p_owner uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('payload',p,'signature',private.sign_schedule(p)) from (select private.schedule_snapshot(p_owner) p) s;
$$;
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
create function private.lesson_activity() returns trigger language plpgsql security definer set search_path='' as $$
declare available date;
begin
 if new.inactive_reason is distinct from 'transferred' then
 select available_from into available from public.tutor_student_availability where tutor_id=new.tutor_id and student_id=new.student_id;
 new.inactive_reason=case when private.schedule_local_date(new.tutor_id,new.starts_at)<available then 'available_from' else null end;
 new.inactive_until=case when new.inactive_reason='available_from' then available else null end;
 else new.inactive_until=null; end if;
 if new.inactive_reason is not null then new.completed_at=null; end if;
 return new;
end $$;
create trigger lesson_activity before insert or update on public.lessons for each row execute function private.lesson_activity();
create or replace function private.resolve_nearest_lesson_start(p_tutor uuid,p_student uuid,p_desired timestamptz,p_duration integer,p_ignore uuid,p_color text)
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
 if exists(select 1 from public.tutor_student_availability where tutor_id=p_tutor and student_id=p_student and private.schedule_local_date(p_tutor,p_desired)<available_from) then return private.snap_lesson_start(p_tutor,p_desired); end if;
 for minute in select m from generate_series(0,1435,5) m order by abs(m-desired_min),m desc loop
   candidate=day_start+make_interval(mins=>minute);
   if not exists(select 1 from public.lessons l where l.tutor_id=p_tutor and l.id is distinct from p_ignore and l.inactive_reason is null and (l.color='coral')=(coalesce(p_color,(select color from public.lessons where id=p_ignore),'default')='coral') and l.starts_at<candidate+make_interval(mins=>p_duration) and l.ends_at>candidate)
   and not exists(select 1 from public.lessons l where l.student_id=p_student and l.id is distinct from p_ignore and l.inactive_reason is null and (l.color='coral')=(coalesce(p_color,(select color from public.lessons where id=p_ignore),'default')='coral') and l.starts_at<candidate+make_interval(mins=>p_duration) and l.ends_at>candidate) then
     return candidate;
   end if;
 end loop;
 raise exception 'No free interval' using errcode='P0002';
end $$;
create or replace function private.resolve_nearest_lesson_start(p_tutor uuid,p_student uuid,p_desired timestamptz,p_duration integer,p_ignore uuid default null) returns timestamptz language sql security definer set search_path='' as $$ select private.resolve_nearest_lesson_start(p_tutor,p_student,p_desired,p_duration,p_ignore,null); $$;
create or replace function private.rollover_tutor(p_tutor uuid,p_now timestamptz default now()) returns void
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
end $$;create or replace function private.lesson_dto(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',l.id,'tutorId',l.tutor_id,'studentId',l.student_id,'subjectId',l.subject_id,
 'studentName',s.full_name,'tutorName',t.full_name,'subjectName',coalesce(sub.name,l.subject_name_snapshot),
 'startsAt',l.starts_at,'endsAt',l.ends_at,'durationMinutes',l.duration_minutes,'color',l.color,'completed',l.completed_at is not null,'inactiveReason',l.inactive_reason,'inactiveUntil',l.inactive_until,'isTransferTarget',l.is_transfer_target,'transferSourceId',l.transfer_source_id,'transferSourceStartsAt',l.transfer_source_starts_at)
 from public.lessons l join public.profiles s on s.id=l.student_id join public.profiles t on t.id=l.tutor_id
 left join public.subjects sub on sub.id=l.subject_id where l.id=p_id;
$$;
create or replace function public.save_schedule_lesson(p_id uuid,p_student uuid,p_subject uuid,p_start timestamptz,p_duration integer,p_note text,p_subject_changed boolean default true)
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
 if old.inactive_reason is not null then raise exception 'Inactive lesson' using errcode='PT005'; end if;
   if date_trunc('week',local_day::timestamp)<>date_trunc('week',private.schedule_local_date(auth.uid(),old.starts_at)::timestamp) then raise exception 'Select a day of the lesson week' using errcode='PT003'; end if;
 end if;
 if local_day>=current_week+7 and not coalesce(old.is_transfer_target,false) then raise exception 'Future week' using errcode='PT002'; end if;
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
     actual=private.resolve_nearest_lesson_start(auth.uid(),p_student,p_start,p_duration,p_id,old.color);
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
create or replace function public.patch_schedule_lesson(p_id uuid,p_start timestamptz default null,p_color text default null,p_completed boolean default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare old public.lessons; actual timestamptz;
begin
 if not private.is_teacher() then raise exception 'Forbidden' using errcode='42501'; end if;
 perform private.rollover_tutor(auth.uid());
 select * into old from public.lessons where id=p_id and tutor_id=auth.uid() for update;
 if not found then raise exception 'Forbidden' using errcode='42501'; end if;
 if old.inactive_reason is not null then raise exception 'Inactive lesson' using errcode='PT005'; end if;
 if p_start is not null and private.schedule_local_date(auth.uid(),p_start)>=private.schedule_week(auth.uid())+7 then raise exception 'Future week' using errcode='PT002'; end if;
 for retry in 1..3 loop
   begin
     actual=case when p_start is null then old.starts_at else private.resolve_nearest_lesson_start(auth.uid(),old.student_id,p_start,old.duration_minutes,p_id,coalesce(p_color,old.color)) end;
     update public.lessons set starts_at=actual,color=coalesce(p_color,color),completed_at=case when p_completed is null then completed_at when p_completed then coalesce(completed_at,now()) else null end where id=p_id;
     return jsonb_build_object('lesson',private.lesson_dto(p_id),'requestedStart',p_start,'shifted',p_start is not null and private.snap_lesson_start(auth.uid(),p_start)<>actual);
   exception when exclusion_violation then
     if retry=3 then raise exception 'Concurrent update' using errcode='PT004'; end if;
   end;
 end loop;
end $$;

-- History carries only affected records. Unrelated lessons never travel back on undo.
create function private.scope_schedule(p jsonb, scope jsonb) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('owner',p->'owner','lessonIds',scope->'lessonIds','studentIds',scope->'studentIds','offsetChanged',scope->'offsetChanged',
 'lessons',coalesce((select jsonb_agg(l order by l->>'id') from jsonb_array_elements(p->'lessons') l where scope->'lessonIds' ? (l->>'id')),'[]'::jsonb),
 'rules',coalesce((select jsonb_agg(r order by r->>'student_id') from jsonb_array_elements(p->'rules') r where scope->'studentIds' ? (r->>'student_id')),'[]'::jsonb),
 'offset',case when (scope->>'offsetChanged')::boolean then p->'offset' else 'null'::jsonb end);
$$;
-- Only signed, owner-bound snapshots may be restored; compare-and-swap rejects stale history.
create function public.schedule_command(p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
   delete from public.lessons where id=any(ids) and tutor_id=owner_id;
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
revoke all on function public.schedule_command(jsonb) from public,anon;
grant execute on function public.schedule_command(jsonb) to authenticated;
revoke all on function private.scope_schedule(jsonb,jsonb),private.sign_schedule(jsonb), private.schedule_snapshot(uuid), private.signed_schedule_snapshot(uuid),private.lesson_activity(),private.resolve_nearest_lesson_start(uuid,uuid,timestamptz,integer,uuid,text) from public,anon,authenticated;
commit;
