import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
test("schedule migration, exclusion constraints and authenticated RLS", async (t) => {
  const db = new PGlite({ extensions: { btree_gist } });
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
    for (const name of (await readdir(new URL("../supabase/migrations/", import.meta.url))).filter((n) => n.endsWith(".sql")).sort())
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8"));
    await db.exec("alter table auth.users disable trigger user");
    for (const [n, role] of [[1, "admin"], [2, "tutor"], [3, "tutor"], [4, "student"], [5, "student"], [6, "student"]] as const) {
      await db.query("insert into auth.users(id) values($1)", [id(n)]);
      await db.query("insert into public.profiles(id,role,full_name,telegram_username,telegram_user_id,telegram_chat_id) values($1,$2,$3,$3,$3,$3)", [id(n), role, `Person ${n}`]);
    }
    const subjects = (await db.query<{ id: string }>("select id from public.subjects order by name")).rows;
    const subject = subjects[0].id, otherSubject = subjects[1].id;
    async function as(n: number, work: () => Promise<void>) {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(n)]);
      await db.exec("set role authenticated");
      try { await work(); } finally { await db.exec("reset role"); }
    }
    await as(1, async () => {
      for (const n of [1, 2, 3]) await db.query("select public.set_tutor_subjects($1,$2)", [id(n), [subject, otherSubject]]);
      for (const [student, tutor, sub] of [[4, 2, subject], [4, 3, otherSubject], [5, 2, subject], [5, 1, otherSubject]] as const)
        await db.query("insert into public.student_tutor_assignments(student_id,tutor_id,subject_id,assigned_by) values($1,$2,$3,$4)", [id(student), id(tutor), sub, id(1)]);
    });
    async function save(tutor: number, student: number, start: string, duration = 60, sub = subject, note = "Приватная заметка") {
      let result = "";
      await as(tutor, async () => {
        result = (await db.query<{ id: string }>("select public.save_schedule_lesson(null,$1,$2,$3,$4,$5) id", [id(student), sub, start, duration, note])).rows[0].id;
      });
      return result;
    }
    const first = await save(2, 4, "2026-09-06T20:00:00Z", 120, otherSubject);
    const second = await save(2, 5, "2026-09-06T22:00:00Z");
    const adminLesson = await save(1, 5, "2026-09-07T12:00:00Z");
    await t.test("duration, palette, tutor/student overlap, back-to-back, assignment and subject", async () => {
      await assert.rejects(save(2, 4, "2026-09-08T10:00:00Z", 601));
      await assert.rejects(save(2, 4, "2026-09-08T10:00:00Z", 0));
      await assert.rejects(save(2, 5, "2026-09-06T21:59:00Z"), { code: "23P01" });
      await assert.rejects(save(3, 4, "2026-09-06T21:00:00Z"), { code: "23P01" });
      await assert.rejects(save(2, 6, "2026-09-08T10:00:00Z"));
      await assert.rejects(save(2, 4, "2026-09-08T10:00:00Z", 60, subjects[2].id));
      await as(2, async () => {
        await assert.rejects(db.query("update public.lessons set color='pink' where id=$1", [first]));
        await db.query("update public.lessons set ends_at='2030-01-01' where id=$1", [first]);
        const row = (await db.query<{ minutes: number }>("select extract(epoch from ends_at-starts_at)/60 minutes from public.lessons where id=$1", [first])).rows[0];
        assert.equal(Number(row.minutes), 120);
      });
      assert.ok(second);
    });
    await t.test("students only read own lessons; no notes or writes or hourly rate", async () => {
      await as(4, async () => {
        assert.deepEqual((await db.query<{ id: string }>("select id from public.lessons")).rows.map((r) => r.id), [first]);
        assert.equal((await db.query("select * from public.lesson_private_notes")).rows.length, 0);
        assert.equal((await db.query("select * from public.app_settings")).rows.length, 0);
        await assert.rejects(db.query("select public.save_schedule_lesson(null,$1,$2,'2026-09-10',60,'')", [id(4), subject]));
        assert.equal((await db.query("update public.lessons set color='blue' returning id")).rows.length, 0);
        assert.equal((await db.query("delete from public.lessons returning id")).rows.length, 0);
        await assert.rejects(db.query("select public.delete_schedule_lessons($1)", [[first]]));
        await assert.rejects(db.query("insert into public.lesson_private_notes values($1,'bad',now())", [second]));
        const names = (await db.query("select * from public.schedule_lesson_names($1)", [[first, second, adminLesson]])).rows;
        assert.equal(names.length, 1); assert.ok(!JSON.stringify(names).includes("Приватная"));
      });
    });
    await t.test("tutor owns writes; admin reads overall but cannot write other calendars", async () => {
      await as(2, async () => {
        assert.equal((await db.query("select * from public.lessons")).rows.length, 2);
        assert.equal((await db.query("select * from public.app_settings")).rows.length, 1);
        assert.equal((await db.query("update public.lesson_private_notes set note='updated' where lesson_id=$1 returning lesson_id", [first])).rows.length, 1);
        assert.equal((await db.query("update public.lesson_private_notes set note='foreign' where lesson_id=$1 returning lesson_id", [adminLesson])).rows.length, 0);
        await assert.rejects(db.query("update public.lessons set tutor_id=$1 where id=$2", [id(3), first]));
      });
      await as(1, async () => {
        assert.equal((await db.query("select * from public.lessons")).rows.length, 3);
        assert.equal((await db.query("select * from public.lesson_private_notes")).rows.length, 3);
        assert.equal((await db.query("delete from public.lessons where id=$1 returning id", [first])).rows.length, 0);
        await assert.rejects(db.query("select public.save_schedule_lesson($1,$2,$3,'2026-09-10',60,'foreign')", [first, id(4), subject]));
        await assert.rejects(db.query("insert into public.lessons(tutor_id,student_id,subject_id,starts_at,duration_minutes) values($1,$2,$3,'2026-09-10',60)", [id(2), id(4), subject]));
      });
    });
    await t.test("preference is per-owner including admin isolation", async () => {
      await as(4, async () => {
        await db.query("insert into public.user_schedule_preferences(user_id,msk_offset_hours) values($1,12)", [id(4)]);
        await assert.rejects(db.query("update public.user_schedule_preferences set msk_offset_hours=13"));
        await assert.rejects(db.query("insert into public.user_schedule_preferences(user_id) values($1)", [id(2)]));
      });
      await as(1, async () => assert.equal((await db.query("select * from public.user_schedule_preferences")).rows.length, 0));
    });
    await t.test("lesson + note atomicity, inactive historical subject and cascade", async () => {
      await assert.rejects(save(2, 4, "2026-09-12T10:00:00Z", 60, subject, "x".repeat(4001)));
      assert.equal((await db.query("select * from public.lessons")).rows.length, 3);
      await as(1, async () => { await db.query("update public.subjects set is_active=false where id=$1", [otherSubject]); });
      await assert.rejects(save(2, 4, "2026-09-12T10:00:00Z", 60, otherSubject));
      await as(2, async () => {
        await db.query("update public.lessons set completed_at=now(),color='green' where id=$1", [first]);
        const deleted = await db.query<{ count: number }>("select public.delete_schedule_lessons($1) count", [[first, first, adminLesson]]);
        assert.equal(deleted.rows[0].count, 1);
        assert.equal((await db.query("select * from public.lesson_private_notes where lesson_id=$1", [first])).rows.length, 0);
      });
    });
  } finally { await db.close(); }
});
