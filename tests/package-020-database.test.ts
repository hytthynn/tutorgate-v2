import {PGlite} from "@electric-sql/pglite";
import {btree_gist} from "@electric-sql/pglite/contrib/btree_gist";
import {readFile,readdir} from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
import {defaultLatexConfig} from "../src/features/latex/config";
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
test("020 only active admin can save LaTeX config; authenticated reads and DB validation",async()=>{
 const db=new PGlite({extensions:{btree_gist}});try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 const dir=new URL("../supabase/migrations/",import.meta.url);for(const f of(await readdir(dir)).filter(f=>f.endsWith(".sql")).sort())await db.exec(await readFile(new URL(f,dir),"utf8"));
 await db.exec("alter table auth.users disable trigger user");
 for(const [n,role] of [[1,"admin"],[2,"tutor"],[3,"student"]] as const){await db.query("insert into auth.users(id) values($1)",[id(n)]);await db.query("insert into profiles(id,role,full_name,telegram_username,telegram_user_id,telegram_chat_id) values($1,$2,$3,$3,$3,$3)",[id(n),role,`Person ${n}`]);}
 async function as<T>(n:number,fn:()=>Promise<T>){await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(n)]);await db.exec("set role authenticated");try{return await fn();}finally{await db.exec("reset role");}}
 const save=(config:unknown)=>db.query("select latex_settings_save($1)",[JSON.stringify(config)]);
 await as(1,async()=>{assert.deepEqual((await db.query<{v:unknown}>("select latex_settings_read() v")).rows[0].v,defaultLatexConfig);await save({...defaultLatexConfig,preamble:String.raw`\newcommand{\R}{\mathbb{R}}`,libraries:[{name:"custom.sty",source:"% package"}]});for(const config of [null,{}, {...defaultLatexConfig,packages:["../evil"]},{...defaultLatexConfig,libraries:[{name:"../x.sty",source:""}]},{...defaultLatexConfig,libraries:[{name:"x.sty",source:null}]},{...defaultLatexConfig,preamble:"x".repeat(16001)}])await assert.rejects(save(config));});
 for(const n of [2,3])await as(n,async()=>{await db.query("select latex_settings_read()");await assert.rejects(save(defaultLatexConfig),{code:"42501"});await assert.rejects(db.query("select * from private.latex_settings"),{code:"42501"});});
 await db.exec("update profiles set account_status='blocked' where id='"+id(1)+"'");await as(1,async()=>{await assert.rejects(save(defaultLatexConfig),{code:"42501"});await assert.rejects(db.query("select latex_settings_read()"),{code:"42501"});});
 await db.exec("set role anon");await assert.rejects(db.query("select latex_settings_read()"),{code:"42501"});await db.exec("reset role");
 }finally{await db.close();}
});
