import "server-only";
import { serviceRpc } from "@/lib/supabase/admin";
import { updateControlMessage, type ControlClaim, type ControlOptions } from "@/features/chats/control-message";
import { editTemplate, sendTemplate } from "./bot";
import type { TelegramMessage } from "./templates";

export function sendControlMessage(chat: string, message: TelegramMessage, options: ControlOptions = {}) {
  return updateControlMessage(chat, message, {
    claim: chatId => serviceRpc<ControlClaim | null>("telegram_control_claim", { p_chat: chatId }),
    edit: editTemplate,
    send: sendTemplate,
    finish: async (chatId, claimId, messageId) => {
      await serviceRpc("telegram_control_finish", { p_chat: chatId, p_claim: claimId, p_message: messageId });
    },
  }, options);
}
