import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
// The generator is also used by operators without a TypeScript runtime.
import { prepareScheduleMigration } from "../scripts/prepare-schedule-migration.mjs";

test("retry takes nonblocking writer/table locks before the unchanged migration body",async()=>{
  const original=await readFile(new URL("../supabase/migrations/202609050007_schedule_features.sql",import.meta.url),"utf8");
  const sql=prepareScheduleMigration(original) as string;
  assert.ok(sql.indexOf("pg_try_advisory_xact_lock(842106001)")<sql.indexOf("lock table"));
  assert.ok(sql.indexOf("in access exclusive mode nowait")<sql.indexOf("alter table public.lessons"));
  const body=original.replace(/^(--[^\n]*\r?\n)begin;\s*/i,"$1");
  assert.ok(sql.endsWith(body));
  assert.throws(()=>prepareScheduleMigration("alter table public.lessons add column x int;"));
});
