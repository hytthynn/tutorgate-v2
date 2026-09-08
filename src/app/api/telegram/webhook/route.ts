import { botApplicationAction } from "@/features/applications/bot-actions";
import { receiveTelegram } from "@/features/chats/incoming";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { appUrl, env } from "@/lib/env";
import { safeEqual, hash } from "@/lib/auth/tokens";
import { serviceRpc } from "@/lib/supabase/admin";
import {
  sendMessage,
  sendTemplate,
  answerCallbackQuery,
  deleteMessage, editTemplate,
} from "@/lib/telegram/bot";
import { sendControlMessage } from "@/lib/telegram/control";
import { confirmationMessage, siteButton, html, escapeHtml, homeButton } from "@/lib/telegram/templates";
import { handleBotInput } from "@/features/chats/bot-handler";
import {
  notifyApplicationAdmins,
  type AdminNotice,
} from "@/features/applications/notifications";
export const runtime = "nodejs";
export const maxDuration = 300;
const peer = z.object({
  id: z.number().int().safe(),
  is_bot: z.boolean().optional(),
  username: z.string().optional(),
});
const chat = z.object({ id: z.number().int().safe(), type: z.string() });
const mediaSchema = z.object({ file_id: z.string().max(1024), file_size: z.number().int().nonnegative().safe().optional(), file_name: z.string().max(1024).optional() });
const entitiesSchema = z.array(z.object({ type: z.string().max(50), offset: z.number().int().nonnegative(), length: z.number().int().nonnegative(), url: z.string().max(2048).optional() })).max(4000);
const updateSchema = z.object({
  update_id: z.number().int().nonnegative().safe(),
  message: z
    .object({
      message_id: z.number().int().safe().optional(),
      text: z.string().max(16384).optional(),
      media_group_id: z.string().min(1).max(128).optional(),
      caption: z.string().max(16384).optional(),
      entities: entitiesSchema.optional(), caption_entities: entitiesSchema.optional(),
      document: mediaSchema.optional(), photo: z.array(mediaSchema).max(20).optional(),
      from: peer,
      chat,
      reply_to_message: z
        .object({ message_id: z.number().int().positive().safe() })
        .optional(),
    })
    .optional(),
  callback_query: z
    .object({
      id: z.string().max(256),
      from: peer,
      data: z.string().max(64).optional(),
      message: z.object({ chat, message_id: z.number().int().positive().safe().optional() }).optional(),
    })
    .optional(),
});
export async function POST(request: NextRequest) {
  if (
    !process.env.TELEGRAM_WEBHOOK_SECRET ||
    !safeEqual(
      request.headers.get("x-telegram-bot-api-secret-token") ?? "",
      env("TELEGRAM_WEBHOOK_SECRET"),
    )
  )
    return new NextResponse(null, { status: 403 });
  if (Number(request.headers.get("content-length")) > 65536)
    return new NextResponse(null, { status: 413 });
  let body;
  try {
    const reader = request.body?.getReader();
    if (!reader) return new NextResponse(null, { status: 400 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) {
        await reader.cancel();
        return new NextResponse(null, { status: 413 });
      }
      chunks.push(value);
    }
    body = updateSchema.safeParse(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (!body.success) return new NextResponse(null, { status: 400 });
  const { message, callback_query: callback, update_id } = body.data;
  const from = callback?.from ?? message?.from,
    conversation = callback?.message?.chat ?? message?.chat;
  if (
    !from ||
    !conversation ||
    conversation.type !== "private" ||
    from.is_bot ||
    from.id !== conversation.id
  )
    return NextResponse.json({ ok: true });
  const userId = String(from.id),
    chatId = String(conversation.id);
  try {
    const start =
      !callback && /^\/start(?:@\w+)?\s+(\S+)\s*$/.exec(message?.text ?? "");
    if (start && !/^contact_[0-9a-f-]{36}$/i.test(start[1])) {
      const payload = start[1];
      if (!/^[\w-]{43}$/.test(payload)) {
        await sendControlMessage(chatId, confirmationMessage("invalid", appUrl("/")), { newMessage: true });
        return NextResponse.json({ ok: true });
      }
      const result = await serviceRpc<{
        status: string;
        chat_id?: string;
        application_id?: string;
      }>("confirm_telegram", {
        p_update: update_id,
        p_hash: hash(payload),
        p_username: from.username?.toLowerCase() ?? "",
        p_user: userId,
        p_chat: chatId,
      });
      if (result.application_id)
        await notifyApplicationAdmins(result.application_id, {
          recipients: (id) =>
            serviceRpc<{ admin_id: string }[]>("application_admin_recipients", {
              p_id: id,
            }),
          claim: (id, admin) =>
            serviceRpc<AdminNotice | null>("claim_application_notification", {
              p_id: id,
              p_admin: admin,
            }),
          finish: (id, admin, success) =>
            serviceRpc("finish_application_notification", {
              p_id: id,
              p_admin: admin,
              p_success: success,
            }),
          send: (chatId, text) =>
            sendMessage(chatId, text, {
              parse_mode: "HTML",
              reply_markup: { inline_keyboard: [[siteButton(appUrl("/"))]] },
            }),
          log: () =>
            console.error("Application admin notification delivery failed"),
        });
      if (result.status !== "done") {
        await sendControlMessage(
          result.status === "send" ? result.chat_id! : chatId,
          confirmationMessage(result.status, appUrl("/")),
          { newMessage: true },
        );
        if (result.status === "send")
          await serviceRpc("telegram_delivered", { p_update: update_id });
      }
    } else
      await handleBotInput(
        {
          updateId: update_id,
          messageId: message?.message_id,
          mediaGroupId: message?.media_group_id,
          userId,
          chatId,
          text: message?.text ?? message?.caption,
          entities: message?.entities ?? message?.caption_entities,
          media: message?.document ?? message?.photo?.at(-1),
          replyId: message?.reply_to_message?.message_id,
          callbackId: callback?.id,
          callbackData: callback?.data,
          callbackMessageId: callback?.message?.message_id,
        },
        {
          applications: botApplicationAction,
          contact: async (input,id) => {
            const target = await serviceRpc<{name:string;userId:string} | null>("bot_directory_contact",{p_user:input.userId,p_chat:input.chatId,p_id:id});
            return target ? html(`<b>${escapeHtml(target.name)}</b>`,[[{text:"Открыть профиль Telegram",url:`tg://user?id=${target.userId}`}],[homeButton]]) : html("Telegram этого пользователя недоступен.",[[homeButton]]);
          },
          beginReply: input => serviceRpc("chat_bot_begin_reply",{p_user:input.userId,p_chat:input.chatId,p_message:input.callbackData!.slice(11),p_source:input.callbackMessageId}),
          remove: deleteMessage,
          edit: editTemplate,
          profile: (user, chatId) =>
            serviceRpc("chat_bot_profile", { p_user: user, p_chat: chatId }),
          tutors: (student) =>
            serviceRpc("chat_bot_tutors", { p_student: student }),
          recipient: async (student, tutor) => {
            await serviceRpc("chat_bot_clear_reply",{p_student:student});
            return serviceRpc("chat_bot_set_recipient", {
              p_student: student,
              p_tutor: tutor,
            });
          },
          clearUnavailableRecipient: (student) =>
            serviceRpc("chat_bot_clear_unavailable_recipient", { p_student: student }),
          receive: receiveTelegram,
          notificationTarget: (message) =>
            serviceRpc("chat_notification_target", { p_message: message }),
          send: sendTemplate,
          control: sendControlMessage,
          answer: answerCallbackQuery,
          url: appUrl,
          log: () => console.error("Telegram chat operation failed"),
        },
      );
    return NextResponse.json({ ok: true });
  } catch {
    console.error("Telegram webhook processing failed");
    return new NextResponse(null, { status: 503 });
  }
}
