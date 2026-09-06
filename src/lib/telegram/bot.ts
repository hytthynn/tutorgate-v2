import "server-only";
import type { TelegramMessage, TelegramOptions } from "./templates";
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
export async function sendMessage(chatId:string,text:string,options:TelegramOptions={}):Promise<number>{
 const response=await fetch(`https://api.telegram.org/bot${env("TELEGRAM_BOT_TOKEN")}/sendMessage`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:chatId,text,...options,link_preview_options:{is_disabled:true}}),signal:AbortSignal.timeout(8000),cache:"no-store"});
 const payload=await response.json();if(!response.ok||!payload.ok||!Number.isSafeInteger(payload.result?.message_id))throw new Error("Telegram delivery failed");return payload.result.message_id;
}
export const sendTemplate=(chat:string,m:TelegramMessage)=>sendMessage(chat,m.text,m.options);
export async function answerCallbackQuery(id:string){const r=await fetch(`https://api.telegram.org/bot${env("TELEGRAM_BOT_TOKEN")}/answerCallbackQuery`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({callback_query_id:id}),signal:AbortSignal.timeout(8000),cache:"no-store"});if(!r.ok||!(await r.json()).ok)throw new Error("Telegram callback failed");}
