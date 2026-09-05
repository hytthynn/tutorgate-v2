"use client";
import { useFeedback } from "@/components/ui/toaster";
import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import {
  loginAction,
  registrationAction,
  forgotPasswordAction,
  resetPasswordAction,
} from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Field } from "./field";
import type { ActionState } from "@/types";
const actions = {
  login: loginAction,
  register: registrationAction,
  forgot: forgotPasswordAction,
  reset: resetPasswordAction,
};
const labels = {
  login: "Войти",
  register: "Создать аккаунт",
  forgot: "Получить ссылку",
  reset: "Сохранить пароль",
};
export function AuthForm({
  kind,
  token = "",
}: {
  kind: keyof typeof actions;
  token?: string;
}) {
  const [state, action, pending] = useActionState(
    actions[kind],
    {} as ActionState,
  );
  useFeedback(state, false);
  if (state.success)
    return (
      <div className="success-state" role="status">
        <span className="success-icon">
          <Check size={24} />
        </span>
        <h2>
          {kind === "forgot"
            ? "Проверьте Telegram"
            : kind === "reset"
              ? "Пароль изменён"
              : "Добро пожаловать"}
        </h2>
        <p>{state.success}</p>
        <Button asChild variant="secondary">
          <Link href="/login">
            Перейти ко входу
            <ArrowRight size={16} />
          </Link>
        </Button>
      </div>
    );
  return (
    <form action={action} className="form-stack">
      {token && <input type="hidden" name="token" value={token} />}
      {(kind === "login" || kind === "register") && (
        <Field
          label="Логин"
          name="username"
          error={state.errors?.username}
          hint={
            kind === "register"
              ? "3–32 символа: латиница, цифры и _"
              : undefined
          }
        >
          <input
            id="username"
            name="username"
            autoComplete="username"
            placeholder="Ваш логин"
            required
            minLength={3}
            maxLength={32}
            aria-invalid={!!state.errors?.username}
            aria-describedby={
              state.errors?.username ? "username-error" : undefined
            }
          />
        </Field>
      )}
      {kind === "forgot" && (
        <Field
          label="Telegram"
          name="telegram_username"
          error={state.errors?.telegram_username}
        >
          <input
            id="telegram_username"
            name="telegram_username"
            placeholder="@username"
            autoComplete="off"
            required
            maxLength={33}
          />
        </Field>
      )}
      {kind !== "forgot" && (
        <Field
          label={kind === "reset" ? "Новый пароль" : "Пароль"}
          name="password"
          error={state.errors?.password}
        >
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={
              kind === "login" ? "current-password" : "new-password"
            }
            placeholder={
              kind === "login" ? "Введите пароль" : "Минимум 8 символов"
            }
            required
            minLength={kind === "login" ? 1 : 8}
            maxLength={128}
          />
        </Field>
      )}
      {(kind === "register" || kind === "reset") && (
        <Field
          label="Повторите пароль"
          name="confirm"
          error={state.errors?.confirm}
        >
          <input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            placeholder="Введите пароль ещё раз"
            required
            minLength={8}
            maxLength={128}
          />
        </Field>
      )}
      {kind === "login" && (
        <Link className="forgot-link" href="/forgot-password">
          Забыли пароль?
        </Link>
      )}
      <Button type="submit" disabled={pending} className="full-width">
        {pending ? <Loader2 size={16} className="spin" /> : null}
        {pending ? "Подождите…" : labels[kind]}
        {!pending && <ArrowRight size={16} />}
      </Button>
    </form>
  );
}
