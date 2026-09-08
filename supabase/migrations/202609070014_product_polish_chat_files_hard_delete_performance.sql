-- Package 014: status presentation and coral temporal invariants.
begin;
select pg_advisory_xact_lock(842106001);
-- Invalidate pre-014 signed histories, including historical coral moves.
update private.schedule_signing_key set key=sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8'));
create or replace function private.save_schedule_lesson_for_owner(p_owner uuid,p_id uuid,p_student uuid,p_subject uuid,p_start timestamptz,p_duration integer,p_note text,p_subject_changed boolean default true)
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
 if old.color='coral' and (p_start is distinct from old.starts_at or p_duration is distinct from old.duration_minutes) then raise exception 'Coral time locked' using errcode='PT014'; end if;
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
     actual=case when old.color='coral' then old.starts_at else private.resolve_nearest_lesson_start(p_owner,p_student,p_start,p_duration,p_id,old.color) end;
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
create or replace function private.schedule_command_for_owner(p_owner uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
 if op in ('move','transfer') and exists(select 1 from public.lessons where id=any(ids) and color='coral') then raise exception 'Coral time locked' using errcode='PT014'; end if;
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

create function private.guard_coral_time() returns trigger language plpgsql set search_path='' as $$
begin
 if old.color='coral' and (new.starts_at is distinct from old.starts_at or new.duration_minutes is distinct from old.duration_minutes) then raise exception 'Coral time locked' using errcode='PT014'; end if;
 return new;
end $$;
revoke all on function private.guard_coral_time() from public,anon,authenticated;
create trigger coral_time_lock before update on public.lessons for each row execute function private.guard_coral_time();

create function public.schedule_week_snapshot(p_owner uuid,p_week date) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles; off integer; lo timestamptz; hi timestamptz; result jsonb;
begin
 select * into actor from public.profiles where id=auth.uid() for share;
 if not found or actor.account_status<>'active' then raise exception 'Forbidden' using errcode='42501'; end if;
 if actor.role='student' then
   if p_owner<>actor.id then raise exception 'Forbidden' using errcode='42501'; end if;
 else perform private.schedule_require_owner(p_owner); end if;
 if p_week is null or extract(isodow from p_week)<>1 then raise exception 'Invalid week' using errcode='22023'; end if;
 select coalesce((select msk_offset_hours from public.user_schedule_preferences where user_id=p_owner),0) into off;
 lo=p_week::timestamp at time zone 'UTC' - make_interval(hours=>3+off); hi=lo+interval '7 days';
 select jsonb_build_object('lessons',coalesce(jsonb_agg(dto order by starts_at,id),'[]'::jsonb)) into result from (
 select l.id,l.starts_at,jsonb_build_object('id',l.id,'tutorId',l.tutor_id,'studentId',l.student_id,'subjectId',l.subject_id,
 'studentName',st.full_name,'tutorName',t.full_name,'subjectName',coalesce(sub.name,l.subject_name_snapshot),
 'startsAt',l.starts_at,'endsAt',l.ends_at,'durationMinutes',l.duration_minutes,'color',l.color,'completed',l.completed_at is not null,
 'inactiveReason',l.inactive_reason,'inactiveUntil',l.inactive_until,'isTransferTarget',l.is_transfer_target,'transferSourceId',l.transfer_source_id,'transferSourceStartsAt',l.transfer_source_starts_at) dto
 from public.lessons l join public.profiles st on st.id=l.student_id join public.profiles t on t.id=l.tutor_id left join public.subjects sub on sub.id=l.subject_id
 where l.starts_at>=lo-interval '600 minutes' and l.ends_at>lo and l.starts_at<hi and (case when actor.role='student' then l.student_id=p_owner else l.tutor_id=p_owner end)) x;
 return result||jsonb_build_object(
 'students',case when actor.role='student' then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',full_name) order by full_name,id) from public.profiles st where st.role='student' and st.account_status='active' and exists(select 1 from public.student_tutor_assignments a where a.tutor_id=p_owner and a.student_id=st.id)),'[]'::jsonb) end,
 'subjects',case when actor.role='student' then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id',sub.id,'name',sub.name) order by sub.name) from public.subjects sub join public.tutor_subjects ts on ts.subject_id=sub.id where ts.tutor_id=p_owner and sub.is_active),'[]'::jsonb) end,
 'assignments',case when actor.role='student' then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('studentId',student_id,'subjectId',subject_id)) from public.student_tutor_assignments where tutor_id=p_owner),'[]'::jsonb) end);
end $$;
revoke all on function public.schedule_week_snapshot(uuid,date) from public,anon;
grant execute on function public.schedule_week_snapshot(uuid,date) to authenticated;


alter table public.chat_messages add column content jsonb;
update public.chat_messages set content=jsonb_build_array(jsonb_build_object('text',body,'marks','[]'::jsonb));
create function private.chat_content_default() returns trigger language plpgsql set search_path='' as $$
begin
 if new.content is null then new.content=jsonb_build_array(jsonb_build_object('text',new.body,'marks','[]'::jsonb)); end if;
 return new;
end $$;
create trigger chat_content_default before insert on public.chat_messages for each row execute function private.chat_content_default();
revoke all on function private.chat_content_default() from public,anon,authenticated;
create function public.chat_send_rich(p_student uuid,p_content jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid=private.chat_require_tutor(); m public.chat_messages; txt text; n jsonb; mark jsonb;
begin
 if jsonb_typeof(p_content)<>'array' or jsonb_array_length(p_content)>4000 then raise exception 'Invalid content' using errcode='22023'; end if;
 for n in select value from jsonb_array_elements(p_content) loop
 if jsonb_typeof(n->'text') is distinct from 'string' or jsonb_typeof(n->'marks') is distinct from 'array' or jsonb_array_length(n->'marks')>7 then raise exception 'Invalid content' using errcode='22023'; end if;
 for mark in select value from jsonb_array_elements(n->'marks') loop
 if mark->>'type' is null or mark->>'type' not in ('bold','italic','underline','strike','code','link','blockquote') or (mark->>'type'='link' and (coalesce(mark->>'href','') !~ '^https?://[^[:space:]]+$')) then raise exception 'Invalid mark' using errcode='22023'; end if;
 end loop;
 end loop;
 select string_agg(value->>'text','' order by ord) into txt from jsonb_array_elements(p_content) with ordinality a(value,ord);
 if txt is null or char_length(txt)>4000 or char_length(btrim(txt))=0 then raise exception 'Invalid text' using errcode='22023'; end if;
 m=private.chat_append(p_student,actor,'tutor',txt);
 update public.chat_messages set content=p_content,body=txt where id=m.id returning * into m;
 return to_jsonb(m)-'conversation_id';
end $$;
revoke all on function public.chat_send_rich(uuid,jsonb) from public,anon;
grant execute on function public.chat_send_rich(uuid,jsonb) to authenticated;
create or replace function public.chat_snapshot(p_student uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.chat_require_tutor(); directory jsonb; history jsonb:='[]'; c uuid; more boolean:=false;
begin
 select coalesce(jsonb_agg(row_data order by last_at desc nulls last,full_name,student_id),'[]') into directory from (
 select s.full_name,s.id student_id,last_msg.created_at last_at,
 jsonb_build_object('studentId',s.id,'studentName',s.full_name,'conversationId',cv.id,'lastMessage',left(last_msg.body,160),'lastAt',last_msg.created_at,
 'unread',(select count(*) from public.chat_messages m where m.conversation_id=cv.id and m.sender_role='student' and m.created_at>cv.tutor_last_read_at)) row_data
 from public.profiles s left join public.chat_conversations cv on cv.student_id=s.id and cv.tutor_id=actor
 left join lateral (select body,created_at from public.chat_messages where conversation_id=cv.id order by created_at desc limit 1) last_msg on true
 where private.chat_pair_active(s.id,actor)) x;
 if p_student is not null and private.chat_pair_active(p_student,actor) then
 select id into c from public.chat_conversations where student_id=p_student and tutor_id=actor;
 select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at),'[]') into history from
 (select id,sender_role,body,content,delivery_status,created_at,coalesce((select jsonb_agg(to_jsonb(a)-'storage_path') from public.chat_attachments a where a.message_id=msg.id),'[]'::jsonb) attachments from public.chat_messages msg where conversation_id=c order by created_at desc limit 200) m;
 select exists(select 1 from public.chat_messages where conversation_id=c order by created_at desc offset 200 limit 1) into more;
 end if;
 return jsonb_build_object('conversations',directory,'messages',history,'hasMore',more,'totalUnread',public.chat_unread(),'cursor',coalesce((select max(revision) from public.chat_messages where conversation_id=c),0)::text,'directoryVersion',coalesce((select version from private.chat_versions where tutor_id=actor),0)::text);
end $$;


create table public.chat_attachments (
 id uuid primary key default gen_random_uuid(), message_id uuid not null references public.chat_messages(id) on delete cascade,
 storage_path text not null unique, original_name text not null check(char_length(original_name) between 1 and 200),
 mime_type text not null, size_bytes bigint not null check(size_bytes between 1 and 10485760),
 kind text not null check(kind in ('image','file')), created_at timestamptz not null default now()
);
create index chat_attachments_message on public.chat_attachments(message_id);
alter table public.chat_attachments enable row level security;
revoke all on public.chat_attachments from public,anon,authenticated;
create policy chat_attachments_participant on public.chat_attachments for select to authenticated using(exists(
 select 1 from public.chat_messages m join public.chat_conversations c on c.id=m.conversation_id
 where m.id=message_id and c.tutor_id=auth.uid() and private.chat_can_read(c.student_id,c.tutor_id)));
grant select(id,message_id,original_name,mime_type,size_bytes,kind,created_at) on public.chat_attachments to authenticated;
create table private.chat_uploads (
 id uuid primary key, actor_id uuid not null, student_id uuid not null, storage_path text not null unique,
 original_name text not null, claimed_size bigint not null check(claimed_size between 1 and 10485760),
 expires_at timestamptz not null default now()+interval '1 hour'
);
alter table private.chat_uploads enable row level security;
revoke all on private.chat_uploads from public,anon,authenticated;
-- Production Storage exists in Supabase; the DB-only fixture intentionally has no Storage schema.
do $$ begin
 if to_regclass('storage.buckets') is not null then
 insert into storage.buckets(id,name,public,file_size_limit) values('chat-attachments','chat-attachments',false,10485760) on conflict(id) do update set public=false,file_size_limit=10485760;
 end if;
end $$;
create function public.chat_prepare_upload(p_actor uuid,p_student uuid,p_id uuid,p_name text,p_size bigint) returns text language plpgsql security definer set search_path='' as $$
declare path text;
begin
 perform private.chat_lock_pair(p_student,p_actor);
 if char_length(p_name) not between 1 and 200 then raise exception 'Invalid name'; end if;
 if (select count(*) from private.chat_uploads where actor_id=p_actor and expires_at>now())>=100 then raise exception 'Upload limit'; end if;
 path=p_actor::text||'/'||p_student::text||'/'||p_id::text;
 insert into private.chat_uploads(id,actor_id,student_id,storage_path,original_name,claimed_size) values(p_id,p_actor,p_student,path,p_name,p_size);
 return path;
end $$;
create function public.chat_upload_details(p_actor uuid,p_student uuid,p_ids uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.chat_lock_pair(p_student,p_actor);
 if cardinality(p_ids)>10 or (select count(*) from private.chat_uploads where id=any(p_ids) and actor_id=p_actor and student_id=p_student and expires_at>now())<>cardinality(p_ids) then raise exception 'Invalid uploads' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(u)) from private.chat_uploads u where id=any(p_ids)),'[]');
end $$;
alter table public.chat_messages drop constraint chat_messages_body_check;
alter table public.chat_messages add constraint chat_messages_body_check check(char_length(body)<=4000);
create function private.chat_nonempty() returns trigger language plpgsql set search_path='' as $$
declare target uuid;
begin
 if tg_table_name='chat_messages' then target=new.id; else target=old.message_id; end if;
 if exists(select 1 from public.chat_messages where id=target and char_length(btrim(body))=0) and not exists(select 1 from public.chat_attachments where message_id=target) then raise exception 'Text or attachment required' using errcode='23514'; end if;
 return null;
end $$;
create constraint trigger chat_nonempty after insert or update on public.chat_messages deferrable initially deferred for each row execute function private.chat_nonempty();
create constraint trigger attachment_nonempty after delete on public.chat_attachments deferrable initially deferred for each row execute function private.chat_nonempty();
revoke all on function private.chat_nonempty() from public,anon,authenticated;
create function public.chat_finalize_uploads(p_actor uuid,p_student uuid,p_content jsonb,p_files jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.chat_messages; f jsonb; u private.chat_uploads; txt text;
begin
 perform private.chat_lock_pair(p_student,p_actor);
 if jsonb_array_length(p_files) not between 1 and 10 then raise exception 'Invalid files'; end if;
 select string_agg(value->>'text','' order by ord) into txt from jsonb_array_elements(p_content) with ordinality a(value,ord);
 if char_length(coalesce(txt,''))>4000 then raise exception 'Invalid text'; end if;
 m=private.chat_append(p_student,p_actor,'tutor',coalesce(txt,''));
 update public.chat_messages set content=p_content where id=m.id returning * into m;
 for f in select value from jsonb_array_elements(p_files) loop
 select * into u from private.chat_uploads where id=(f->>'id')::uuid and actor_id=p_actor and student_id=p_student and expires_at>now() for update;
 if not found or u.claimed_size<>(f->>'size')::bigint then raise exception 'Invalid upload' using errcode='42501'; end if;
 insert into public.chat_attachments(id,message_id,storage_path,original_name,mime_type,size_bytes,kind) values(u.id,m.id,u.storage_path,u.original_name,f->>'type',(f->>'size')::bigint,case when f->>'type' in ('image/jpeg','image/png','image/gif','image/webp') then 'image' else 'file' end);
 delete from private.chat_uploads where id=u.id;
 end loop;
 return to_jsonb(m)-'conversation_id';
end $$;
create function public.chat_attachment_access(p_actor uuid,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 return (select to_jsonb(a) from public.chat_attachments a join public.chat_messages m on m.id=a.message_id join public.chat_conversations c on c.id=m.conversation_id where a.id=p_id and c.tutor_id=p_actor and private.chat_pair_active(c.student_id,c.tutor_id));
end $$;
revoke all on function public.chat_prepare_upload(uuid,uuid,uuid,text,bigint),public.chat_upload_details(uuid,uuid,uuid[]),public.chat_finalize_uploads(uuid,uuid,jsonb,jsonb),public.chat_attachment_access(uuid,uuid) from public,anon,authenticated;
grant execute on function public.chat_prepare_upload(uuid,uuid,uuid,text,bigint),public.chat_upload_details(uuid,uuid,uuid[]),public.chat_finalize_uploads(uuid,uuid,jsonb,jsonb),public.chat_attachment_access(uuid,uuid) to service_role;


create function public.chat_finish_delivery_parts(p_message uuid,p_success boolean,p_chat text,p_ids bigint[]) returns void language plpgsql security definer set search_path='' as $$
declare m public.chat_messages; c public.chat_conversations; n bigint;
begin
 select * into m from public.chat_messages where id=p_message and sender_role='tutor' for update;
 if not found or m.delivery_status<>'pending' then return; end if;
 select * into c from public.chat_conversations where id=m.conversation_id;
 if cardinality(p_ids)>0 then
 if not exists(select 1 from public.profiles where id=c.student_id and telegram_chat_id=p_chat) then raise exception 'Invalid mapping'; end if;
 foreach n in array p_ids loop
 if n<=0 then raise exception 'Invalid mapping'; end if;
 insert into private.telegram_message_links values(p_chat,n,m.id) on conflict do nothing;
 end loop;
 end if;
 if p_success and coalesce(cardinality(p_ids),0)=0 then raise exception 'Missing delivery'; end if;
 update public.chat_messages set delivery_status=case when p_success then 'sent' else 'failed' end where id=m.id;
end $$;
revoke all on function public.chat_finish_delivery_parts(uuid,boolean,text,bigint[]) from public,anon,authenticated;
grant execute on function public.chat_finish_delivery_parts(uuid,boolean,text,bigint[]) to service_role;


create function public.chat_bot_media_target(p_user text,p_chat text,p_reply bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare s uuid; t uuid;
begin
 select id into s from public.profiles where telegram_user_id=p_user and telegram_chat_id=p_chat and role='student' and account_status='active';
 if s is null then return jsonb_build_object('status','unlinked'); end if;
 if p_reply is not null then
 select c.tutor_id into t from private.telegram_message_links l join public.chat_messages m on m.id=l.message_id join public.chat_conversations c on c.id=m.conversation_id where l.chat_id=p_chat and l.telegram_message_id=p_reply and c.student_id=s;
 else select tutor_id into t from private.telegram_chat_state where student_id=s; end if;
 if t is null then return jsonb_build_object('status',case when p_reply is null then 'choose' else 'unavailable' end); end if;
 if not private.chat_pair_active(s,t) then return jsonb_build_object('status','unavailable'); end if;
 return jsonb_build_object('status','ok','student',s,'tutor',t);
end $$;
create function public.chat_bot_receive_rich(p_user text,p_chat text,p_update bigint,p_text text,p_reply bigint,p_content jsonb,p_file jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s uuid; t uuid; m public.chat_messages; previous uuid;
begin
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
 update public.chat_messages set content=p_content where id=m.id;
 if p_file is not null then
 insert into public.chat_attachments(id,message_id,storage_path,original_name,mime_type,size_bytes,kind)
 values((p_file->>'id')::uuid,m.id,p_file->>'path',p_file->>'name',p_file->>'type',(p_file->>'size')::bigint,case when p_file->>'type' in ('image/jpeg','image/png','image/webp','image/gif') then 'image' else 'file' end);
 delete from private.chat_uploads where id=(p_file->>'id')::uuid;
 end if;
 insert into private.telegram_chat_updates(telegram_update_id,message_id) values(p_update,m.id);
 return jsonb_build_object('status','sent','messageId',m.id,'studentId',s,'tutorId',t,'studentName',(select full_name from public.profiles where id=s),'text',m.body);
end $$;
revoke all on function public.chat_bot_media_target(text,text,bigint),public.chat_bot_receive_rich(text,text,bigint,text,bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.chat_bot_media_target(text,text,bigint),public.chat_bot_receive_rich(text,text,bigint,text,bigint,jsonb,jsonb) to service_role;

-- Audit references must never cascade into another person's business records.
alter table public.tutor_subjects alter column assigned_by drop not null, drop constraint tutor_subjects_assigned_by_fkey, add foreign key(assigned_by) references public.profiles(id) on delete set null;
alter table public.student_tutor_assignments alter column assigned_by drop not null, drop constraint student_tutor_assignments_assigned_by_fkey, add foreign key(assigned_by) references public.profiles(id) on delete set null;
alter table public.app_settings drop constraint app_settings_updated_by_fkey, add foreign key(updated_by) references public.profiles(id) on delete set null;
alter table public.profiles drop constraint profiles_blocked_by_fkey, drop constraint profiles_deleted_by_fkey, add foreign key(blocked_by) references public.profiles(id) on delete set null, add foreign key(deleted_by) references public.profiles(id) on delete set null;
create table private.user_deletion_jobs (
 user_id uuid primary key, status text not null check(status in ('prepared','purged','complete')),
 storage_paths text[] not null default '{}', telegram_user text, telegram_chat text, ready_after timestamptz not null default now(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table private.user_deletion_jobs enable row level security;
revoke all on private.user_deletion_jobs from public,anon,authenticated;
create function public.admin_prepare_hard_delete_user(p_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare target public.profiles; job private.user_deletion_jobs; paths text[];
begin
 if not private.is_admin() or auth.uid()=p_user then raise exception 'Forbidden' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(842106001);
 select * into job from private.user_deletion_jobs where user_id=p_user for update;
 if found then return to_jsonb(job)-'telegram_user'-'telegram_chat'; end if;
 select * into target from public.profiles where id=p_user for update;
 if not found or target.role='admin' then raise exception 'Forbidden' using errcode='42501'; end if;
 select coalesce(array_agg(storage_path),'{}') into paths from (
 select a.storage_path from public.chat_attachments a join public.chat_messages m on m.id=a.message_id join public.chat_conversations c on c.id=m.conversation_id where p_user in(c.student_id,c.tutor_id)
 union select storage_path from private.chat_uploads where p_user in(actor_id,student_id)) x;
 insert into private.user_deletion_jobs(user_id,status,storage_paths,telegram_user,telegram_chat) values(p_user,'prepared',paths,target.telegram_user_id,target.telegram_chat_id) returning * into job;
 update private.user_deletion_jobs set ready_after=greatest(now(),
   coalesce((select max(expires_at+interval '65 minutes') from private.chat_uploads where p_user in(actor_id,student_id)),now()),
   coalesce((select max(a.created_at+interval '125 minutes') from public.chat_attachments a join public.chat_messages m on m.id=a.message_id join public.chat_conversations c on c.id=m.conversation_id where p_user in(c.student_id,c.tutor_id)),now())) where user_id=p_user returning * into job;
 perform public.revoke_user_sessions(p_user);
 delete from private.one_time_tokens where user_id=p_user;
 update public.profiles set account_status='blocked',blocked_at=now(),blocked_by=auth.uid() where id=p_user;
 return to_jsonb(job)-'telegram_user'-'telegram_chat';
end $$;
create function public.admin_purge_hard_delete_user(p_actor uuid,p_user uuid) returns void language plpgsql security definer set search_path='' as $$
declare job private.user_deletion_jobs; apps uuid[];
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and account_status='active') or p_actor=p_user then raise exception 'Forbidden' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(842106001);
 select * into job from private.user_deletion_jobs where user_id=p_user for update;
 if not found then raise exception 'Missing deletion job'; end if;
 if job.status<>'prepared' then return; end if;
 if job.ready_after>now() then raise exception 'Upload permissions still active'; end if;
 if exists(select 1 from public.profiles where id=p_user and role='admin') then raise exception 'Forbidden' using errcode='42501'; end if;
 delete from private.telegram_chat_state where p_user in(student_id,tutor_id);
 delete from private.telegram_control_messages where chat_id=job.telegram_chat;
 delete from public.chat_conversations where p_user in(student_id,tutor_id);
 delete from public.lessons where p_user in(student_id,tutor_id);
 delete from public.tutor_student_availability where p_user in(student_id,tutor_id);
 delete from public.schedule_week_rollovers where tutor_id=p_user;
 delete from public.user_schedule_preferences where user_id=p_user;
 delete from public.student_tutor_assignments where p_user in(student_id,tutor_id);
 delete from public.tutor_subjects where tutor_id=p_user;
 delete from private.chat_uploads where p_user in(actor_id,student_id);
 select array_agg(id) into apps from public.applications where telegram_user_id=job.telegram_user or telegram_chat_id=job.telegram_chat;
 delete from private.one_time_tokens where user_id=p_user or application_id=any(apps);
 delete from private.telegram_updates where application_id=any(apps);
 delete from public.applications where id=any(apps);
 delete from private.auth_aliases where user_id=p_user;
 delete from private.sessions where user_id=p_user;
 delete from public.profiles where id=p_user;
 update private.user_deletion_jobs set status='purged',telegram_user=null,telegram_chat=null,updated_at=now() where user_id=p_user;
end $$;
create function public.admin_finish_hard_delete_user(p_actor uuid,p_user uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and account_status='active') then raise exception 'Forbidden' using errcode='42501'; end if;
 if exists(select 1 from auth.users where id=p_user) or exists(select 1 from public.profiles where id=p_user) then raise exception 'Deletion incomplete'; end if;
 update private.user_deletion_jobs set status='complete',storage_paths='{}',updated_at=now() where user_id=p_user and status='purged';
 if not found and not exists(select 1 from private.user_deletion_jobs where user_id=p_user and status='complete') then raise exception 'Deletion incomplete'; end if;
end $$;
create function public.admin_pending_deletions() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Forbidden' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',user_id,'createdAt',created_at)) from private.user_deletion_jobs where status<>'complete'),'[]');
end $$;
revoke all on function public.admin_prepare_hard_delete_user(uuid),public.admin_pending_deletions() from public,anon;
grant execute on function public.admin_prepare_hard_delete_user(uuid),public.admin_pending_deletions() to authenticated;
revoke all on function public.admin_purge_hard_delete_user(uuid,uuid),public.admin_finish_hard_delete_user(uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_purge_hard_delete_user(uuid,uuid),public.admin_finish_hard_delete_user(uuid,uuid) to service_role;
-- The superseded endpoint is no longer a product deletion surface.
revoke execute on function public.admin_soft_delete_user(uuid) from authenticated;


create function public.bot_application_command(p_user text,p_chat text,p_action text,p_id uuid default null,p_hash text default null,p_role text default 'student',p_bucket text default 'pending_review',p_offset integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; result jsonb;
begin
 select id into actor from public.profiles where telegram_user_id=p_user and telegram_chat_id=p_chat and role='admin' and account_status='active' for share;
 if actor is null then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_action='queue' then return public.admin_applications(actor,p_role,p_bucket,p_offset); end if;
 if p_action not in ('approve','reject','resend') or p_id is null then raise exception 'Invalid action'; end if;
 result=public.review_application(actor,p_id,p_action,p_hash);
 return result||jsonb_build_object('actor',actor);
end $$;
revoke all on function public.bot_application_command(text,text,text,uuid,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.bot_application_command(text,text,text,uuid,text,text,text,integer) to service_role;


create sequence private.chat_revision;
alter table public.chat_messages add column revision bigint not null default nextval('private.chat_revision');
create table private.chat_versions(tutor_id uuid primary key,version bigint not null);
revoke all on private.chat_versions,private.chat_revision from public,anon,authenticated;
create function private.chat_revise() returns trigger language plpgsql set search_path='' as $$
begin perform 1 from public.chat_conversations where id=new.conversation_id for update; new.revision=nextval('private.chat_revision'); return new; end $$;
create trigger chat_revise before update on public.chat_messages for each row execute function private.chat_revise();
create function private.chat_bump_directory() returns trigger language plpgsql security definer set search_path='' as $$
declare teacher uuid; old_teacher uuid;
begin
 if tg_table_name='chat_messages' then
 select tutor_id into teacher from public.chat_conversations where id=case when tg_op='DELETE' then old.conversation_id else new.conversation_id end;
 elsif tg_table_name='chat_conversations' then teacher=new.tutor_id;
 elsif tg_table_name='student_tutor_assignments' then
 if tg_op<>'DELETE' then teacher=new.tutor_id; end if;
 if tg_op<>'INSERT' then old_teacher=old.tutor_id; end if;
 else
 insert into private.chat_versions select tutor_id,nextval('private.chat_revision') from public.chat_conversations where student_id=new.id or tutor_id=new.id group by tutor_id on conflict(tutor_id) do update set version=excluded.version;
 return null;
 end if;
 if teacher is not null then insert into private.chat_versions values(teacher,nextval('private.chat_revision')) on conflict(tutor_id) do update set version=excluded.version; end if;
 if old_teacher is not null then insert into private.chat_versions values(old_teacher,nextval('private.chat_revision')) on conflict(tutor_id) do update set version=excluded.version; end if;
 return null;
end $$;
create trigger chat_directory_message after insert or update or delete on public.chat_messages for each row execute function private.chat_bump_directory();
create trigger chat_directory_assignment after insert or update or delete on public.student_tutor_assignments for each row execute function private.chat_bump_directory();
create trigger chat_directory_read after update of tutor_last_read_at on public.chat_conversations for each row execute function private.chat_bump_directory();
create trigger chat_directory_profile after update on public.profiles for each row execute function private.chat_bump_directory();
revoke all on function private.chat_revise(),private.chat_bump_directory() from public,anon,authenticated;
create function public.chat_updates(p_student uuid,p_after bigint,p_version bigint) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid=private.chat_require_tutor(); version bigint; cv uuid; history jsonb; cursor bigint; directory jsonb=null;
begin
 select coalesce((select v.version from private.chat_versions v where tutor_id=actor),0) into version;
 if p_version is distinct from version then directory=public.chat_snapshot(null)->'conversations'; end if;
 if p_student is not null and private.chat_pair_active(p_student,actor) then select id into cv from public.chat_conversations where student_id=p_student and tutor_id=actor; end if;
 select coalesce(jsonb_agg(dto order by revision),'[]'),coalesce(max(revision),p_after) into history,cursor from (
 select m.revision,(to_jsonb(m)-'conversation_id'-'revision')||jsonb_build_object('attachments',coalesce((select jsonb_agg(to_jsonb(a)-'storage_path') from public.chat_attachments a where a.message_id=m.id),'[]')) dto
 from public.chat_messages m where conversation_id=cv and revision>greatest(0,p_after) order by revision limit 200) x;
 return jsonb_build_object('messages',history,'cursor',cursor::text,'directoryVersion',version::text,'conversations',directory,'totalUnread',public.chat_unread());
end $$;
revoke all on function public.chat_updates(uuid,bigint,bigint) from public,anon;
grant execute on function public.chat_updates(uuid,bigint,bigint) to authenticated;


create function public.admin_directory_page(p_kind text,p_q text default '',p_filter uuid default null,p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare ids uuid[]; total integer; result jsonb;
begin
 if not private.is_admin() then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_kind not in ('students','tutors') or p_page not between 0 and 100000 then raise exception 'Invalid page'; end if;
 with filtered as (
 select p.id,p.full_name from public.profiles p left join private.auth_aliases a on a.user_id=p.id
 where p.account_status<>'deleted' and (case when p_kind='students' then p.role='student' else p.role in ('tutor','admin') end)
 and (coalesce(p_q,'')='' or position(lower(regexp_replace(trim(p_q),'^@','')) in lower(p.full_name||' '||coalesce(a.username_normalized,'')||' '||coalesce(p.telegram_username,'')||' '||coalesce(p.telegram_user_id,'')))>0)
 and (p_filter is null or case when p_kind='students' then exists(select 1 from public.student_tutor_assignments where student_id=p.id and tutor_id=p_filter) else exists(select 1 from public.tutor_subjects where tutor_id=p.id and subject_id=p_filter) end))
 select (select count(*) from filtered),coalesce((select array_agg(id) from (select id from filtered order by full_name,id limit 50 offset p_page*50) page),'{}'::uuid[]) into total,ids;
 select jsonb_build_object('total',total,'people',coalesce(jsonb_agg(jsonb_build_object('id',p.id,'role',p.role,'full_name',p.full_name,'login',a.username_normalized,'telegram_username',p.telegram_username,'telegram_user_id',p.telegram_user_id,'account_status',p.account_status,'blocked_at',p.blocked_at) order by p.full_name,p.id),'[]')) into result from public.profiles p left join private.auth_aliases a on a.user_id=p.id where p.id=any(ids);
 return result||jsonb_build_object(
 'tutors',coalesce((select jsonb_agg(jsonb_build_object('id',id,'role',role,'full_name',full_name,'account_status',account_status) order by full_name,id) from public.profiles where role in ('tutor','admin') and account_status<>'deleted'),'[]'),
 'subjects',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'is_active',is_active) order by name) from public.subjects),'[]'),
 'assignments',coalesce((select jsonb_agg(jsonb_build_object('id',id,'student_id',student_id,'tutor_id',tutor_id,'subject_id',subject_id)) from public.student_tutor_assignments where case when p_kind='students' then student_id=any(ids) else tutor_id=any(ids) end),'[]'),
 'tutorSubjects',coalesce((select jsonb_agg(jsonb_build_object('tutor_id',tutor_id,'subject_id',subject_id)) from public.tutor_subjects where p_kind='students' or tutor_id=any(ids)),'[]'));
end $$;
revoke all on function public.admin_directory_page(text,text,uuid,integer) from public,anon;
grant execute on function public.admin_directory_page(text,text,uuid,integer) to authenticated;

create or replace function private.resolve_nearest_lesson_start(p_tutor uuid,p_student uuid,p_desired timestamptz,p_duration integer,p_ignore uuid,p_color text)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare day_start timestamptz; desired_min integer; candidate timestamptz; minute integer; off integer;
begin
 if exists(select 1 from public.lessons where id=p_ignore and color='coral') then
 if not exists(select 1 from public.lessons where id=p_ignore and tutor_id=p_tutor and starts_at=p_desired and duration_minutes=p_duration) then raise exception 'Coral time locked' using errcode='PT014'; end if;
 return p_desired;
 end if;
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


create table private.chat_storage_gc(storage_path text primary key,not_before timestamptz not null default now());
revoke all on private.chat_storage_gc from public,anon,authenticated;
create function private.chat_queue_storage_gc() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.chat_storage_gc values(old.storage_path,now()+interval '3 hours') on conflict do nothing;
 return old;
end $$;
create trigger chat_attachment_gc after delete on public.chat_attachments for each row execute function private.chat_queue_storage_gc();
create trigger chat_upload_gc after delete on private.chat_uploads for each row execute function private.chat_queue_storage_gc();
revoke all on function private.chat_queue_storage_gc() from public,anon,authenticated;
create function public.chat_storage_cleanup_candidates() returns text[] language plpgsql security definer set search_path='' as $$
begin
 delete from private.chat_uploads where expires_at<now()-interval '2 hours';
 return coalesce((select array_agg(storage_path) from (select g.storage_path from private.chat_storage_gc g where not_before<now() and not exists(select 1 from public.chat_attachments a where a.storage_path=g.storage_path) and not exists(select 1 from private.chat_uploads u where u.storage_path=g.storage_path) limit 100) x),'{}');
end $$;
create function public.chat_storage_cleanup_finished(p_paths text[]) returns void language sql security definer set search_path='' as $$
 delete from private.chat_storage_gc where storage_path=any(p_paths);
$$;
revoke all on function public.chat_storage_cleanup_candidates(),public.chat_storage_cleanup_finished(text[]) from public,anon,authenticated;
grant execute on function public.chat_storage_cleanup_candidates(),public.chat_storage_cleanup_finished(text[]) to service_role;
create function private.deleting_profile_locked() returns trigger language plpgsql set search_path='' as $$
begin
 if new.account_status='active' and exists(select 1 from private.user_deletion_jobs where user_id=new.id and status<>'complete') then raise exception 'Deletion in progress' using errcode='42501'; end if;
 return new;
end $$;
create trigger deleting_profile_locked before update on public.profiles for each row execute function private.deleting_profile_locked();
revoke all on function private.deleting_profile_locked() from public,anon,authenticated;
create function public.chat_previous(p_student uuid,p_before timestamptz,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid=private.chat_require_tutor(); cv uuid;
begin
 if not private.chat_pair_active(p_student,actor) then raise exception 'Forbidden' using errcode='42501'; end if;
 select id into cv from public.chat_conversations where student_id=p_student and tutor_id=actor;
 return coalesce((select jsonb_agg(dto order by created_at,id) from (
 select m.id,m.created_at,(to_jsonb(m)-'conversation_id'-'revision')||jsonb_build_object('attachments',coalesce((select jsonb_agg(to_jsonb(a)-'storage_path') from public.chat_attachments a where a.message_id=m.id),'[]')) dto
 from public.chat_messages m where conversation_id=cv and (created_at,id)<(p_before,p_id) order by created_at desc,id desc limit 200) x),'[]');
end $$;
revoke all on function public.chat_previous(uuid,timestamptz,uuid) from public,anon;
grant execute on function public.chat_previous(uuid,timestamptz,uuid) to authenticated;


-- Fixture EXPLAIN found a full scan of 10,000 messages for an empty delta.
create index chat_messages_revision on public.chat_messages(conversation_id,revision);
create or replace function public.chat_unread() returns integer language plpgsql stable security definer set search_path='' as $$
declare actor uuid=private.chat_require_tutor(); n integer;
begin
 with active as materialized(select id,tutor_last_read_at from public.chat_conversations c where tutor_id=actor and private.chat_pair_active(student_id,tutor_id))
 select coalesce(sum((select count(*) from public.chat_messages m where m.conversation_id=c.id and m.sender_role='student' and m.created_at>c.tutor_last_read_at)),0)::integer into n from active c;
 return n;
end $$;

commit;
