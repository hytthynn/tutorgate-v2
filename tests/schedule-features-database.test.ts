import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { addDays, currentWeek, localToUtc } from "../src/features/schedule/time";
import type { ScheduleResult } from "../src/features/schedule/types";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;

test("008 transactions, conflict classes, signed history and availability", async t => {
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

    const command=(n:number,input:unknown)=>as(n,async()=> (await db.query<{v:ScheduleResult}>("select public.schedule_command($1) v",[JSON.stringify(input)])).rows[0].v);
    const first=(await save(2,4,at(0,"10:00"))).lesson!;
    const second=(await save(2,5,at(0,"12:00"))).lesson!;
    await t.test("normal/coral matrix enforced independently for tutor and student",async()=>{
      for(const [tutor,student,sub] of [[2,5,subject],[3,4,other]] as const){
        const insert=(color:string)=>db.query<{id:string}>("insert into public.lessons(tutor_id,student_id,subject_id,starts_at,duration_minutes,color) values($1,$2,$3,$4,60,$5) returning id",[id(tutor),id(student),sub,at(0,"10:00"),color]);
        await assert.rejects(insert("default"),{code:"23P01"});
        const coral=(await insert("coral")).rows[0].id;
        await assert.rejects(insert("coral"),{code:"23P01"});
        await db.query("update public.lessons set inactive_reason='transferred' where id=$1",[coral]);
        const active=(await insert("coral")).rows[0].id;
        await db.query("update public.lessons set inactive_reason='transferred' where id=$1",[active]);
        await db.query("delete from public.lessons where id=any($1)",[[coral,active]]);
      }
    });
    await t.test("transfer group is atomic, copies notes, rejects repeated and too-far transfers; real undo/redo",async()=>{
      const moved=await command(2,{kind:"transfer",ids:[first.id,second.id],startsAt:at(7,"11:00")});
      const targets=moved.lessons!.filter(l=>l.isTransferTarget).sort((a,b)=>a.startsAt.localeCompare(b.startsAt));
      assert.equal(targets.length,2);assert.ok(moved.lessons!.filter(l=>[first.id,second.id].includes(l.id)).every(l=>l.inactiveReason==="transferred"));
      assert.equal(Date.parse(targets[1].startsAt)-Date.parse(targets[0].startsAt),120*60000);
      for(const target of targets){assert.equal(target.completed,false);assert.equal((await db.query<{note:string}>("select note from public.lesson_private_notes where lesson_id=$1",[target.id])).rows[0].note,"PRIVATE_NOTE");}
      await assert.rejects(command(2,{kind:"transfer",ids:[targets[0].id],startsAt:at(7,"15:00")}),{code:"PT006"});
      const undone=await command(2,{kind:"restore",expected:moved.after,target:moved.before});
      assert.equal(undone.lessons!.length,2);assert.ok(undone.lessons!.every(l=>!l.inactiveReason));
      const redone=await command(2,{kind:"restore",expected:undone.after,target:moved.after});
      assert.equal(redone.lessons!.length,4);
      await command(2,{kind:"restore",expected:redone.after,target:moved.before});
      await assert.rejects(command(2,{kind:"transfer",ids:[first.id],startsAt:at(14,"11:00")}),{code:"PT007"});
      await assert.rejects(command(1,{kind:"transfer",ids:[first.id],startsAt:at(0,"15:00")}),{code:"42501"});
    });
    await t.test("availability applies only to tutor/student and cancellation conflicts roll back",async()=>{
      const hidden=(await save(3,4,at(1,"15:00"),60,other)).lesson!;
      const rule=await command(2,{kind:"availability",studentIds:[id(4),id(4)],availableFrom:addDays(week,1)});
      assert.equal(rule.lessons!.find(l=>l.id===first.id)!.inactiveReason,"available_from");
      assert.equal((await db.query<{inactive_reason:string|null}>("select inactive_reason from public.lessons where id=$1",[hidden.id])).rows[0].inactive_reason,null);
      const blocker=(await save(2,5,at(0,"10:00"))).lesson!;
      await assert.rejects(command(2,{kind:"availability",studentIds:[id(4)],availableFrom:null}),{code:"23P01"});
      assert.equal((await db.query("select * from public.tutor_student_availability where tutor_id=$1",[id(2)])).rows.length,1);
      await command(2,{kind:"delete",ids:[blocker.id]});
      const cancelled=await command(2,{kind:"availability",studentIds:[id(4)],availableFrom:null});
      assert.equal(cancelled.lessons!.find(l=>l.id===first.id)!.inactiveReason,null);
    });
    await t.test("signed delete restores exact IDs and notes, rejects forgery/other owner/stale undo",async()=>{
      const removed=await command(2,{kind:"delete",ids:[first.id,second.id]});
      assert.equal(removed.lessons!.length,0);
      const forged=structuredClone(removed.before!);forged.payload.owner=id(1);
      await assert.rejects(command(2,{kind:"restore",expected:removed.after,target:forged}),{code:"42501"});
      await assert.rejects(command(1,{kind:"restore",expected:removed.after,target:removed.before}),{code:"42501"});
      const restored=await command(2,{kind:"restore",expected:removed.after,target:removed.before});
      assert.deepEqual(restored.lessons!.map(l=>l.id).sort(),[first.id,second.id].sort());
      await assert.rejects(command(2,{kind:"restore",expected:removed.after,target:removed.before}),{code:"PT009"});
      assert.equal((await db.query<{note:string}>("select note from public.lesson_private_notes where lesson_id=$1",[first.id])).rows[0].note,"PRIVATE_NOTE");
    });
    await t.test("paste clears transfer/completion; group move keeps geometry; color conflict is atomic",async()=>{
      const pasted=await command(2,{kind:"paste",ids:[first.id,second.id],startsAt:at(3,"10:00")});
      const copies=pasted.lessons!.filter(l=>pasted.createdIds!.includes(l.id));
      assert.equal(copies.length,2);assert.ok(copies.every(l=>!l.isTransferTarget&&!l.completed));
      const moved=await command(2,{kind:"move",ids:copies.map(l=>l.id),startsAt:at(4,"11:00")});
      const changed=moved.lessons!.filter(l=>copies.some(c=>c.id===l.id)).sort((a,b)=>a.startsAt.localeCompare(b.startsAt));
      assert.equal(Date.parse(changed[1].startsAt)-Date.parse(changed[0].startsAt),120*60000);
      const coral=await command(2,{kind:"color",ids:[first.id],color:"coral"});
      const normal=(await save(2,5,at(0,"10:00"))).lesson!;
      assert.equal(Date.parse(normal.startsAt),Date.parse(first.startsAt));
      await assert.rejects(command(2,{kind:"color",ids:[first.id,second.id],color:"default"}),{code:"23P01"});
      assert.equal((await db.query<{color:string}>("select color from public.lessons where id=$1",[first.id])).rows[0].color,"coral");
      assert.ok(coral.before);
    });
    await t.test("rollover skips transferred source, resets target markers and respects availability",async()=>{
      const source=(await save(1,5,at(0,"16:00"),45,other,"RECURRING_NOTE")).lesson!;
      const transfer=await command(1,{kind:"transfer",ids:[source.id],startsAt:at(7,"16:00")});
      const target=transfer.lessons!.find(l=>l.isTransferTarget)!;
      await db.query("select private.rollover_tutor($1,$2)",[id(1),at(7,"12:00")]);
      assert.equal((await db.query("select id from public.lessons where tutor_id=$1",[id(1)])).rows.length,2);
      await db.query("select private.rollover_tutor($1,$2)",[id(1),at(14,"12:00")]);
      const copies=(await db.query<{id:string;is_transfer_target:boolean;transfer_source_id:string|null;completed_at:string|null}>("select * from public.lessons where tutor_id=$1 and starts_at=$2",[id(1),at(14,"16:00")])).rows;
      assert.equal(copies.length,1);assert.equal(copies[0].is_transfer_target,false);assert.equal(copies[0].transfer_source_id,null);assert.equal(copies[0].completed_at,null);
      assert.equal((await db.query<{note:string}>("select note from public.lesson_private_notes where lesson_id=$1",[copies[0].id])).rows[0].note,"RECURRING_NOTE");
      const rule=await command(1,{kind:"availability",studentIds:[id(5)],availableFrom:addDays(week,28)});
      assert.equal(rule.lessons!.find(l=>l.id===source.id)!.inactiveReason,"transferred");assert.equal(rule.lessons!.find(l=>l.id===target.id)!.inactiveReason,"available_from");
      await db.query("select private.rollover_tutor($1,$2)",[id(1),at(21,"12:00")]);
      assert.equal((await db.query<{inactive_reason:string}>("select inactive_reason from public.lessons where tutor_id=$1 and starts_at=$2",[id(1),at(21,"16:00")])).rows[0].inactive_reason,"available_from");
      const cancel=await command(1,{kind:"availability",studentIds:[id(5)],availableFrom:null});
      assert.equal(cancel.lessons!.find(l=>l.id===source.id)!.inactiveReason,"transferred");
    });
    await t.test("group transfer failure leaves every source untouched; offset undo restores its prior value",async()=>{
      const a=(await save(2,4,at(5,"16:00"))).lesson!;
      const b=(await save(2,5,at(5,"18:00"))).lesson!;
      await db.query("delete from public.student_tutor_assignments where tutor_id=$1 and student_id=$2 and subject_id=$3",[id(2),id(5),subject]);
      await assert.rejects(command(2,{kind:"transfer",ids:[a.id,b.id],startsAt:at(6,"14:00")}),{code:"23514"});
      assert.equal((await db.query("select id from public.lessons where transfer_source_id=any($1)",[[a.id,b.id]])).rows.length,0);
      assert.ok((await db.query<{inactive_reason:string|null}>("select inactive_reason from public.lessons where id=any($1)",[[a.id,b.id]])).rows.every(l=>l.inactive_reason===null));
      const offset=await command(2,{kind:"offset",offset:1});
      assert.equal(offset.offset,1);
      const undone=await command(2,{kind:"restore",expected:offset.after,target:offset.before});assert.equal(undone.offset,0);
    });
    await t.test("undo is scoped, does not overwrite unrelated changes or restore another tutor's notes",async()=>{
      const edited=await command(2,{kind:"completed",ids:[first.id],completed:true});
      await db.query("update public.lessons set color='blue' where id=$1",[second.id]);
      const undone=await command(2,{kind:"restore",expected:edited.after,target:edited.before});
      assert.equal(undone.lessons!.find(l=>l.id===second.id)!.color,"blue");
      assert.equal((edited.before!.payload.lessons as unknown[]).length,1);
      await as(4,async()=>{
        assert.equal((await db.query("select * from public.tutor_student_availability")).rows.length,0);
        await assert.rejects(db.query("select private.scope_schedule('{}','{}')"),{code:"42501"});
        await assert.rejects(db.query("select public.schedule_command($1)",[JSON.stringify({kind:"delete",ids:[first.id]})]),{code:"42501"});
      });
    });
  } finally {await db.close();}
});

