import {PGlite} from "@electric-sql/pglite";
import {btree_gist} from "@electric-sql/pglite/contrib/btree_gist";
import {readFile,readdir} from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
test("019 admin chat read access checks actor and owner without changing identity or read markers",async()=>{
 const db=new PGlite({extensions:{btree_gist}});try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 const dir=new URL("../supabase/migrations/",import.meta.url);for(const file of(await readdir(dir)).filter(f=>f.endsWith(".sql")).sort())await db.exec(await readFile(new URL(file,dir),"utf8"));
 await db.exec("alter table auth.users disable trigger user");
 for(const [n,role] of [[1,"admin"],[2,"tutor"],[3,"tutor"],[4,"student"]]){await db.query("insert into auth.users(id) values($1)",[id(Number(n))]);await db.query("insert into profiles(id,role,full_name,telegram_username,telegram_user_id,telegram_chat_id) values($1,$2,$3,$3,$3,$3)",[id(Number(n)),role,`User ${n}`]);}
 async function as<T>(n:number,fn:()=>Promise<T>){await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(n)]);await db.exec("set role authenticated");try{return await fn();}finally{await db.exec("reset role");}}
 const subject=(await db.query<{id:string}>("select id from subjects limit 1")).rows[0].id;
 await as(1,async()=>{await db.query("select set_tutor_subjects($1,$2)",[id(2),[subject]]);await db.query("insert into student_tutor_assignments(student_id,tutor_id,subject_id,assigned_by) values($1,$2,$3,$4)",[id(4),id(2),subject,id(1)]);});
 const msg=(await as(2,()=>db.query<{v:{id:string}}>("select chat_send_rich($1,$2) v",[id(4),JSON.stringify([{text:"Teacher private chat",marks:[]}])]))).rows[0].v;
 await db.query("insert into chat_attachments(id,message_id,storage_path,original_name,mime_type,size_bytes,kind) values($1,$2,'private/video','video.mp4','video/mp4',40,'file')",[id(90),msg.id]);
 const read=(owner=id(2))=>db.query<{v:{messages:{id:string;created_at:string}[];ownerName:string}}>("select admin_chat_snapshot($1,$2) v",[owner,id(4)]);
 const markers=await db.query("select tutor_last_read_at from chat_conversations");
 await as(1,async()=>{const result=(await read()).rows[0].v;assert.equal(result.messages[0].id,msg.id);assert.equal(result.ownerName,"User 2");assert.equal((await db.query<{v:string}>("select auth.uid() v")).rows[0].v,id(1));assert.equal((await db.query<{v:{messages:unknown[]}}>("select chat_snapshot($1) v",[id(4)])).rows[0].v.messages.length,0);assert.ok((await db.query<{v:unknown}>("select admin_chat_attachment($1,$2) v",[id(2),id(90)])).rows[0].v);assert.equal((await db.query<{v:unknown}>("select admin_chat_attachment($1,$2) v",[id(3),id(90)])).rows[0].v,null);});
 assert.deepEqual((await db.query("select tutor_last_read_at from chat_conversations")).rows,markers.rows);
 for(const actor of [2,3,4])await as(actor,async()=>{await assert.rejects(read(),{code:"42501"});await assert.rejects(db.query("select admin_chat_attachment($1,$2)",[id(2),id(90)]),{code:"42501"});await assert.rejects(db.query("select admin_chat_previous($1,$2,now(),$3)",[id(2),id(4),msg.id]),{code:"42501"});});
 await as(1,async()=>{await assert.rejects(read(id(4)),{code:"42501"});await assert.rejects(read(id(999)),{code:"42501"});});
 await db.exec("update profiles set account_status='blocked' where role='admin'");await assert.rejects(as(1,()=>read()),{code:"42501"});await db.exec("update profiles set account_status='active' where role='admin'");
 const cv=(await db.query<{id:string}>("select id from chat_conversations")).rows[0].id;
 await db.query("insert into chat_messages(conversation_id,sender_role,body,created_at,delivery_status) select $1,'tutor','History '||g,now()+interval '1 second','sent' from generate_series(1,205) g",[cv]);
 await as(1,async()=>{const result=(await read()).rows[0].v;assert.equal(result.messages.length,200);const first=result.messages[0];const older=(await db.query<{v:{id:string}[]}>("select admin_chat_previous($1,$2,$3,$4) v",[id(2),id(4),first.created_at,first.id])).rows[0].v;assert.equal(older.length,6);assert.ok(!older.some(m=>result.messages.some(r=>r.id===m.id)));});
 await db.exec("delete from student_tutor_assignments");await as(1,async()=>{assert.equal((await read()).rows[0].v.messages.length,0);assert.equal((await db.query<{v:unknown}>("select admin_chat_attachment($1,$2) v",[id(2),id(90)])).rows[0].v,null);});
 }finally{await db.close();}
});
