import "server-only";
import { env } from "@/lib/env";
export async function getChatUsername(chatId: string): Promise<string | null> {
  const response = await fetch(`https://api.telegram.org/bot${env("TELEGRAM_BOT_TOKEN")}/getChat`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId }), signal: AbortSignal.timeout(8000), cache: "no-store",
  });
  if (!response.ok) throw new Error("Telegram sync failed");
  const payload = await response.json();
  if (!payload.ok || payload.result?.type !== "private") throw new Error("Telegram sync failed");
  const username: unknown = payload.result.username;
  if (username === undefined || username === null) return null;
  if (typeof username !== "string" || !/^[a-zA-Z0-9_]+$/.test(username)) throw new Error("Telegram sync failed");
  return username.toLowerCase();
}
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
