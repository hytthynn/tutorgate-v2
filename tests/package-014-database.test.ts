import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { currentWeek, addDays, localToUtc } from "../src/features/schedule/time";
import type { ScheduleResult } from "../src/features/schedule/types";
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
test("014 schedule, media, deletion and read contracts",async t=>{
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
 const cmd=(value:unknown)=>as(2,async()=>(await db.query<{v:ScheduleResult}>("select schedule_command($1,$2) v",[id(2),JSON.stringify(value)])).rows[0].v);
 const week=currentWeek(0), start=localToUtc(week,"10:00",0);
 const input={kind:"create",studentId:id(4),subjectId:subs[0],startsAt:start,durationMinutes:60,note:"private"};
 const created=await cmd(input), lesson=created.lesson!;
 await t.test("coral rejects temporal changes, permits notes and recolor, old move history invalidated by guard",async()=>{
   await cmd({kind:"color",ids:[lesson.id],color:"coral"});
   for(const kind of ["move","transfer"]) await assert.rejects(cmd({kind,ids:[lesson.id],startsAt:localToUtc(week,"12:00",0)}),{code:"PT014"});
   await assert.rejects(cmd({...input,kind:"edit",id:lesson.id,durationMinutes:61}),{code:"PT014"});
   const saved=await cmd({...input,kind:"edit",id:lesson.id,note:"changed"});
   assert.equal(Date.parse(saved.lesson!.startsAt),Date.parse(start));
   await cmd({kind:"color",ids:[lesson.id],color:"default"});
   await cmd({kind:"move",ids:[lesson.id],startsAt:localToUtc(week,"12:00",0)});
 });
 await t.test("week snapshot bounds history, includes names, blocks forged owner and student notes",async()=>{
   const snapshot=await as(2,async()=>(await db.query<{v:{lessons:ScheduleResult["lessons"]}}>("select schedule_week_snapshot($1,$2) v",[id(2),week])).rows[0].v);
   assert.equal(snapshot.lessons?.length,1); assert.equal(snapshot.lessons?.[0].studentName,"Person 4");
   assert.doesNotMatch(JSON.stringify(snapshot),/private|changed/);
   await assert.rejects(as(3,()=>db.query("select schedule_week_snapshot($1,$2)",[id(2),week])),{code:"42501"});
   const empty=await as(2,async()=>(await db.query<{v:{lessons:unknown[]}}>("select schedule_week_snapshot($1,$2) v",[id(2),addDays(week,-7)])).rows[0].v);
   assert.equal(empty.lessons.length,0);
 });
 let messageId="";
 await t.test("rich text, attachment-only, true byte boundary and participant access",async()=>{
   await as(2,()=>db.query("select chat_send_rich($1,$2)",[id(4),JSON.stringify([{text:"<safe>",marks:[{type:"bold"}]}])]));
   await assert.rejects(as(2,()=>db.query("select chat_send_rich($1,$2)",[id(4),JSON.stringify([{text:"bad",marks:[{type:"link",href:"javascript:alert(1)"}]}])])),{code:"22023"});
   await assert.rejects(db.query("select chat_prepare_upload($1,$2,$3,'x',10485761)",[id(2),id(4),id(100)]),{code:"23514"});
   await db.query("select chat_prepare_upload($1,$2,$3,'file.txt',10485760)",[id(2),id(4),id(100)]);
   const files=[{id:id(100),size:10485760,type:"application/octet-stream"}];
   const sent=(await db.query<{v:{id:string}}>("select chat_finalize_uploads($1,$2,$3,$4) v",[id(2),id(4),JSON.stringify([{text:"",marks:[]}]),JSON.stringify(files)])).rows[0].v; messageId=sent.id;
   const foreign=await as(3,()=>db.query("select id from chat_attachments")); assert.equal(foreign.rows.length,0);
   await assert.rejects(as(2,()=>db.query("select storage_path from chat_attachments")),{code:"42501"});
   await assert.rejects(as(2,()=>db.query("select chat_finalize_uploads($1,$2,$3,$4)",[id(2),id(4),'[]','[]'])),{code:"42501"});
   await assert.rejects(db.query("delete from chat_attachments where message_id=$1",[messageId]),{code:"23514"});
 });
 await t.test("delta is empty when unchanged and includes delivery transitions and mappings",async()=>{
   const initial=await as(2,async()=>(await db.query<{v:{cursor:string;directoryVersion:string}}>("select chat_snapshot($1) v",[id(4)])).rows[0].v);
   const delta=()=>as(2,async()=>(await db.query<{v:{messages:{id:string;delivery_status:string}[];conversations:unknown}}>("select chat_updates($1,$2,$3) v",[id(4),initial.cursor,initial.directoryVersion])).rows[0].v);
   assert.deepEqual(await delta(),{...(await delta()),messages:[],conversations:null});
   await db.query("select chat_finish_delivery_parts($1,false,'Person 4',array[11,12]::bigint[])",[messageId]);
   const changed=await delta(); assert.equal(changed.messages.length,1); assert.equal(changed.messages[0].delivery_status,"failed");
   assert.equal((await db.query("select * from private.telegram_message_links where message_id=$1",[messageId])).rows.length,2);
 });
 await t.test("bot admin identity enforced and directory pagination preserves identifier search",async()=>{
   await assert.rejects(db.query("select bot_application_command('Person 2','Person 2','queue')"),{code:"42501"});
   await db.query("select bot_application_command('Person 1','Person 1','queue')");
   const page=await as(1,async()=>(await db.query<{v:{total:number;people:unknown[]}}>("select admin_directory_page('students','Person 4',null,0) v")).rows[0].v);
   assert.equal(page.total,1);assert.equal(page.people.length,1);
   await assert.rejects(as(2,()=>db.query("select admin_directory_page('students')")),{code:"42501"});
 });
 await t.test("015 aggregate budget, trusted reply source and assignment purge",async()=>{
   for(const n of [101,102])await db.query("select chat_prepare_upload($1,$2,$3,'large.bin',6291456)",[id(2),id(4),id(n)]);
   await assert.rejects(db.query("select chat_finalize_uploads($1,$2,$3,$4)",[id(2),id(4),'[{"text":"","marks":[]}]',JSON.stringify([101,102].map(n=>({id:id(n),size:6291456,type:"application/octet-stream"})))]),{code:"23514"});
   await db.query("delete from private.chat_uploads where id=any($1)",[[id(101),id(102)]]);
   await assert.rejects(db.query("select chat_bot_begin_reply('Person 4','Person 4',$1,999)",[messageId]),{code:"42501"});
   await db.query("select chat_bot_begin_reply('Person 4','Person 4',$1,11)",[messageId]);
   const reply=(await db.query<{v:{status:string;replyTelegramId:number;originalText:string}}>("select chat_bot_receive_flow('Person 4','Person 4',150001,'answer',null,'[{\"text\":\"answer\",\"marks\":[]}]',null) v")).rows[0].v;
   assert.equal(reply.status,"sent");assert.equal(reply.replyTelegramId,11);assert.match(reply.originalText,/file.txt/);
   assert.equal((await db.query("select * from private.telegram_reply_state")).rows.length,0);
   await assert.rejects(as(2,()=>db.query("select chat_bot_reply_context('Person 4','Person 4')")),{code:"42501"});
   await db.query("select chat_prepare_upload($1,$2,$3,'gone.txt',1)",[id(3),id(5),id(103)]);
   await db.query("select chat_finalize_uploads($1,$2,$3,$4)",[id(3),id(5),'[{"text":"gone","marks":[]}]',JSON.stringify([{id:id(103),size:1,type:"application/octet-stream"}])]);
   await as(1,()=>db.query("delete from student_tutor_assignments where student_id=$1 and tutor_id=$2",[id(5),id(3)]));
   assert.equal((await db.query("select * from chat_conversations where student_id=$1 and tutor_id=$2",[id(5),id(3)])).rows.length,0);
   assert.equal((await db.query("select * from chat_attachments where id=$1",[id(103)])).rows.length,0);
   assert.equal((await db.query("select * from private.chat_storage_gc where revoked")).rows.length,1);
   await as(1,()=>db.query("insert into student_tutor_assignments(student_id,tutor_id,subject_id,assigned_by) values($1,$2,$3,$4)",[id(5),id(3),subs[2],id(1)]));
 });
 await t.test("hard deletion purges all owned data, preserves others, forbids admin, retries after Auth gap",async()=>{
   await assert.rejects(as(2,()=>db.query("select admin_prepare_hard_delete_user($1)",[id(4)])),{code:"42501"});
   await assert.rejects(as(1,()=>db.query("select admin_prepare_hard_delete_user($1)",[id(6)])),{code:"42501"});
   const job=await as(1,async()=>(await db.query<{v:{storage_paths:string[]}}>("select admin_prepare_hard_delete_user($1) v",[id(4)])).rows[0].v);
   assert.equal(job.storage_paths.length,1);
   await assert.rejects(db.query("select admin_purge_hard_delete_user($1,$2)",[id(1),id(4)]));
   await db.query("update private.user_deletion_jobs set ready_after=now() where user_id=$1",[id(4)]);
   await db.query("select admin_purge_hard_delete_user($1,$2)",[id(1),id(4)]);
   for(const table of ["profiles","lessons","chat_conversations"]) {
     const condition=table==="profiles"?"id=$1":"student_id=$1";
     assert.equal((await db.query(`select * from ${table} where ${condition}`,[id(4)])).rows.length,0);
   }
   assert.equal((await db.query("select * from chat_attachments")).rows.length,0);
   assert.equal((await db.query("select * from student_tutor_assignments where student_id=$1",[id(5)])).rows.length,2);
   await assert.rejects(db.query("select admin_finish_hard_delete_user($1,$2)",[id(1),id(4)]));
   await as(1,()=>db.query("select admin_prepare_hard_delete_user($1)",[id(4)]));
   await db.query("select admin_purge_hard_delete_user($1,$2)",[id(1),id(4)]);
   await db.query("delete from auth.users where id=$1",[id(4)]);
   await db.query("select admin_finish_hard_delete_user($1,$2)",[id(1),id(4)]);
   await db.query("select admin_finish_hard_delete_user($1,$2)",[id(1),id(4)]);
 });
 } finally {await db.close();}
});
