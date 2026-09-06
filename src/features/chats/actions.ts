"use server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { serviceRpc } from "@/lib/supabase/admin";
import { sendTemplate } from "@/lib/telegram/bot";
import { codePointLength, tutorMessage } from "@/lib/telegram/templates";
import type { ChatMessage, ChatResult, ChatSnapshot } from "./types";
export async function chatSnapshotAction(
  student: string | null,
): Promise<ChatResult<ChatSnapshot>> {
  await requireRole(["tutor", "admin"]);
  if (student !== null && !z.uuid().safeParse(student).success)
    return { error: "Ученик не найден." };
  try {
    const db = await createClient();
    const { data, error } = await db.rpc("chat_snapshot", {
      p_student: student,
    });
    if (error) throw error;
    return { data: data as ChatSnapshot };
  } catch {
    return { error: "Не удалось загрузить чаты. Попробуйте ещё раз." };
  }
}
export async function chatUnreadAction(): Promise<ChatResult<number>> {
  await requireRole(["tutor", "admin"]);
  try {
    const db = await createClient();
    const { data, error } = await db.rpc("chat_unread");
    if (error) throw error;
    return { data: Number(data) };
  } catch {
    return { error: "Не удалось обновить непрочитанные сообщения." };
  }
}
export async function chatMarkReadAction(
  student: string,
  message: string,
): Promise<ChatResult<true>> {
  await requireRole(["tutor", "admin"]);
  if (
    !z.uuid().safeParse(student).success ||
    !z.uuid().safeParse(message).success
  )
    return { error: "Сообщение не найдено." };
  try {
    const db = await createClient();
    const { error } = await db.rpc("chat_mark_read", {
      p_student: student,
      p_message: message,
    });
    if (error) throw error;
    return { data: true };
  } catch {
    return { error: "Не удалось отметить сообщения прочитанными." };
  }
}
export async function chatSendAction(
  student: string,
  text: string,
): Promise<ChatResult<ChatMessage>> {
  const actor = await requireRole(["tutor", "admin"]);
  if (!z.uuid().safeParse(student).success)
    return { error: "Ученик не найден." };
  if (typeof text !== "string" || !text.trim() || codePointLength(text) > 4000)
    return { error: "Введите текст от 1 до 4000 символов." };
  let message: ChatMessage;
  try {
    const db = await createClient();
    const { data, error } = await db.rpc("chat_send", {
      p_student: student,
      p_text: text,
    });
    if (error) throw error;
    message = data as ChatMessage;
  } catch {
    return {
      error:
        "Не удалось сохранить сообщение. Проверьте назначение ученика и повторите попытку.",
    };
  }
  // Pending is committed before network I/O. Service-only identity never reaches the client.
  let chat: string | null = null,
    telegramId: number | null = null,
    delivered = false;
  try {
    const target = await serviceRpc<{
      chatId: string;
      tutorName: string;
      text: string;
    } | null>("chat_delivery_target", {
      p_message: message.id,
      p_tutor: actor.id,
    });
    if (!target) throw new Error("Chat unavailable");
    chat = target.chatId;
    for (const part of tutorMessage(actor.id, target.tutorName, target.text))
      telegramId = await sendTemplate(chat, part);
    delivered = true;
  } catch {
    console.error("Chat Telegram delivery failed");
  }
  try {
    await serviceRpc("chat_finish_delivery", {
      p_message: message.id,
      p_success: delivered,
      p_chat: chat,
      p_telegram: telegramId,
    });
    message.delivery_status = delivered ? "sent" : "failed";
  } catch {
    console.error("Chat Telegram delivery audit failed");
  }
  // A failed audit stays pending/unknown. Never invite duplicate resends of a committed message.
  return { data: message };
}
