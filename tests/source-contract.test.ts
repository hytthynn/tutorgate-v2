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

test("007 schedule uses local magnet, persistent status and conditional completion icon", async () => {
  const calendar = await read("src/components/schedule/calendar.tsx");
  assert.match(calendar, /nearestFreeStart\(desiredStart, source.durationMinutes, offset, busy\)/);
  assert.match(calendar, /lessons.filter\(lesson => lesson.id !== source.id\)/);
  assert.match(calendar, /g.target = startsAt \?\? undefined/);
  assert.match(calendar, /noFreeInterval/);
  assert.match(calendar, /role="status" aria-live="polite"/);
  assert.match(calendar, /onSaveState=\{setSaveState\}/);
  assert.match(calendar, /lesson.completed && <CircleCheck/);
  assert.doesNotMatch(calendar, /visibility:|Все 24 часа/);
  assert.match(await read("src/components/schedule/lesson-dialog.tsx"), /<form onSubmit=/);
  assert.match(await read("src/components/schedule/lesson-dialog.tsx"), /onSaveState\?\.\("error"\)/);
});
test("007 auto filters replace URLs, debounce 300ms, and preserve server directory", async () => {
  const directory = await read("src/features/people/page.tsx");
  assert.doesNotMatch(directory, /use client|Найти/);
  assert.match(directory, /admin && p.role === "admin"/);
  assert.match(await read("src/components/people/directory-filters.tsx"), /event.target.value \}, 300/);
  const hook = await read("src/components/shared/use-auto-filters.ts");
  assert.match(hook, /router.replace/); assert.doesNotMatch(hook, /router.push/);
  assert.match(hook, /serialize\(current.current, lastQuery.current\)/);
  assert.doesNotMatch(await read("src/components/statistics/statistics-view.tsx"), /Применить|router.push/);
});
test("007 subject selectors have no search; people selectors keep it", async () => {
  assert.doesNotMatch(await read("src/components/schedule/lesson-dialog.tsx"), /Select searchable aria-label="Предмет"/);
  const forms = await read("src/components/forms/admin-forms.tsx");
  assert.doesNotMatch(forms, /Select searchable\s+name="subject_id"/);
  assert.match(forms, /Select searchable\s+name="tutor_id"/);
  assert.match(await read("src/components/people/directory-filters.tsx"), /searchable=\{kind === "students"\}/);
});
test("007 shared loading API used by every agreed form and logout", async () => {
  const button = await read("src/components/ui/button.tsx");
  assert.match(button, /disabled=\{disabled \|\| loading\}/);
  assert.match(button, /aria-busy=\{loading/);
  assert.match(button, /Loader2.*className="spin"/);
  for (const file of ["admin-forms", "auth-form", "application-form"]) assert.match(await read(`src/components/forms/${file}.tsx`), /loading=\{pending\}/);
  assert.equal((await read("src/components/forms/admin-forms.tsx")).match(/loading=\{pending\}/g)?.length, 6);
  assert.match(await read("src/components/layout/navigation.tsx"), /useFormStatus/);
});
