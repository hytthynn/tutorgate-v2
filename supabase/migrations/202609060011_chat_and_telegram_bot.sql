-- Package 011; apply once after 010. Old migrations are unchanged.
begin;
select pg_advisory_xact_lock(842106001);
create table public.chat_conversations (
 id uuid primary key default gen_random_uuid(),
 student_id uuid not null references public.profiles(id),
 tutor_id uuid not null references public.profiles(id),
 tutor_last_read_at timestamptz not null default '-infinity',
 created_at timestamptz not null default now(),
 unique(student_id,tutor_id), check(student_id<>tutor_id)
);
create table public.chat_messages (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
 sender_role text not null check(sender_role in ('student','tutor')),
 body text not null check(char_length(btrim(body)) between 1 and 4000 and char_length(body)<=4000),
 delivery_status text not null check(delivery_status in ('pending','sent','failed')),
 created_at timestamptz not null,
 check(sender_role='tutor' or delivery_status='sent')
);
create index chat_messages_history on public.chat_messages(conversation_id,created_at desc,id);
create index chat_messages_unread on public.chat_messages(conversation_id,created_at) where sender_role='student';
create index chat_conversations_tutor on public.chat_conversations(tutor_id);
create table private.telegram_chat_state (
 student_id uuid primary key references public.profiles(id),
 tutor_id uuid not null references public.profiles(id), updated_at timestamptz not null default now()
);
create table private.telegram_chat_updates (
 telegram_update_id bigint primary key, message_id uuid not null references public.chat_messages(id) on delete cascade,
 created_at timestamptz not null default now()
);
create table private.telegram_message_links (
 chat_id text not null, telegram_message_id bigint not null,
 message_id uuid not null references public.chat_messages(id) on delete cascade, primary key(chat_id,telegram_message_id)
);
revoke all on public.chat_conversations,public.chat_messages from public,anon,authenticated;
revoke all on private.telegram_chat_state,private.telegram_chat_updates,private.telegram_message_links from public,anon,authenticated;
alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;
alter table private.telegram_chat_state enable row level security;
alter table private.telegram_chat_updates enable row level security;
alter table private.telegram_message_links enable row level security;
create function private.chat_pair_active(p_student uuid,p_tutor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles s,public.profiles t where s.id=p_student and s.role='student' and s.account_status='active'
 and t.id=p_tutor and t.role='tutor' and t.account_status='active'
 and exists(select 1 from public.student_tutor_assignments a where a.student_id=s.id and a.tutor_id=t.id));
$$;
create function private.chat_can_read(p_student uuid,p_tutor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(auth.uid() in (p_student,p_tutor) and private.chat_pair_active(p_student,p_tutor),false);
$$;
create function private.chat_require_tutor() returns uuid language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and role='tutor' and account_status='active') then raise exception 'Forbidden' using errcode='42501'; end if;
 return auth.uid();
end $$;
-- Shared row locks serialize sends with removal/blocking. Locks use stable order.
create function private.chat_lock_pair(p_student uuid,p_tutor uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.profiles where id in (p_student,p_tutor) order by id for share;
 perform 1 from public.student_tutor_assignments where student_id=p_student and tutor_id=p_tutor order by id for share;
 if not found or not private.chat_pair_active(p_student,p_tutor) then raise exception 'Chat unavailable' using errcode='42501'; end if;
end $$;
create function private.chat_append(p_student uuid,p_tutor uuid,p_role text,p_text text) returns public.chat_messages language plpgsql security definer set search_path='' as $$
declare c uuid; m public.chat_messages; stamp timestamptz;
begin
 perform private.chat_lock_pair(p_student,p_tutor);
 insert into public.chat_conversations(student_id,tutor_id) values(p_student,p_tutor) on conflict(student_id,tutor_id) do nothing;
 select id into c from public.chat_conversations where student_id=p_student and tutor_id=p_tutor for update;
 -- Strict ordering even for multiple writes inside the same transaction.
 select greatest(clock_timestamp(),coalesce(max(created_at)+interval '1 microsecond','-infinity')) into stamp from public.chat_messages where conversation_id=c;
 insert into public.chat_messages(conversation_id,sender_role,body,delivery_status,created_at)
 values(c,p_role,btrim(p_text),case when p_role='tutor' then 'pending' else 'sent' end,stamp) returning * into m;
 return m;
end $$;
revoke all on function private.chat_pair_active(uuid,uuid),private.chat_can_read(uuid,uuid),private.chat_require_tutor(),private.chat_lock_pair(uuid,uuid),private.chat_append(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function private.chat_can_read(uuid,uuid) to authenticated;
create policy chat_conversations_participant on public.chat_conversations for select to authenticated using(private.chat_can_read(student_id,tutor_id));
create policy chat_messages_participant on public.chat_messages for select to authenticated using(exists(select 1 from public.chat_conversations c where c.id=conversation_id and private.chat_can_read(c.student_id,c.tutor_id)));
grant select on public.chat_conversations,public.chat_messages to authenticated;
create function public.chat_unread() returns integer language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.chat_require_tutor(); n integer;
begin
 select count(*)::integer into n from public.chat_messages m join public.chat_conversations c on c.id=m.conversation_id
 where c.tutor_id=actor and private.chat_pair_active(c.student_id,c.tutor_id) and m.sender_role='student' and m.created_at>c.tutor_last_read_at;
 return n;
end $$;
create function public.chat_snapshot(p_student uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
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
 (select id,sender_role,body,delivery_status,created_at from public.chat_messages where conversation_id=c order by created_at desc limit 200) m;
 select exists(select 1 from public.chat_messages where conversation_id=c order by created_at desc offset 200 limit 1) into more;
 end if;
 return jsonb_build_object('conversations',directory,'messages',history,'hasMore',more,'totalUnread',public.chat_unread());
end $$;
create function public.chat_mark_read(p_student uuid,p_message uuid) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.chat_require_tutor(); c uuid; stamp timestamptz;
begin
 perform private.chat_lock_pair(p_student,actor);
 select id into c from public.chat_conversations where student_id=p_student and tutor_id=actor for update;
 select created_at into stamp from public.chat_messages where id=p_message and conversation_id=c;
 if stamp is null then raise exception 'Message not in conversation' using errcode='42501'; end if;
 update public.chat_conversations set tutor_last_read_at=greatest(tutor_last_read_at,stamp) where id=c;
end $$;
create function public.chat_send(p_student uuid,p_text text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.chat_require_tutor(); m public.chat_messages;
begin
 if p_text is null or char_length(p_text)>4000 or char_length(btrim(p_text))=0 then raise exception 'Invalid text' using errcode='22023'; end if;
 m:=private.chat_append(p_student,actor,'tutor',p_text); return to_jsonb(m)-'conversation_id';
end $$;
revoke all on function public.chat_unread(),public.chat_snapshot(uuid),public.chat_mark_read(uuid,uuid),public.chat_send(uuid,text) from public,anon,authenticated;
grant execute on function public.chat_unread(),public.chat_snapshot(uuid),public.chat_mark_read(uuid,uuid),public.chat_send(uuid,text) to authenticated;
-- Service-only interfaces. Telegram identity is never in an authenticated DTO.
create function public.chat_bot_profile(p_user text,p_chat text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',id,'role',role,'name',full_name) from public.profiles where telegram_user_id=p_user and telegram_chat_id=p_chat and account_status='active';
$$;
create function public.chat_bot_tutors(p_student uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(row_data order by full_name,id),'[]') from (
 select t.id,t.full_name,jsonb_build_object('id',t.id,'name',t.full_name,'subjects',(
 select string_agg(distinct s.name,', ' order by s.name) from public.student_tutor_assignments a join public.subjects s on s.id=a.subject_id where a.student_id=p_student and a.tutor_id=t.id)) row_data
 from public.profiles t where private.chat_pair_active(p_student,t.id)) x;
$$;
create function public.chat_bot_set_recipient(p_student uuid,p_tutor uuid default null) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_tutor is null then delete from private.telegram_chat_state where student_id=p_student; return; end if;
 perform private.chat_lock_pair(p_student,p_tutor);
 insert into private.telegram_chat_state(student_id,tutor_id) values(p_student,p_tutor) on conflict(student_id) do update set tutor_id=excluded.tutor_id,updated_at=now();
end $$;
create function public.chat_bot_receive(p_user text,p_chat text,p_update bigint,p_text text,p_reply bigint default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare s uuid; t uuid; m public.chat_messages; previous uuid;
begin
 if p_update is null or p_update<0 then raise exception 'Invalid update' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('telegram-chat-update:'||p_update::text,0));
 select message_id into previous from private.telegram_chat_updates where telegram_update_id=p_update;
 if found then return jsonb_build_object('status','duplicate'); end if;
 select id into s from public.profiles where telegram_user_id=p_user and telegram_chat_id=p_chat and role='student' and account_status='active';
 if s is null then return jsonb_build_object('status','unlinked'); end if;
 if p_text is null or char_length(p_text)>4000 or char_length(btrim(p_text))=0 then return jsonb_build_object('status','invalid_text'); end if;
 if p_reply is not null then
 select c.tutor_id into t from private.telegram_message_links l join public.chat_messages msg on msg.id=l.message_id join public.chat_conversations c on c.id=msg.conversation_id
 where l.chat_id=p_chat and l.telegram_message_id=p_reply and c.student_id=s;
 if t is null then return jsonb_build_object('status','unavailable'); end if;
 else
 select tutor_id into t from private.telegram_chat_state where student_id=s;
 if t is null then return jsonb_build_object('status','choose'); end if;
 end if;
 begin m:=private.chat_append(s,t,'student',p_text);
 exception when insufficient_privilege then
 delete from private.telegram_chat_state where student_id=s and tutor_id=t;
 return jsonb_build_object('status','unavailable'); end;
 insert into private.telegram_chat_updates(telegram_update_id,message_id) values(p_update,m.id);
 return jsonb_build_object('status','sent','messageId',m.id,'studentId',s,'tutorId',t,'studentName',(select full_name from public.profiles where id=s),'text',m.body);
end $$;
create function public.chat_delivery_target(p_message uuid,p_tutor uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.chat_conversations; m public.chat_messages;
begin
 select * into m from public.chat_messages where id=p_message and sender_role='tutor' and delivery_status='pending'; if not found then return null; end if;
 select * into c from public.chat_conversations where id=m.conversation_id and tutor_id=p_tutor; if not found then return null; end if;
 perform private.chat_lock_pair(c.student_id,c.tutor_id);
 return jsonb_build_object('chatId',(select telegram_chat_id from public.profiles where id=c.student_id),'tutorName',(select full_name from public.profiles where id=c.tutor_id),'text',m.body);
end $$;
create function public.chat_finish_delivery(p_message uuid,p_success boolean,p_chat text default null,p_telegram bigint default null) returns void language plpgsql security definer set search_path='' as $$
declare c public.chat_conversations; m public.chat_messages;
begin
 select * into m from public.chat_messages where id=p_message and sender_role='tutor' for update;
 if not found or m.delivery_status<>'pending' then return; end if;
 select * into c from public.chat_conversations where id=m.conversation_id;
 if p_success then
 if p_chat is null or p_telegram is null or p_telegram<=0 or not exists(select 1 from public.profiles where id=c.student_id and telegram_chat_id=p_chat) then raise exception 'Invalid delivery mapping' using errcode='22023'; end if;
 insert into private.telegram_message_links(chat_id,telegram_message_id,message_id) values(p_chat,p_telegram,m.id);
 end if;
 update public.chat_messages set delivery_status=case when p_success then 'sent' else 'failed' end where id=m.id;
end $$;
create function public.chat_notification_target(p_message uuid) returns text language sql stable security definer set search_path='' as $$
 select t.telegram_chat_id from public.chat_messages m join public.chat_conversations c on c.id=m.conversation_id join public.profiles t on t.id=c.tutor_id
 where m.id=p_message and m.sender_role='student' and private.chat_pair_active(c.student_id,c.tutor_id);
$$;
revoke all on function public.chat_bot_profile(text,text),public.chat_bot_tutors(uuid),public.chat_bot_set_recipient(uuid,uuid),public.chat_bot_receive(text,text,bigint,text,bigint),public.chat_delivery_target(uuid,uuid),public.chat_finish_delivery(uuid,boolean,text,bigint),public.chat_notification_target(uuid) from public,anon,authenticated;
grant execute on function public.chat_bot_profile(text,text),public.chat_bot_tutors(uuid),public.chat_bot_set_recipient(uuid,uuid),public.chat_bot_receive(text,text,bigint,text,bigint),public.chat_delivery_target(uuid,uuid),public.chat_finish_delivery(uuid,boolean,text,bigint),public.chat_notification_target(uuid) to service_role;
commit;
