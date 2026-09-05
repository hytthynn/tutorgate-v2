alter table private.sessions add column user_id uuid references auth.users(id) on delete cascade;
create function public.bind_session(p_hash text,p_user uuid) returns void language sql security definer set search_path='' as $$
 update private.sessions set user_id=p_user where handle_hash=p_hash;
$$;
create function public.revoke_user_sessions(p_user uuid) returns void language sql security definer set search_path='' as $$
 delete from private.sessions where user_id=p_user;
$$;
revoke all on function public.bind_session(text,uuid),public.revoke_user_sessions(uuid) from public,anon,authenticated;
grant execute on function public.bind_session(text,uuid),public.revoke_user_sessions(uuid) to service_role;
