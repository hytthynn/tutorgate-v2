import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import test from "node:test";import assert from "node:assert/strict";import { readFile,readdir } from "node:fs/promises";
import { currentWeek,localToUtc } from "../src/features/schedule/time";
import type { ScheduleResult } from "../src/features/schedule/types";
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
test("018 migrations, billing authorization, snapshots, private backgrounds and rich media",async t=>{
 const db=new PGlite({extensions:{btree_gist}});try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 const dir=new URL("../supabase/migrations/",import.meta.url);for(const f of (await readdir(dir)).filter(f=>f.endsWith(".sql")&&f<"202609080018").sort())await db.exec(await readFile(new URL(f,dir),"utf8"));await db.exec("alter table auth.users disable trigger user");
 for(const [n,role] of [[1,"admin"],[2,"tutor"],[3,"tutor"],[4,"student"]] as const){await db.query("insert into auth.users(id) values($1)",[id(n)]);await db.query("insert into profiles(id,role,full_name,telegram_username,telegram_user_id,telegram_chat_id) values($1,$2,$3,$3,$3,$3)",[id(n),role,`Person ${n}`]);}
 async function as<T>(n:number,fn:()=>Promise<T>){await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(n)]);await db.exec("set role authenticated");try{return await fn();}finally{await db.exec("reset role");}}
 const subject=(await db.query<{id:string}>("select id from subjects limit 1")).rows[0].id;
 await as(1,async()=>{await db.query("select set_tutor_subjects($1,$2)",[id(2),[subject]]);await db.query("insert into student_tutor_assignments(student_id,tutor_id,subject_id,assigned_by) values($1,$2,$3,$4)",[id(4),id(2),subject,id(1)]);});
 // Seed a completion under 017, then prove the one-time backfill before new rates exist.
 await db.exec("update app_settings set hourly_rate=1250");
 await db.query("insert into lessons(id,tutor_id,student_id,subject_id,starts_at,duration_minutes,completed_at) values($1,$2,$3,$4,$5,60,now())",[id(90),id(2),id(4),subject,localToUtc(currentWeek(0),"08:00",0)]);
 await db.exec("create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[])");
 await db.exec(await readFile(new URL("202609080018_chat_schedule_rates_background.sql",dir),"utf8"));
 assert.equal((await db.query<{r:number}>("select hourly_rate_snapshot::float8 r from lessons where id=$1",[id(90)])).rows[0].r,1250);
 const bucket=(await db.query<{public:boolean;file_size_limit:number}>("select public,file_size_limit::integer from storage.buckets where id='schedule-backgrounds'")).rows[0];assert.equal(bucket.public,false);assert.equal(bucket.file_size_limit,7340032);
 const cmd=(command:unknown)=>as(2,async()=>(await db.query<{v:ScheduleResult}>("select schedule_command($1,$2) v",[id(2),JSON.stringify(command)])).rows[0].v);
 const created=await cmd({kind:"create",studentId:id(4),subjectId:subject,startsAt:localToUtc(currentWeek(0),"10:00",0),durationMinutes:60,note:""});const lesson=created.lesson!.id;
 const rate=async()=>(await db.query<{r:number|null}>("select hourly_rate_snapshot::float8 r from lessons where id=$1",[lesson])).rows[0].r;
 const tutor=(value:number|null)=>as(1,()=>db.query("select admin_set_tutor_rate($1,$2)",[id(2),value]));
 const pair=(value:number|null)=>as(1,()=>db.query("select admin_set_tutor_student_rate($1,$2,$3)",[id(2),lesson,value]));
 await t.test("rates are admin-only and validated before numeric coercion",async()=>{for(const n of [2,4]){await assert.rejects(as(n,()=>db.query("select admin_set_tutor_rate($1,100)",[id(2)])),{code:"42501"});await assert.rejects(as(n,()=>db.query("select admin_set_tutor_student_rate($1,$2,100)",[id(2),lesson])),{code:"42501"});assert.equal((await as(n,()=>db.query("select * from tutor_billing_rates"))).rows.length,0);}await assert.rejects(as(1,()=>db.query("insert into tutor_billing_rates(tutor_id,hourly_rate) values($1,10)",[id(2)])),{code:"42501"});for(const value of [-1,1000000.01,1.001])await assert.rejects(tutor(value),{code:"22023"});await assert.rejects(as(1,()=>db.query("select admin_set_tutor_student_rate($1,$2,10)",[id(3),lesson])),{code:"42501"});});
 await t.test("pair > tutor > global, immutable completion and signed redo",async()=>{await db.exec("update app_settings set hourly_rate=1200");await tutor(1500);await pair(1800.01);const marked=await cmd({kind:"completed",ids:[lesson],completed:true});assert.equal(await rate(),1800.01);await pair(2000);await tutor(3000);await db.exec("update app_settings set hourly_rate=4000");assert.equal(await rate(),1800.01);
 const undone=await cmd({kind:"restore",expected:marked.after,target:marked.before});assert.equal(await rate(),null);await cmd({kind:"restore",expected:undone.after,target:undone.before});assert.equal(await rate(),1800.01);
 await db.query("update lessons set color='gray',hourly_rate_snapshot=999 where id=$1",[lesson]);assert.equal(await rate(),1800.01);
 await cmd({kind:"completed",ids:[lesson],completed:false});await cmd({kind:"completed",ids:[lesson],completed:true});assert.equal(await rate(),2000);
 await pair(null);await cmd({kind:"completed",ids:[lesson],completed:false});await cmd({kind:"completed",ids:[lesson],completed:true});assert.equal(await rate(),3000);
 await tutor(null);await cmd({kind:"completed",ids:[lesson],completed:false});await cmd({kind:"completed",ids:[lesson],completed:true});assert.equal(await rate(),4000);
 });
 await t.test("background self-owner writes, delegated reads, private staged metadata and cleanup",async()=>{
 await assert.rejects(db.query("select schedule_background_prepare($1,$2,$3,100)",[id(1),id(2),id(80)]),{code:"42501"});await assert.rejects(db.query("select schedule_background_prepare($1,$1,$2,100)",[id(4),id(80)]),{code:"42501"});await assert.rejects(as(2,()=>db.query("select schedule_background_prepare($1,$1,$2,100)",[id(2),id(80)])),{code:"42501"});
 await db.query("select schedule_background_prepare($1,$1,$2,100)",[id(2),id(80)]);await db.query("select schedule_background_set($1,$1,$2,'image/gif')",[id(2),id(80)]);
 assert.ok((await as(1,()=>db.query<{v:unknown}>("select schedule_background_read($1) v",[id(2)]))).rows[0].v);await assert.rejects(as(3,()=>db.query("select schedule_background_read($1)",[id(2)])),{code:"42501"});await assert.rejects(as(2,()=>db.query("delete from schedule_backgrounds")),{code:"42501"});
 await db.query("select schedule_background_set($1,$1,null,null)",[id(2)]);assert.equal((await db.query<{v:string[]}>("select schedule_background_gc_paths() v")).rows[0].v.length,0);await db.exec("update private.schedule_background_gc set not_before=now()-interval '1 second'");assert.equal((await db.query<{v:string[]}>("select schedule_background_gc_paths() v")).rows[0].v.length,1);
 });
 await t.test("v1/v2 body contract, unsafe nodes, sticker-only receive and duplicate update",async()=>{
 const content={version:2,blocks:[{type:"paragraph",align:"center",content:[{text:"$x$",marks:[]}]},{type:"code_block",language:"js",text:"<x>\n"}]};
 const msg=await as(2,()=>db.query<{v:{body:string}}>("select chat_send_rich($1,$2) v",[id(4),JSON.stringify(content)]));assert.equal(msg.rows[0].v.body,"$x$\n<x>\n");
 await as(2,()=>db.query("select chat_send_rich($1,$2)",[id(4),JSON.stringify([{text:"legacy",marks:[]}]) ]));await assert.rejects(as(2,()=>db.query("select chat_send_rich($1,$2)",[id(4),JSON.stringify({version:2,blocks:[{type:"html",text:"bad"}]})])),{code:"22023"});
 for(const [i,kind] of ["animation","sticker_static","sticker_animated","sticker_video"].entries()){
 await db.query("select chat_bot_set_recipient($1,$2)",[id(4),id(2)]);const path=(await db.query<{v:string}>("select chat_prepare_upload($1,$2,$3,'sticker',100) v",[id(2),id(4),id(100+i)])).rows[0].v;
 const args=[8000+i,JSON.stringify({version:2,blocks:[]}),JSON.stringify({id:id(100+i),path,name:"sticker",size:100,type:"image/webp",kind})];
 const received=await db.query<{v:{status:string}}>("select chat_bot_receive_rich('Person 4','Person 4',$1,'',null,$2,$3) v",args);assert.equal(received.rows[0].v.status,"sent");assert.equal((await db.query<{v:{status:string}}>("select chat_bot_receive_rich('Person 4','Person 4',$1,'',null,$2,$3) v",args)).rows[0].v.status,"duplicate");
 }
 await assert.rejects(db.exec("update chat_attachments set kind='unsafe'"),{code:"23514"});
 });
 }finally{await db.close();}
});
