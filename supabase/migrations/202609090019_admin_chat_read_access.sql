begin;
select pg_advisory_xact_lock(842106001);
-- Explicit read-only administration. No JWT substitution or new table grants.
create function private.admin_chat_owner(p_owner uuid) returns uuid language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.is_admin() or not exists(select 1 from public.profiles where id=p_owner and role in ('admin','tutor') and account_status='active') then raise exception 'Forbidden' using errcode='42501'; end if;
 return p_owner;
end $$;
revoke all on function private.admin_chat_owner(uuid) from public,anon,authenticated;
create function public.admin_chat_snapshot(p_owner uuid,p_student uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.admin_chat_owner(p_owner); directory jsonb; history jsonb:='[]'; c uuid; more boolean:=false;
begin
 select coalesce(jsonb_agg(row_data order by last_at desc nulls last,full_name,student_id),'[]') into directory from (
 select s.full_name,s.id student_id,last_msg.created_at last_at,
 jsonb_build_object('studentId',s.id,'studentName',s.full_name,'conversationId',cv.id,'lastMessage',left(last_msg.body,160),'lastAt',last_msg.created_at,
 'unread',(select count(*) from public.chat_messages m where m.conversation_id=cv.id and m.sender_role='student' and m.created_at>cv.tutor_last_read_at)) row_data
 from public.profiles s left join public.chat_conversations cv on cv.student_id=s.id and cv.tutor_id=actor
 left join lateral (select body,created_at from public.chat_messages where conversation_id=cv.id order by created_at desc,id desc limit 1) last_msg on true
 where private.chat_pair_active(s.id,actor)) x;
 if p_student is not null and private.chat_pair_active(p_student,actor) then
 select id into c from public.chat_conversations where student_id=p_student and tutor_id=actor;
 select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at,m.id),'[]') into history from
 (select id,sender_role,body,content,delivery_status,created_at,coalesce((select jsonb_agg(to_jsonb(a)-'storage_path') from public.chat_attachments a where a.message_id=msg.id),'[]'::jsonb) attachments from public.chat_messages msg where conversation_id=c order by created_at desc,id desc limit 200) m;
 select exists(select 1 from public.chat_messages where conversation_id=c order by created_at desc,id desc offset 200 limit 1) into more;
 end if;
 return jsonb_build_object('conversations',directory,'messages',history,'hasMore',more,'ownerName',(select full_name from public.profiles where id=actor),'totalUnread',0,'cursor',coalesce((select max(revision) from public.chat_messages where conversation_id=c),0)::text,'directoryVersion',coalesce((select version from private.chat_versions where tutor_id=actor),0)::text);
end $$;
create function public.admin_chat_previous(p_owner uuid,p_student uuid,p_before timestamptz,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid=private.admin_chat_owner(p_owner); cv uuid;
begin
 if not private.chat_pair_active(p_student,actor) then raise exception 'Forbidden' using errcode='42501'; end if;
 select id into cv from public.chat_conversations where student_id=p_student and tutor_id=actor;
 return coalesce((select jsonb_agg(dto order by created_at,id) from (
 select m.id,m.created_at,(to_jsonb(m)-'conversation_id'-'revision')||jsonb_build_object('attachments',coalesce((select jsonb_agg(to_jsonb(a)-'storage_path') from public.chat_attachments a where a.message_id=m.id),'[]')) dto
 from public.chat_messages m where conversation_id=cv and (created_at,id)<(p_before,p_id) order by created_at desc,id desc limit 200) x),'[]');
end $$;
create function public.admin_chat_attachment(p_owner uuid,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.admin_chat_owner(p_owner);
 return (select jsonb_build_object('storage_path',a.storage_path,'original_name',a.original_name) from public.chat_attachments a join public.chat_messages m on m.id=a.message_id join public.chat_conversations c on c.id=m.conversation_id where a.id=p_id and c.tutor_id=p_owner and private.chat_pair_active(c.student_id,c.tutor_id));
end $$;
revoke all on function public.admin_chat_snapshot(uuid,uuid),public.admin_chat_previous(uuid,uuid,timestamptz,uuid),public.admin_chat_attachment(uuid,uuid) from public,anon;
grant execute on function public.admin_chat_snapshot(uuid,uuid),public.admin_chat_previous(uuid,uuid,timestamptz,uuid),public.admin_chat_attachment(uuid,uuid) to authenticated;
comment on function public.admin_chat_snapshot(uuid,uuid) is 'Read-only administrator view; does not modify tutor read markers or identity.';
commit;
