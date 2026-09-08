"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { CHAT_BUCKET } from "@/features/chats/attachments";
import { createAdminClient, serviceRpc } from "@/lib/supabase/admin";
import { getChatUsername } from "@/lib/telegram/bot";
import { syncTelegramProfiles, type SyncCounts, type SyncProfile } from "./telegram-sync";
import type { ActionState } from "@/types";

const commandSchema = z.object({ id: z.uuid(), operation: z.enum(["student", "tutor", "block", "unblock", "delete"]) });
export async function manageUserAction(input: unknown): Promise<ActionState> {
  const actor = await requireRole("admin");
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success) return { error: "Некорректное действие." };
  const { id, operation } = parsed.data;
  let deletionCommitted = false;
  try {
    const db = await createClient();
    const result = operation === "delete" ? await db.rpc("admin_prepare_hard_delete_user", { p_user: id })
      : operation === "block" || operation === "unblock" ? await db.rpc("admin_set_user_blocked", { p_user: id, p_blocked: operation === "block" })
      : await db.rpc("admin_change_user_role", { p_user: id, p_role: operation });
    if (result.error) return { error: result.error.code === "P0010" ? result.error.message : "Действие недоступно для этого аккаунта." };
    if (operation === "delete") {
      deletionCommitted = true;
      const auth = createAdminClient();
      const job = result.data as { status: string; storage_paths: string[]; ready_after?: string };
      if (job.ready_after && Date.parse(job.ready_after) > Date.now()) {
        revalidatePath("/admin", "layout");
        return { error: "Доступ отозван. Удаление ожидает истечения разрешений на загрузку файлов (не более 2 часов 5 минут). Затем повторите очистку." };
      }
      if (job.status !== "complete") {
        for (let i=0;i<job.storage_paths.length;i+=100) {
          const removed = await auth.storage.from(CHAT_BUCKET).remove(job.storage_paths.slice(i,i+100));
          if (removed.error) throw removed.error;
        }
        await serviceRpc("admin_purge_hard_delete_user",{ p_actor: actor.id, p_user: id });
        const existing = await auth.auth.admin.getUserById(id);
        if (existing.error && existing.error.status !== 404) throw existing.error;
        if (existing.data.user) {
          const deleted = await auth.auth.admin.deleteUser(id);
          if (deleted.error) throw deleted.error;
        }
        await serviceRpc("admin_finish_hard_delete_user",{ p_actor: actor.id, p_user: id });
      }
    }
    for (const role of ["admin", "student", "tutor"]) revalidatePath(`/${role}`, "layout");
    return { success: operation === "delete" ? "Аккаунт и связанные данные полностью удалены." : "Изменения сохранены." };
  } catch { return { error: deletionCommitted ? "Удаление не завершено. Повторите очистку." : "Не удалось выполнить действие. Попробуйте ещё раз." }; }
}

export async function syncTelegramAction(): Promise<ActionState> {
  await requireRole("admin");
  try {
    const db = createAdminClient();
    const counts: SyncCounts = { checked: 0, updated: 0, removed: 0, unchanged: 0, errors: 0 };
    let after: string | undefined;
    for (;;) {
      let query = db.from("profiles").select("id,telegram_chat_id,telegram_username,account_status").neq("account_status", "deleted").not("telegram_chat_id", "is", null).order("id").limit(100);
      if (after) query = query.gt("id", after);
      const { data, error } = await query;
      if (error) throw new Error("Sync unavailable");
      const batch = data as SyncProfile[];
      const result = await syncTelegramProfiles(batch, getChatUsername, async (profile, username) => {
        // A concurrent deletion or Telegram change must not be overwritten.
        let update = db.from("profiles").update({ telegram_username: username }).eq("id", profile.id).eq("telegram_chat_id", profile.telegram_chat_id!).neq("account_status", "deleted");
        update = profile.telegram_username === null ? update.is("telegram_username", null) : update.eq("telegram_username", profile.telegram_username);
        const saved = await update.select("id");
        if (saved.error || saved.data?.length !== 1) throw new Error("Sync conflict");
      });
      for (const key of Object.keys(counts) as (keyof SyncCounts)[]) counts[key] += result[key];
      if (batch.length < 100) break;
      after = batch.at(-1)!.id;
    }
    revalidatePath("/admin", "layout");
    const summary = `Проверено: ${counts.checked} · Обновлено: ${counts.updated} · Username удалён: ${counts.removed} · Без изменений: ${counts.unchanged} · Ошибки: ${counts.errors}`;
    return counts.errors ? {error: `Синхронизация завершена частично. ${summary}`} : {success:summary};
  } catch { return { error: "Не удалось завершить синхронизацию. Уже сохранённые обновления не потеряны; повторите попытку." }; }
}
