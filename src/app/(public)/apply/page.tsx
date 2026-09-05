import Link from "next/link";
import { ApplicationForm } from "@/components/forms/application-form";
import { createAdminClient } from "@/lib/supabase/admin";
import { missingSupabaseVariables } from "@/lib/env";
import type { Subject } from "@/types";
export const dynamic = "force-dynamic";
export const metadata = { title: "Подать заявку" };
export default async function ApplyPage() {
  let subjects: Subject[] = [];
  const missing = missingSupabaseVariables();
  let unavailable = missing.length > 0;
  if (unavailable) {
    console.error("[TutorGate:subjects] Missing environment variables", {
      missing,
    });
  } else {
    try {
      const { data, error, status } = await createAdminClient()
        .from("subjects")
        .select("id,name,is_active")
        .eq("is_active", true)
        .order("name");
      subjects = data ?? [];
      unavailable = !!error;
      if (error) {
        // Never log keys, headers, raw responses or connection URLs.
        console.error("[TutorGate:subjects] Supabase query failed", {
          status,
          code: /^[A-Z0-9_]{1,24}$/.test(error.code ?? "")
            ? error.code
            : "UNKNOWN",
        });
      }
    } catch {
      unavailable = true;
      console.error(
        "[TutorGate:subjects] Client configuration or network failure",
      );
    }
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
