import Link from "next/link";
import { ArrowLeft, KeyRound } from "lucide-react";
import { AuthForm } from "@/components/forms/auth-form";
export const metadata = { title: "Восстановление пароля" };
export default function ForgotPage() {
  return (
    <section className="auth-card">
      <AuthForm kind="forgot">
      <Link className="back-link" href="/login">
        <ArrowLeft size={14} />
        Ко входу
      </Link>
      <div className="auth-heading">
        <span className="section-icon">
          <KeyRound size={20} />
        </span>
        <h1>Забыли пароль?</h1>
        <p>
          Укажите Telegram, привязанный к аккаунту. Бот пришлёт ссылку для
          восстановления.
        </p>
      </div>
      </AuthForm>
    </section>
  );
}
