"use server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/access";
import { createAdminClient, serviceRpc } from "@/lib/supabase/admin";
import { validateAttachment, validateAttachmentTotal, detectedMedia, CHAT_BUCKET, MAX_ATTACHMENTS, type AttachmentInput } from "./attachments";
import { contentSchema } from "./rich-text";
import { deliverChat } from "./delivery";
import type { ChatMessage, ChatResult } from "./types";

export async function prepareChatUpload(student: string, input: AttachmentInput): Promise<ChatResult<{ id: string; url: string }>> {
  const actor = await requireRole(["tutor","admin"]);
  try {
    z.uuid().parse(student);
    const file = validateAttachment(input), id = crypto.randomUUID();
    const path = await serviceRpc<string>("chat_prepare_upload", { p_actor: actor.id, p_student: student, p_id: id, p_name: file.name, p_size: file.size });
    const result = await createAdminClient().storage.from(CHAT_BUCKET).createSignedUploadUrl(path, { upsert: false });
    if (result.error) throw result.error;
    return { data: { id, url: result.data.signedUrl } };
  } catch { return { error: "Не удалось подготовить файл. Проверьте размер (до 10 МБ) и назначение ученика." }; }
}
export async function finalizeChatUploads(student: string, ids: string[], content: unknown): Promise<ChatResult<ChatMessage>> {
  const actor = await requireRole(["tutor","admin"]);
  try {
    z.uuid().parse(student); z.array(z.uuid()).min(1).max(MAX_ATTACHMENTS).parse(ids);
    const parsed = contentSchema.parse(content);
    const uploads = await serviceRpc<{ id: string; storage_path: string; original_name: string; claimed_size: number }[]>("chat_upload_details", { p_actor: actor.id, p_student: student, p_ids: ids });
    const files = [];
    validateAttachmentTotal(uploads.map(upload=>({size:Number(upload.claimed_size)})));
    for (const upload of uploads) {
      const result = await createAdminClient().storage.from(CHAT_BUCKET).download(upload.storage_path);
      if (result.error) throw result.error;
      validateAttachment({ name: upload.original_name, size: result.data.size, type: result.data.type });
      if (result.data.size !== Number(upload.claimed_size)) throw new Error("Size mismatch");
      const type = detectedMedia(new Uint8Array(await result.data.slice(0,32).arrayBuffer())) ?? "application/octet-stream";
      files.push({ id: upload.id, size: result.data.size, type });
      validateAttachmentTotal(files);
    }
    const message = await serviceRpc<ChatMessage>("chat_finalize_uploads", { p_actor: actor.id, p_student: student, p_content: parsed, p_files: files });
    return { data: await deliverChat(actor.id,message) };
  } catch { return { error: "Не удалось подтвердить отправку файлов. Обновите историю перед повторной отправкой." }; }
}
export async function chatAttachmentUrl(id: string): Promise<ChatResult<string>> {
  const actor = await requireRole(["tutor","admin"]);
  try {
    z.uuid().parse(id);
    const file = await serviceRpc<{ storage_path: string; original_name: string } | null>("chat_attachment_access", { p_actor: actor.id, p_id: id });
    if (!file) throw new Error("Unavailable");
    const result = await createAdminClient().storage.from(CHAT_BUCKET).createSignedUrl(file.storage_path,60,{ download: file.original_name });
    if (result.error) throw result.error;
    return { data: result.data.signedUrl };
  } catch { return { error: "Файл недоступен. Проверьте назначение ученика." }; }
}
