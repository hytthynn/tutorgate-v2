import "server-only";
import { createAdminClient, serviceRpc } from "@/lib/supabase/admin";
import { sendTemplate, sendMedia } from "@/lib/telegram/bot";
import { tutorMessage, html } from "@/lib/telegram/templates";
import { plainContent, telegramContent } from "./rich-text";
import { CHAT_BUCKET } from "./attachments";
import type { ChatMessage } from "./types";

export async function deliverChat(actor: string, message: ChatMessage) {
  let chat: string | null = null, delivered = false;
  const ids: number[] = [];
  try {
    const target = await serviceRpc<{ chatId: string; tutorName: string } | null>("chat_delivery_target", { p_message: message.id, p_tutor: actor });
    if (!target) throw new Error("Unavailable");
    chat = target.chatId;
    for (const part of [...tutorMessage(actor,target.tutorName,""), ...telegramContent(message.content ?? plainContent(message.body)).map(text => html(text))]) ids.push(await sendTemplate(chat,part));
    const db = createAdminClient();
    const files = await db.from("chat_attachments").select("storage_path,original_name,mime_type,kind").eq("message_id",message.id);
    if (files.error) throw files.error;
    for (const file of files.data) {
      const object = await db.storage.from(CHAT_BUCKET).download(file.storage_path);
      if (object.error) throw object.error;
      ids.push(await sendMedia(chat,object.data,file.original_name,file.kind === "image"));
    }
    delivered = true;
  } catch { console.error("Chat Telegram delivery failed"); }
  try {
    await serviceRpc("chat_finish_delivery_parts", { p_message: message.id, p_success: delivered, p_chat: chat, p_ids: ids });
    message.delivery_status = delivered ? "sent" : "failed";
  } catch { console.error("Chat Telegram delivery audit failed"); }
  return message;
}
