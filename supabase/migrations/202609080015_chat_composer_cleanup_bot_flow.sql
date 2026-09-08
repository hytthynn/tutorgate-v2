begin;
-- A message has one aggregate attachment budget, including trusted service calls.
create function private.chat_attachment_budget() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.chat_messages where id=new.message_id for update;
 if (select coalesce(sum(size_bytes),0) from public.chat_attachments where message_id=new.message_id)>10485760 then raise exception 'Total attachment size exceeds 10 MB' using errcode='23514'; end if;
 return null;
end $$;
create trigger chat_attachment_budget after insert or update on public.chat_attachments for each row execute function private.chat_attachment_budget();
revoke all on function private.chat_attachment_budget() from public,anon,authenticated;

-- Revoked uploads are deleted now and again after signed upload permissions expire.
alter table private.chat_storage_gc add column revoked boolean not null default false;
create or replace function private.chat_queue_storage_gc() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.chat_storage_gc(storage_path,not_before) values(old.storage_path,now()+interval '3 hours') on conflict do nothing;
 return old;
end $$;
create function private.chat_purge_unassigned_pair() returns trigger language plpgsql security definer set search_path='' as $$
declare paths text[];
begin
 if exists(select 1 from public.student_tutor_assignments where student_id=old.student_id and tutor_id=old.tutor_id) then return null; end if;
 select array_agg(storage_path) into paths from (
 select a.storage_path from public.chat_attachments a join public.chat_messages m on m.id=a.message_id join public.chat_conversations c on c.id=m.conversation_id where c.student_id=old.student_id and c.tutor_id=old.tutor_id
 union select storage_path from private.chat_uploads where student_id=old.student_id and actor_id=old.tutor_id) p;
 delete from private.chat_uploads where student_id=old.student_id and actor_id=old.tutor_id;
 delete from public.chat_conversations where student_id=old.student_id and tutor_id=old.tutor_id;
 delete from private.telegram_chat_state where student_id=old.student_id and tutor_id=old.tutor_id;
 update private.chat_storage_gc set revoked=true where storage_path=any(paths);
 return null;
end $$;
create constraint trigger chat_purge_unassigned_pair after delete or update on public.student_tutor_assignments deferrable initially deferred for each row execute function private.chat_purge_unassigned_pair();
revoke all on function private.chat_purge_unassigned_pair() from public,anon,authenticated;
create function public.chat_revoked_storage_paths() returns text[] language sql security definer set search_path='' as $$
 select coalesce(array_agg(storage_path),'{}') from (select storage_path from private.chat_storage_gc where revoked and not exists(select 1 from public.chat_attachments a where a.storage_path=chat_storage_gc.storage_path) and not exists(select 1 from private.chat_uploads u where u.storage_path=chat_storage_gc.storage_path) limit 100) p;
$$;
create function public.chat_revoked_storage_removed(p_paths text[]) returns void language sql security definer set search_path='' as $$
 update private.chat_storage_gc set revoked=false where storage_path=any(p_paths);
$$;
revoke all on function public.chat_revoked_storage_paths(),public.chat_revoked_storage_removed(text[]) from public,anon,authenticated;
grant execute on function public.chat_revoked_storage_paths(),public.chat_revoked_storage_removed(text[]) to service_role;

create table private.telegram_reply_state(student_id uuid primary key references public.profiles(id) on delete cascade, message_id uuid not null references public.chat_messages(id) on delete cascade, telegram_message_id bigint not null);
alter table private.telegram_reply_state enable row level security;
revoke all on private.telegram_reply_state from public,anon,authenticated;
create function public.chat_bot_begin_reply(p_user text,p_chat text,p_message uuid,p_source bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare s uuid; t uuid;
begin
 select id into s from public.profiles where telegram_user_id=p_user and telegram_chat_id=p_chat and role='student' and account_status='active' for update;
 select c.tutor_id into t from private.telegram_message_links l join public.chat_messages m on m.id=l.message_id join public.chat_conversations c on c.id=m.conversation_id where l.chat_id=p_chat and l.telegram_message_id=p_source and m.id=p_message and m.sender_role='tutor' and c.student_id=s;
 if t is null or not private.chat_pair_active(s,t) then raise exception 'Unavailable reply' using errcode='42501'; end if;
 perform public.chat_bot_set_recipient(s,t);
 insert into private.telegram_reply_state values(s,p_message,p_source) on conflict(student_id) do update set message_id=excluded.message_id,telegram_message_id=excluded.telegram_message_id;
 return jsonb_build_object('name',(select full_name from public.profiles where id=t));
end $$;
create function public.chat_bot_clear_reply(p_student uuid) returns void language sql security definer set search_path='' as $$delete from private.telegram_reply_state where student_id=p_student$$;
create function public.chat_bot_reply_context(p_user text,p_chat text) returns bigint language sql stable security definer set search_path='' as $$
 select r.telegram_message_id from private.telegram_reply_state r join public.profiles p on p.id=r.student_id where p.telegram_user_id=p_user and p.telegram_chat_id=p_chat and p.account_status='active';
$$;
create function public.chat_bot_receive_flow(p_user text,p_chat text,p_update bigint,p_text text,p_reply bigint,p_content jsonb,p_file jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s uuid; effective_reply bigint; result jsonb; original text; prompt bigint;
begin
 select id into s from public.profiles where telegram_user_id=p_user and telegram_chat_id=p_chat and role='student' and account_status='active' for update;
 effective_reply=coalesce(p_reply,public.chat_bot_reply_context(p_user,p_chat));
 select m.body||coalesce((select E'\n📎 '||string_agg(original_name,', ') from public.chat_attachments where message_id=m.id),'') into original from private.telegram_message_links l join public.chat_messages m on m.id=l.message_id join public.chat_conversations c on c.id=m.conversation_id where l.chat_id=p_chat and l.telegram_message_id=effective_reply and c.student_id=s;
 select message_id into prompt from private.telegram_control_messages where chat_id=p_chat;
 result=public.chat_bot_receive_rich(p_user,p_chat,p_update,p_text,effective_reply,p_content,p_file);
 if result->>'status'='sent' then
 delete from private.telegram_reply_state where student_id=s;
 delete from private.telegram_chat_state where student_id=s;
 result=result||jsonb_build_object('replyTelegramId',effective_reply,'originalText',original,'controlId',prompt,'tutorName',(select full_name from public.profiles where id=(result->>'tutorId')::uuid));
 end if;
 return result;
end $$;
revoke all on function public.chat_bot_begin_reply(text,text,uuid,bigint),public.chat_bot_clear_reply(uuid),public.chat_bot_reply_context(text,text),public.chat_bot_receive_flow(text,text,bigint,text,bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.chat_bot_begin_reply(text,text,uuid,bigint),public.chat_bot_clear_reply(uuid),public.chat_bot_reply_context(text,text),public.chat_bot_receive_flow(text,text,bigint,text,bigint,jsonb,jsonb) to service_role;
commit;
