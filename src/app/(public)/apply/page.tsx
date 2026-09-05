import Link from "next/link";
import { ApplicationForm } from "@/components/forms/application-form";
import { createAdminClient } from "@/lib/supabase/admin";
import { configured } from "@/lib/env";
import type { Subject } from "@/types";
export const dynamic = "force-dynamic";
export const metadata = { title: "Подать заявку" };
export default async function ApplyPage() {
  let subjects: Subject[] = [];
  let unavailable = !configured();
  if (!unavailable) {
    const { data, error } = await createAdminClient()
      .from("subjects")
      .select("id,name,is_active")
      .eq("is_active", true)
      .order("name");
    subjects = data ?? [];
    unavailable = !!error;
  }
  return (
    <section className="auth-card application-card">
      <div className="auth-heading">
        <span className="eyebrow">НАЧНЁМ ЗНАКОМСТВО</span>
        <h1>Заявка в TutorGate</h1>
        <p>Расскажите немного о себе.</p>
      </div>
      <ApplicationForm subjects={subjects} unavailable={unavailable} />
      <div className="auth-bottom">
        <span>Уже есть аккаунт?</span>
        <Link href="/login">Войти</Link>
      </div>
    </section>
  );
}
