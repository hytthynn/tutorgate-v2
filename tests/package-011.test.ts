import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  startMessage,
  registrationMessage,
  resetMessage,
  tutorMessage,
  escapeHtml,
  recipientMessage,
  pickerMessage,
  studentNotification,
} from "../src/lib/telegram/templates";
import {
  handleBotInput,
  type BotPorts,
  type BotInput,
  type BotProfile,
} from "../src/features/chats/bot-handler";
import {
  initialSubject,
  lessonChoices,
} from "../src/features/schedule/lesson-form-state";
import { chatDateLabel } from "../src/features/chats/dates";
import type {
  ScheduleData,
  ScheduleLesson,
} from "../src/features/schedule/types";
import type { LessonInput } from "../src/features/schedule/validation";
const read = (f: string) =>
  readFile(new URL(`../${f}`, import.meta.url), "utf8");
const url = "https://fixture.example";
test("011 start catalogue and secret URLs only in inline keyboards", () => {
  for (const role of ["student", "tutor", "admin", undefined]) {
    const m = startMessage(role, url);
    assert.match(m.text, /Добро пожаловать/);
    assert.equal(
      m.options.reply_markup!.inline_keyboard.flat().length,
      role === "student" ? 2 : 1,
    );
  }
  for (const m of [
    registrationMessage("approve", url + "/register?token=SECRET"),
    registrationMessage("resend", url + "/register?token=SECRET"),
    resetMessage(url + "/reset-password?token=SECRET"),
  ]) {
    assert.doesNotMatch(m.text, /SECRET|https:|token=/);
    assert.match(JSON.stringify(m.options), /SECRET/);
  }
});
test("011 escapes all dynamic HTML; long text remains intact and notification has no reply action", () => {
  assert.equal(escapeHtml("<b>&</b>"), "&lt;b&gt;&amp;&lt;/b&gt;");
  assert.match(recipientMessage("<X>").text, /&lt;X&gt;/);
  const text = "<>&".repeat(1333) + "!";
  const parts = tutorMessage("00000000-0000-4000-8000-000000000002", "И".repeat(150), text);
  assert.equal(parts.length, 2);
  assert.equal(parts[1].text, text);
  assert.equal(parts[1].options.parse_mode, undefined);
  assert.match(tutorMessage("00000000-0000-4000-8000-000000000002", "<X>", "<script>")[0].text, /&lt;script&gt;/);
  const m = studentNotification(
    "Student",
    "x".repeat(4000),
    url + "/tutor/chats?student=id",
  );
  assert.equal(m.options.reply_markup!.inline_keyboard.flat().length, 1);
  assert.doesNotMatch(JSON.stringify(m), /callback_data|Ответить/);
  const picker = pickerMessage(
    Array.from({ length: 30 }, (_, n) => ({
      id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
      name: "Tutor",
      subjects: "A, B",
    })),
    1,
  );
  for (const b of picker.options.reply_markup!.inline_keyboard.flat())
    if ("callback_data" in b)
      assert.ok(Buffer.byteLength(b.callback_data) <= 64);
});
const empty: ScheduleData = {
  now: "2026-09-06",
  role: "tutor",
  week: "2026-08-31",
  offset: 0,
  lessons: [],
  students: [],
  subjects: [],
  assignments: [],
};
const draft: LessonInput = {
  studentId: "s",
  subjectId: null,
  subjectChanged: true,
  date: "2026-09-06",
  time: "12:00",
  durationMinutes: 60,
  note: "",
};
test("011 sentinel only for unchanged existing historical lesson; explicit empty selectors", () => {
  const lesson = {
    id: "l",
    studentId: "s",
    subjectId: null,
    subjectName: "История",
  } as ScheduleLesson;
  assert.equal(initialSubject(null, draft), "");
  assert.equal(initialSubject(null, { ...draft, subjectChanged: false }), "");
  assert.equal(initialSubject(lesson), "__historical__");
  assert.equal(initialSubject(lesson, draft), "");
  assert.equal(
    initialSubject(lesson, { ...draft, subjectChanged: false }),
    "__historical__",
  );
  assert.equal(
    lessonChoices(empty, "").studentPlaceholder,
    "Нет доступных учеников",
  );
  assert.equal(
    lessonChoices(empty, "").subjectPlaceholder,
    "Сначала выберите ученика",
  );
  assert.equal(
    lessonChoices(empty, "s").subjectPlaceholder,
    "Нет доступных предметов",
  );
  assert.equal(
    lessonChoices(
      {
        ...empty,
        subjects: [{ id: "a", name: "A" }],
        assignments: [{ studentId: "other", subjectId: "a" }],
      },
      "s",
    ).subjects.length,
    0,
  );
});
test("011 date separators use MSK midnight", () => {
  const now = new Date("2026-09-06T22:00:00Z");
  assert.equal(chatDateLabel("2026-09-06T21:30:00Z", now), "Сегодня");
  assert.equal(chatDateLabel("2026-09-06T18:00:00Z", now), "Вчера");
  assert.equal(chatDateLabel("2026-08-01T12:00:00Z", now), "01.08.2026");
});
function fixture(role: BotProfile["role"] = "student") {
  const sent: string[] = [],
    received: BotInput[] = [],
    answers: string[] = [];
  let recipient: string | null = null;
  const ports: BotPorts = {
    profile: async () => ({ id: "s", role, name: "Student" }),
    tutors: async () => [{ id: "t", name: "Tutor", subjects: "A, B" }],
    recipient: async (_, t) => {
      recipient = t;
    },
    clearUnavailableRecipient: async () => { if (!(await ports.tutors("s")).some(t=>t.id===recipient)) recipient=null; },
    receive: async (i) => {
      received.push(i);
      return {
        status: "sent",
        messageId: "m",
        studentId: "s",
        studentName: "Student",
        text: i.text,
      };
    },
    notificationTarget: async () => ({chatId: "tutor-chat", role: "tutor"}),
    send: async (_, m) => {
      sent.push(m.text);
    },
    answer: async (id) => {
      answers.push(id);
    },
    url: (path) => url + path,
    log: () => {},
  };
  return {
    ports,
    sent,
    received,
    answers,
    get recipient() {
      return recipient;
    },
  };
}
const input: BotInput = {
  updateId: 1,
  userId: "1",
  chatId: "1",
  text: "Hello",
};
test("011 one tutor shortcut, pagination, visible cancel", async () => {
  const f = fixture();
  await handleBotInput(
    { ...input, callbackId: "c", callbackData: "chat:choose" },
    f.ports,
  );
  assert.equal(f.recipient, "t");
  assert.match(f.sent[0], /Вы пишете/);
  await handleBotInput(
    { ...input, callbackId: "cancel", callbackData: "chat:cancel" },
    f.ports,
  );
  assert.equal(f.recipient, null);
  assert.equal(f.sent.length, 2);
  assert.equal(f.sent[1], "✅ Действие отменено.");
  assert.deepEqual(f.answers, ["c", "cancel"]);
  f.ports.tutors = async () => [
    { id: "a", name: "A", subjects: "A" },
    { id: "b", name: "B", subjects: "B" },
  ];
  await handleBotInput(
    { ...input, callbackId: "c2", callbackData: "chat:choose" },
    f.ports,
  );
  assert.match(f.sent.at(-1)!, /Выберите репетитора/);
});
test("011 Reply passed to atomic DB resolver; duplicate update has no notification", async () => {
  const f = fixture();
  await handleBotInput({ ...input, replyId: 123 }, f.ports);
  assert.equal(f.received[0].replyId, 123);
  assert.equal(f.sent.length, 2);
  f.ports.receive = async () => ({ status: "duplicate" });
  await handleBotInput(input, f.ports);
  assert.equal(f.sent.length, 2);
});
test("011 tutor/admin text and student nontext/oversize never reach chat insert", async () => {
  for (const role of ["tutor", "admin"] as const) {
    const f = fixture(role);
    await handleBotInput(input, f.ports);
    assert.equal(f.received.length, 0);
  }
  for (const text of [undefined, " ", "x".repeat(4001)]) {
    const f = fixture();
    await handleBotInput({ ...input, text }, f.ports);
    assert.equal(f.received.length, 0);
    assert.equal(f.sent.length, 1);
  }
});
test("011 removed assignment, DB failure, notification failure have distinct safe outcomes", async () => {
  const f = fixture();
  f.ports.receive = async () => ({ status: "unavailable" });
  await handleBotInput(input, f.ports);
  assert.match(f.sent[0], /Чат больше недоступен/);
  f.ports.receive = async () => {
    throw Error("db");
  };
  await handleBotInput(input, f.ports);
  assert.match(f.sent.at(-1)!, /Не удалось отправить/);
  const g = fixture();
  g.ports.notificationTarget = async () => {
    throw Error("notify");
  };
  await handleBotInput(input, g.ports);
  assert.equal(g.received.length, 1);
  assert.match(g.sent[0], /Сообщение отправлено/);
});
test("011 source boundaries: role checks, visible polling, bounded read marker and callback commands", async () => {
  assert.equal(
    (
      (await read("src/features/chats/actions.ts")).match(
        /requireRole\(\["tutor", "admin"\]\)/g,
      ) ?? []
    ).length,
    4,
  );
  const view = await read("src/components/chats/chat-view.tsx");
  assert.match(view, /chatMarkReadAction\(selected,\s*lastId\)/);
  assert.match(view, /последние 200/);
  assert.doesNotMatch(view, /telegram_chat_id|SUPABASE_SECRET_KEY|serviceRpc/);
  assert.match(await read("src/features/chats/use-visible-polling.ts"), /5000/);
  const hook = await read("scripts/set-webhook.mjs");
  assert.match(hook, /\["message", "callback_query"\]/);
  assert.match(hook, /setMyCommands/);
});


test("012 reply button binds trusted teacher ID to last part, including emoji and byte limit",()=>{
 const teacher="00000000-0000-4000-8000-000000000001";
 for(const [name,body] of [["Admin","Hello"],["Long".repeat(40),"😀".repeat(4000)]]){
 const parts=tutorMessage(teacher,name,body),button=parts.at(-1)!.options.reply_markup!.inline_keyboard[0][0];
 assert.deepEqual(button,{text:"↩️ Ответить",callback_data:`chat:to:${teacher}`});
 if("callback_data" in button)assert.ok(Buffer.byteLength(button.callback_data)<=64);
 if(parts.length>1)assert.equal(parts[0].options.reply_markup,undefined);
 }
});
test("012 repeated cancel visible, stale cancel safe, removed reply recipient cleared",async()=>{
 const f=fixture();
 const messages:ReturnType<typeof startMessage>[]=[];f.ports.send=async(_,m)=>{messages.push(m);};
 await handleBotInput({...input,callbackId:"select",callbackData:"chat:to:t"},f.ports);assert.equal(f.recipient,"t");
 for(let n=0;n<2;n++)await handleBotInput({...input,callbackId:`cancel${n}`,callbackData:"chat:cancel"},f.ports);
 assert.equal(f.recipient,null);assert.equal(messages.filter(m=>m.text==="✅ Действие отменено.").length,2);
 assert.equal(messages.at(-1)!.options.reply_markup!.inline_keyboard.flat().length,2);
 f.ports.receive=async()=>({status:f.recipient?"sent":"choose"});await handleBotInput(input,f.ports);assert.match(messages.at(-1)!.text,/Сначала укажите/);
 await handleBotInput({...input,callbackId:"select2",callbackData:"chat:to:t"},f.ports);
 await handleBotInput({...input,callbackId:"other-stale",callbackData:"chat:to:removed"},f.ports);assert.equal(f.recipient,"t");
 f.ports.tutors=async()=>[];await handleBotInput({...input,callbackId:"stale-reply",callbackData:"chat:to:t"},f.ports);assert.equal(f.recipient,null);assert.match(messages.at(-1)!.text,/Чат больше недоступен/);
 f.ports.profile=async()=>null;f.ports.recipient=async()=>{throw Error("Stale mutation");};
 await handleBotInput({...input,callbackId:"stale-cancel",callbackData:"chat:cancel"},f.ports);assert.match(messages.at(-1)!.text,/не связан/);
 for(const role of ["tutor","admin"] as const){const g=fixture(role);g.ports.recipient=async()=>{throw Error("Wrong role mutation");};await handleBotInput({...input,callbackId:"cancel",callbackData:"chat:cancel"},g.ports);assert.match(g.sent[0],/Добро пожаловать/);}
});
test("012 assigned admin shortcut and notification use admin chat route",async()=>{
 const f=fixture();const sent:ReturnType<typeof startMessage>[]=[];f.ports.send=async(_,m)=>{sent.push(m);};
 f.ports.tutors=async()=>[{id:"admin",name:"Admin Teacher",subjects:"Math"}];
 await handleBotInput({...input,callbackId:"choose",callbackData:"chat:choose"},f.ports);assert.equal(f.recipient,"admin");
 f.ports.notificationTarget=async()=>({chatId:"admin-chat",role:"admin"});await handleBotInput(input,f.ports);
 assert.match(JSON.stringify(sent),/https:\/\/fixture.example\/admin\/chats\?student=s/);
});
