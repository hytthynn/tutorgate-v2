import Link from "next/link";
import { AuthForm } from "@/components/forms/auth-form";
import { ArrowUpRight, LogIn } from "lucide-react";
export const metadata = { title: "Вход" };
export default function LoginPage() {
  return (
    <section className="auth-card">
      <div className="auth-heading">
        <span className="section-icon">
          <LogIn size={20} />
        </span>
        <span className="eyebrow">С ВОЗВРАЩЕНИЕМ</span>
        <h1>Войти в TutorGate</h1>
        <p>Ваше пространство для обучения.</p>
      </div>
      <AuthForm kind="login" />
      <div className="auth-bottom">
        <span>Ещё нет аккаунта?</span>
        <Link href="/apply">
          Подать заявку
          <ArrowUpRight size={14} />
        </Link>
      </div>
    </section>
  );
}
