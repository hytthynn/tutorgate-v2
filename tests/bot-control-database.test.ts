import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

test("013 private control registry: service-only, serialized claims, persistence, expiry and stale token",async()=>{
 const db=new PGlite();
 try {
  await db.exec("create role anon;create role authenticated;create role service_role;create schema private;");
  await db.exec(await readFile(new URL("../supabase/migrations/202609060013_telegram_control_message.sql",import.meta.url),"utf8"));
  for(const role of ["anon","authenticated"]){
   await db.exec(`set role ${role}`);
   await assert.rejects(db.query("select public.telegram_control_claim('123')"),{code:"42501"});
   await assert.rejects(db.query("select * from private.telegram_control_messages"),{code:"42501"});
   await db.exec("reset role");
  }
  const claim=async(chat="123")=>(await db.query<{v:{claimId:string;messageId:number|null}|null}>("select public.telegram_control_claim($1) v",[chat])).rows[0].v;
  await db.exec("set role service_role");
  const first=(await claim())!;assert.equal(first.messageId,null);assert.equal(await claim(),null);
  assert.notEqual(await claim("456"),null);
  await db.query("select public.telegram_control_finish('123',$1,99)",[first.claimId]);
  const second=(await claim())!;assert.equal(second.messageId,99);
  await assert.rejects(db.query("select public.telegram_control_finish('123',$1,100)",[first.claimId]),{code:"42501"});
  await db.query("select public.telegram_control_finish('123',$1,null)",[second.claimId]);
  assert.equal((await claim())!.messageId,99);
  await db.exec("reset role;update private.telegram_control_messages set claimed_until=now()-interval '1 second' where chat_id='123';set role service_role");
  assert.notEqual(await claim(),null);
  await assert.rejects(claim("bad-chat"),{code:"23514"});
 } finally { await db.close(); }
});
