import "server-only";
import { serviceRpc } from "@/lib/supabase/admin";
import { token, hash } from "@/lib/auth/tokens";
import { appUrl } from "@/lib/env";
import { sendTemplate } from "@/lib/telegram/bot";
import { html, escapeHtml, homeButton, registrationMessage, type InlineButton } from "@/lib/telegram/templates";
import type { BotInput } from "@/features/chats/bot-handler";
import type { ApplicationQueue, ReviewAction } from "./types";

export async function botApplicationAction(input: BotInput) {
  const queue = /^menu:(apps|approved):(student|tutor):(\d+)$/.exec(input.callbackData ?? "");
  if (queue) {
    const offset = Math.min(1000000,Number(queue[3]));
    const data = await serviceRpc<ApplicationQueue>("bot_application_command",{ p_user: input.userId, p_chat: input.chatId, p_action: "queue", p_role: queue[2], p_bucket: queue[1] === "apps" ? "pending_review" : "approved", p_offset: offset });
    const item = data.items[0], rows: InlineButton[][] = [];
    let text = `📥 <b>${queue[1] === "apps" ? "Очередь заявок" : "Принятые заявки"}</b> · ${data.total}`;
    if (item) {
      text += `\n\n<b>${escapeHtml(item.full_name)}</b>\n${item.role === "student" ? "Ученик" : "Репетитор"} · @${escapeHtml(item.telegram_username)}\n${escapeHtml(item.subjects.join(", "))}\n${escapeHtml([...(item.student_goal ?? item.teaching_experience ?? "")].slice(0,600).join(""))}\n${new Date(item.created_at).toLocaleDateString("ru-RU")}`;
      if (item.status === "pending_review") rows.push([{ text: "✅ Принять", callback_data: `app:approve:${item.id}` },{ text: "❌ Отклонить", callback_data: `app:reject:${item.id}` }]);
      if (item.can_resend) rows.push([{ text: "🔁 Новая ссылка", callback_data: `app:resend:${item.id}` }]);
    }
    const paging: InlineButton[] = [];
    if (offset > 0) paging.push({ text: "← Назад", callback_data: `menu:${queue[1]}:${queue[2]}:${offset-1}` });
    if (offset+1 < data.total) paging.push({ text: "Далее →", callback_data: `menu:${queue[1]}:${queue[2]}:${offset+1}` });
    if (paging.length) rows.push(paging);
    rows.push([{ text: "Ученики", callback_data: `menu:${queue[1]}:student:0` },{ text: "Репетиторы", callback_data: `menu:${queue[1]}:tutor:0` }]);
    rows.push([{ text: queue[1] === "apps" ? "Принятые заявки" : "Очередь", callback_data: `menu:${queue[1] === "apps" ? "approved" : "apps"}:${queue[2]}:0` }]);
    rows.push([{ text: "🌐 Открыть на сайте", url: appUrl("/admin/applications") }],[homeButton]);
    return html(text,rows);
  }
  const action = /^app:(approve|reject|resend):([0-9a-f-]{36})$/.exec(input.callbackData ?? "");
  if (!action) return html("⚠️ Действие недоступно.",[[homeButton]]);
  const kind = action[1] as ReviewAction, raw = kind === "reject" ? null : token();
  const message = registrationMessage(kind,raw ? appUrl(`/register?token=${raw}`) : appUrl("/"));
  const result = await serviceRpc<{ status: string; chat_id?: string; actor: string }>("bot_application_command",{ p_user: input.userId, p_chat: input.chatId, p_action: kind, p_id: action[2], p_hash: raw ? hash(raw) : null });
  if (result.status !== "ok") return html("ℹ️ <b>Заявка уже обработана или действие недоступно</b>",[[{ text: "📥 Обновить очередь", callback_data: "menu:apps:student:0" }],[homeButton]]);
  let sent = false;
  try { await sendTemplate(result.chat_id!,message); sent = true; } catch { console.error("Bot application delivery failed"); }
  if (raw) await serviceRpc("application_link_delivered",{ p_actor: result.actor, p_id: action[2], p_hash: hash(raw), p_success: sent });
  return html(`${kind === "reject" ? "❌ Заявка отклонена" : kind === "approve" ? "✅ Заявка принята" : "🔁 Новая ссылка создана"}${sent ? "" : "\nСообщение не доставлено. Решение сохранено."}`,[[{ text: "📥 Заявки", callback_data: "menu:apps:student:0" }],[homeButton]]);
}
