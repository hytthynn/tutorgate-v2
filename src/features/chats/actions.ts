"use server";
import { contentSchema, plainText, plainContent } from "./rich-text";
import { z } from "zod";
import { requireRole } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { deliverChat } from "./delivery";
import { codePointLength } from "@/lib/telegram/templates";
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
  content?: unknown,
): Promise<ChatResult<ChatMessage>> {
  const actor = await requireRole(["tutor", "admin"]);
  if (!z.uuid().safeParse(student).success)
    return { error: "Ученик не найден." };
  if (typeof text !== "string" || !text.trim() || codePointLength(text) > 4000)
    return { error: "Введите текст от 1 до 4000 символов." };
  const parsed = contentSchema.safeParse(content ?? plainContent(text));
  if (!parsed.success || plainText(parsed.data) !== text) return { error: "Проверьте форматирование сообщения." };
  let message: ChatMessage;
  try {
    const db = await createClient();
    const { data, error } = await db.rpc("chat_send_rich", {
      p_student: student,
      p_content: parsed.data,
    });
    if (error) throw error;
    message = data as ChatMessage;
  } catch {
    return {
      error:
        "Не удалось сохранить сообщение. Проверьте назначение ученика и повторите попытку.",
    };
  }
  return { data: await deliverChat(actor.id, message) };
}

export async function chatUpdatesAction(student: string | null, after: string, version: string): Promise<ChatResult<ChatSnapshot>> {
  await requireRole(["tutor","admin"]);
  try {
    if (student !== null) z.uuid().parse(student);
    z.string().regex(/^\d{1,19}$/).parse(after); z.string().regex(/^\d{1,19}$/).parse(version);
    const { data, error } = await (await createClient()).rpc("chat_updates", { p_student: student, p_after: after, p_version: version });
    if (error) throw error;
    return { data: data as ChatSnapshot };
  } catch { return { error: "Не удалось обновить чат." }; }
}

export async function chatPreviousAction(student: string, before: string, id: string): Promise<ChatResult<ChatMessage[]>> {
  await requireRole(["tutor","admin"]);
  try {
    z.uuid().parse(student); z.uuid().parse(id); z.iso.datetime({ offset: true }).parse(before);
    const { data, error } = await (await createClient()).rpc("chat_previous", { p_student: student, p_before: before, p_id: id });
    if (error) throw error; return { data: data as ChatMessage[] };
  } catch { return { error: "Не удалось загрузить предыдущие сообщения." }; }
}
