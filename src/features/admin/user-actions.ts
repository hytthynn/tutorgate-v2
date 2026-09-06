"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getChatUsername } from "@/lib/telegram/bot";
import { syncTelegramProfiles, type SyncCounts, type SyncProfile } from "./telegram-sync";
import type { ActionState } from "@/types";

const commandSchema = z.object({ id: z.uuid(), operation: z.enum(["student", "tutor", "block", "unblock", "delete"]) });
export async function manageUserAction(input: unknown): Promise<ActionState> {
  await requireRole("admin");
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success) return { error: "Некорректное действие." };
  const { id, operation } = parsed.data;
  let deletionCommitted = false;
  try {
    const db = await createClient();
    const result = operation === "delete" ? await db.rpc("admin_soft_delete_user", { p_user: id })
      : operation === "block" || operation === "unblock" ? await db.rpc("admin_set_user_blocked", { p_user: id, p_blocked: operation === "block" })
      : await db.rpc("admin_change_user_role", { p_user: id, p_role: operation });
    if (result.error) return { error: result.error.code === "P0010" ? result.error.message : "Действие недоступно для этого аккаунта." };
    if (operation === "delete") {
      deletionCommitted = true;
      const auth = createAdminClient();
      const { error } = await auth.auth.admin.updateUserById(id, { user_metadata: {}, ban_duration: "876000h" });
      if (error) return { error: "Доступ отозван и данные обезличены. Дополнительная блокировка в Auth не завершена — повторите удаление." };
    }
    for (const role of ["admin", "student", "tutor"]) revalidatePath(`/${role}`, "layout");
    return { success: operation === "delete" ? "Аккаунт удалён. История занятий сохранена." : "Изменения сохранены." };
  } catch { return { error: deletionCommitted ? "Доступ отозван и данные обезличены. Завершение операции прервано — повторите удаление." : "Не удалось выполнить действие. Попробуйте ещё раз." }; }
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
    return { success: `Проверено: ${counts.checked} · Обновлено: ${counts.updated} · Username удалён: ${counts.removed} · Без изменений: ${counts.unchanged} · Ошибки: ${counts.errors}` };
  } catch { return { error: "Не удалось завершить синхронизацию. Уже сохранённые обновления не потеряны; повторите попытку." }; }
}
