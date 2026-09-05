-- Run as database owner AFTER migration 006.
create extension if not exists pg_cron;
select cron.schedule('tutorgate-week-rollover','*/5 * * * *','select private.rollover_all_schedules()');
select private.rollover_all_schedules();
