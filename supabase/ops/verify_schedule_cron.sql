-- Deployment gate: run as database owner. Errors block production release.
do $$ begin
 if not exists(select 1 from pg_extension where extname='pg_cron') then
   raise exception 'TutorGate: pg_cron is required for the 5-minute rollover SLA';
 end if;
 if not exists(select 1 from cron.job where jobname='tutorgate-week-rollover' and active and schedule='*/5 * * * *') then
   raise exception 'TutorGate: rollover cron is absent, disabled or has wrong interval';
 end if;
end $$;
select jobid,jobname,schedule,active from cron.job where jobname='tutorgate-week-rollover';
select j.jobname,d.status,d.start_time,d.end_time,d.return_message from cron.job_run_details d join cron.job j using(jobid) where j.jobname='tutorgate-week-rollover' order by d.start_time desc limit 20;
select tutor_id,target_week_start,copied_count,skipped_count,completed_at from public.schedule_week_rollovers order by completed_at desc limit 50;
