// Isolated mock service/Telegram store. Not imported by production code.
import { randomUUID } from 'node:crypto';
const apps=[], tokens=new Map(), updates=new Map(), notices=new Map(), messages=[];
const admin='00000000-0000-4000-8000-000000000001';
const admins=[admin,'00000000-0000-4000-8000-000000000099'];
const stamp=()=>new Date().toISOString();
const reply=(value,status=200)=>({value,status});
export function applicationFixture(op,args,method,path) {
 if(path==='/fixtures/applications-reset'){apps.length=0;tokens.clear();updates.clear();notices.clear();messages.length=0;return reply(true);}
 if(path==='/fixtures/applications-seed'){for(const [i,name] of ['Екатерина Александровна Соколова','Александр Константинопольский'].entries())apps.push({id:randomUUID(),role:'student',full_name:name,telegram_username:'applicant_long_username_'+i,subjects:['Математика','Физика'],student_goal:'Подготовка к экзаменам и поступлению в университет',status:'pending_review',created_at:stamp(),telegram_verified_at:stamp(),reviewed_at:null,registered_at:null});return reply(true);}
 if(path==='/fixtures/applications-state') return reply({apps,messages});
 if(path==='/fixtures/applications-expire'){for(const t of tokens.values())if(t.application_id===args.id&&t.purpose==='registration')t.expires_at=new Date(Date.now()-1000).toISOString();return reply(true);}
 if(path==='/fixtures/telegram/send'){messages.push({chat_id:args.chat_id,text:args.text,reply_markup:args.reply_markup,hasButtons:!!args.reply_markup});return reply({ok:true,result:{message_id:messages.length}});}
 if(path==='/fixtures/telegram/answer')return reply({ok:true});
 if(op==='submit_application') {
  const data=args.p_data,id=randomUUID();apps.push({id,...data,subjects:['Математика'],status:'pending_telegram',created_at:stamp(),telegram_verified_at:null,reviewed_at:null,reviewed_by_name:null,registered_at:null});
  tokens.set(args.p_hash,{application_id:id,purpose:'telegram_application',expires_at:new Date(Date.now()+86400000).toISOString(),used_at:null});return reply(id);
 }
 if(op==='confirm_telegram') {
  const u=updates.get(args.p_update);if(u)return reply({...u,status:u.delivered?'done':'send'});
  const t=tokens.get(args.p_hash),a=apps.find(a=>a.id===t?.application_id);
  if(!t||t.used_at||!a||a.status!=='pending_telegram')return reply({status:'invalid'});
  if(!args.p_username)return reply({status:'no_username'});
  if(args.p_username!==a.telegram_username)return reply({status:'mismatch'});
  if(apps.some(x=>x.id!==a.id&&x.telegram_user_id===args.p_user&&!['rejected','expired'].includes(x.status)))return reply({status:'linked'});
  a.status='pending_review';a.telegram_verified_at=stamp();a.telegram_user_id=args.p_user;a.telegram_chat_id=args.p_chat;t.used_at=stamp();
  const result={status:'send',application_id:a.id,chat_id:args.p_chat};updates.set(args.p_update,result);
  for(const id of admins)notices.set(`${a.id}:${id}`,{attempted:false});return reply(result);
 }
 if(op==='telegram_delivered'){const u=updates.get(args.p_update);if(u)u.delivered=true;return reply(null);}
 if(op==='application_admin_recipients')return reply(admins.filter(id=>notices.get(`${args.p_id}:${id}`)?.attempted===false).map(admin_id=>({admin_id})));
 if(op==='claim_application_notification'){
  const n=notices.get(`${args.p_id}:${args.p_admin}`),a=apps.find(a=>a.id===args.p_id);if(!n||n.attempted||!a)return reply(null);n.attempted=true;
  return reply({chat_id:args.p_admin,role:a.role,full_name:a.full_name,telegram_username:a.telegram_username,subjects:a.subjects,details:a.student_goal??a.teaching_experience});
 }
 if(op==='finish_application_notification')return reply(null);
 if(['review_application','admin_applications','application_link_delivered'].includes(op)&&args.p_actor!==admin)return reply({code:'42501'},403);
 if(op==='admin_applications'){
  const filtered=apps.filter(a=>a.role===args.p_role&&(args.p_bucket==='approved'?['approved','registered'].includes(a.status):a.status===args.p_bucket));
  const items=filtered.slice(args.p_offset,args.p_offset+50).map(a=>{
   const safe={...a};
   delete safe.telegram_user_id;
   delete safe.telegram_chat_id;
   const latest=[...tokens.values()].find(t=>t.application_id===a.id&&t.purpose==='registration'&&!t.used_at);
   return {...safe,link_expires_at:latest?.expires_at??null,delivery_status:a.registration_delivery_status??null,can_resend:a.status==='approved'&&(!latest||Date.parse(latest.expires_at)<=Date.now()||a.registration_delivery_status==='failed')};
  });return reply({items,total:filtered.length});
 }
 if(op==='review_application'){
  const a=apps.find(a=>a.id===args.p_id);if(!a)return reply({status:'unavailable'});
  if(args.p_action==='resend'){if(a.status!=='approved')return reply({status:'unavailable'});}
  else {if(a.status!=='pending_review')return reply({status:'processed'});a.status=args.p_action==='approve'?'approved':'rejected';a.reviewed_at=stamp();a.reviewed_by_name='Александр Волков';}
  for(const t of tokens.values())if(t.application_id===a.id&&t.purpose==='registration'&&!t.used_at)t.used_at=stamp();
  if(args.p_action!=='reject'){tokens.set(args.p_hash,{application_id:a.id,purpose:'registration',expires_at:new Date(Date.now()+86400000).toISOString(),used_at:null});a.registration_delivery_status='pending';}
  return reply({status:'ok',chat_id:a.telegram_chat_id});
 }
 if(op==='application_link_delivered'){const a=apps.find(a=>a.id===args.p_id);if(a)a.registration_delivery_status=args.p_success?'sent':'failed';return reply(null);}
 if(op==='token_status'&&tokens.has(args.p_hash)){
  const t=tokens.get(args.p_hash),a=apps.find(a=>a.id===t.application_id);
  return reply(t.used_at?'used':Date.parse(t.expires_at)<=Date.now()?'expired':t.purpose==='registration'&&a?.status!=='approved'?'invalid':'valid');
 }
 if(path==='/auth/v1/admin/users'&&tokens.has(args.user_metadata?.registration_hash)){
  const t=tokens.get(args.user_metadata.registration_hash),a=apps.find(a=>a.id===t.application_id);
  if(t.used_at||Date.parse(t.expires_at)<=Date.now()||a.status!=='approved')return reply({msg:'Invalid registration'},400);
  a.status='registered';a.registered_at=stamp();t.used_at=stamp();return reply({user:{id:randomUUID(),email:args.email,user_metadata:{}}});
 }
 return undefined;
}
