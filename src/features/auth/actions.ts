"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, serviceRpc } from "@/lib/supabase/admin";
import {
  sessionClient,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/supabase/session";
import {
  loginSchema,
  registrationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "@/lib/validation/schemas";
import { allowed } from "@/lib/auth/rate-limit";
import { token, hash } from "@/lib/auth/tokens";
import { appUrl, env } from "@/lib/env";
import { resetMessage } from "@/lib/telegram/templates";
import { sendTemplate } from "@/lib/telegram/bot";
import type { ActionState, Profile } from "@/types";

export async function loginAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { errors: z.flattenError(parsed.error).fieldErrors };
  let role: string | undefined;
  try {
    if (!(await allowed("login", parsed.data.username)))
      return { error: "Слишком много попыток. Попробуйте через 15 минут." };
    const alias = await serviceRpc<string | null>("lookup_alias", {
      p_username: parsed.data.username,
    });
    const jar = await cookies();
    // Rotate the opaque handle at login, preventing session fixation.
    let handle: string | undefined;
    const db = await sessionClient(undefined, (value) => {
      handle = value;
      jar.set(SESSION_COOKIE, value, sessionCookieOptions);
    });
    const { data, error } = await db.auth.signInWithPassword({
      email: alias ?? `missing@${env("AUTH_ALIAS_DOMAIN")}`,
      password: parsed.data.password,
    });
    if (error || !data.user) return { error: "Неверный логин или пароль." };
    const { data: profile } = await db
      .rpc("visible_profiles")
      .eq("id", data.user.id)
      .single();
    // visible_profiles fails closed unless the caller's account is active.
    if (!profile) {
      await db.auth.signOut();
      jar.delete(SESSION_COOKIE);
      return { error: "Доступ к аккаунту закрыт. Обратитесь к администратору." };
    }
    if (handle) {
      try {
        await serviceRpc("bind_session", { p_hash: hash(handle), p_user: data.user.id });
      } catch {
        await db.auth.signOut();
        jar.delete(SESSION_COOKIE);
        return { error: "Доступ к аккаунту закрыт. Обратитесь к администратору." };
      }
    }
    role = (profile as Profile).role;
  } catch {
    return { error: "Не удалось войти. Попробуйте ещё раз." };
  }
  redirect(`/${role}/schedule`);
}
export async function logoutAction() {
  const db = await createClient();
  await db.auth.signOut();
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
export async function registrationAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = registrationSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { errors: z.flattenError(parsed.error).fieldErrors };
  try {
    if (!(await allowed("register", hash(parsed.data.token), 10)))
      return { error: "Слишком много попыток. Попробуйте позже." };
    const status = await serviceRpc<string | null>("token_status", {
      p_hash: hash(parsed.data.token),
      p_purpose: "registration",
    });
    if (status !== "valid") return { error: tokenMessage(status) };
    if (await serviceRpc("lookup_alias", { p_username: parsed.data.username }))
      return { errors: { username: ["Этот логин уже занят"] } };
    const { error } = await createAdminClient().auth.admin.createUser({
      email: `u_${token()}@${env("AUTH_ALIAS_DOMAIN")}`,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: {
        username: parsed.data.username,
        registration_hash: hash(parsed.data.token),
      },
    });
    if (error)
      return {
        error:
          "Не удалось зарегистрироваться. Проверьте ссылку и попробуйте другой логин.",
      };
    return { success: "Аккаунт создан. Теперь можно войти." };
  } catch {
    return { error: "Не удалось зарегистрироваться. Попробуйте ещё раз." };
  }
}
const recoveryResponse =
  "Если Telegram привязан к аккаунту TutorGate, ссылка для восстановления отправлена в бот.";
export async function forgotPasswordAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { errors: z.flattenError(parsed.error).fieldErrors };
  try {
    if (await allowed("forgot", parsed.data.telegram_username, 3)) {
      const raw = token();
      const chat = await serviceRpc<string | null>("request_reset", {
        p_username: parsed.data.telegram_username,
        p_hash: hash(raw),
      });
      if (chat)
        await sendTemplate(chat, resetMessage(appUrl(`/reset-password?token=${raw}`)));
    }
  } catch {
    console.error("Password recovery could not be delivered");
  }
  return { success: recoveryResponse };
}
export async function resetPasswordAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { errors: z.flattenError(parsed.error).fieldErrors };
  try {
    if (!(await allowed("reset", hash(parsed.data.token), 10)))
      return { error: "Слишком много попыток. Попробуйте позже." };
    const uid = await serviceRpc<string | null>("claim_reset", {
      p_hash: hash(parsed.data.token),
    });
    if (!uid)
      return {
        error: tokenMessage(
          await serviceRpc("token_status", {
            p_hash: hash(parsed.data.token),
            p_purpose: "password_reset",
          }),
        ),
      };
    const { error } = await createAdminClient().auth.admin.updateUserById(uid, {
      password: parsed.data.password,
    });
    if (error)
      return {
        error:
          "Не удалось изменить пароль. Запросите новую ссылку восстановления.",
      };
    await serviceRpc("revoke_user_sessions", { p_user: uid });
    return { success: "Пароль изменён. Войдите с новым паролем." };
  } catch {
    return {
      error:
        "Не удалось изменить пароль. Запросите новую ссылку восстановления.",
    };
  }
}
function tokenMessage(status: unknown) {
  return status === "used"
    ? "Эта ссылка уже использована."
    : status === "expired"
      ? "Срок действия ссылки истёк."
      : "Ссылка недействительна.";
}
