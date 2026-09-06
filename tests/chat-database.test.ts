import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
test("011 full migration chain, active assignment, Reply mapping, dedupe, bounded reads and private grants", async (t) => {
  const db = new PGlite({ extensions: { btree_gist } });
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`,
    );
    const dir = new URL("../supabase/migrations/", import.meta.url);
    for (const f of (await readdir(dir))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.exec(await readFile(new URL(f, dir), "utf8"));
    await db.exec("alter table auth.users disable trigger user");
    for (const [n, role] of [
      [1, "admin"],
      [2, "tutor"],
      [3, "student"],
      [4, "tutor"],
      [5, "student"],
    ] as const) {
      await db.query("insert into auth.users values($1,$2,'{}')", [
        id(n),
        `u${n}@fixture.test`,
      ]);
      await db.query(
        "insert into public.profiles(id,role,full_name,telegram_username,telegram_user_id,telegram_chat_id) values($1,$2,$3,$4,$5,$5)",
        [id(n), role, `Person ${n}`, `fixture_${n}`, String(n)],
      );
    }
    const subjects = (
      await db.query<{ id: string }>(
        "select id from public.subjects order by id limit 3",
      )
    ).rows.map((r) => r.id);
    // Assignment triggers derive assigned_by from the authenticated actor.
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(1)]);
    for (const [tutor, subject] of [
      [2, subjects[0]],
      [2, subjects[1]],
      [4, subjects[2]],
      [1, subjects[0]],
    ] as const)
      await db.query(
        "insert into public.tutor_subjects(tutor_id,subject_id,assigned_by) values($1,$2,$3)",
        [id(tutor), subject, id(1)],
      );
    for (const [student, tutor, subject] of [
      [3, 2, subjects[0]],
      [3, 2, subjects[1]],
      [3, 4, subjects[2]],
      [5, 1, subjects[0]],
    ] as const)
      await db.query(
        "insert into public.student_tutor_assignments(student_id,tutor_id,subject_id,assigned_by) values($1,$2,$3,$4)",
        [id(student), id(tutor), subject, id(1)],
      );
    await db.exec("select set_config('request.jwt.claim.sub','',false)");
    async function as<T>(n: number, fn: () => Promise<T>): Promise<T> {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id(n),
      ]);
      await db.exec("set role authenticated");
      try {
        return await fn();
      } finally {
        await db.exec("reset role");
      }
    }
    const send = async (student = 3, tutor = 2, text = "Tutor message") =>
      (
        await as(tutor, () =>
          db.query<{ m: { id: string; delivery_status: string } }>(
            "select public.chat_send($1,$2) m",
            [id(student), text],
          ),
        )
      ).rows[0].m;
    const incoming = async (update: number, reply: number | null = 101) =>
      (
        await db.query<{ v: { status: string; messageId: string } }>(
          "select public.chat_bot_receive('3','3',$1,'Student reply',$2) v",
          [update, reply],
        )
      ).rows[0].v;
    const unread = async () =>
      (
        await as(2, () =>
          db.query<{ n: number }>("select public.chat_unread() n"),
        )
      ).rows[0].n;
    const message = await send();
    await t.test(
      "unique pair across subjects; assigned admin included in picker",
      async () => {
        await send();
        assert.equal(
          (await db.query("select * from public.chat_conversations")).rows
            .length,
          1,
        );
        assert.equal(message.delivery_status, "pending");
        const picker = (
          await db.query<{ v: { id: string }[] }>(
            "select public.chat_bot_tutors($1) v",
            [id(3)],
          )
        ).rows[0].v;
        assert.equal(picker.length, 2);
        assert.deepEqual(
          (
            await db.query<{ v: {id:string}[] }>(
              "select public.chat_bot_tutors($1) v",
              [id(5)],
            )
          ).rows[0].v.map(t=>t.id),
          [id(1)],
        );
      },
    );
    await t.test(
      "role, assignment, text and direct access boundaries",
      async () => {
        for (const n of [1, 3, 5])
          await assert.rejects(send(3, n), { code: "42501" });
        await assert.rejects(send(5), { code: "42501" });
        await assert.rejects(send(3, 2, "x".repeat(4001)), { code: "22023" });
        for (const table of [
          "telegram_chat_state",
          "telegram_chat_updates",
          "telegram_message_links",
        ])
          await assert.rejects(
            as(2, () => db.query(`select * from private.${table}`)),
            { code: "42501" },
          );
        await assert.rejects(
          as(2, () => db.query("select public.chat_bot_profile('3','3')")),
          { code: "42501" },
        );
        await assert.rejects(
          as(2, () =>
            db.query("update public.chat_messages set body='tamper'"),
          ),
          { code: "42501" },
        );
        assert.equal(
          (await as(4, () => db.query("select * from public.chat_messages")))
            .rows.length,
          0,
        );
        assert.equal(
          (await as(3, () => db.query("select * from public.chat_messages")))
            .rows.length,
          2,
        );
        await db.exec("set role anon");
        try {
          await assert.rejects(db.query("select public.chat_snapshot(null)"), {
            code: "42501",
          });
        } finally {
          await db.exec("reset role");
        }
      },
    );
    await t.test("service grant and stable Telegram identity", async () => {
      await db.exec("set role service_role");
      try {
        const result = await db.query<{ v: { id: string } }>(
          "select public.chat_bot_profile('3','3') v",
        );
        assert.equal(result.rows[0].v.id, id(3));
        assert.equal(
          (
            await db.query<{ v: unknown }>(
              "select public.chat_bot_profile('3','999') v",
            )
          ).rows[0].v,
          null,
        );
      } finally {
        await db.exec("reset role");
      }
    });
    await t.test(
      "Reply beats saved recipient and retry creates one message",
      async () => {
        await db.query("select public.chat_finish_delivery($1,true,'3',101)", [
          message.id,
        ]);
        await db.query("select public.chat_bot_set_recipient($1,$2)", [
          id(3),
          id(4),
        ]);
        const m = await incoming(1001);
        assert.equal(m.status, "sent");
        assert.equal(
          (
            await db.query<{ tutor_id: string }>(
              "select c.tutor_id from public.chat_messages m join public.chat_conversations c on c.id=m.conversation_id where m.id=$1",
              [m.messageId],
            )
          ).rows[0].tutor_id,
          id(2),
        );
        assert.equal((await incoming(1001)).status, "duplicate");
        assert.equal((await incoming(1002, 999)).status, "unavailable");
        assert.equal(await unread(), 1);
      },
    );
    await t.test(
      "read marker cannot clear a newer unseen message or another conversation",
      async () => {
        const a = await incoming(1003),
          b = await incoming(1004);
        await as(2, () =>
          db.query("select public.chat_mark_read($1,$2)", [id(3), a.messageId]),
        );
        assert.equal(await unread(), 1);
        await as(2, () =>
          db.query("select public.chat_mark_read($1,$2)", [id(3), message.id]),
        );
        assert.equal(await unread(), 1);
        await assert.rejects(
          as(4, () =>
            db.query("select public.chat_mark_read($1,$2)", [
              id(3),
              b.messageId,
            ]),
          ),
          { code: "42501" },
        );
        await as(2, () =>
          db.query("select public.chat_mark_read($1,$2)", [id(3), b.messageId]),
        );
        assert.equal(await unread(), 0);
      },
    );
    await t.test(
      "history tail is chronological and reports truncation; private IDs absent",
      async () => {
        await db.query(
          "select private.chat_append($1,$2,'student','fixture '||n::text) from generate_series(1,205) n",
          [id(3), id(2)],
        );
        const snap = (
          await as(2, () =>
            db.query<{
              v: { messages: { created_at: string }[]; hasMore: boolean };
            }>("select public.chat_snapshot($1) v", [id(3)]),
          )
        ).rows[0].v;
        assert.equal(snap.messages.length, 200);
        assert.equal(snap.hasMore, true);
        assert.deepEqual(
          snap.messages.map((m) => m.created_at),
          snap.messages.map((m) => m.created_at).toSorted(),
        );
        assert.doesNotMatch(JSON.stringify(snap), /telegram|chat_id/);
        await assert.rejects(
          db.query(
            "update public.chat_messages set body=repeat('a',4001) where id=$1",
            [message.id],
          ),
          { code: "23514" },
        );
      },
    );
    await t.test(
      "last assignment removal blocks send, read and Reply; one remaining subject still permits chat",
      async () => {
        await db.query(
          "delete from public.student_tutor_assignments where student_id=$1 and subject_id=$2",
          [id(3), subjects[0]],
        );
        await send();
        await db.query(
          "delete from public.student_tutor_assignments where student_id=$1 and tutor_id=$2",
          [id(3), id(2)],
        );
        await assert.rejects(send(), { code: "42501" });
        assert.equal((await incoming(1005)).status, "unavailable");
        assert.equal(await unread(), 0);
        assert.equal(
          (await as(2, () => db.query("select * from public.chat_messages")))
            .rows.length,
          0,
        );
        await assert.rejects(
          as(2, () =>
            db.query("select public.chat_mark_read($1,$2)", [
              id(3),
              message.id,
            ]),
          ),
          { code: "42501" },
        );
      },
    );
    await t.test("blocked accounts fail closed", async () => {
      await db.query(
        "update public.profiles set account_status='blocked' where id=$1",
        [id(3)],
      );
      assert.equal(
        (
          await db.query<{ v: unknown }>(
            "select public.chat_bot_profile('3','3') v",
          )
        ).rows[0].v,
        null,
      );
      assert.equal(
        (await as(3, () => db.query("select * from public.chat_conversations")))
          .rows.length,
        0,
      );
      await db.query(
        "update public.profiles set account_status='blocked' where id=$1",
        [id(2)],
      );
      await assert.rejects(unread(), { code: "42501" });
    });
  } finally {
    await db.close();
  }
});
