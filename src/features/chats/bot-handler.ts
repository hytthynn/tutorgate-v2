import type { TelegramEntity } from "./rich-text";
import {
  html, sentReceipt,
  chatStatusMessage,
  pickerMessage,
  recipientMessage,
  startMessage,
  studentNotification,
  codePointLength,
  type BotTutor,
  type TelegramMessage,
} from "@/lib/telegram/templates";
import type { ControlOptions } from "./control-message";
export type BotProfile = {
  id: string;
  role: "student" | "tutor" | "admin";
  name: string;
};
export type BotInput = {
  updateId: number;
  messageId?: number;
  mediaGroupId?: string;
  userId: string;
  chatId: string;
  text?: string;
  entities?: TelegramEntity[];
  media?: import("./telegram-media").IncomingMedia;
  replyId?: number;
  callbackId?: string;
  callbackData?: string;
  callbackMessageId?: number;
};
export type ReceiveResult = {
  status: string;
  albumContinuation?: boolean;
  messageId?: string;
  studentId?: string;
  tutorId?: string;
  studentName?: string;
  text?: string;
  replyTelegramId?: number;
  originalText?: string;
  controlId?: number;
  tutorName?: string;
};
export type BotPorts = {
  contact?: (input: BotInput, id: string) => Promise<TelegramMessage>;
  beginReply?: (input: BotInput) => Promise<{name:string}>;
  remove?: (chat: string, message: number) => Promise<unknown>;
  edit?: (chat: string, message: number, content: TelegramMessage) => Promise<boolean>;
  applications?: (input: BotInput) => Promise<TelegramMessage>;
  profile: (user: string, chat: string) => Promise<BotProfile | null>;
  tutors: (student: string) => Promise<BotTutor[]>;
  recipient: (student: string, tutor: string | null) => Promise<unknown>;
  clearUnavailableRecipient: (student: string) => Promise<unknown>;
  receive: (input: BotInput) => Promise<ReceiveResult>;
  notificationTarget: (message: string) => Promise<{ chatId: string; role: "tutor" | "admin" } | null>;
  send: (chat: string, message: TelegramMessage) => Promise<unknown>;
  control: (chat: string, message: TelegramMessage, options?: ControlOptions) => Promise<unknown>;
  answer: (callback: string) => Promise<unknown>;
  url: (path: string) => string;
  log: () => void;
};
/** Pure orchestration for the normal bot workflow. Deep-link confirmation stays separate. */
export async function handleBotInput(input: BotInput, ports: BotPorts) {
  const home = ports.url("/"),
    send = (m: TelegramMessage) => ports.control(input.chatId, m, {
      newMessage: !input.callbackId,
      sourceMessageId: input.callbackMessageId,
    });
  if (input.callbackId) {
    try {
      await ports.answer(input.callbackId);
    } catch {
      ports.log();
    }
    if (!input.callbackData) return;
  }
  const profile = await ports.profile(input.userId, input.chatId);
  const contact = /^\/start(?:@\w+)?\s+contact_([0-9a-f-]{36})\s*$/i.exec(input.text ?? "");
  if (contact) {
    await send(profile?.role === "admin" && ports.contact ? await ports.contact(input,contact[1]) : html("Профиль доступен только администратору TutorGate."));
    return;
  }
  if (profile?.role === "admin" && ports.applications && /^(menu:(apps|approved):|app:)/.test(input.callbackData ?? "")) { await send(await ports.applications(input)); return; }
  if (input.callbackData === "menu:home") { if(profile?.role==="student")await ports.recipient(profile.id,null); await send(startMessage(profile?.role,home)); return; }
  if (input.callbackData === "chat:cancel") {
    if (profile?.role === "student") {
      await ports.recipient(profile.id, null);
      const tutors = await ports.tutors(profile.id);
      await send(tutors.length ? pickerMessage(tutors) : chatStatusMessage("no_tutors",home));
    } else await send(startMessage(profile?.role, home));
    return;
  }
  if (!profile || /^\/start(?:@\w+)?\s*$/.test(input.text ?? "")) {
    if(profile?.role==="student")await ports.recipient(profile.id,null);
    await send(startMessage(profile?.role, home));
    return;
  }
  if (profile.role !== "student") {
    await send(
      chatStatusMessage(
        profile.role,
        ports.url(`/${profile.role}/chats`),
      ),
    );
    return;
  }
  const unavailable = async () => {
    await ports.clearUnavailableRecipient(profile.id);
    return send(chatStatusMessage("unavailable", home, (await ports.tutors(profile.id)).length > 0));
  };
  if (input.callbackData) {
    const tutors = await ports.tutors(profile.id);
    if (input.callbackData.startsWith("chat:reply:") && ports.beginReply) {
      try { const target=await ports.beginReply(input); await ports.control(input.chatId,recipientMessage(target.name),{newMessage:true}); }
      catch { await unavailable(); }
      return;
    }
    if (
      input.callbackData === "chat:choose" ||
      /^chat:page:\d+$/.test(input.callbackData)
    ) {
      if (!tutors.length) {
        await ports.recipient(profile.id, null);
        await send(chatStatusMessage("no_tutors", home));
      } else {
        await ports.recipient(profile.id,null);
        await send(
          pickerMessage(
            tutors,
            input.callbackData.startsWith("chat:page:")
              ? Number(input.callbackData.slice(10))
              : 0,
          ),
        );
      }
    } else if (input.callbackData.startsWith("chat:to:")) {
      const tutor = tutors.find((t) => t.id === input.callbackData!.slice(8));
      if (!tutor) {
        await unavailable();
        return;
      }
      try {
        await ports.recipient(profile.id, tutor.id);
      } catch {
        await unavailable();
        return;
      }
      await send(recipientMessage(tutor.name));
    }
    return;
  }
  if (!input.media && (input.text === undefined || !input.text.trim())) {
    await send(chatStatusMessage("attachment", home));
    return;
  }
  if (codePointLength(input.text ?? "") > 4000) {
    await send(chatStatusMessage("too_long", home));
    return;
  }
  let result: ReceiveResult;
  try {
    result = await ports.receive(input);
  } catch {
    ports.log();
    await send(chatStatusMessage("error", home));
    return;
  }
  if (result.status === "too_large") { await send(html("⚠️ <b>Общий размер файлов не должен превышать 10 МБ</b>")); return; }
  if (result.status === "too_many" || result.status === "too_long") { await send(html(result.status === "too_many" ? "Не больше 10 файлов в сообщении." : "Подписи альбома не должны превышать 4000 символов.")); return; }
  if (result.status === "duplicate") return;
  if (result.status === "unavailable") {
    await unavailable();
    return;
  }
  if (result.status !== "sent") {
    await send(
      chatStatusMessage(result.status === "choose" ? "choose" : "error", home),
    );
    return;
  }
  // DB is already committed. Notifications are at-most-once attempts; webhook retries do not duplicate messages.
  try {
    const target = await ports.notificationTarget(result.messageId!);
    if (target && !result.albumContinuation)
      await ports.send(
        target.chatId,
        studentNotification(
          result.studentName!,
          result.text || (input.media ? "📎 Файл" : ""),
          ports.url(`/${target.role}/chats?student=${result.studentId}`),
        ),
      );
  } catch {
    ports.log();
  }
  try {
    const receipt=sentReceipt(result.tutorId!,result.tutorName ?? "",result.text || (input.media ? `📎 ${input.media.file_name ?? "Изображение"}` : ""),result.originalText ?? undefined);
    const edited=result.replyTelegramId && ports.edit ? await ports.edit(input.chatId,result.replyTelegramId,receipt) : false;
    if(!edited)await ports.control(input.chatId,receipt,{newMessage:!result.albumContinuation});
    // Delete only after the receipt exists. Delivery failure preserves the user's input.
    for(const id of [input.messageId,result.controlId]) if(id && id!==result.replyTelegramId && ports.remove) {
      try { await ports.remove(input.chatId,id); } catch { ports.log(); }
    }
  } catch {
    ports.log();
  }
}
