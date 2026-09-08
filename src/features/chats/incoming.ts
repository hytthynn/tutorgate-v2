import "server-only";
import { createAdminClient, serviceRpc } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { CHAT_BUCKET, MAX_ATTACHMENT_BYTES, detectedImage, validateAttachment } from "./attachments";
import { contentSchema, fromTelegram } from "./rich-text";
import type { BotInput, ReceiveResult } from "./bot-handler";

export async function receiveTelegram(input: BotInput): Promise<ReceiveResult> {
  const replyId = input.replyId ?? await serviceRpc<number | null>("chat_bot_reply_context",{p_user:input.userId,p_chat:input.chatId});
  const content = contentSchema.parse(fromTelegram(input.text ?? "",input.entities));
  let file: { id: string; path: string; name: string; size: number; type: string } | null = null;
  const db = createAdminClient();
  if (input.media) {
    if (!input.media.file_size) return { status: "error" };
    if (input.media.file_size > MAX_ATTACHMENT_BYTES) return { status: "too_large" };
    const target = await serviceRpc<{ status: string; student: string; tutor: string }>(input.mediaGroupId ? "chat_bot_album_target" : "chat_bot_media_target", { p_user: input.userId, p_chat: input.chatId, p_reply: replyId, ...(input.mediaGroupId ? {p_group:input.mediaGroupId,p_update:input.updateId} : {}) });
    if (target.status !== "ok") return target;
    const response = await fetch(`https://api.telegram.org/bot${env("TELEGRAM_BOT_TOKEN")}/getFile`,{ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file_id: input.media.file_id }), signal: AbortSignal.timeout(8000) });
    const metadata = await response.json();
    const path: unknown = metadata.result?.file_path;
    if (!response.ok || !metadata.ok || typeof path !== "string" || !/^[a-zA-Z0-9_./-]+$/.test(path) || path.includes("..")) throw new Error("Invalid file metadata");
    const download = await fetch(`https://api.telegram.org/file/bot${env("TELEGRAM_BOT_TOKEN")}/${path}`,{ signal: AbortSignal.timeout(30000) });
    if (!download.ok || !download.body) throw new Error("Download failed");
    const reader = download.body.getReader(); let size = 0; const chunks: Uint8Array[] = [];
    for (;;) {
      const { done,value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_ATTACHMENT_BYTES) { await reader.cancel(); return { status: "too_large" }; }
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks), type = detectedImage(bytes) ?? "application/octet-stream";
    const normalized = validateAttachment({ name: input.media.file_name ?? "Изображение", size, type });
    const id = crypto.randomUUID();
    const storagePath = await serviceRpc<string>("chat_prepare_upload",{ p_actor: target.tutor, p_student: target.student, p_id: id, p_name: normalized.name, p_size: size });
    file = { id, path: storagePath, name: normalized.name, size, type };
    const uploaded = await db.storage.from(CHAT_BUCKET).upload(file.path,bytes,{ contentType: type, upsert: false });
    if (uploaded.error) throw uploaded.error;
  }
  // On an uncertain RPC response keep the object: the transaction may have committed.
  const result = await serviceRpc<ReceiveResult>(input.mediaGroupId ? "chat_bot_receive_album" : "chat_bot_receive_flow",{ p_user: input.userId, p_chat: input.chatId, p_update: input.updateId, p_text: input.text ?? "", ...(input.mediaGroupId ? {p_group:input.mediaGroupId} : {p_reply:replyId}), p_content: content, p_file: file });
  if (file && result.status !== "sent") await db.storage.from(CHAT_BUCKET).remove([file.path]);
  return result;
}
