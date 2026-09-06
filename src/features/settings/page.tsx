import { Coins, BookOpen } from "lucide-react";
import { requireRole } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { PageHeading } from "@/components/shared/page-heading";
import {
  RateForm,
  AddSubjectForm,
  RemoveSubject,
} from "@/components/forms/admin-forms";
export async function SettingsPage() {
  await requireRole("admin");
  const db = await createClient();
  const [settings, subjects] = await Promise.all([
    db.from("app_settings").select("hourly_rate").eq("id", true).single(),
    db
      .from("subjects")
      .select("id,name,is_active")
      .eq("is_active", true)
      .order("name"),
  ]);
  if (settings.error || subjects.error) throw new Error("Settings unavailable");
  return (
    <>
      <PageHeading
        title="Настройки"
        description="Общие параметры учебного пространства."
      />
      <div className="settings-grid">
        <section className="panel settings-panel">
          <div className="settings-heading">
            <span className="section-icon">
              <Coins size={20} />
            </span>
            <div>
              <h2>Ставка за час</h2>
              <p>Единая ставка для всех репетиторов.</p>
            </div>
          </div>
          <RateForm rate={Number(settings.data.hourly_rate)} />
        </section>
        <section className="panel settings-panel">
          <div className="settings-heading">
            <span className="section-icon">
              <BookOpen size={20} />
            </span>
            <div>
              <h2>Предметы</h2>
              <p>Доступны в заявках и новых назначениях.</p>
            </div>
          </div>
          <AddSubjectForm />
          <div className="settings-subjects">
            {subjects.data.length ? (
              subjects.data.map((s) => (
                <div key={s.id}>
                  <span>{s.name}</span>
                  <RemoveSubject subject={s} />
                </div>
              ))
            ) : (
              <p className="muted">
                Добавьте первый предмет, чтобы открыть приём заявок.
              </p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
