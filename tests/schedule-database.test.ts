import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { addDays, currentWeek, localToUtc } from "../src/features/schedule/time";
import type { ScheduleResult } from "../src/features/schedule/types";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;

test("schedule: real migrations, magnet, historical snapshots, rollover and role boundaries", async t => {
  const db = new PGlite({ extensions: { btree_gist } });
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
    for (const name of (await readdir(new URL("../supabase/migrations/",import.meta.url))).filter(n=>n.endsWith(".sql")).sort())
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),"utf8"));
    await db.exec("alter table auth.users disable trigger user");
    for (const [n,role] of [[1,"admin"],[2,"tutor"],[3,"tutor"],[4,"student"],[5,"student"],[6,"student"]] as const) {
      await db.query("insert into auth.users(id) values($1)",[id(n)]);
      await db.query("insert into public.profiles(id,role,full_name,telegram_username,telegram_user_id,telegram_chat_id) values($1,$2,$3,$3,$3,$3)",[id(n),role,`Person ${n}`]);
    }
    async function as<T>(n:number, work:()=>Promise<T>):Promise<T> {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(n)]); await db.exec("set role authenticated");
      try { return await work(); } finally { await db.exec("reset role"); }
    }
    const subjects=(await db.query<{id:string;name:string}>("select id,name from public.subjects order by name")).rows;
    const subject=subjects[0].id, other=subjects[1].id;
    await as(1,async()=>{
      for (const n of [1,2,3]) await db.query("select public.set_tutor_subjects($1,$2)",[id(n),[subject,other]]);
      for (const [student,tutor,sub] of [[4,2,subject],[4,3,other],[5,2,subject],[5,1,other]] as const)
        await db.query("insert into public.student_tutor_assignments(student_id,tutor_id,subject_id,assigned_by) values($1,$2,$3,$4)",[id(student),id(tutor),sub,id(1)]);
    });
    const week=currentWeek(0), at=(day:number,time:string)=>localToUtc(addDays(week,day),time,0);
    async function save(tutor:number,student:number,start:string,duration=60,sub:string|null=subject,note="PRIVATE_NOTE",lesson:string|null=null,changed=true) {
      return as(tutor,async()=> (await db.query<{v:ScheduleResult}>("select public.save_schedule_lesson($1,$2,$3,$4,$5,$6,$7) v",[lesson,id(student),sub,start,duration,note,changed])).rows[0].v);
    }
    const first=(await save(2,4,at(0,"10:00"))).lesson!;
    let second=first;
    await t.test("same tutor overlap resolves after desired start on distance tie",async()=>{
      const result=await save(2,5,at(0,"10:30")); second=result.lesson!;
      assert.equal(result.shifted,true); assert.equal(Date.parse(second.startsAt),Date.parse(at(0,"11:00")));
      assert.equal(Date.parse(first.endsAt),Date.parse(second.startsAt));
    });
    await t.test("student conflict with hidden tutor uses same resolver without data disclosure",async()=>{
      const result=await save(3,4,at(0,"10:30"),60,other);
      assert.equal(Date.parse(result.lesson!.startsAt),Date.parse(at(0,"11:00")));
      assert.ok(!JSON.stringify(result).includes(first.id)); assert.ok(!JSON.stringify(result).includes("PRIVATE_NOTE"));
      await as(3,async()=>{
        assert.equal((await db.query("select * from public.lessons where id=$1",[first.id])).rows.length,0);
        assert.equal((await db.query("select * from public.schedule_lesson_names($1)",[[first.id]])).rows.length,0);
      });
    });
    await t.test("exclusion constraints remain authoritative on direct privileged writes",async()=>{
      await assert.rejects(db.query("insert into public.lessons(tutor_id,student_id,subject_id,starts_at,duration_minutes) values($1,$2,$3,$4,60)",[id(2),id(5),subject,at(0,"10:00")]),{code:"23P01"});
      await assert.rejects(db.query("insert into public.lessons(tutor_id,student_id,subject_id,starts_at,duration_minutes) values($1,$2,$3,$4,60)",[id(3),id(4),other,at(0,"10:00")]),{code:"23P01"});
    });
    await t.test("move RPC resolves overlap and excludes its own source",async()=>{
      const result=await as(2,async()=> (await db.query<{v:ScheduleResult}>("select public.patch_schedule_lesson($1,$2) v",[second.id,at(0,"10:30")])).rows[0].v);
      assert.equal(Date.parse(result.lesson!.startsAt),Date.parse(at(0,"11:00")));
    });
    await t.test("server enforces current-week creation, future edits and dialog week",async()=>{
      await assert.rejects(save(2,4,at(7,"10:00")),{code:"PT001"});
      await assert.rejects(save(2,4,at(-1,"10:00")),{code:"PT001"});
      await assert.rejects(as(2,()=>db.query("select public.patch_schedule_lesson($1,$2)",[first.id,at(7,"10:00")])),{code:"PT002"});
      await assert.rejects(save(2,4,at(-7,"10:00"),60,subject,"",first.id),{code:"PT003"});
      await assert.rejects(save(2,6,at(1,"10:00")));
      await assert.rejects(save(2,4,at(1,"10:00"),60,other));
      for (const duration of [0,601]) await assert.rejects(save(2,4,at(1,"10:00"),duration));
    });
    await t.test("lesson+note are atomic; raw writes and private helpers unavailable to users",async()=>{
      const before=(await db.query("select id from public.lessons")).rows.length;
      await assert.rejects(save(2,4,at(1,"13:00"),60,subject,"x".repeat(4001)));
      assert.equal((await db.query("select id from public.lessons")).rows.length,before);
      await as(2,async()=>{
        await assert.rejects(db.query("update public.lessons set color='green' where id=$1",[first.id]));
        await assert.rejects(db.query("select private.rollover_tutor($1)",[id(3)]));
        await assert.rejects(db.query("select private.resolve_nearest_lesson_start($1,$2,$3,60)",[id(3),id(4),at(0,"10:00")]));
      });
    });
    await t.test("student cannot mutate or read private notes; admin cannot edit another tutor",async()=>{
      await as(4,async()=>{
        assert.equal((await db.query("select * from public.lesson_private_notes")).rows.length,0);
        await assert.rejects(db.query("select public.patch_schedule_lesson($1,null,'blue')",[first.id]));
        await assert.rejects(db.query("select public.delete_schedule_lessons($1)",[[first.id]]));
        await assert.rejects(db.query("select public.ensure_schedule_rollover()"));
      });
      await as(1,async()=>{
        await assert.rejects(db.query("select public.patch_schedule_lesson($1,null,'blue')",[first.id]));
        assert.equal((await db.query("select * from public.lesson_private_notes where lesson_id=$1",[first.id])).rows.length,0);
      });
    });
    await t.test("full local day yields a controlled no-slot error, including cross-midnight blockers",async()=>{
      const fullDay=at(2,"00:00");
      for (const [minute,duration] of [[0,600],[600,600],[1200,240]]) {
        const start=new Date(Date.parse(fullDay)+minute*60000).toISOString(); await save(2,4,start,duration);
      }
      await assert.rejects(save(2,5,at(2,"12:00")),{code:"P0002"});
      const late=await save(2,4,at(3,"23:59"),120);
      assert.equal(Date.parse(late.lesson!.startsAt),Date.parse(at(3,"23:55")));
    });
    await t.test("rollover copies valid prior-week rows once, note/color but not completion",async()=>{
      const source=(await db.query<{id:string}>("insert into public.lessons(tutor_id,student_id,subject_id,starts_at,duration_minutes,color,completed_at) values($1,$2,$3,$4,90,'blue',now()) returning id",[id(1),id(5),other,at(-7,"14:00")])).rows[0].id;
      await db.query("insert into public.lesson_private_notes values($1,'ROLLOVER_SECRET',now())",[source]);
      await db.query("select private.rollover_tutor($1)",[id(1)]);
      const copies=(await db.query<{id:string;completed_at:string|null;color:string;starts_at:string}>("select * from public.lessons where tutor_id=$1 and starts_at=$2",[id(1),at(0,"14:00")])).rows;
      assert.equal(copies.length,1); assert.notEqual(copies[0].id,source); assert.equal(copies[0].completed_at,null); assert.equal(copies[0].color,"blue");
      assert.equal((await db.query<{note:string}>("select note from public.lesson_private_notes where lesson_id=$1",[copies[0].id])).rows[0].note,"ROLLOVER_SECRET");
      await db.query("select private.rollover_tutor($1)",[id(1)]);
      assert.equal((await db.query("select id from public.lessons where tutor_id=$1",[id(1)])).rows.length,2);
      await db.query("update public.lessons set duration_minutes=45 where id=$1",[source]);
      assert.equal((await db.query<{duration_minutes:number}>("select duration_minutes from public.lessons where id=$1",[copies[0].id])).rows[0].duration_minutes,90);
    });
    await t.test("rollover omits removed assignments, logs them and leaves the source",async()=>{
      const source=(await db.query<{id:string}>("insert into public.lessons(tutor_id,student_id,subject_id,starts_at,duration_minutes) values($1,$2,$3,$4,60) returning id",[id(3),id(4),other,at(-6,"16:00")])).rows[0].id;
      await db.query("delete from public.student_tutor_assignments where tutor_id=$1",[id(3)]);
      // Remove only test-created current-week marker to exercise a fresh boundary.
      await db.query("delete from public.schedule_week_rollovers where tutor_id=$1",[id(3)]);
      await db.query("select private.rollover_tutor($1)",[id(3)]);
      assert.equal((await db.query("select id from public.lessons where tutor_id=$1 and starts_at=$2",[id(3),at(1,"16:00")])).rows.length,0);
      assert.equal((await db.query("select id from public.lessons where id=$1",[source])).rows.length,1);
      assert.equal((await db.query<{skipped_count:number}>("select skipped_count from public.schedule_week_rollovers where tutor_id=$1",[id(3)])).rows[0].skipped_count,1);
    });
    await t.test("hard delete removes current relations, preserves lesson snapshot and statistics",async()=>{
      await as(2,async()=>{
        await db.query("select public.patch_schedule_lesson($1,null,null,true)",[first.id]);
        await assert.rejects(db.query("select public.delete_subject_hard($1)",[subject]));
      });
      await as(1,()=>db.query("select public.delete_subject_hard($1)",[subject]));
      for (const table of ["subjects","student_tutor_assignments","tutor_subjects","application_subjects"])
        assert.equal((await db.query(`select * from public.${table} where ${table==="subjects"?"id":"subject_id"}=$1`,[subject])).rows.length,0);
      const row=(await db.query<{subject_id:string|null;subject_name_snapshot:string;completed_at:string|null}>("select * from public.lessons where id=$1",[first.id])).rows[0];
      assert.equal(row.subject_id,null); assert.equal(row.subject_name_snapshot,subjects[0].name); assert.ok(row.completed_at);
      const names=await as(2,()=>db.query<{subject_name:string}>("select * from public.schedule_lesson_names($1)",[[first.id]]));
      assert.equal(names.rows[0].subject_name,subjects[0].name);
      const edited=await save(2,4,at(0,"10:00"),45,null,"history still editable",first.id,false);
      assert.equal(edited.lesson!.subjectName,subjects[0].name); assert.equal(edited.lesson!.durationMinutes,45);
      await assert.rejects(save(2,4,at(4,"10:00"),60,subject));
      await assert.rejects(save(2,4,at(4,"10:00"),60,null));
    });
    await t.test("delete returns only actual owned IDs and cascades notes",async()=>{
      const response=await as(2,async()=> (await db.query<{v:{ids:string[]}}>("select public.delete_schedule_lessons($1) v",[[first.id,first.id,id(999)]])).rows[0].v);
      assert.deepEqual(response.ids,[first.id]);
      assert.equal((await db.query("select * from public.lesson_private_notes where lesson_id=$1",[first.id])).rows.length,0);
    });
  } finally { await db.close(); }
});
