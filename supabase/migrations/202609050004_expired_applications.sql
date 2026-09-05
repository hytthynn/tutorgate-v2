-- Release Telegram reservations only after ALL registration links expire.
-- Registered identities remain reserved by profiles forever.
create function private.expire_old_applications() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.applications a set status='expired',telegram_user_id=null,telegram_chat_id=null
 where a.status in ('pending_telegram','telegram_verified')
 and not exists(select 1 from private.one_time_tokens t where t.application_id=a.id and t.used_at is null and t.expires_at>now());
 return new;
end $$;
create trigger expire_old_applications before insert on public.applications for each statement execute function private.expire_old_applications();
revoke all on function private.expire_old_applications() from public,anon,authenticated;
