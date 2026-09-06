import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Keep the deployed migration immutable; wrap the failed migration for SQL Editor retry. */
export function prepareScheduleMigration(migration) {
  if (!/^--[^\n]*\r?\nbegin;/i.test(migration) || !/commit;\s*$/i.test(migration)) {
    throw new Error("Expected the complete transactional schedule migration.");
  }
  return `-- Run this COMPLETE file in Supabase SQL Editor as the database owner.
-- Only for a database on 006 where 007 failed and rolled back.
-- If SQLSTATE 55P03 is returned, retry the WHOLE file during a quiet period.
begin;
do $guard$
begin
  if not pg_try_advisory_xact_lock(842106001) then
    raise exception 'Schedule writer or rollover is running. Retry the complete migration later.' using errcode='55P03';
  end if;
end
$guard$;
-- Acquire the strongest required locks before any DDL. NOWAIT also covers
-- readers that do not participate in the schedule advisory-lock protocol.
-- A failed acquisition aborts this transaction; previously acquired locks are released.
lock table public.profiles, public.subjects, public.tutor_subjects,
  public.student_tutor_assignments, public.lessons, public.lesson_private_notes,
  public.user_schedule_preferences, public.schedule_week_rollovers
  in access exclusive mode nowait;
do $guard$
begin
  if exists(select 1 from information_schema.columns
    where table_schema='public' and table_name='lessons' and column_name='inactive_reason') then
    raise exception 'Migration 007 is already present, or was run in fragments. Do not rerun it; inspect migration state first.';
  end if;
end
$guard$;

${migration.replace(/^(--[^\n]*\r?\n)begin;\s*/i, "$1")}`;
}

async function main() {
  const source = new URL("../supabase/migrations/202609050007_schedule_features.sql", import.meta.url);
  const output = resolve(process.argv[2] ?? "artifacts/apply-schedule-features.sql");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, prepareScheduleMigration(await readFile(source, "utf8")), "utf8");
  console.log(output);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode=1; });
}
