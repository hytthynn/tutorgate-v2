import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFile,readdir,writeFile,mkdir } from "node:fs/promises";
import { performance } from "node:perf_hooks";
const db=new PGlite({extensions:{btree_gist}});
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
  const files=(await readdir("supabase/migrations")).filter(f=>f.endsWith(".sql")).sort();
  for(const f of files.filter(f=>!f.includes("014")))await db.exec(await readFile(`supabase/migrations/${f}`,"utf8"));
  await db.exec("alter table auth.users disable trigger user");
  for(const [n,role] of [[1,"admin"],[2,"tutor"],[3,"student"]]){
    await db.query("insert into auth.users(id) values($1)",[id(n)]);
    await db.query("insert into profiles(id,role,full_name,telegram_username,telegram_user_id,telegram_chat_id) values($1,$2,$3,$3,$3,$3)",[id(n),role,`Fixture ${n}`]);
  }
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(1)]);
  const sub=(await db.query("select id from subjects limit 1")).rows[0].id;
  await db.query("insert into tutor_subjects values($1,$2,$3,now())",[id(2),sub,id(1)]);
  await db.query("insert into student_tutor_assignments(student_id,tutor_id,subject_id,assigned_by) values($1,$2,$3,$4)",[id(3),id(2),sub,id(1)]);
  await db.exec(`insert into auth.users(id) select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(100,5149) n;
    insert into profiles(id,role,full_name,telegram_username,telegram_user_id,telegram_chat_id) select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,case when n<150 then 'tutor'::app_role else 'student'::app_role end,'Fixture '||n,'fixture_'||n,n::text,n::text from generate_series(100,5149) n;`);
  await db.query("insert into tutor_subjects(tutor_id,subject_id,assigned_by) select id,$1,$2 from profiles where role='tutor' and id<>$3",[sub,id(1),id(2)]);
  await db.query(`insert into student_tutor_assignments(student_id,tutor_id,subject_id,assigned_by) select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('00000000-0000-4000-8000-'||lpad((100+n%50)::text,12,'0'))::uuid,$1,$2 from generate_series(150,5149) n`,[sub,id(1)]);
  await db.exec("alter table lessons disable trigger user");
  await db.query(`insert into lessons(tutor_id,student_id,subject_id,subject_name_snapshot,starts_at,ends_at,duration_minutes,completed_at)
    select $1,$2,$3,'Fixture',t,t+interval '1 hour',60,t from (select timestamptz '2026-09-07 07:00Z'-n*interval '1 day' t from generate_series(0,9999) n) x`,[id(2),id(3),sub]);
  await db.exec("alter table lessons enable trigger user");
  await db.query("insert into chat_conversations(id,student_id,tutor_id) values($1,$2,$3)",[id(20),id(3),id(2)]);
  await db.query("insert into chat_messages(conversation_id,sender_role,body,delivery_status,created_at) select $1,'student',repeat('Fixture message ',10),'sent',now()-n*interval '1 minute' from generate_series(1,10000) n",[id(20)]);
  await db.exec("analyze");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(2)]);
  async function measure(sql,args=[]) {
    await db.query(sql,args); const times=[]; let result;
    for(let n=0;n<20;n++){const t=performance.now();result=await db.query(sql,args);times.push(performance.now()-t);}
    times.sort((a,b)=>a-b);
    return {p50Ms:+times[10].toFixed(2),p95Ms:+times[18].toFixed(2),bytes:Buffer.byteLength(JSON.stringify(result.rows)),rows:result.rows.length};
  }
  const before={schedule:await measure("select * from lessons where tutor_id=$1 order by starts_at,id",[id(2)]),chat:await measure("select chat_snapshot($1)",[id(3)])};
  const lessonId=(await db.query("select id from lessons order by starts_at desc limit 1")).rows[0].id;
  const mutationSql="select schedule_command($1,$2)";
  const mutationArgs=[id(2),JSON.stringify({kind:"completed",ids:[lessonId],completed:true})];
  before.mutation=await measure(mutationSql,mutationArgs);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(1)]);
  before.directory=await measure("select * from admin_directory_profiles()");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(2)]);
  for(const f of files.filter(f=>f.includes("014")))await db.exec(await readFile(`supabase/migrations/${f}`,"utf8"));
  await db.exec("analyze");
  const snapshot=(await db.query("select chat_snapshot($1) v",[id(3)])).rows[0].v;
  const after={schedule:await measure("select schedule_week_snapshot($1,'2026-09-07')",[id(2)]),chat:await measure("select chat_updates($1,$2,$3)",[id(3),snapshot.cursor,snapshot.directoryVersion])};
  after.mutation=await measure(mutationSql,mutationArgs);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(1)]);
  after.directory=await measure("select admin_directory_page('students','',null,0)");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(2)]);
  const plans={};
  for(const [name,sql,args] of [
    ["week","select id from lessons where tutor_id=$1 and starts_at>='2026-09-06 14:00Z' and starts_at<'2026-09-14' and ends_at>'2026-09-07'",[id(2)]],
    ["statistics","select id from lessons where tutor_id=$1 and completed_at is not null and inactive_reason is null and starts_at>'2026-08-07' and starts_at<'2026-09-14'",[id(2)]],
    ["assignment","select 1 from student_tutor_assignments where tutor_id=$1 and student_id=$2",[id(2),id(3)]],
    ["chatDelta","select id from chat_messages where conversation_id=$1 and revision>10000 order by revision limit 200",[id(20)]]
  ]) plans[name]=(await db.query(`explain (analyze,buffers,format json) ${sql}`,args)).rows;
  await mkdir("artifacts",{recursive:true});
  const result={environment:"Local PGlite fixture, 10,000 lessons + 10,000 messages + 5,053 profiles + 5,001 assignments; 20 warm samples; no network or RLS timing. Before schedule includes raw rows; after includes names and choices.",before,after,plans};
  await writeFile("artifacts/package-014-performance.json",JSON.stringify(result,null,2));
  console.log(JSON.stringify({before,after},null,2));
} finally {await db.close();}
