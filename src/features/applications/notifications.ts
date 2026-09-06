// Pure transport orchestration: injected adapters are also used by mock tests.
export type AdminNotice = { chat_id: string; role: "student" | "tutor"; full_name: string; telegram_username: string; subjects: string[]; details: string };
export function adminNotificationText(n: AdminNotice) {
 return `Новая заявка в TutorGate\n\nРоль: ${n.role === "student" ? "Ученик" : "Репетитор"}\nФИО: ${n.full_name}\nTelegram: @${n.telegram_username}\nПредметы: ${n.subjects.join(", ")}\n${n.role === "student" ? "Цель" : "Опыт"}: ${n.details}\n\nПроверьте заявку в админ-панели.`;
}
export async function notifyApplicationAdmins(applicationId: string, ports: {
 recipients: (id: string) => Promise<{ admin_id: string }[]>;
 claim: (id: string, admin: string) => Promise<AdminNotice | null>;
 finish: (id: string, admin: string, success: boolean) => Promise<unknown>;
 send: (chat: string, text: string) => Promise<unknown>;
 log: () => void;
}) {
 const recipients = await ports.recipients(applicationId);
 // Limited concurrency; claim individually immediately before delivery.
 let index = 0;
 await Promise.all(Array.from({ length: Math.min(5,recipients.length) }, async () => {
  while(index < recipients.length) {
   const admin = recipients[index++].admin_id;
   const notice = await ports.claim(applicationId,admin);
   if(!notice) continue;
   let sent = false;
   try { await ports.send(notice.chat_id,adminNotificationText(notice)); sent = true; }
   catch { ports.log(); }
   try { await ports.finish(applicationId,admin,sent); } catch { ports.log(); }
  }
 }));
}
