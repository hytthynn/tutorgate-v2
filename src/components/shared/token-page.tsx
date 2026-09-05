import Link from "next/link";
import { Link2Off } from "lucide-react";
import { serviceRpc } from "@/lib/supabase/admin";
import { configured } from "@/lib/env";
import { hash } from "@/lib/auth/tokens";
import { AuthForm } from "@/components/forms/auth-form";
import { Button } from "@/components/ui/button";
export async function TokenPage({
  token,
  kind,
}: {
  token: string;
  kind: "register" | "reset";
}) {
  let status: string | null = null;
  try {
    if (configured() && /^[\w-]{43}$/.test(token))
      status = await serviceRpc("token_status", {
        p_hash: hash(token),
        p_purpose: kind === "register" ? "registration" : "password_reset",
      });
  } catch {
    status = "unavailable";
  }
  if (status !== "valid")
    return (
      <section className="auth-card">
        <div className="auth-heading">
          <span className="section-icon">
            <Link2Off size={20} />
          </span>
          <h1>
            {status === "used"
              ? "Эта ссылка уже использована."
              : status === "expired"
                ? "Срок действия ссылки истёк."
                : status === "unavailable"
                  ? "Попробуйте позже"
                  : "Ссылка недействительна"}
          </h1>
          <p>
            {kind === "register"
              ? "Откройте ссылку из сообщения бота. Если вы уже зарегистрировались, перейдите ко входу."
              : "Запросите новую ссылку восстановления через Telegram."}
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link href={kind === "register" ? "/login" : "/forgot-password"}>
            {kind === "register" ? "Перейти ко входу" : "Получить новую ссылку"}
          </Link>
        </Button>
      </section>
    );
  return (
    <section className="auth-card">
      <AuthForm kind={kind} token={token}>
      <div className="auth-heading">
        <span className="eyebrow">
          {kind === "register" ? "ПОСЛЕДНИЙ ШАГ" : "ВОССТАНОВЛЕНИЕ ДОСТУПА"}
        </span>
        <h1>{kind === "register" ? "Создайте аккаунт" : "Новый пароль"}</h1>
        <p>
          {kind === "register"
            ? "Придумайте логин и надёжный пароль."
            : "Выберите пароль длиной не менее 8 символов."}
        </p>
      </div>
      </AuthForm>
    </section>
  );
}
