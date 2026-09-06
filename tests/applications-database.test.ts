import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { hash, token } from "../src/lib/auth/tokens";

test("009 application moderation against full PostgreSQL migrations", async t => {
 const db = new PGlite({ extensions: { btree_gist } });
 try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
   create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
  for(const name of (await readdir(new URL("../supabase/migrations/",import.meta.url))).filter(n=>n.endsWith(".sql")).sort())
   await db.exec(await readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),"utf8"));
  const scalar = async <T>(sql:string, args:unknown[]=[]) => (await db.query<{v:T}>(sql,args)).rows[0].v;
  const admin=randomUUID(), admin2=randomUUID(), tutor=randomUUID(), student=randomUUID();
  // Fixture bootstrap, never production bypass. Re-enable trigger before registration tests.
  await db.exec("alter table auth.users disable trigger user");
  for(const [id,role] of [[admin,"admin"],[admin2,"admin"],[tutor,"tutor"],[student,"student"]]) {
   await db.query("insert into auth.users(id) values($1)",[id]);
   await db.query("insert into public.profiles(id,role,full_name,telegram_username,telegram_user_id,telegram_chat_id) values($1,$2,$3,$3,$3,$3)",[id,role,id]);
  }
  await db.exec("alter table auth.users enable trigger user");
  const subject=await scalar<string>("select id v from public.subjects limit 1");
  let sequence=50000;
  async function application(tg=String(++sequence),role="student") {
   const name=`applicant_${++sequence}`, deep=hash(token());
   const id=await scalar<string>("select public.submit_application($1,$2) v",[JSON.stringify({role,full_name:name,telegram_username:name,student_goal:role==="student"?"ЕГЭ":null,teaching_experience:role==="tutor"?"3–5 лет":null,subject_ids:[subject]}),deep]);
   return {id,deep,tg,name,update:++sequence};
  }
  const confirm = (a: Awaited<ReturnType<typeof application>>, update=a.update) => scalar<{status:string;application_id:string}>("select public.confirm_telegram($1,$2,$3,$4,$4) v",[update,a.deep,a.name,a.tg]);
  const review = (a:string, action:string, h:string|null=null, actor=admin) => scalar<{status:string}>("select public.review_application($1,$2,$3,$4) v",[actor,a,action,h]);
  const state = (a:string) => scalar<string>("select status::text v from public.applications where id=$1",[a]);
  const countTokens = (a:string) => scalar<number>("select count(*)::int v from private.one_time_tokens where application_id=$1 and purpose='registration' and used_at is null",[a]);
  const register = (h:string,name=`registered_${++sequence}`) => db.query("insert into auth.users values($1,$2,$3::jsonb)",[randomUUID(),`${name}@internal.test`,JSON.stringify({username:name,registration_hash:h})]);

  await t.test("confirmation queues review, consumes deep link, never creates registration token; dedupe per admin",async()=>{
   const a=await application(); assert.equal((await confirm(a)).status,"send");
   assert.equal(await state(a.id),"pending_review"); assert.equal(await countTokens(a.id),0);
   assert.equal(await scalar("select public.token_status($1,'telegram_application') v",[a.deep]),"used");
   const recipients=await scalar<{admin_id:string}[]>("select public.application_admin_recipients($1) v",[a.id]);
   assert.equal(recipients.length,2);
   for(const recipient of recipients) {
    const claims=await Promise.all([1,2].map(()=>scalar("select public.claim_application_notification($1,$2) v",[a.id,recipient.admin_id])));
    assert.equal(claims.filter(Boolean).length,1);
    await scalar("select public.finish_application_notification($1,$2,false) v",[a.id,recipient.admin_id]);
   }
   await confirm(a); await scalar("select public.telegram_delivered($1) v",[a.update]);
   assert.equal((await confirm(a)).status,"done");
   assert.equal((await scalar<unknown[]>("select public.application_admin_recipients($1) v",[a.id])).length,0);
   assert.equal(await scalar("select count(*)::int v from private.application_admin_notifications where application_id=$1",[a.id]),2);
   assert.equal(await countTokens(a.id),0);
  });
  await t.test("approve only once, cryptographic hash storage, exact 24h TTL, atomic single-use registration",async()=>{
   const a=await application(), reg=hash(token()); await confirm(a);
   const decisions=await Promise.all([review(a.id,"approve",reg),review(a.id,"approve",hash(token()),admin2)]);
   assert.deepEqual(decisions.map(d=>d.status).sort(),["ok","processed"]);
   assert.equal(await countTokens(a.id),1); assert.equal(await state(a.id),"approved");
   assert.equal(await scalar("select extract(epoch from expires_at-created_at)::int v from private.one_time_tokens where token_hash=$1",[reg]),86400);
   assert.equal(await scalar("select public.token_status($1,'registration') v",[reg]),"valid");
   await register(reg); assert.equal(await state(a.id),"registered");
   await assert.rejects(register(reg)); assert.equal((await review(a.id,"resend",hash(token()))).status,"unavailable");
   const other=await application(a.tg); assert.equal((await confirm(other)).status,"linked");
   const queue=await scalar<{items:Record<string,unknown>[]}>("select public.admin_applications($1,'student','approved',0) v",[admin]);
   assert.ok(queue.items.some(row=>row.id===a.id&&row.status==="registered"));
   assert.ok(!JSON.stringify(queue).includes("chat_id"));assert.ok(!JSON.stringify(queue).includes("token_hash"));
  });
  await t.test("unapproved/rejected cannot register; rejection preserves identity and allows reapply",async()=>{
   const a=await application(), legacy=hash(token()); await confirm(a);
   // Simulate a legacy token without approval: trigger must reject it.
   await db.query("insert into private.one_time_tokens(purpose,token_hash,application_id,expires_at) values('registration',$1,$2,now()+interval '24 hours')",[legacy,a.id]);
   await assert.rejects(register(legacy));
   assert.equal((await review(a.id,"reject")).status,"ok");
   assert.equal(await countTokens(a.id),0); await assert.rejects(register(legacy));
   assert.equal(await scalar("select telegram_user_id v from public.applications where id=$1",[a.id]),a.tg);
   const next=await application(a.tg);assert.equal((await confirm(next)).status,"send");
   assert.equal(await state(a.id),"rejected"); assert.equal(await state(next.id),"pending_review");
  });
  await t.test("approved persists after expiry; resend revokes old token and preserves review audit",async()=>{
   const a=await application(), old=hash(token()), fresh=hash(token());await confirm(a);await review(a.id,"approve",old);
   const reviewed=await scalar("select reviewed_at v from public.applications where id=$1",[a.id]);
   await db.query("update private.one_time_tokens set expires_at=now()-interval '1 second' where token_hash=$1",[old]);
   await application(); // runs expire_old_applications trigger
   assert.equal(await state(a.id),"approved");
   const queue=await scalar<{items:{id:string;can_resend:boolean}[]}>("select public.admin_applications($1,'student','approved',0) v",[admin]);
   assert.equal(queue.items.find(row=>row.id===a.id)?.can_resend,true);
   assert.equal((await review(a.id,"resend",fresh)).status,"ok");assert.equal(await countTokens(a.id),1);
   assert.deepEqual(await scalar("select reviewed_at v from public.applications where id=$1",[a.id]),reviewed);
   await assert.rejects(register(old));await register(fresh);assert.equal(await state(a.id),"registered");
  });
  await t.test("delivery failures allow resend; late old delivery cannot overwrite newer state",async()=>{
   const a=await application(), old=hash(token()), fresh=hash(token());await confirm(a);await review(a.id,"approve",old);
   assert.equal((await review(a.id,"resend",fresh)).status,"unavailable");
   await scalar("select public.application_link_delivered($1,$2,$3,false) v",[admin,a.id,old]);
   assert.equal((await review(a.id,"resend",fresh)).status,"ok");
   await scalar("select public.application_link_delivered($1,$2,$3,true) v",[admin,a.id,old]);
   assert.equal(await scalar("select registration_delivery_status v from public.applications where id=$1",[a.id]),"pending");
   await assert.rejects(register(old));
  });
  await t.test("concurrent approve/reject admits a single transition",async()=>{
   const a=await application();await confirm(a);
   const results=await Promise.all([review(a.id,"reject"),review(a.id,"approve",hash(token()),admin2)]);
   assert.equal(results.filter(r=>r.status==="ok").length,1);assert.equal(results.filter(r=>r.status==="processed").length,1);
   assert.equal(await countTokens(a.id),(await state(a.id))==="approved"?1:0);
  });
  await t.test("expiration only affects unconfirmed applications; role and RPC permissions stay closed",async()=>{
   const a=await application();await db.query("update private.one_time_tokens set expires_at=now()-interval '1 second' where token_hash=$1",[a.deep]);await application();assert.equal(await state(a.id),"expired");
   for(const actor of [tutor,student]) {
    await assert.rejects(review(a.id,"approve",hash(token()),actor),{code:"42501"});
    await assert.rejects(scalar("select public.admin_applications($1,'student','pending_review',0) v",[actor]),{code:"42501"});
   }
   await db.exec("set role authenticated");
   try {
    await assert.rejects(db.query("select * from public.applications"),{code:"42501"});
    await assert.rejects(db.query("select public.review_application($1,$2,'approve',$3)",[admin,a.id,hash(token())]),{code:"42501"});
    await assert.rejects(db.query("select * from private.one_time_tokens"),{code:"42501"});
   } finally { await db.exec("reset role"); }
  });
 } finally { await db.close(); }
});
