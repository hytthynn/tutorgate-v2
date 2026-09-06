import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { overlapLanes, removeLessons, isTransferAllowed } from "../src/features/schedule/operations";
import { applicationBucket, reviewAllowed } from "../src/features/applications/types";
import { notifyApplicationAdmins, adminNotificationText, type AdminNotice } from "../src/features/applications/notifications";
import type { ScheduleLesson } from "../src/features/schedule/types";
const lesson:ScheduleLesson={id:"a",tutorId:"t",studentId:"s",studentName:"S",tutorName:"T",subjectId:null,subjectName:"Math",startsAt:"2026-09-07T07:00:00Z",endsAt:"2026-09-07T08:00:00Z",durationMinutes:60,color:"default",completed:false};
const item=(l:ScheduleLesson,start=600,end=660)=>({lesson:l,segment:{startMinute:start,endMinute:end}});
for(const other of [{color:"coral"},{inactiveReason:"transferred"},{inactiveReason:"available_from"}] as const) test(`009 allowed overlap stays full width: ${JSON.stringify(other)}`,()=>{
 const result=overlapLanes([item(lesson),item({...lesson,id:"b",...other})]);
 assert.deepEqual(result.map(l=>[l.lane,l.lanes]),[[0,1],[0,1]]);
});
test("009 same-class conflicts split defensively, unrelated people do not",()=>{
 assert.ok(overlapLanes([item(lesson),item({...lesson,id:"b",color:"gray"})]).every(l=>l.lanes===2));
 assert.ok(overlapLanes([item({...lesson,color:"coral"}),item({...lesson,id:"b",color:"coral"})]).every(l=>l.lanes===2));
 assert.ok(overlapLanes([item(lesson),item({...lesson,id:"b",studentId:"other",tutorId:"other"})]).every(l=>l.lanes===1));
 assert.ok(overlapLanes([item({...lesson,inactiveReason:"transferred"}),item({...lesson,id:"b",inactiveReason:"transferred"})]).every(l=>l.lanes===1));
});
test("009 midnight segment adjacency does not create defensive lanes",()=>{
 assert.ok(overlapLanes([item(lesson,0,60),item({...lesson,id:"b"},60,120)]).every(l=>l.lanes===1));
});
const source={...lesson,inactiveReason:"transferred" as const};
const target={...lesson,id:"target",startsAt:"2026-09-08T07:00:00Z",endsAt:"2026-09-08T08:00:00Z",isTransferTarget:true,transferSourceId:source.id,transferSourceStartsAt:source.startsAt};
test("009 delete target restores source, availability reapplies and completion remains cleared",()=>{
 const restored=removeLessons([source,target],[target.id],[],0);
 assert.equal(restored.length,1);assert.equal(restored[0].inactiveReason,null);assert.equal(restored[0].completed,false);
 assert.equal(removeLessons([source,target],[target.id],[{studentId:"s",availableFrom:"2026-09-08"}],0)[0].inactiveReason,"available_from");
 assert.equal(source.inactiveReason,"transferred"); // immutable rollback input
});
test("009 delete source detaches target, which becomes transferable",()=>{
 const [detached]=removeLessons([source,target],[source.id],[],0);
 assert.equal(detached.isTransferTarget,false);assert.equal(detached.transferSourceId,null);assert.equal(detached.transferSourceStartsAt,null);
 assert.equal(isTransferAllowed(detached),true);assert.equal(detached.startsAt,target.startsAt);
});
test("009 batch deletes both sides and handles multiple unrelated pairs",()=>{
 assert.deepEqual(removeLessons([source,target],[source.id,target.id],[],0),[]);
 const anotherSource={...source,id:"source2"},anotherTarget={...target,id:"target2",transferSourceId:"source2"};
 const result=removeLessons([source,target,anotherSource,anotherTarget],[source.id,anotherTarget.id],[],0);
 assert.equal(result.find(l=>l.id===target.id)?.isTransferTarget,false);
 assert.equal(result.find(l=>l.id===anotherSource.id)?.inactiveReason,null);
});
test("009 status mapping and decision gates",()=>{
 for(const status of ["pending_telegram","expired"] as const) assert.equal(applicationBucket(status),null);
 assert.equal(applicationBucket("registered"),"approved");
 assert.equal(reviewAllowed("pending_review","approve"),true);
 assert.equal(reviewAllowed("approved","approve"),false);assert.equal(reviewAllowed("rejected","approve"),false);
 assert.equal(reviewAllowed("approved","resend"),true);assert.equal(reviewAllowed("registered","resend"),false);
});
test("009 two-admin mock delivery is deduplicated, failures isolated and no Telegram decision buttons",async()=>{
 const sent:string[]=[], claimed=new Set<string>(), results:boolean[]=[];let logged=0;
 const notice:AdminNotice={chat_id:"1",role:"student",full_name:"Иван Иванов",telegram_username:"ivan",subjects:["Математика"],details:"ЕГЭ"};
 const ports={recipients:async()=>[{admin_id:"one"},{admin_id:"two"}],claim:async(_:string,id:string)=>{if(claimed.has(id))return null;claimed.add(id);return {...notice,chat_id:id};},finish:async(_:string,_admin:string,ok:boolean)=>{results.push(ok);},send:async(id:string,text:string)=>{sent.push(text);if(id==="two")throw new Error("network");},log:()=>{logged++;}};
 await Promise.all([notifyApplicationAdmins("a",ports),notifyApplicationAdmins("a",ports)]);
 await notifyApplicationAdmins("a",ports);
 assert.equal(sent.length,2);assert.equal(results.filter(Boolean).length,1);assert.equal(logged,1);
 for(const text of sent) {assert.match(text,/Роль:<\/b> Ученик/);assert.match(text,/Предметы:<\/b> Математика/);assert.doesNotMatch(text,/inline_keyboard|callback_data|register\?token/);}
 assert.match(adminNotificationText({...notice,role:"tutor",details:"3–5 лет"}),/Опыт:<\/b> 3–5 лет/);
});
test("009 render contracts and token privacy",async()=>{
 const read=(f:string)=>readFile(new URL(`../${f}`,import.meta.url),"utf8");
 const css=await read("src/app/globals.css");
 assert.match(css,/input\[type="date"\].*cursor: text/);assert.doesNotMatch(css,/\.sidebar-note|\.status-dot/);
 const assignment=/\.assignment-tag \{([^}]+)\}/.exec(css)![1];assert.match(assignment,/white-space: nowrap/);assert.match(assignment,/text-overflow: ellipsis/);
 const people=await read("src/features/people/page.tsx");assert.match(people,/className="assignment-tag"[^\n]+title=/);assert.match(people,/\{" · "\}/);assert.doesNotMatch(people,/TutorGate \/ \{title\}/);
 assert.match(await read("src/components/schedule/toolbar.tsx"),/\{editable && <div className="schedule-controls-group schedule-edit-controls"/);
 assert.match(await read("src/components/schedule/calendar.tsx"),/\{editable && <span className="schedule-save-status"/);
 const hook=await read("src/app/api/telegram/webhook/route.ts");assert.doesNotMatch(hook,/p_registration_hash|updateToken|register\?token/);
 assert.doesNotMatch(await read("src/features/applications/admin-page.tsx"),/chat_id|user_id|token_hash/);
 assert.doesNotMatch(await read("src/components/shared/brand.tsx"),/PanelLeftClose/);
});
