import test from "node:test";
import assert from "node:assert/strict";
import { effectiveLessonColor, isTimeLocked, isTransferAllowed } from "../src/features/schedule/operations";
import type { ScheduleLesson } from "../src/features/schedule/types";
import { contentSchema, fromTelegram, plainText, telegramContent, safeLink } from "../src/features/chats/rich-text";
import { MAX_ATTACHMENT_BYTES, detectedImage, validateAttachment } from "../src/features/chats/attachments";
import { startMessage } from "../src/lib/telegram/templates";
import { selectLeft } from "../src/components/ui/select-position";
const lesson: ScheduleLesson = { id:"l",tutorId:"t",studentId:"s",studentName:"Student",tutorName:"Tutor",subjectId:null,subjectName:"Subject",startsAt:"2026-09-07T10:00:00Z",endsAt:"2026-09-07T11:00:00Z",durationMinutes:60,color:"coral",completed:false };
test("014 Select center and viewport clamps",()=>{
  assert.equal(selectLeft(400,100,200,1440),350);
  assert.equal(selectLeft(10,50,200,320),12);
  assert.equal(selectLeft(280,30,200,320),108);
});
test("014 status precedence preserves base and coral temporal lock",()=>{
  for (const l of [lesson,{...lesson,isTransferTarget:true},{...lesson,completed:true}]) { assert.equal(isTimeLocked(l),true); assert.equal(isTransferAllowed(l),false); }
  assert.equal(effectiveLessonColor(lesson),"coral");
  assert.equal(effectiveLessonColor({...lesson,isTransferTarget:true}),"blue");
  assert.equal(effectiveLessonColor({...lesson,isTransferTarget:true,completed:true}),"green");
  assert.equal(effectiveLessonColor({...lesson,isTransferTarget:true,completed:true,inactiveReason:"transferred"}),"gray");
  assert.equal(lesson.color,"coral");
});
test("014 rich text rejects unsafe URLs and emits balanced, escaped Telegram HTML",()=>{
  for (const href of ["javascript:alert(1)","data:text/html,x","file:///etc/passwd"," https://safe.test"]) {
    assert.equal(safeLink(href),false);
    assert.equal(contentSchema.safeParse([{text:"x",marks:[{type:"link",href}]}]).success,false);
  }
  const text="😀 <>& "+"x".repeat(3980);
  const c=fromTelegram(text,[{type:"bold",offset:3,length:text.length-3},{type:"italic",offset:4,length:2}]);
  assert.equal(plainText(c),text);
  const parts=telegramContent(c); assert.ok(parts.length>1);
  for (const part of parts) { assert.ok(part.length<=3900); assert.equal((part.match(/<b>/g)??[]).length,(part.match(/<\/b>/g)??[]).length); }
  assert.match(parts.join(""),/&lt;/);
  assert.deepEqual(fromTelegram("link",[{type:"text_link",offset:0,length:4,url:"javascript:bad"}])[0].marks,[]);
});
test("014 attachment boundary, name sanitation and magic detection",()=>{
  assert.equal(validateAttachment({name:"../a.html",size:MAX_ATTACHMENT_BYTES,type:"text/html"}).name,".._a.html");
  for(const size of [0,-1,1.5,MAX_ATTACHMENT_BYTES+1]) assert.throws(()=>validateAttachment({name:"x",size,type:"text/plain"}));
  assert.equal(detectedImage(new TextEncoder().encode("<svg><script>bad</script>")),null);
  assert.equal(detectedImage(new Uint8Array([255,216,255,0])),"image/jpeg");
});
test("014 role menus and callbacks fit Telegram byte limit",()=>{
  for(const role of ["student","tutor","admin"]) {
    const rows=startMessage(role,"https://fixture.example").options.reply_markup!.inline_keyboard.flat();
    assert.ok(rows.some(b=>"url" in b && b.url==="https://t.me/tutorgate"));
    for(const b of rows) if("callback_data" in b) assert.ok(Buffer.byteLength(b.callback_data)<=64);
    assert.equal(rows.some(b=>"callback_data" in b && b.callback_data.startsWith("menu:apps")),role==="admin");
  }
});
