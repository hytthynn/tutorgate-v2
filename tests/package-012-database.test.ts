import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { currentWeek, addDays, localToUtc } from "../src/features/schedule/time";
import type { ScheduleResult } from "../src/features/schedule/types";
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
test("012 delegated calendar and teacher chat permissions on full migration chain",async t=>{
 const db=new PGlite({extensions:{btree_gist}});
 try {
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 const dir=new URL("../supabase/migrations/",import.meta.url);
 for(const f of (await readdir(dir)).filter(f=>f.endsWith(".sql")).sort())await db.exec(await readFile(new URL(f,dir),"utf8"));
 await db.exec("alter table auth.users disable trigger user");
 for(const [n,role] of [[1,"admin"],[2,"tutor"],[3,"tutor"],[4,"student"],[5,"student"],[6,"admin"]] as const){
 await db.query("insert into auth.users(id) values($1)",[id(n)]);
 await db.query("insert into profiles(id,role,full_name,telegram_username,telegram_user_id,telegram_chat_id) values($1,$2,$3,$3,$3,$3)",[id(n),role,`Person ${n}`]); }
 async function as<T>(n:number,fn:()=>Promise<T>){await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(n)]);await db.exec("set role authenticated");try{return await fn();}finally{await db.exec("reset role");}}
 const subs=(await db.query<{id:string}>("select id from subjects order by id limit 3")).rows.map(r=>r.id);
 await as(1,async()=>{for(const n of [1,2,3,6])await db.query("select public.set_tutor_subjects($1,$2)",[id(n),subs]);
 for(const [s,teacher,sub] of [[4,2,subs[0]],[4,1,subs[1]],[5,6,subs[0]],[5,3,subs[2]]] as const)await db.query("insert into student_tutor_assignments(student_id,tutor_id,subject_id,assigned_by) values($1,$2,$3,$4)",[id(s),id(teacher),sub,id(1)]);});
 const command=(actor:number,owner:number,c:unknown)=>as(actor,async()=>(await db.query<{v:ScheduleResult}>("select public.schedule_command($1::uuid,$2::jsonb) v",[id(owner),JSON.stringify(c)])).rows[0].v);
 const context=(actor:number,owner:number)=>as(actor,()=>db.query("select public.schedule_owner_context($1)",[id(owner)]));
 const note=(actor:number,owner:number,lesson:string)=>as(actor,async()=>(await db.query<{v:string}>("select public.schedule_lesson_note($1,$2) v",[id(owner),lesson])).rows[0].v);
 const week=currentWeek(0),at=(d:number,h:string)=>localToUtc(addDays(week,d),h,0);
 const create={kind:"create",studentId:id(4),subjectId:subs[0],subjectChanged:true,startsAt:at(0,"10:00"),durationMinutes:60,note:"TARGET NOTE"};
 await t.test("actor/target validation, active teacher only, self-admin and admin-admin",async()=>{
 for(const [a,o] of [[2,3],[4,2],[1,4],[1,99]])await assert.rejects(context(a,o),{code:"42501"});
 await assert.rejects(as(1,()=>db.query("select public.schedule_owner_context('invalid')")),{code:"22P02"});
 await context(1,2);await context(1,6);
 const own=await command(1,1,{kind:"offset",offset:1});assert.equal(own.offset,1);
 await command(1,1,{kind:"offset",offset:0});
 const another=await command(1,6,{...create,studentId:id(5),startsAt:at(0,"16:00")});assert.equal(another.lesson?.tutorId,id(6));
 });
 let created=await command(1,2,create),lesson=created.lesson!;
 await t.test("create/edit target assignments, immutable owner, notes and canonical owner",async()=>{
 assert.equal(lesson.tutorId,id(2));assert.equal(created.before?.payload.owner,id(2));
 assert.equal(await note(1,2,lesson.id),"TARGET NOTE");assert.equal(await note(2,2,lesson.id),"TARGET NOTE");
 for(const a of [3,4])await assert.rejects(note(a,2,lesson.id),{code:"42501"});
 await assert.rejects(note(1,3,lesson.id),{code:"42501"});
 await assert.rejects(command(1,2,{...create,studentId:id(5)}),{code:"23514"});
 await assert.rejects(command(1,2,{...create,subjectId:subs[1]}),{code:"23514"});
 created=await command(1,2,{...create,kind:"edit",id:lesson.id,startsAt:at(0,"11:00"),note:"EDITED"});
 lesson=created.lesson!;assert.equal(lesson.tutorId,id(2));assert.equal(await note(1,2,lesson.id),"EDITED");
 await assert.rejects(command(1,3,{...create,kind:"edit",id:lesson.id}),{code:"42501"});
 await assert.rejects(as(1,()=>db.query("update lessons set tutor_id=$1 where id=$2",[id(1),lesson.id])),{code:"42501"});
 });
 await t.test("move/paste/transfer/color/completed/delete and signed undo redo stay in target",async()=>{
 await command(1,2,{kind:"move",ids:[lesson.id],startsAt:at(1,"10:00")});
 await command(1,2,{kind:"color",ids:[lesson.id],color:"gray"});
 const completed=await command(1,2,{kind:"completed",ids:[lesson.id],completed:true});assert.equal(completed.lessons?.[0].completed,true);
 const pasted=await command(1,2,{kind:"paste",ids:[lesson.id],startsAt:at(2,"10:00")});assert.equal(pasted.lessons?.length,2);
 const moved=await command(1,2,{kind:"transfer",ids:[lesson.id],startsAt:at(7,"10:00")});assert.equal(moved.lessons?.filter(l=>l.isTransferTarget).length,1);
 assert.ok(moved.lessons?.every(l=>l.tutorId===id(2)));
 await assert.rejects(command(1,3,{kind:"restore",expected:moved.after,target:moved.before}),{code:"42501"});
 const undo=await command(1,2,{kind:"restore",expected:moved.after,target:moved.before});assert.equal(undo.lessons?.length,2);
 const redo=await command(1,2,{kind:"restore",expected:undo.after,target:moved.after});assert.equal(redo.lessons?.length,3);
 const deleted=await command(1,2,{kind:"delete",ids:redo.lessons!.map(l=>l.id)});assert.equal(deleted.lessons?.length,0);
 });
 await t.test("availability and rollover context, delegated offset including signed restore forbidden",async()=>{
 const rules=await command(1,2,{kind:"availability",studentIds:[id(4)],availableFrom:addDays(week,1)});assert.equal(rules.rules?.[0].studentId,id(4));
 const data=(await context(1,2)).rows[0] as {schedule_owner_context:{rules:unknown[]}};assert.equal(data.schedule_owner_context.rules.length,1);
 assert.equal((await db.query("select * from schedule_week_rollovers where tutor_id=$1",[id(2)])).rows.length,1);
 await assert.rejects(command(1,2,{kind:"offset",offset:2}),{code:"42501"});
 const changed=await command(2,2,{kind:"offset",offset:2});
 await assert.rejects(command(1,2,{kind:"restore",expected:changed.after,target:changed.before}),{code:"42501"});
 await command(2,2,{kind:"restore",expected:changed.after,target:changed.before});
 await db.query("update profiles set account_status='blocked' where id=$1",[id(2)]);
 await assert.rejects(context(1,2),{code:"42501"});await assert.rejects(command(1,2,create),{code:"42501"});
 await db.query("update profiles set account_status='active' where id=$1",[id(2)]);
 });
 await t.test("admin chats are personal; bot picker and notification carry teacher role",async()=>{
 const sent=await as(1,async()=>(await db.query<{v:{id:string}}>("select chat_send($1,'Admin message') v",[id(4)])).rows[0].v);
 const snapshot=await as(1,async()=>(await db.query<{v:{conversations:{studentId:string}[]}}>("select chat_snapshot(null) v")).rows[0].v);
 assert.deepEqual(snapshot.conversations.map(c=>c.studentId),[id(4)]);
 await assert.rejects(as(6,()=>db.query("select chat_send($1,'Forbidden')",[id(4)])),{code:"42501"});
 const other=await as(6,()=>db.query("select * from chat_messages where id=$1",[sent.id]));assert.equal(other.rows.length,0);
 const picker=(await db.query<{v:{id:string}[]}>("select chat_bot_tutors($1) v",[id(4)])).rows[0].v;assert.ok(picker.some(p=>p.id===id(1)));
 await db.query("select chat_bot_set_recipient($1,$2)",[id(4),id(1)]);
 await db.query("select chat_bot_clear_unavailable_recipient($1)",[id(4)]);
 assert.equal((await db.query<{tutor_id:string}>("select tutor_id from private.telegram_chat_state where student_id=$1",[id(4)])).rows[0].tutor_id,id(1));
 await assert.rejects(as(2,()=>db.query("select chat_bot_clear_unavailable_recipient($1)",[id(4)])),{code:"42501"});
 const received=(await db.query<{v:{messageId:string}}>("select chat_bot_receive('Person 4','Person 4',99001,'Student reply',null) v")).rows[0].v;
 const target=(await db.query<{v:{chatId:string;role:string}}>("select chat_notification_target($1) v",[received.messageId])).rows[0].v;assert.deepEqual(target,{chatId:"Person 1",role:"admin"});
 await as(1,()=>db.query("delete from student_tutor_assignments where student_id=$1 and tutor_id=$2",[id(4),id(1)]));
 await db.query("select chat_bot_clear_unavailable_recipient($1)",[id(4)]);
 assert.equal((await db.query("select * from private.telegram_chat_state where student_id=$1",[id(4)])).rows.length,0);
 });
 } finally {await db.close();}
});
