"use server";
import { z } from "zod";
import { applicationSchema } from "@/lib/validation/schemas";
import { serviceRpc } from "@/lib/supabase/admin";
import { token, hash } from "@/lib/auth/tokens";
import { allowed } from "@/lib/auth/rate-limit";
import { env } from "@/lib/env";
import type { ActionState } from "@/types";
export async function applyAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = applicationSchema.safeParse({
    ...Object.fromEntries(form),
    subject_ids: form.getAll("subject_ids"),
    privacy: form.get("privacy") === "on",
  });
  if (!parsed.success)
    return { errors: z.flattenError(parsed.error).fieldErrors };
  try {
    const bot = env("TELEGRAM_BOT_USERNAME");
    if (!(await allowed("apply", parsed.data.telegram_username, 4)))
      return { error: "Слишком много заявок. Попробуйте через 15 минут." };
    const raw = token();
    await serviceRpc("submit_application", {
      p_data: parsed.data,
      p_hash: hash(raw),
    });
    return {
      success:
        "Заявка сохранена. Теперь подтвердите Telegram, чтобы получить ссылку для регистрации.",
      url: `https://t.me/${bot}?start=${raw}`,
    };
  } catch {
    return { error: "Не удалось отправить заявку. Попробуйте ещё раз." };
  }
}
