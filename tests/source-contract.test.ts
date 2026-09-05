import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
const read = (name: string) => readFile(new URL(`../${name}`, import.meta.url), "utf8");
test("schedule never refreshes the current RSC calendar", async () => {
  for (const file of ["src/components/schedule/calendar.tsx", "src/components/schedule/lesson-dialog.tsx", "src/features/schedule/actions.ts", "src/features/schedule/service.ts"]) {
    const source = await read(file);
    assert.doesNotMatch(source, /router\.refresh\s*\(/, file);
    assert.doesNotMatch(source, /revalidatePath\s*\(/, file);
  }
});
test("custom selectors and global toast replace legacy mechanisms", async () => {
  const files = await readdir(new URL("../src/", import.meta.url), { recursive: true });
  for (const file of files.filter(f => /\.tsx$/.test(f))) {
    assert.doesNotMatch(await read(`src/${file}`), /<select(?:\s|>)/, file);
  }
  const css = await read("src/app/globals.css");
  assert.doesNotMatch(css, /\.schedule-notice/);
  assert.match(css, /input\[type="number"\]::\-webkit-inner-spin-button/);
  assert.match(await read("src/app/layout.tsx"), /<Toaster\s*\/>/);
});
test("history is unbounded but paginated, normalized names are batched", async () => {
  const query = await read("src/features/schedule/queries.ts");
  assert.match(query, /readLessons\(null,\s*null,/);
  assert.match(query, /range\(page\s*\*\s*500,\s*page\s*\*\s*500\s*\+\s*499\)/);
  assert.match(query, /rows\.slice\(i,\s*i\s*\+\s*500\)/);
});
test("upgrade migration retains exclusion constraints and locks private helpers", async () => {
  const sql = await read("supabase/migrations/202609050006_schedule_upgrade.sql");
  assert.doesNotMatch(sql, /drop constraint lessons_(tutor|student)_overlap/);
  assert.match(sql, /on delete set null/i);
  assert.match(sql, /primary key\(tutor_id,target_week_start\)/);
  assert.match(sql, /revoke insert,update,delete on public.lessons,public.lesson_private_notes from authenticated/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /tutorgate-week-rollover/);
});
