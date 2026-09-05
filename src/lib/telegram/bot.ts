import "server-only";
import { env } from "@/lib/env";
export async function sendMessage(chatId: string, text: string) {
  const response = await fetch(
    `https://api.telegram.org/bot${env("TELEGRAM_BOT_TOKEN")}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        link_preview_options: { is_disabled: true },
      }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    },
  );
  if (!response.ok || !(await response.json()).ok)
    throw new Error("Telegram delivery failed");
}
