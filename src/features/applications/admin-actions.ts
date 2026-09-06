"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/access";
import { serviceRpc } from "@/lib/supabase/admin";
import { token, hash } from "@/lib/auth/tokens";
import { appUrl } from "@/lib/env";
import { sendMessage } from "@/lib/telegram/bot";
import type { ReviewAction, ReviewResult } from "./types";
async function review(applicationId: string, action: ReviewAction): Promise<ReviewResult> {
 const actor = await requireRole("admin");
 if (!z.uuid().safeParse(applicationId).success) return { error: "Заявка не найдена." };
 const raw = action === "reject" ? null : token();
 // Validate trusted APP_URL before committing a decision that requires a link.
 let text: string;
 try {
  text = action === "reject" ? "Ваша заявка в TutorGate отклонена. Вы можете подать новую заявку позже."
   : `${action === "approve" ? "Ваша заявка в TutorGate принята." : "Новая ссылка на регистрацию в TutorGate."}\n\nЗавершите регистрацию:\n${appUrl(`/register?token=${raw}`)}\n\nСсылка действует 24 часа и может быть использована один раз.`;
 } catch { return { error: "Не удалось подготовить сообщение. Проверьте настройки приложения." }; }
 let result: { status: string; chat_id?: string };
 try {
  result = await serviceRpc("review_application", { p_actor: actor.id, p_id: applicationId, p_action: action, p_hash: raw ? hash(raw) : null });
 } catch { return { error: "Не удалось сохранить решение. Попробуйте ещё раз." }; }
 if (result.status !== "ok") return { error: result.status === "processed" ? "Заявка уже обработана другим администратором." : "Действие недоступно для текущего статуса заявки." };
 let delivered = false, deliveryRecorded = true;
 try { await sendMessage(result.chat_id!, text); delivered = true; }
 catch { console.error("Application decision delivery failed"); }
 if (raw) {
  try { await serviceRpc("application_link_delivered", { p_actor: actor.id, p_id: applicationId, p_hash: hash(raw), p_success: delivered }); }
  catch { deliveryRecorded = false; console.error("Application delivery audit failed"); }
 }
 revalidatePath("/admin/applications");
 if (!delivered) return { warning: action === "approve" ? "Заявка принята, но сообщение не удалось доставить. Отправьте новую ссылку."
  : action === "reject" ? "Заявка отклонена, но сообщение не удалось доставить." : "Ссылка создана, но сообщение не удалось доставить. Повторите отправку." };
 if (!deliveryRecorded) return { warning: "Сообщение отправлено, но статус доставки не удалось сохранить. Обновите страницу через две минуты." };
 return { success: action === "approve" ? "Заявка принята. Ссылка на регистрацию отправлена." : action === "reject" ? "Заявка отклонена." : "Новая ссылка отправлена. Предыдущая ссылка больше не действует." };
}
export async function approveApplicationAction(id: string) { return review(id, "approve"); }
export async function rejectApplicationAction(id: string) { return review(id, "reject"); }
export async function resendRegistrationLinkAction(id: string) { return review(id, "resend"); }
