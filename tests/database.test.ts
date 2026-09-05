import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { hash, token } from "../src/lib/auth/tokens";

test("real PostgreSQL migrations, registration transactions, RLS and single-use tokens", async (t) => {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
  for (const name of (
    await readdir(new URL("../supabase/migrations/", import.meta.url))
  )
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await db.exec(
      await readFile(
        new URL(`../supabase/migrations/${name}`, import.meta.url),
        "utf8",
      ),
    );
  const query = async <T>(sql: string, args: unknown[] = []) =>
    (await db.query<T>(sql, args)).rows;
  const subjects = await query<{ id: string }>(
    "select id from public.subjects order by name",
  );
  const subject = subjects[0].id;
  const another = subjects[1].id;
  async function createUser(
    name: string,
    role: "student" | "tutor",
    tg: string,
  ) {
    const deep = hash(token()),
      reg = hash(token()),
      id = randomUUID();
    const [app] = await query<{ id: string }>(
      "select public.submit_application($1::jsonb,$2) id",
      [
        JSON.stringify({
          role,
          full_name: name,
          telegram_username: name,
          student_goal: role === "student" ? "Другое" : undefined,
          teaching_experience: role === "tutor" ? "5+ лет" : undefined,
          subject_ids: [subject],
        }),
        deep,
      ],
    );
    const updateId = Number(tg);
    const [confirmed] = await query<{ v: { status: string } }>(
      "select public.confirm_telegram($1,$2,$3,$4,$5,$5) v",
      [updateId, deep, reg, name, tg],
    );
    assert.equal(confirmed.v.status, "send");
    await db.query("insert into auth.users values($1,$2,$3::jsonb)", [
      id,
      `${name}@internal.test`,
      JSON.stringify({ username: name, registration_hash: reg }),
    ]);
    return { id, reg, deep, app: app.id, updateId };
  }
  const admin = await createUser("administrator", "tutor", "10001");
  await db.query("select public.promote_admin('administrator')");
  const tutor = await createUser("teacher", "tutor", "10002");
  const other = await createUser("another_teacher", "tutor", "10003");
  const student = await createUser("student_one", "student", "10004");
  const student2 = await createUser("student_two", "student", "10005");
  const asUser = async (id: string, work: () => Promise<void>) => {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role authenticated");
    try {
      await work();
    } finally {
      await db.exec("reset role");
    }
  };
  await t.test(
    "registration is atomic, no auto-assigned tutor subjects, duplicate token denied",
    async () => {
      assert.equal(
        (await query("select * from public.tutor_subjects")).length,
        0,
      );
      assert.equal(
        (
          await query<{ v: string }>(
            "select public.token_status($1,'registration') v",
            [tutor.reg],
          )
        )[0].v,
        "used",
      );
      await assert.rejects(
        db.query("insert into auth.users values($1,$2,$3::jsonb)", [
          randomUUID(),
          "dup@internal.test",
          JSON.stringify({
            username: "duplicate",
            registration_hash: tutor.reg,
          }),
        ]),
      );
      assert.equal((await query("select * from auth.users")).length, 5);
    },
  );
  await t.test(
    "webhook retries use one registration token and duplicate delivery is tracked",
    async () => {
      const [retry] = await query<{ v: { status: string } }>(
        "select public.confirm_telegram($1,$2,$3,'teacher','10002','10002') v",
        [tutor.updateId, tutor.deep, tutor.reg],
      );
      assert.equal(retry.v.status, "send");
      await db.query("select public.telegram_delivered($1)", [tutor.updateId]);
      const [done] = await query<{ v: { status: string } }>(
        "select public.confirm_telegram($1,$2,$3,'teacher','10002','10002') v",
        [tutor.updateId, tutor.deep, tutor.reg],
      );
      assert.equal(done.v.status, "done");
    },
  );
  await t.test(
    "admin assignments enforce subjects, roles and RESTRICT deletion",
    async () => {
      await asUser(admin.id, async () => {
        await db.query("select public.set_tutor_subjects($1,$2::uuid[])", [
          tutor.id,
          [subject],
        ]);
        await db.query(
          "insert into public.student_tutor_assignments(student_id,tutor_id,subject_id,assigned_by) values($1,$2,$3,$4)",
          [student.id, tutor.id, subject, admin.id],
        );
        await assert.rejects(
          db.query(
            "insert into public.student_tutor_assignments(student_id,tutor_id,subject_id,assigned_by) values($1,$2,$3,$4)",
            [student2.id, tutor.id, another, admin.id],
          ),
        );
        await assert.rejects(
          db.query("select public.set_tutor_subjects($1,'{}'::uuid[])", [
            tutor.id,
          ]),
        );
        await assert.rejects(
          db.query("select public.set_tutor_subjects($1,$2::uuid[])", [
            student.id,
            [subject],
          ]),
        );
      });
    },
  );
  await t.test(
    "students and tutors read only their assigned peers; no Telegram/private fields",
    async () => {
      await asUser(student.id, async () => {
        const visible = await query<{
          id: string;
          telegram_username: string | null;
        }>("select * from public.visible_profiles()");
        assert.deepEqual(
          new Set(visible.map((p) => p.id)),
          new Set([student.id, tutor.id]),
        );
        assert.equal(
          visible.find((p) => p.id === tutor.id)?.telegram_username,
          null,
        );
        await assert.rejects(
          db.query("select telegram_user_id from public.profiles"),
        );
        await assert.rejects(db.query("select * from private.auth_aliases"));
        await assert.rejects(db.query("select public.lookup_alias('teacher')"));
        assert.equal(
          (await query("select * from public.app_settings")).length,
          0,
        );
        await assert.rejects(
          db.query("select public.set_tutor_subjects($1,$2::uuid[])", [
            tutor.id,
            [another],
          ]),
        );
      });
      await asUser(tutor.id, async () =>
        assert.deepEqual(
          new Set(
            (
              await query<{ id: string }>(
                "select * from public.visible_profiles()",
              )
            ).map((p) => p.id),
          ),
          new Set([student.id, tutor.id]),
        ),
      );
      await asUser(other.id, async () =>
        assert.equal(
          (await query("select * from public.student_tutor_assignments"))
            .length,
          0,
        ),
      );
    },
  );
  await t.test(
    "anonymous access only exposes active subjects and no service RPCs",
    async () => {
      await db.exec("set role anon");
      try {
        assert.ok((await query("select * from public.subjects")).length > 0);
        await assert.rejects(db.query("select * from public.applications"));
        await assert.rejects(
          db.query("select public.session_read('anything')"),
        );
      } finally {
        await db.exec("reset role");
      }
    },
  );
  await t.test(
    "password reset tokens are single-use under concurrent calls",
    async () => {
      const reset = hash(token());
      await db.query("select public.request_reset('teacher',$1)", [reset]);
      const responses = await Promise.all([
        query<{ id: string | null }>("select public.claim_reset($1) id", [
          reset,
        ]),
        query<{ id: string | null }>("select public.claim_reset($1) id", [
          reset,
        ]),
      ]);
      assert.equal(responses.filter((r) => r[0].id === tutor.id).length, 1);
    },
  );
  await t.test(
    "Telegram mismatch leaves token usable; an existing Telegram identity cannot register twice",
    async () => {
      const deep = hash(token());
      const reg = hash(token());
      await db.query("select public.submit_application($1::jsonb,$2)", [
        JSON.stringify({
          role: "tutor",
          full_name: "New Teacher",
          telegram_username: "new_teacher",
          teaching_experience: "5+ лет",
          subject_ids: [subject],
        }),
        deep,
      ]);
      const confirm = async (name: string, tg: string, update: number) =>
        (
          await query<{ v: { status: string } }>(
            "select public.confirm_telegram($1,$2,$3,$4,$5,$5) v",
            [update, deep, reg, name, tg],
          )
        )[0].v.status;
      assert.equal(await confirm("wrong_username", "99999", 80001), "mismatch");
      assert.equal(await confirm("", "99999", 80002), "no_username");
      assert.equal(await confirm("new_teacher", "10002", 80003), "linked");
      assert.equal(
        (
          await query<{ v: string }>(
            "select public.token_status($1,'telegram_application') v",
            [deep],
          )
        )[0].v,
        "valid",
      );
    },
  );
  await t.test(
    "expired registrations release only unregistered Telegram reservations",
    async () => {
      const deep = hash(token());
      const reg = hash(token());
      const [app] = await query<{ id: string }>(
        "select public.submit_application($1::jsonb,$2) id",
        [
          JSON.stringify({
            role: "tutor",
            full_name: "Expired Teacher",
            telegram_username: "expired_teacher",
            teaching_experience: "5+ лет",
            subject_ids: [subject],
          }),
          deep,
        ],
      );
      await db.query(
        "select public.confirm_telegram(90001,$1,$2,'expired_teacher','90001','90001')",
        [deep, reg],
      );
      await db.query(
        "update private.one_time_tokens set expires_at=now()-interval '1 second' where token_hash=$1",
        [reg],
      );
      await db.query("select public.submit_application($1::jsonb,$2)", [
        JSON.stringify({
          role: "tutor",
          full_name: "Expired Teacher",
          telegram_username: "expired_teacher",
          teaching_experience: "5+ лет",
          subject_ids: [subject],
        }),
        hash(token()),
      ]);
      const [expired] = await query<{
        status: string;
        telegram_user_id: string | null;
      }>(
        "select status,telegram_user_id from public.applications where id=$1",
        [app.id],
      );
      assert.equal(expired.status, "expired");
      assert.equal(expired.telegram_user_id, null);
      assert.equal(
        (await query("select * from public.profiles where id=$1", [tutor.id]))
          .length,
        1,
      );
    },
  );
  await t.test(
    "reset revocation removes only the target user's opaque sessions",
    async () => {
      const first = hash(token()),
        second = hash(token());
      for (const handle of [first, second])
        await db.query(
          'select public.session_write($1,\'[{"name":"cookie","value":"secret"}]\'::jsonb)',
          [handle],
        );
      await db.query("select public.bind_session($1,$2)", [first, tutor.id]);
      await db.query("select public.bind_session($1,$2)", [second, other.id]);
      await db.query("select public.revoke_user_sessions($1)", [tutor.id]);
      assert.equal(
        (
          await query<{ v: unknown }>("select public.session_read($1) v", [
            first,
          ])
        )[0].v,
        null,
      );
      assert.ok(
        (
          await query<{ v: unknown }>("select public.session_read($1) v", [
            second,
          ])
        )[0].v,
      );
    },
  );
  await t.test(
    "rate counters persist across calls and refuse the fourth request",
    async () => {
      for (let i = 0; i < 4; i++)
        assert.equal(
          (
            await query<{ v: boolean }>(
              "select public.rate_limit('test',3,900) v",
            )
          )[0].v,
          i < 3,
        );
    },
  );
  await t.test(
    "hard deletion removes current assignments and prevents new ones",
    async () => {
      await asUser(admin.id, async () => {
        await db.query(
          "select public.delete_subject_hard($1)",
          [subject],
        );
        assert.equal(
          (await query("select * from public.student_tutor_assignments"))
            .length,
          0,
        );
        await assert.rejects(
          db.query(
            "insert into public.student_tutor_assignments(student_id,tutor_id,subject_id,assigned_by) values($1,$2,$3,$4)",
            [student2.id, tutor.id, subject, admin.id],
          ),
        );
      });
    },
  );
  await db.close();
});
