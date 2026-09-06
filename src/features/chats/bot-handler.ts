import {
  chatStatusMessage,
  pickerMessage,
  recipientMessage,
  startMessage,
  studentNotification,
  codePointLength,
  type BotTutor,
  type TelegramMessage,
} from "@/lib/telegram/templates";
export type BotProfile = {
  id: string;
  role: "student" | "tutor" | "admin";
  name: string;
};
export type BotInput = {
  updateId: number;
  userId: string;
  chatId: string;
  text?: string;
  replyId?: number;
  callbackId?: string;
  callbackData?: string;
};
export type ReceiveResult = {
  status: string;
  messageId?: string;
  studentId?: string;
  tutorId?: string;
  studentName?: string;
  text?: string;
};
export type BotPorts = {
  profile: (user: string, chat: string) => Promise<BotProfile | null>;
  tutors: (student: string) => Promise<BotTutor[]>;
  recipient: (student: string, tutor: string | null) => Promise<unknown>;
  receive: (input: BotInput) => Promise<ReceiveResult>;
  notificationTarget: (message: string) => Promise<string | null>;
  send: (chat: string, message: TelegramMessage) => Promise<unknown>;
  answer: (callback: string) => Promise<unknown>;
  url: (path: string) => string;
  log: () => void;
};
/** Pure orchestration for the normal bot workflow. Deep-link confirmation stays separate. */
export async function handleBotInput(input: BotInput, ports: BotPorts) {
  const home = ports.url("/"),
    send = (m: TelegramMessage) => ports.send(input.chatId, m);
  if (input.callbackId) {
    try {
      await ports.answer(input.callbackId);
    } catch {
      ports.log();
    }
    if (!input.callbackData) return;
  }
  const profile = await ports.profile(input.userId, input.chatId);
  if (input.callbackData === "chat:cancel") {
    if (profile?.role === "student") await ports.recipient(profile.id, null);
    return;
  }
  if (!profile || /^\/start(?:@\w+)?\s*$/.test(input.text ?? "")) {
    await send(startMessage(profile?.role, home));
    return;
  }
  if (profile.role !== "student") {
    await send(
      chatStatusMessage(
        profile.role,
        profile.role === "tutor" ? ports.url("/tutor/chats") : home,
      ),
    );
    return;
  }
  const unavailable = async () =>
    send(
      chatStatusMessage(
        "unavailable",
        home,
        (await ports.tutors(profile.id)).length > 0,
      ),
    );
  if (input.callbackData) {
    const tutors = await ports.tutors(profile.id);
    if (
      input.callbackData === "chat:choose" ||
      /^chat:page:\d+$/.test(input.callbackData)
    ) {
      if (!tutors.length) {
        await ports.recipient(profile.id, null);
        await send(chatStatusMessage("no_tutors", home));
      } else if (tutors.length === 1) {
        try {
          await ports.recipient(profile.id, tutors[0].id);
        } catch {
          await unavailable();
          return;
        }
        await send(recipientMessage(tutors[0].name));
      } else
        await send(
          pickerMessage(
            tutors,
            input.callbackData.startsWith("chat:page:")
              ? Number(input.callbackData.slice(10))
              : 0,
          ),
        );
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
  if (input.text === undefined || !input.text.trim()) {
    await send(chatStatusMessage("attachment", home));
    return;
  }
  if (codePointLength(input.text) > 4000) {
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
    if (target)
      await ports.send(
        target,
        studentNotification(
          result.studentName!,
          result.text!,
          ports.url(`/tutor/chats?student=${result.studentId}`),
        ),
      );
  } catch {
    ports.log();
  }
  try {
    await send(chatStatusMessage("sent", home));
  } catch {
    ports.log();
  }
}
