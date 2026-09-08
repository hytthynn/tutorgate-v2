import "server-only";
import { editResult } from "./edit-result";
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

export async function editTemplate(chatId: string, messageId: number, message: TelegramMessage): Promise<boolean> {
  const response = await fetch(`https://api.telegram.org/bot${env("TELEGRAM_BOT_TOKEN")}/editMessageText`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text: message.text,
      ...message.options, reply_markup: message.options.reply_markup ?? { inline_keyboard: [] },
      link_preview_options: { is_disabled: true } }),
    signal: AbortSignal.timeout(8000), cache: "no-store",
  });
  const outcome = editResult(response.status, await response.json());
  if (outcome === "error") throw new Error("Telegram control edit failed");
  return outcome === "edited";
}

export async function sendMedia(chat: string, file: Blob, name: string, image: boolean): Promise<number> {
  const field = image ? "photo" : "document";
  const form = new FormData(); form.set("chat_id",chat); form.set(field,file,name);
  const response = await fetch(`https://api.telegram.org/bot${env("TELEGRAM_BOT_TOKEN")}/${image ? "sendPhoto" : "sendDocument"}`, { method: "POST", body: form, signal: AbortSignal.timeout(30000), cache: "no-store" });
  const result = await response.json();
  if (!response.ok || !result.ok || !Number.isSafeInteger(result.result?.message_id)) throw new Error("Media delivery failed");
  return result.result.message_id;
}

export async function deleteMessage(chatId: string, messageId: number) {
  const response = await fetch(`https://api.telegram.org/bot${env("TELEGRAM_BOT_TOKEN")}/deleteMessage`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:chatId,message_id:messageId}),signal:AbortSignal.timeout(8000),cache:"no-store"});
  const payload = await response.json();
  if (!payload.ok && !String(payload.description).toLowerCase().includes("message to delete not found")) throw new Error("Telegram message cleanup failed");
}
