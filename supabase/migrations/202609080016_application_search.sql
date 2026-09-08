begin;
create function public.admin_applications_search(p_actor uuid,p_role text,p_bucket text,p_offset integer default 0,p_q text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare statuses public.application_status[]; needle text=lower(trim(left(coalesce(p_q,''),150)));
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and account_status='active') then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_role not in ('student','tutor') or p_offset<0 or p_offset>1000000 then raise exception 'Invalid filter' using errcode='22023'; end if;
 statuses=case p_bucket when 'pending_review' then array['pending_review']::public.application_status[]
 when 'approved' then array['approved','registered']::public.application_status[]
 when 'rejected' then array['rejected']::public.application_status[] else null end;
 if statuses is null then raise exception 'Invalid filter' using errcode='22023'; end if;
 if left(needle,1)='@' then needle=substring(needle from 2); end if;
 return jsonb_build_object('total',(select count(*) from public.applications where role::text=p_role and status=any(statuses) and (needle='' or strpos(lower(full_name),needle)>0 or strpos(lower(telegram_username),needle)>0)),
 'items',coalesce((select jsonb_agg(item order by created_at desc,id desc) from (
 select a.created_at,a.id,jsonb_build_object(
   'id',a.id,'role',a.role,'full_name',a.full_name,'telegram_username',a.telegram_username,
   'student_goal',a.student_goal,'teaching_experience',a.teaching_experience,
   'subjects',coalesce((select jsonb_agg(s.name order by s.name) from public.application_subjects x join public.subjects s on s.id=x.subject_id where x.application_id=a.id),'[]'::jsonb),
   'created_at',a.created_at,'telegram_verified_at',a.telegram_verified_at,'status',a.status,
   'reviewed_at',a.reviewed_at,'reviewed_by_name',a.reviewed_by_name,'registered_at',a.registered_at,
   'link_expires_at',latest.expires_at,'delivery_status',a.registration_delivery_status,
   'can_resend',a.status='approved' and (latest.expires_at is null or latest.expires_at<=now() or a.registration_delivery_status='failed' or (a.registration_delivery_status='pending' and a.registration_delivery_at<now()-interval '2 minutes'))
 ) item from public.applications a
 left join lateral(select expires_at from private.one_time_tokens where application_id=a.id and purpose='registration' and used_at is null order by created_at desc limit 1) latest on true
 where a.role::text=p_role and a.status=any(statuses) and (needle='' or strpos(lower(a.full_name),needle)>0 or strpos(lower(a.telegram_username),needle)>0) order by a.created_at desc,a.id desc limit 50 offset p_offset
 ) rows),'[]'::jsonb));
end $$;

revoke all on function public.admin_applications_search(uuid,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.admin_applications_search(uuid,text,text,integer,text) to service_role;
create function public.bot_directory_contact(p_user text,p_chat text,p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where telegram_user_id=p_user and telegram_chat_id=p_chat and role='admin' and account_status='active') then raise exception 'Forbidden' using errcode='42501'; end if;
 return (select jsonb_build_object('name',full_name,'userId',telegram_user_id) from public.profiles where id=p_id and account_status<>'deleted' and telegram_user_id ~ '^[1-9][0-9]*$');
end $$;
revoke all on function public.bot_directory_contact(text,text,uuid) from public,anon,authenticated;
grant execute on function public.bot_directory_contact(text,text,uuid) to service_role;
commit;
