-- Package 012: explicit actor/owner authorization; no identity substitution.
begin;
select pg_advisory_xact_lock(842106001);
create function private.schedule_require_owner(p_owner uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare actor public.profiles; owner_profile public.profiles;
begin
 select * into actor from public.profiles where id=auth.uid() for share;
 if not found or actor.account_status<>'active' then raise exception 'Forbidden' using errcode='42501'; end if;
 select * into owner_profile from public.profiles where id=p_owner for share;
 if not found or owner_profile.account_status<>'active' or owner_profile.role not in ('tutor','admin') or (actor.id<>p_owner and actor.role<>'admin') or actor.role not in ('tutor','admin') then raise exception 'Forbidden' using errcode='42501'; end if;
 return p_owner;
end $$;
revoke all on function private.schedule_require_owner(uuid) from public,anon,authenticated;
create or replace function private.chat_pair_active(p_student uuid,p_tutor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles s,public.profiles t where s.id=p_student and s.role='student' and s.account_status='active'
 and t.id=p_tutor and t.role in ('tutor','admin') and t.account_status='active'
 and exists(select 1 from public.student_tutor_assignments a where a.student_id=s.id and a.tutor_id=t.id));
$$;
create or replace function private.chat_require_tutor() returns uuid language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and role in ('tutor','admin') and account_status='active') then raise exception 'Forbidden' using errcode='42501'; end if;
 return auth.uid();
end $$;
-- Stale reply buttons must not cancel a different, still valid recipient.
create function public.chat_bot_clear_unavailable_recipient(p_student uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.profiles where id=p_student and role='student' and account_status='active' for share;
 if not found then return; end if;
 delete from private.telegram_chat_state where student_id=p_student and not private.chat_pair_active(student_id,tutor_id);
end $$;
revoke all on function public.chat_bot_clear_unavailable_recipient(uuid) from public,anon,authenticated;
grant execute on function public.chat_bot_clear_unavailable_recipient(uuid) to service_role;
drop function public.chat_notification_target(uuid);
create function public.chat_notification_target(p_message uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('chatId',t.telegram_chat_id,'role',t.role) from public.chat_messages m join public.chat_conversations c on c.id=m.conversation_id join public.profiles t on t.id=c.tutor_id
 where m.id=p_message and m.sender_role='student' and private.chat_pair_active(c.student_id,c.tutor_id);
$$;
create function private.save_schedule_lesson_for_owner(p_owner uuid,p_id uuid,p_student uuid,p_subject uuid,p_start timestamptz,p_duration integer,p_note text,p_subject_changed boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result uuid; old public.lessons; actual timestamptz; subject uuid; local_day date; current_week date;
begin
 perform private.schedule_require_owner(p_owner);
 if not private.is_teacher() then raise exception 'Forbidden' using errcode='42501'; end if;
 perform private.rollover_tutor(p_owner);
 if p_note is null or char_length(p_note)>4000 then raise exception 'Invalid note' using errcode='23514'; end if;
 local_day=private.schedule_local_date(p_owner,p_start); current_week=private.schedule_week(p_owner);
 if p_id is null and (local_day<current_week or local_day>=current_week+7) then raise exception 'Current week only' using errcode='PT001'; end if;
 if p_id is not null then
   select * into old from public.lessons where id=p_id and tutor_id=p_owner for update;
   if not found then raise exception 'Forbidden' using errcode='42501'; end if;
 if old.inactive_reason is not null then raise exception 'Inactive lesson' using errcode='PT005'; end if;
   if date_trunc('week',local_day::timestamp)<>date_trunc('week',private.schedule_local_date(p_owner,old.starts_at)::timestamp) then raise exception 'Select a day of the lesson week' using errcode='PT003'; end if;
 end if;
 if local_day>=current_week+7 and not coalesce(old.is_transfer_target,false) then raise exception 'Future week' using errcode='PT002'; end if;
 subject=case when p_id is not null and not p_subject_changed then old.subject_id else p_subject end;
 if (p_id is null or p_subject_changed or p_student is distinct from old.student_id) and subject is null then raise exception 'Invalid subject' using errcode='23514'; end if;
 if p_id is null or p_subject_changed or p_student is distinct from old.student_id then
   perform 1 from public.subjects where id=subject and is_active for share;
   if not found then raise exception 'Inactive subject' using errcode='23514'; end if;
   perform 1 from public.tutor_subjects where tutor_id=p_owner and subject_id=subject for share;
   if not found then raise exception 'Unavailable subject' using errcode='23514'; end if;
   perform 1 from public.student_tutor_assignments where tutor_id=p_owner and student_id=p_student and subject_id=subject for share;
   if not found then raise exception 'Invalid assignment' using errcode='23514'; end if;
 end if;
 for retry in 1..3 loop
   begin
     actual=private.resolve_nearest_lesson_start(p_owner,p_student,p_start,p_duration,p_id,old.color);
     if p_id is null then
       insert into public.lessons(tutor_id,student_id,subject_id,starts_at,duration_minutes) values(p_owner,p_student,subject,actual,p_duration) returning id into result;
     else
       update public.lessons set student_id=p_student,subject_id=subject,starts_at=actual,duration_minutes=p_duration where id=p_id returning id into result;
     end if;
     insert into public.lesson_private_notes(lesson_id,note) values(result,p_note) on conflict(lesson_id) do update set note=excluded.note;
     return jsonb_build_object('lesson',private.lesson_dto(result),'requestedStart',p_start,'shifted',actual<>private.snap_lesson_start(p_owner,p_start));
   exception when exclusion_violation then
     if retry=3 then raise exception 'Concurrent update' using errcode='PT004'; end if;
   end;
 end loop;
end $$;
create function private.schedule_command_for_owner(p_owner uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 owner_id uuid=p_owner; op text=p_command->>'kind'; before_state jsonb; after_state jsonb; result jsonb='{}';
 ids uuid[]; source public.lessons; row_data jsonb; restored public.lessons; expected jsonb; target jsonb;
 start_time timestamptz; anchor timestamptz; actual timestamptz; shift_minutes integer; placed boolean=false;
 duration integer; new_id uuid; created uuid[]='{}'; affected uuid[]='{}'; students uuid[];
 scope jsonb; before_payload jsonb; after_payload jsonb; off integer; rule_date date; candidate_date date; current_week date; local_day date;
begin
 perform private.schedule_require_owner(owner_id);
 if owner_id<>auth.uid() and (op='offset' or (op='restore' and (coalesce((p_command->'target'->'payload'->>'offsetChanged')::boolean,false) or coalesce((p_command->'expected'->'payload'->>'offsetChanged')::boolean,false)))) then raise exception 'Delegated offset forbidden' using errcode='42501'; end if;
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
   result=private.save_schedule_lesson_for_owner(owner_id,(p_command->>'id')::uuid,(p_command->>'studentId')::uuid,(p_command->>'subjectId')::uuid,(p_command->>'startsAt')::timestamptz,(p_command->>'durationMinutes')::integer,p_command->>'note',coalesce((p_command->>'subjectChanged')::boolean,true));
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

create function public.schedule_owner_context(p_owner uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(842106001);
 perform private.schedule_require_owner(p_owner);
 perform private.rollover_tutor(p_owner);
 return jsonb_build_object('ownerId',p_owner,'ownerName',(select full_name from public.profiles where id=p_owner),
 'offset',coalesce((select msk_offset_hours from public.user_schedule_preferences where user_id=p_owner),0),
 'rules',coalesce((select jsonb_agg(jsonb_build_object('studentId',student_id,'availableFrom',available_from) order by student_id) from public.tutor_student_availability where tutor_id=p_owner),'[]'::jsonb));
end $$;
create function public.schedule_lesson_note(p_owner uuid,p_lesson uuid) returns text language plpgsql security definer set search_path='' as $$
begin
 perform private.schedule_require_owner(p_owner);
 if not exists(select 1 from public.lessons where id=p_lesson and tutor_id=p_owner) then raise exception 'Forbidden' using errcode='42501'; end if;
 return coalesce((select note from public.lesson_private_notes where lesson_id=p_lesson),'');
end $$;
create function public.schedule_command(p_owner uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(842106001);
 perform private.schedule_require_owner(p_owner);
 return private.schedule_command_for_owner(p_owner,p_command);
end $$;
create or replace function public.schedule_command(p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(842106001);
 if not private.is_active_user() then raise exception 'Forbidden' using errcode='42501'; end if;
 if private.is_teacher() then return public.schedule_command(auth.uid(),p_command); end if;
 return private.schedule_command_009(p_command);
end $$;
revoke all on function private.save_schedule_lesson_for_owner(uuid,uuid,uuid,uuid,timestamptz,integer,text,boolean),private.schedule_command_for_owner(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.schedule_command(uuid,jsonb),public.schedule_owner_context(uuid),public.schedule_lesson_note(uuid,uuid) from public,anon;
grant execute on function public.schedule_command(uuid,jsonb),public.schedule_owner_context(uuid),public.schedule_lesson_note(uuid,uuid) to authenticated;
revoke all on function public.chat_notification_target(uuid) from public,anon,authenticated;
grant execute on function public.chat_notification_target(uuid) to service_role;
commit;
