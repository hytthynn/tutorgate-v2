import Link from "next/link";
import { PageHeading } from "@/components/shared/page-heading";
import { getAdminApplications } from "./queries";
import { ReviewButtons } from "./review-buttons";
import { statusLabels, type ApplicationBucket } from "./types";
const roles = [["student", "Ученики"], ["tutor", "Репетиторы"]] as const;
const buckets = [["pending_review", "На рассмотрении"], ["approved", "Принятые"], ["rejected", "Отклонённые"]] as const;
const date = (value: string | null) => value ? new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
export async function AdminApplicationsPage({ params }: { params: Record<string, string | undefined> }) {
 const role = params.role === "tutor" ? "tutor" : "student";
 const bucket: ApplicationBucket = params.status === "approved" || params.status === "rejected" ? params.status : "pending_review";
 const page = Math.min(20000, Math.max(0, Number.parseInt(params.page ?? "0",10) || 0));
 const queue = await getAdminApplications(role,bucket,page);
 const href = (r = role, b: ApplicationBucket = bucket, n = 0) => `/admin/applications?role=${r}&status=${b}&page=${n}`;
 return <section className="applications-page">
  <PageHeading title="Заявки" description="Проверка новых учеников и репетиторов после подтверждения Telegram." />
  <div className="application-toolbar">
  <nav className="application-tabs" aria-label="Роль заявителя">{roles.map(([value,label]) => <Link key={value} href={href(value)} aria-current={value === role ? "page" : undefined}>{label}</Link>)}</nav>
  <nav className="application-tabs application-status-tabs" aria-label="Статус заявки">{buckets.map(([value,label]) => <Link key={value} href={href(role,value)} aria-current={value === bucket ? "page" : undefined}>{label}</Link>)}</nav>
  </div>
  <p className="application-count">Заявок: {queue.total} · Время указано по МСК</p>
  {!queue.items.length && <div className="panel application-empty"><h2>Заявок пока нет</h2><p>В этом разделе появятся заявки с выбранным статусом.</p></div>}
  <div className="application-list">{queue.items.map(a => <article className="panel application-card admin-application-card" key={a.id} aria-label={`Заявка: ${a.full_name}`}>
   <div className="application-card-heading"><div><h2>{a.full_name}</h2><p>{a.role === "student" ? "Ученик" : "Репетитор"} · @{a.telegram_username}</p></div><span className="application-status" data-status={a.status}>{statusLabels[a.status]}</span></div>
   <dl className="application-details">
    <div><dt>Предметы</dt><dd>{a.subjects.join(", ") || "Предметы удалены"}</dd></div>
    <div><dt>{a.role === "student" ? "Цель занятий" : "Опыт преподавания"}</dt><dd>{a.student_goal ?? a.teaching_experience}</dd></div>
    <div><dt>Подана</dt><dd>{date(a.created_at)}</dd></div><div><dt>Telegram подтверждён</dt><dd>{date(a.telegram_verified_at)}</dd></div>
    {a.reviewed_at && <div><dt>Решение</dt><dd>{a.reviewed_by_name ?? "Администратор"} · {date(a.reviewed_at)}</dd></div>}
    {a.registered_at && <div><dt>Регистрация завершена</dt><dd>{date(a.registered_at)}</dd></div>}
    {a.status === "approved" && <div><dt>Ссылка на регистрацию</dt><dd>{a.link_expires_at ? `Действует до ${date(a.link_expires_at)}` : "Нужна новая ссылка"}{a.delivery_status === "failed" ? " · Не доставлена" : a.delivery_status === "pending" ? " · Доставка не подтверждена" : ""}</dd></div>}
   </dl>
   <ReviewButtons application={a} />
  </article>)}</div>
  {(page > 0 || (page+1)*50 < queue.total) && <nav className="application-pagination" aria-label="Страницы заявок">{page > 0 && <Link href={href(role,bucket,page-1)}>← Назад</Link>}<span>Страница {page+1}</span>{(page+1)*50 < queue.total && <Link href={href(role,bucket,page+1)}>Далее →</Link>}</nav>}
 </section>;
}
