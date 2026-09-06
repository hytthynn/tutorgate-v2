// Isolated UI fixtures. This process is never imported by application code.
// PostgreSQL/RLS behaviour is separately tested with real migrations in PGlite.
import {chatFixture,resetChats} from "./chat-fixtures.mjs";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { applicationFixture } from "./application-fixtures.mjs";
import { spawn } from "node:child_process";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const profiles = [
  {
    id: id(1),
    role: "admin",
    full_name: "Александр Волков",
    telegram_username: "alex_volkov",
  },
  {
    id: id(2),
    role: "tutor",
    full_name: "Мария Соколова",
    telegram_username: "maria_sokolova",
  },
  {
    id: id(3),
    role: "tutor",
    full_name: "Дмитрий Лебедев",
    telegram_username: "dmitry_lebedev",
  },
  {
    id: id(4),
    role: "student",
    full_name: "Анна Смирнова",
    telegram_username: "anna_smirnova",
  },
  {
    id: id(5),
    role: "student",
    full_name: "Михаил Кузнецов",
    telegram_username: "mikhail_kuznetsov",
  },
];
for (const [i,p] of profiles.entries()) Object.assign(p,{login:i===0?"admin":i===1?"tutor":i===3?"student":`user_${i+1}`,telegram_user_id:String(100001+i),telegram_chat_id:String(100001+i),account_status:"active",blocked_at:null});
const seedProfiles=structuredClone(profiles);
const sessionUsers=new Map();
const subjects = [
  "Математика",
  "Физика",
  "Английский язык",
  "Русский язык",
  "Информатика",
  "Химия",
].map((name, i) => ({ id: id(10 + i), name, is_active: true }));
const tutorSubjects = [
  { tutor_id: id(1), subject_id: id(10) },
  { tutor_id: id(2), subject_id: id(10) },
  { tutor_id: id(2), subject_id: id(11) },
  { tutor_id: id(3), subject_id: id(12) },
];
const assignments = [
  { id: id(23), student_id: id(4), tutor_id: id(1), subject_id: id(12) },
  { id: id(20), student_id: id(4), tutor_id: id(2), subject_id: id(10) },
  { id: id(21), student_id: id(5), tutor_id: id(2), subject_id: id(11) },
];
assignments.push({ id: id(22), student_id: id(4), tutor_id: id(2), subject_id: id(11) });
const sessions = new Map();
const behaviors = new Map(), actionCounts = new Map();
const localDate = (instant, offset = 0) => new Date(new Date(instant).getTime() + (3 + offset)*3600000).toISOString().slice(0,10);
const monday = date => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - (d.getUTCDay()+6)%7); return d.toISOString().slice(0,10); };
const week = monday(localDate(new Date()));
const day = n => new Date(Date.parse(`${week}T00:00:00Z`)+n*86400000).toISOString().slice(0,10);
const at = (n,time) => new Date(Date.parse(`${day(n)}T${time}:00Z`)-3*3600000).toISOString();
function dto(l) { return { id:l.id,tutorId:l.tutor_id,studentId:l.student_id,subjectId:l.subject_id,studentName:profiles.find(p=>p.id===l.student_id)?.full_name,tutorName:profiles.find(p=>p.id===l.tutor_id)?.full_name,subjectName:subjects.find(s=>s.id===l.subject_id)?.name ?? l.subject_name_snapshot,startsAt:l.starts_at,endsAt:l.ends_at,durationMinutes:l.duration_minutes,color:l.color,inactiveReason:l.inactive_reason??null,inactiveUntil:l.inactive_until??null,isTransferTarget:l.is_transfer_target??false,transferSourceId:l.transfer_source_id??null,transferSourceStartsAt:l.transfer_source_starts_at??null,completed:l.completed_at!==null }; }
function magnet(candidate, offset) {
  const desired=Date.parse(candidate.starts_at), date=localDate(desired,offset);
  const midnight=Date.parse(`${date}T00:00:00Z`)-(3+offset)*3600000;
  const snap=Math.min(1435,Math.max(0,Math.round((desired-midnight)/300000)*5));
  const minutes=Array.from({length:288},(_,i)=>i*5).sort((a,b)=>Math.abs(a-snap)-Math.abs(b-snap)||b-a);
  for(const minute of minutes) { const start=midnight+minute*60000;
    const moved={...candidate,starts_at:new Date(start).toISOString(),ends_at:new Date(start+candidate.duration_minutes*60000).toISOString()};
    if(!overlaps(moved)) return moved;
  }
  return null;
}
const lessons = [];
const notes = new Map();
const preferences = new Map();
const availability=[];
let nextLesson = 100;
const seedSubjects=structuredClone(subjects), seedTutorSubjects=structuredClone(tutorSubjects), seedAssignments=structuredClone(assignments);
function resetSchedule() {
  resetChats();
  profiles.splice(0,profiles.length,...structuredClone(seedProfiles));
  subjects.splice(0,subjects.length,...structuredClone(seedSubjects));
  tutorSubjects.splice(0,tutorSubjects.length,...structuredClone(seedTutorSubjects));
  assignments.splice(0,assignments.length,...structuredClone(seedAssignments));
  lessons.length = 0; availability.length=0; notes.clear(); preferences.clear(); behaviors.clear(); actionCounts.clear(); nextLesson = 100;
  for (const [student, starts, duration] of [[4, at(0,"10:00"), 60], [5, at(0,"12:00"), 60], [4, at(6,"23:00"), 120]]) {
    const lesson = { id: id(nextLesson++), tutor_id: id(2), student_id: id(student), subject_id: id(student === 5 ? 11 : 10), subject_name_snapshot: "Математика", starts_at: starts, ends_at: new Date(Date.parse(starts) + duration * 60000).toISOString(), duration_minutes: duration, color: "default", completed_at: null, updated_at: new Date().toISOString() };
    lessons.push(lesson); notes.set(lesson.id, "PRIVATE_TUTOR_NOTE_секрет");
  }
}
resetSchedule();
function matches(row, params) {
  return [...params].every(([key, filter]) => {
    if (["select", "order", "offset", "limit", "subjects.is_active"].includes(key)) return true;
    if (filter === "not.is.null") return row[key] != null;
    const value = filter.slice(filter.indexOf(".") + 1);
    if (filter.startsWith("neq.")) return String(row[key]) !== value;
    if (filter === "is.null") return row[key] == null;
    if (key === "id" && filter.startsWith("gt.")) return row[key] > value;
    if (filter.startsWith("eq.")) return String(row[key]) === value;
    if (filter.startsWith("lt.")) return Date.parse(row[key]) < Date.parse(value);
    if (filter.startsWith("gte.")) return Date.parse(row[key]) >= Date.parse(value);
    if (filter.startsWith("gt.")) return Date.parse(row[key]) > Date.parse(value);
    if (filter.startsWith("in.")) return value.slice(1, -1).split(",").includes(row[key]);
    return true;
  });
}
function overlaps(candidate) {
  return lessons.some((l) => !l.inactive_reason && !candidate.inactive_reason && (l.color==="coral")===(candidate.color==="coral") && l.id !== candidate.id && (l.tutor_id === candidate.tutor_id || l.student_id === candidate.student_id) && Date.parse(l.starts_at) < Date.parse(candidate.ends_at) && Date.parse(l.ends_at) > Date.parse(candidate.starts_at));
}
const jwt = (uid) =>
  `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: uid, email: "hidden_alias@internal.test", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.fixture-signature`;
function user(uid) {
  return {
    id: uid,
    aud: "authenticated",
    role: "authenticated",
    email: "hidden_alias@internal.test",
    created_at: new Date().toISOString(),
    app_metadata: {},
    user_metadata: {},
  };
}
const server = http.createServer(async (req, res) => {
  let text = "";
  for await (const chunk of req) text += chunk;
  const args = text ? JSON.parse(text) : {};
  const url = new URL(req.url, "http://localhost");
  let uid;
  try {
    uid = JSON.parse(
      Buffer.from(
        (req.headers.authorization ?? "").split(".")[1],
        "base64url",
      ).toString(),
    ).sub;
  } catch {}
  const profile = profiles.find((p) => p.id === uid);
  let value = [];
  let status = 200;
  const op = url.pathname.split("/").at(-1);
  if (url.pathname === "/fixtures/behavior") {
    behaviors.set(args.op, { delay: args.delay ?? 0, fail: args.fail ?? false });
    res.writeHead(200, { "Content-Type": "application/json" }); res.end("true"); return;
  }
  if (url.pathname === "/fixtures/state") {
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ actionCounts: Object.fromEntries(actionCounts), lessons, notes:Object.fromEntries(notes) })); return;
  }
  if (url.pathname === "/fixtures/scenario") {
    if(args.mode==="no-students")assignments.length=0;
    if(args.mode==="no-subjects")subjects.length=0;
    if(args.mode==="historical"){lessons[0].subject_id=null;lessons[0].subject_name_snapshot="Историческая математика";}
    if (args.mode === "hidden") lessons.push({ ...lessons[0], id: id(900), tutor_id: id(3), starts_at: at(0,"14:00"), ends_at: at(0,"15:00"), updated_at: new Date().toISOString() });
    if (args.mode === "full-day") for (let n=0;n<3;n++) lessons.push({ ...lessons[0], id: id(910+n), student_id: id(5), starts_at: at(1,`${String(n*8).padStart(2,"0")}:00`), ends_at: n===2 ? at(2,"00:00") : at(1,`${String((n+1)*8).padStart(2,"0")}:00`), duration_minutes:480 });
    res.writeHead(200, { "Content-Type": "application/json" }); res.end("true"); return;
  }
  if (req.method !== "GET" && !url.pathname.startsWith("/fixtures")) actionCounts.set(op, (actionCounts.get(op) ?? 0) + 1);
  const alias=op==="schedule_command"?({create:"save_schedule_lesson",edit:"save_schedule_lesson",move:"patch_schedule_lesson",color:"patch_schedule_lesson",completed:"patch_schedule_lesson",delete:"delete_schedule_lessons",offset:"user_schedule_preferences"}[args.p_command?.kind]):null;
  if(alias)actionCounts.set(alias,(actionCounts.get(alias)??0)+1);
  const behavior = behaviors.get(op)??behaviors.get(alias);
  if (behavior && req.method !== "GET") {
    behaviors.delete(op);if(alias)behaviors.delete(alias);
    await new Promise(resolve => setTimeout(resolve, behavior.delay));
    if (behavior.fail) { res.writeHead(500,{"Content-Type":"application/json"}); res.end(JSON.stringify({code:"P0001",message:"Fixture failure"})); return; }
  }
  if(url.pathname === "/fixtures/users-state") {res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({profiles,sessionCount:sessions.size}));return;}
  if(url.pathname === "/fixtures/telegram/get-chat") {
    const p=profiles.find(p=>p.telegram_chat_id===args.chat_id);
    const result={id:Number(args.chat_id),type:"private",...(args.chat_id==="100002"?{}:{username:p?.telegram_username+"_new"})};
    res.writeHead(args.chat_id==="100003"?500:200,{"Content-Type":"application/json"});res.end(JSON.stringify({ok:args.chat_id!=="100003",result}));return;
  }
  const applicationResult = chatFixture(op,args,url.pathname,profile,profiles,assignments) ?? applicationFixture(op,args,req.method,url.pathname);
  if (applicationResult) { value=applicationResult.value; status=applicationResult.status; }
  else if (url.pathname === "/fixtures/reset-schedule") { resetSchedule(); value = true; }
  else if(op.startsWith("admin_") && ["admin_directory_profiles","admin_change_user_role","admin_set_user_blocked","admin_soft_delete_user"].includes(op)) {
    const target=profiles.find(p=>p.id===args.p_user);
    if(profile?.role!=="admin"||profile.account_status!=="active") {status=403;value={code:"42501"};}
    else if(op==="admin_directory_profiles")value=profiles.filter(p=>p.account_status!=="deleted").map(p=>({id:p.id,role:p.role,full_name:p.full_name,login:p.login,telegram_username:p.telegram_username,telegram_user_id:p.telegram_user_id,account_status:p.account_status,blocked_at:p.blocked_at}));
    else if(!target||target.role==="admin"||(target.account_status==="deleted"&&op!=="admin_soft_delete_user")) {status=403;value={code:"42501"};}
    else if(op==="admin_change_user_role") {
      if(assignments.some(a=>[a.student_id,a.tutor_id].includes(target.id))||tutorSubjects.some(a=>a.tutor_id===target.id)||lessons.some(l=>[l.student_id,l.tutor_id].includes(target.id)&&Date.parse(l.ends_at)>=Date.now())){status=400;value={code:"P0010",message:"Сначала снимите назначения, предметы репетитора и будущие занятия."};}
      else {target.role=args.p_role;value=null;}
    } else {
      if(op==="admin_soft_delete_user")Object.assign(target,{account_status:"deleted",full_name:"Удалённый пользователь",login:null,telegram_username:null,telegram_user_id:null,telegram_chat_id:null});
      else Object.assign(target,{account_status:args.p_blocked?"blocked":"active",blocked_at:args.p_blocked?new Date().toISOString():null});
      if(target.account_status!=="active")for(const [hash,user] of sessionUsers)if(user===target.id){sessions.delete(hash);sessionUsers.delete(hash);}
      value=null;
    }
  }
  else if(op==="schedule_owner_context" || op==="schedule_lesson_note") {
    const owner=profiles.find(p=>p.id===args.p_owner);
    if(!owner || !["tutor","admin"].includes(owner.role) || owner.account_status!=="active" || !profile || profile.account_status!=="active" || !["tutor","admin"].includes(profile.role) || (owner.id!==uid && profile.role!=="admin")) {status=403;value={code:"42501"};}
    else if(op==="schedule_owner_context") value={ownerId:owner.id,ownerName:owner.full_name,offset:preferences.get(owner.id)?.msk_offset_hours??0,rules:availability.filter(r=>r.tutor_id===owner.id).map(r=>({studentId:r.student_id,availableFrom:r.available_from}))};
    else if(!lessons.some(l=>l.id===args.p_lesson&&l.tutor_id===owner.id)){status=403;value={code:"42501"};}
    else value=notes.get(args.p_lesson)??"";
  }
  else if(op==="tutor_student_availability")value=availability.filter(r=>r.tutor_id===uid);
  else if(op==="schedule_command"){
    const ownerId=args.p_owner??uid;
    const c=args.p_command, original=structuredClone(lessons), oldNotes=new Map(notes), oldRules=structuredClone(availability),oldPreferences=new Map(preferences);
    const snapshot=()=>({payload:{owner:ownerId,lessons:structuredClone(lessons.filter(l=>l.tutor_id===ownerId)),notes:Object.fromEntries([...notes].filter(([id])=>lessons.some(l=>l.id===id&&l.tutor_id===ownerId))),rules:structuredClone(availability.filter(r=>r.tutor_id===ownerId)),offset:preferences.get(ownerId)?.msk_offset_hours??0},signature:"a".repeat(64)});
    const before=snapshot();let extra={};
    const activity=l=>{if(l.inactive_reason!=="transferred"){const r=availability.find(r=>r.tutor_id===l.tutor_id&&r.student_id===l.student_id);l.inactive_reason=r&&localDate(l.starts_at,preferences.get(ownerId)?.msk_offset_hours??0)<r.available_from?"available_from":null;l.inactive_until=l.inactive_reason?r.available_from:null;}if(l.inactive_reason)l.completed_at=null;return l;};
    const remove=ids=>{for(let i=lessons.length-1;i>=0;i--)if(ids.includes(lessons[i].id))lessons.splice(i,1);};
    try{
      const owner=profiles.find(p=>p.id===ownerId);
      if(!owner || owner.account_status!=="active" || (ownerId!==uid && profile?.role!=="admin") || (ownerId!==uid && c.kind==="offset"))throw {code:"42501"};
      const group=lessons.filter(l=>c.ids?.includes(l.id)&&l.tutor_id===ownerId);
      if(c.ids&&group.length!==c.ids.length)throw {code:"42501"};
      if(c.kind==="restore"){
        const target=c.target.payload;const ownedIds=lessons.filter(l=>l.tutor_id===ownerId).map(l=>l.id);remove(ownedIds);lessons.push(...structuredClone(target.lessons));for(const id of ownedIds)notes.delete(id);for(const [id,note] of Object.entries(target.notes))notes.set(id,note);availability.splice(0,availability.length,...availability.filter(r=>r.tutor_id!==ownerId),...structuredClone(target.rules));preferences.set(ownerId,{user_id:ownerId,msk_offset_hours:target.offset});
      }else if(c.kind==="delete"){
        const restore=group.filter(l=>l.is_transfer_target&&!c.ids.includes(l.transfer_source_id)).map(l=>l.transfer_source_id);
        remove(c.ids);for(const id of c.ids)notes.delete(id);
        for(const l of lessons.filter(l=>l.tutor_id===ownerId)){
          if(l.is_transfer_target&&c.ids.includes(l.transfer_source_id)){l.is_transfer_target=false;l.transfer_source_id=null;l.transfer_source_starts_at=null;}
          if(restore.includes(l.id)&&l.inactive_reason==="transferred"){l.inactive_reason=null;l.inactive_until=null;l.completed_at=null;activity(l);}
        }
      }
      else if(c.kind==="offset"){preferences.set(ownerId,{user_id:ownerId,msk_offset_hours:c.offset});lessons.filter(l=>l.tutor_id===ownerId).forEach(activity);}
      else if(c.kind==="availability"){
        for(let i=availability.length-1;i>=0;i--)if(availability[i].tutor_id===ownerId&&c.studentIds.includes(availability[i].student_id))availability.splice(i,1);
        if(c.availableFrom)for(const student_id of new Set(c.studentIds))availability.push({tutor_id:ownerId,student_id,available_from:c.availableFrom});
        lessons.filter(l=>l.tutor_id===ownerId).forEach(activity);
      }else if(c.kind==="color"||c.kind==="completed"){
        for(const l of group){if(l.inactive_reason)throw {code:"PT005"};if(c.kind==="color")l.color=c.color;else l.completed_at=c.completed?new Date().toISOString():null;}
      }else if(c.kind==="create"||c.kind==="edit"){
        const old=lessons.find(l=>l.id===c.id),offset=preferences.get(ownerId)?.msk_offset_hours??0;
        const l=activity({...old,id:old?.id??id(nextLesson++),tutor_id:ownerId,student_id:c.studentId,subject_id:c.subjectChanged===false?old?.subject_id:c.subjectId,subject_name_snapshot:subjects.find(s=>s.id===c.subjectId)?.name??old?.subject_name_snapshot,starts_at:c.startsAt,duration_minutes:c.durationMinutes,color:old?.color??"default",completed_at:old?.completed_at??null});
        const moved=magnet(l,offset);if(!moved)throw {code:"P0002"};if(old)Object.assign(old,moved);else lessons.push(moved);notes.set(moved.id,c.note);extra={lesson:dto(moved),requestedStart:c.startsAt,shifted:Date.parse(c.startsAt)!==Date.parse(moved.starts_at)};
      }else if(["transfer","paste","move"].includes(c.kind)){
        if(group.some(l=>l.inactive_reason))throw {code:"PT005"};if(c.kind==="transfer"&&group.some(l=>l.is_transfer_target))throw {code:"PT006"};
        const anchor=Math.min(...group.map(l=>Date.parse(l.starts_at))),offset=preferences.get(ownerId)?.msk_offset_hours??0;
        const copies=group.map(l=>activity({...l,id:c.kind==="move"?l.id:id(nextLesson++),starts_at:new Date(Date.parse(l.starts_at)+Date.parse(c.startsAt)-anchor).toISOString(),duration_minutes:c.durationMinutes??l.duration_minutes,completed_at:c.kind==="move"?l.completed_at:null,is_transfer_target:c.kind==="transfer"||c.kind==="move"&&l.is_transfer_target,transfer_source_id:c.kind==="transfer"?l.id:null,transfer_source_starts_at:c.kind==="transfer"?l.starts_at:null}));
        for(let i=0;i<copies.length;i++){const l=copies[i];l.ends_at=new Date(Date.parse(l.starts_at)+l.duration_minutes*60000).toISOString();if(c.kind!=="move")notes.set(l.id,notes.get(group[i].id)??"");}
        if(c.kind==="transfer")for(const l of group){l.inactive_reason="transferred";l.completed_at=null;}if(c.kind==="move")remove(c.ids);
        const desired=Date.parse(copies[0].starts_at),candidate=magnet(copies[0],offset);if(!candidate)throw {code:"P0002"};const delta=Date.parse(candidate.starts_at)-desired;
        for(const l of copies){l.starts_at=new Date(Date.parse(l.starts_at)+delta).toISOString();l.ends_at=new Date(Date.parse(l.ends_at)+delta).toISOString();lessons.push(l);}
        extra={createdIds:copies.map(l=>l.id),shifted:delta!==0,...(copies.length===1&&c.kind==="move"?{lesson:dto(copies[0]),requestedStart:c.startsAt}:{})};
      }
      if(lessons.some(overlaps))throw {code:"23P01"};
      value={...extra,before,after:snapshot(),replaceAll:profile?.role!=="student",lessons:lessons.filter(l=>l.tutor_id===ownerId).map(dto),rules:availability.filter(r=>r.tutor_id===ownerId).map(r=>({studentId:r.student_id,availableFrom:r.available_from})),offset:preferences.get(ownerId)?.msk_offset_hours??0};
    }catch(error){lessons.splice(0,lessons.length,...original);notes.clear();for(const [id,note]of oldNotes)notes.set(id,note);availability.splice(0,availability.length,...oldRules);preferences.clear();for(const [id,p]of oldPreferences)preferences.set(id,p);status=409;value={code:error.code??"P0001"};}
  }
  else if (op === "ensure_schedule_rollover") value=null;
  else if (op === "save_schedule_lesson" || op === "patch_schedule_lesson") {
    const old=args.p_id ? lessons.find(l=>l.id===args.p_id && l.tutor_id===uid) : null;
    const offset=preferences.get(uid)?.msk_offset_hours ?? 0;
    const requested=args.p_start ?? old?.starts_at;
    const current=monday(localDate(new Date(),offset)), localWeek=monday(localDate(requested,offset));
    const candidate=op==="patch_schedule_lesson" ? {...old,starts_at:requested,color:args.p_color ?? old?.color,completed_at:args.p_completed==null?old?.completed_at:args.p_completed?new Date().toISOString():null} :
      {...(old ?? { id:id(nextLesson++),tutor_id:uid,color:"default",completed_at:null }), student_id:args.p_student,subject_id:args.p_subject_changed===false?old?.subject_id:args.p_subject,starts_at:requested,duration_minutes:args.p_duration};
    if(profile?.role==="student" || (args.p_id && !old)) {status=403;value={code:"42501"};}
    else if(!old && localWeek!==current) {status=400;value={code:"PT001"};}
    else if(args.p_start && localWeek>current) {status=400;value={code:"PT002"};}
    else {
      const moved=args.p_start ? magnet(candidate,offset) : candidate;
      if(!moved) {status=409;value={code:"P0002"};}
      else {
        moved.updated_at=new Date().toISOString();
        moved.ends_at=new Date(Date.parse(moved.starts_at)+moved.duration_minutes*60000).toISOString();
        moved.subject_name_snapshot=subjects.find(s=>s.id===moved.subject_id)?.name ?? old?.subject_name_snapshot;
        if(old) Object.assign(old,moved); else lessons.push(moved);
        if(op==="save_schedule_lesson") notes.set(moved.id,args.p_note);
        value={lesson:dto(moved),requestedStart:args.p_start,shifted:Boolean(args.p_start && Date.parse(args.p_start)!==Date.parse(moved.starts_at))};
      }
    }
  } else if (op === "delete_schedule_lessons") {
    if (profile?.role === "student") { status = 403; value = { code: "42501" }; }
    else {
      const owned = lessons.filter((l) => l.tutor_id === uid && args.p_ids.includes(l.id));
      for (const row of owned) { lessons.splice(lessons.indexOf(row), 1); notes.delete(row.id); }
      value = { ids: owned.map(l=>l.id) };
    }
  } else if(op === "delete_subject_hard") {
    if(profile?.role!=="admin") {status=403;value={code:"42501"};}
    else {
      for(const rows of [assignments,tutorSubjects]) for(let i=rows.length-1;i>=0;i--) if(rows[i].subject_id===args.p_id) rows.splice(i,1);
      for(const lesson of lessons) if(lesson.subject_id===args.p_id) lesson.subject_id=null;
      const index=subjects.findIndex(s=>s.id===args.p_id); if(index>=0) subjects.splice(index,1); value=null;
    }
  } else if (op === "lessons") {
    const readable = lessons.filter((l) => profile?.role === "admin" || l.tutor_id === uid || l.student_id === uid);
    const filtered = readable.filter((l) => matches(l, url.searchParams));
    if (req.method === "PATCH") {
      value = [];
      for (const old of filtered.filter((l) => l.tutor_id === uid && profile?.role !== "student")) {
        const candidate = { ...old, ...args };
        candidate.ends_at = new Date(Date.parse(candidate.starts_at) + candidate.duration_minutes * 60000).toISOString();
        if (overlaps(candidate)) { status = 409; value = { code: "23P01" }; break; }
        Object.assign(old, candidate); value.push(candidate);
      }
    } else if (req.method === "DELETE") {
      for (const row of filtered.filter((l) => l.tutor_id === uid && profile?.role !== "student")) { lessons.splice(lessons.indexOf(row), 1); notes.delete(row.id); }
      value = [];
    } else value = filtered.slice(Number(url.searchParams.get("offset") ?? 0), Number(url.searchParams.get("offset") ?? 0) + Number(url.searchParams.get("limit") ?? 500));
  } else if (op === "schedule_lesson_names") {
    value = lessons.filter((l) => args.p_ids.includes(l.id) && (profile?.role === "admin" || l.tutor_id === uid || l.student_id === uid)).map((l) => ({ id: l.id, student_name: profiles.find((p) => p.id === l.student_id)?.full_name, tutor_name: profiles.find((p) => p.id === l.tutor_id)?.full_name, subject_name: subjects.find((s) => s.id === l.subject_id)?.name ?? l.subject_name_snapshot }));
  } else if (op === "lesson_private_notes") {
    value = profile?.role === "student" ? [] : lessons.filter((l) => l.tutor_id === uid || profile?.role === "admin").map((l) => ({ lesson_id: l.id, note: notes.get(l.id) ?? "" })).filter((l) => matches(l, url.searchParams));
  } else if (op === "user_schedule_preferences") {
    if (req.method === "POST" && args.user_id === uid) preferences.set(uid, { user_id: uid, msk_offset_hours: args.msk_offset_hours });
    value = preferences.has(uid) ? [preferences.get(uid)] : [];
  } else if (url.pathname === "/auth/v1/token") {
    const name = args.email?.split("@")[0];
    const p = profiles.find((p) => p.login === name) ?? profiles.find((p) => p.role === name) ?? profiles[0];
    value = {
      access_token: jwt(p.id),
      refresh_token: "fixture-refresh",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: "bearer",
      user: user(p.id),
    };
  } else if (url.pathname === "/auth/v1/user") value = user(uid);
  else if (op === "session_delete") { sessions.delete(args.p_hash); value = null; }
  else if (op === "session_read") value = sessions.get(args.p_hash) ?? null;
  else if (op === "session_refresh") {
    if(sessions.has(args.p_hash)) {if(args.p_cookies.length)sessions.set(args.p_hash,args.p_cookies);else sessions.delete(args.p_hash);} value=null;
  } else if (op === "session_write") {
    sessions.set(args.p_hash, args.p_cookies);
    value = null;
  } else if (op === "lookup_alias") value = args.p_username==="fixture_new"?null:`${args.p_username}@internal.test`;
  else if (op === "rate_limit") value = true;
  else if (op === "bind_session") { sessionUsers.set(args.p_hash,args.p_user);value=null; }
  else if (op === "profiles") {
    const rows=profiles.filter(p=>matches(p,url.searchParams));
    if(req.method === "PATCH")for(const row of rows)Object.assign(row,args);
    value=rows;
  }
  else if (op === "visible_profiles") {
    value =
      profile?.role === "admin"
        ? profiles
        : profiles.filter(
            (p) =>
              p.id === uid ||
              assignments.some(
                (a) =>
                  (a.student_id === uid && a.tutor_id === p.id) ||
                  (a.tutor_id === uid && a.student_id === p.id),
              ),
          );
    value = profile?.account_status === "active" ? value.filter(p=>p.account_status === "active").map(p=>({id:p.id,role:p.role,full_name:p.full_name,telegram_username:p.id===uid||profile.role==="admin"?p.telegram_username:null})) : [];
    if (url.searchParams.has("id"))
      value = value.filter((p) => `eq.${p.id}` === url.searchParams.get("id"));
  } else if (op === "subjects") value = subjects;
  else if (op === "tutor_subjects") value = tutorSubjects.filter((s) => matches(s, url.searchParams)).map((s) => url.searchParams.get("select")?.includes("subjects!") ? { ...s, subjects: subjects.find((sub) => sub.id === s.subject_id) } : s);
  else if (op === "student_tutor_assignments")
    value =
      profile?.role === "admin"
        ? assignments
        : assignments.filter((a) => a.student_id === uid || a.tutor_id === uid);
  else if (op === "app_settings") value = [{ hourly_rate: 1500 }];
  else if(op==="request_reset")value=null;
  else if(op==="claim_reset")value=id(4);
  else if(url.pathname.startsWith("/auth/v1/admin/users"))value={user:user(id(4))};
  else if (op === "token_status") value = args.p_hash ? "valid" : null;
  if(Array.isArray(value) && ["subjects","tutor_subjects","student_tutor_assignments","visible_profiles","admin_directory_profiles","profiles"].includes(op)) {
    if(op!=="profiles"||req.method!=="PATCH")value=value.filter(row=>matches(row,url.searchParams));
    const from=Number(url.searchParams.get("offset") ?? 0), limit=Number(url.searchParams.get("limit") ?? 500); value=value.slice(from,from+limit);
  }
  if (req.headers.accept?.includes("vnd.pgrst.object") && Array.isArray(value))
    value = value[0] ?? null;
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(value));
});
server.listen(54329, "127.0.0.1");
const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "-p", "3100"],
  {
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54329",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-public",
      SUPABASE_SECRET_KEY: "fixture-secret",
      TELEGRAM_BOT_TOKEN: "fixture-bot",
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require=${fileURLToPath(new URL("./telegram-preload.cjs", import.meta.url))}`,
      TELEGRAM_BOT_USERNAME: "tutorgate_fixture_bot",
      TELEGRAM_WEBHOOK_SECRET: "fixture-webhook",
      AUTH_ALIAS_DOMAIN: "internal.test",
      APP_URL: "http://localhost:3100",
    },
  },
);
function close() {
  child.kill();
  server.close();
}
process.on("SIGTERM", close);
process.on("SIGINT", close);
child.on("exit", () => {
  server.close();
  process.exit();
});
