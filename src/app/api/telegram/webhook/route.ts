import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { safeEqual, hash } from "@/lib/auth/tokens";
import { serviceRpc } from "@/lib/supabase/admin";
import { sendMessage } from "@/lib/telegram/bot";
import { notifyApplicationAdmins, type AdminNotice } from "@/features/applications/notifications";
export const runtime = "nodejs";
export const maxDuration = 300;
const updateSchema = z.object({
  update_id: z.number().int().nonnegative().safe(),
  message: z
    .object({
      text: z.string().max(4096).optional(),
      from: z.object({
        id: z.number().int().safe(),
        is_bot: z.boolean().optional(),
        username: z.string().optional(),
      }),
      chat: z.object({ id: z.number().int().safe(), type: z.string() }),
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
  if (Number(request.headers.get("content-length")) > 16384)
    return new NextResponse(null, { status: 413 });
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 16384) return new NextResponse(null, { status: 413 });
    body = updateSchema.safeParse(JSON.parse(raw));
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (!body.success) return new NextResponse(null, { status: 400 });
  const { message, update_id } = body.data;
  if (
    !message ||
    message.chat.type !== "private" ||
    message.from.is_bot ||
    message.from.id !== message.chat.id
  )
    return NextResponse.json({ ok: true });
  const payload = /^\/start(?:@\w+)?\s+([\w-]{43})$/.exec(
    message.text ?? "",
  )?.[1];
  if (!payload) return NextResponse.json({ ok: true });
  try {
    const result = await serviceRpc<{ status: string; chat_id?: string; application_id?: string }>(
      "confirm_telegram",
      {
        p_update: update_id,
        p_hash: hash(payload),
        p_username: message.from.username?.toLowerCase() ?? "",
        p_user: String(message.from.id),
        p_chat: String(message.chat.id),
      },
    );
    if (result.application_id) {
      await notifyApplicationAdmins(result.application_id, {
        recipients: id => serviceRpc<{ admin_id: string }[]>("application_admin_recipients", { p_id: id }),
        claim: (id, admin) => serviceRpc<AdminNotice | null>("claim_application_notification", { p_id: id, p_admin: admin }),
        finish: (id, admin, success) => serviceRpc("finish_application_notification", { p_id: id, p_admin: admin, p_success: success }),
        send: sendMessage,
        log: () => console.error("Application admin notification delivery failed"),
      });
    }
    if (result.status === "done") return NextResponse.json({ ok: true });
    if (result.status === "send") {
      await sendMessage(
        result.chat_id!,
        "Telegram подтверждён. Заявка отправлена на проверку. Мы пришлём сообщение после решения администратора.",
      );
      await serviceRpc("telegram_delivered", { p_update: update_id });
    } else {
      const messages: Record<string, string> = {
        mismatch:
          "Не удалось подтвердить заявку. Откройте ссылку с Telegram-аккаунта, указанного в заявке.",
        no_username: "Для подтверждения заявки необходим Telegram username.",
        linked:
          "Этот Telegram-аккаунт уже связан с TutorGate. Используйте вход или восстановление пароля.",
        expired: "Срок действия ссылки истёк. Подайте заявку заново.",
        invalid:
          "Ссылка недействительна или уже использована. Проверьте сообщения бота.",
      };
      await sendMessage(
        String(message.chat.id),
        messages[result.status] ?? messages.invalid,
      );
    }
    return NextResponse.json({ ok: true });
  } catch {
    console.error("Telegram webhook processing failed");
    return new NextResponse(null, { status: 503 });
  }
}
