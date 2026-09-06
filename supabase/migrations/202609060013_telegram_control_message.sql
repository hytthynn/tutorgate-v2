-- One persistent bot control message per private chat, separate from chat delivery/reply mappings.
begin;
create table private.telegram_control_messages (
 chat_id text primary key check (chat_id ~ '^[0-9]{1,20}$'),
 message_id bigint check (message_id > 0),
 claim_id uuid,
 claimed_until timestamptz,
 updated_at timestamptz not null default now()
);
alter table private.telegram_control_messages enable row level security;
revoke all on private.telegram_control_messages from public,anon,authenticated;

create function public.telegram_control_claim(p_chat text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare panel private.telegram_control_messages; token uuid;
begin
 insert into private.telegram_control_messages(chat_id) values(p_chat) on conflict do nothing;
 select * into panel from private.telegram_control_messages where chat_id=p_chat for update;
 if panel.claimed_until > clock_timestamp() then return null; end if;
 token=gen_random_uuid();
 update private.telegram_control_messages set claim_id=token,claimed_until=clock_timestamp()+interval '2 minutes' where chat_id=p_chat;
 return jsonb_build_object('claimId',token,'messageId',panel.message_id);
end $$;

create function public.telegram_control_finish(p_chat text,p_claim uuid,p_message bigint) returns void
language plpgsql security definer set search_path='' as $$
begin
 update private.telegram_control_messages set message_id=coalesce(p_message,message_id),
 claim_id=null,claimed_until=null,updated_at=clock_timestamp()
 where chat_id=p_chat and claim_id=p_claim;
 if not found then raise exception 'Control claim expired' using errcode='42501'; end if;
end $$;
revoke all on function public.telegram_control_claim(text),public.telegram_control_finish(text,uuid,bigint) from public,anon,authenticated;
grant execute on function public.telegram_control_claim(text),public.telegram_control_finish(text,uuid,bigint) to service_role;
commit;
