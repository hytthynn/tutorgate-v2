import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;

test("010 upgrade, admin boundaries, role transitions, sessions and preserved history in PostgreSQL", async t => {
  const db = new PGlite({ extensions: { btree_gist } });
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
    const directory = new URL("../supabase/migrations/", import.meta.url);
    const files = (await readdir(directory)).filter(n => n.endsWith(".sql")).sort();
    for (const name of files.filter(n => !n.includes("202609060010"))) await db.exec(await readFile(new URL(name, directory), "utf8"));
    await db.exec("alter table auth.users disable trigger user");
    async function add(n: number, role: string) {
      await db.query("insert into auth.users values($1,$2,$3)", [id(n), `u${n}@internal.test`, { username: `user_${n}`, registration_hash: "secret" }]);
      await db.query("insert into public.profiles(id,role,full_name,telegram_username,telegram_user_id,telegram_chat_id) values($1,$2,$3,$4,$5,$5)", [id(n), role, `Person ${n}`, `telegram_${n}`, String(n)]);
      await db.query("insert into private.auth_aliases values($1,$2,$3)", [id(n), `user_${n}`, `u${n}@internal.test`]);
    }
    // Apply 010 over populated package 009, not just an empty database.
    await add(1, "admin"); await add(2, "tutor"); await add(3, "student");
    await db.exec(await readFile(new URL(files.find(n => n.includes("202609060010"))!, directory), "utf8"));
    async function as<T>(n: number, work: () => Promise<T>): Promise<T> {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(n)]); await db.exec("set role authenticated");
      try { return await work(); } finally { await db.exec("reset role"); }
    }
    const subject = (await db.query<{id:string}>("select id from public.subjects limit 1")).rows[0].id;
    const role = (n: number, target: string) => as(1, () => db.query("select public.admin_change_user_role($1,$2)", [id(n), target]));
    const block = (n: number, value: boolean) => as(1, () => db.query("select public.admin_set_user_blocked($1,$2)", [id(n), value]));
    const remove = (n: number) => as(1, () => db.query("select public.admin_soft_delete_user($1)", [id(n)]));
    const profile = async (n: number) => (await db.query<{account_status:string;role:string;full_name:string;telegram_username:string|null;telegram_user_id:string|null;telegram_chat_id:string|null}>("select * from public.profiles where id=$1", [id(n)])).rows[0];
    async function link(tutor: number, student: number) {
      await as(1, async () => {
        await db.query("select public.set_tutor_subjects($1,$2)", [id(tutor), [subject]]);
        await db.query("insert into public.student_tutor_assignments(student_id,tutor_id,subject_id,assigned_by) values($1,$2,$3,$4)", [id(student), id(tutor), subject, id(1)]);
      });
    }
    async function lesson(tutor: number, student: number, future: boolean) {
      return (await db.query<{id:string}>("insert into public.lessons(tutor_id,student_id,subject_id,starts_at,duration_minutes,completed_at) values($1,$2,$3,now()+$4::interval,60,case when $5 then null else now()-interval '20 days' end) returning id", [id(tutor), id(student), subject, future ? "20 days" : "-20 days", future])).rows[0].id;
    }
    await t.test("admin directory only; nullable username; ordinary DTO excludes private identifiers", async () => {
      await db.query("update public.profiles set telegram_username=null where id=$1", [id(3)]);
      const result = await as(1, () => db.query<{login:string;telegram_user_id:string;telegram_username:null}>("select * from public.admin_directory_profiles() where id=$1", [id(3)]));
      assert.equal(result.rows[0].login, "user_3"); assert.equal(result.rows[0].telegram_user_id, "3"); assert.equal(result.rows[0].telegram_username, null);
      for (const n of [2,3]) {
        await assert.rejects(as(n, () => db.query("select * from public.admin_directory_profiles()")), { code: "42501" });
        const rows = await as(n, () => db.query<Record<string,unknown>>("select * from public.visible_profiles()"));
        assert.ok(rows.rows.every(p => !("login" in p) && !("telegram_user_id" in p)));
        await assert.rejects(as(n, () => db.query("select public.admin_set_user_blocked($1,true)", [id(2)])), { code: "42501" });
        await assert.rejects(as(n, () => db.query("select public.admin_soft_delete_user($1)", [id(2)])), { code: "42501" });
      }
      await db.exec("set role anon");
      try { await assert.rejects(db.query("select * from public.admin_directory_profiles()"), { code: "42501" }); } finally { await db.exec("reset role"); }
      await assert.rejects(db.query("update public.profiles set telegram_chat_id=null where id=$1", [id(3)]), { code: "23514" });
    });
    await t.test("both role directions, each incompatible relation, future lessons, historical lessons retained", async () => {
      for (const [tutor, student, target] of [[10,11,"student"], [12,13,"tutor"]] as const) {
        await add(tutor,"tutor"); await add(student,"student"); await link(tutor,student);
        const n = target === "student" ? tutor : student;
        await assert.rejects(role(n,target), { code:"P0010" });
        const historical = await lesson(tutor,student,false), future = await lesson(tutor,student,true);
        await db.query("delete from public.student_tutor_assignments where student_id=$1", [id(student)]);
        await assert.rejects(role(n,target), { code:"P0010" });
        await db.query("delete from public.lessons where id=$1", [future]);
        if (target === "student") {
          await assert.rejects(role(n,target), { code:"P0010" });
          await as(1, () => db.query("select public.set_tutor_subjects($1,'{}')", [id(tutor)]));
        }
        await role(n,target); assert.equal((await profile(n)).role, target);
        assert.equal((await db.query("select id from public.lessons where id=$1", [historical])).rows.length,1);
      }
      await assert.rejects(role(1,"student"), { code:"42501" });
      await assert.rejects(block(1,true), { code:"42501" });
      await assert.rejects(remove(1), { code:"42501" });
      await assert.rejects(as(3, () => db.query("update public.profiles set role='admin' where id=$1", [id(3)])), { code:"42501" });
    });
    await t.test("block revokes vault, stale access fails closed, late refresh/bind cannot restore access, unblock works", async () => {
      await link(2,3);
      await db.query("select public.session_write('session3','[]'::jsonb||jsonb_build_object('name','auth','value','cookie'))");
      await db.query("select public.bind_session('session3',$1)", [id(3)]);
      await block(3,true);
      assert.equal((await profile(3)).account_status,"blocked");
      assert.equal((await db.query("select * from private.sessions where handle_hash='session3'")).rows.length,0);
      await db.query("select public.session_refresh('session3','[{\"name\":\"auth\",\"value\":\"late\"}]')");
      assert.equal((await db.query("select * from private.sessions where handle_hash='session3'")).rows.length,0);
      await assert.rejects(db.query("select public.bind_session('session3',$1)", [id(3)]), { code:"42501" });
      assert.equal((await as(3, () => db.query<Record<string,unknown>>("select * from public.visible_profiles()"))).rows.length,0);
      assert.equal((await as(3, () => db.query("select id from public.profiles"))).rows.length,0);
      await assert.rejects(as(3, () => db.query("select public.schedule_command('{\"kind\":\"offset\",\"offset\":1}')")), { code:"42501" });
      assert.equal((await as(1, () => db.query("select * from public.admin_directory_profiles() where id=$1",[id(3)]))).rows.length,1);
      await assert.rejects(lesson(2,3,true), { code:"23514" });
      await assert.rejects(as(1, () => db.query("update public.student_tutor_assignments set assigned_by=$1 where student_id=$2", [id(1),id(3)])), { code:"23514" });
      await block(3,false);
      assert.equal((await profile(3)).account_status,"active");
      assert.equal((await as(3, () => db.query("select * from public.visible_profiles() where id=$1",[id(3)]))).rows.length,1);
    });
    await t.test("soft delete erases identifiers/alias/reset/metadata, preserves lesson + notes + aggregates and cannot unblock", async () => {
      const historical = await lesson(2,3,false);
      await db.query("insert into public.lesson_private_notes values($1,'history',now())", [historical]);
      await db.query("insert into private.one_time_tokens(purpose,token_hash,user_id,expires_at) values('password_reset',repeat('a',64),$1,now()+interval '1 hour')", [id(3)]);
      await db.query("select public.session_write('delete3','[{\"name\":\"auth\",\"value\":\"cookie\"}]')");
      await db.query("select public.bind_session('delete3',$1)", [id(3)]);
      await remove(3); await remove(3);
      const p = await profile(3);
      assert.equal(p.account_status,"deleted"); assert.equal(p.full_name,"Удалённый пользователь");
      assert.equal(p.telegram_username,null); assert.equal(p.telegram_user_id,null); assert.equal(p.telegram_chat_id,null);
      for (const table of ["auth_aliases","one_time_tokens","sessions"]) assert.equal((await db.query(`select * from private.${table} where user_id=$1`,[id(3)])).rows.length,0);
      assert.deepEqual((await db.query<{raw_user_meta_data:unknown}>("select raw_user_meta_data from auth.users where id=$1",[id(3)])).rows[0].raw_user_meta_data,{});
      assert.equal((await db.query<{v:string|null}>("select public.lookup_alias('user_3') v")).rows[0].v,null);
      assert.equal((await db.query("select * from public.lessons where id=$1 and completed_at is not null",[historical])).rows.length,1);
      assert.equal((await db.query("select * from public.lesson_private_notes where lesson_id=$1",[historical])).rows.length,1);
      assert.equal((await as(1, () => db.query("select * from public.admin_directory_profiles() where id=$1",[id(3)]))).rows.length,0);
      assert.equal((await as(2, () => db.query<{student_name:string}>("select * from public.schedule_lesson_names($1)",[[historical]]))).rows[0].student_name,"Удалённый пользователь");
      await assert.rejects(block(3,false), { code:"42501" }); await assert.rejects(role(3,"tutor"), { code:"42501" });
      assert.equal((await db.query<{v:string|null}>("select public.claim_reset(repeat('a',64)) v")).rows[0].v,null);
    });
    await t.test("subject removal remains valid for historical participants whose roles changed", async () => {
      const before=(await db.query("select id from public.lessons")).rows.length;
      await as(1,()=>db.query("select public.delete_subject_hard($1)",[subject]));
      assert.equal((await db.query("select id from public.lessons")).rows.length,before);
    });
  } finally { await db.close(); }
});
