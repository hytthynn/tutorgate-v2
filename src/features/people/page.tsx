import { DirectoryFilters } from "@/components/people/directory-filters";
import { ArrowUpRight, BookOpen } from "lucide-react";
import { getDirectory } from "./queries";
import { PageHeading } from "@/components/shared/page-heading";
import { EmptyState } from "@/components/shared/empty-state";
import {
  TutorSubjectsDialog,
  AssignmentDialog,
} from "@/components/forms/admin-forms";
import { initials } from "@/lib/utils";
import type { Role } from "@/types";
export async function PeoplePage({
  kind,
  role,
  searchParams,
}: {
  kind: "tutors" | "students";
  role: Role;
  searchParams: { q?: string; subject?: string; tutor?: string };
}) {
  const { profiles, subjects, assignments, tutorSubjects, viewer } =
    await getDirectory();
  const admin = role === "admin";
  const tutors = profiles.filter(
    (p) => p.role === "tutor" || p.role === "admin",
  );
  let people =
    kind === "tutors" ? tutors : profiles.filter((p) => p.role === "student");
  if (!admin)
    people = people.filter((p) =>
      assignments.some((a) =>
        kind === "tutors"
          ? a.student_id === viewer.id && a.tutor_id === p.id
          : a.tutor_id === viewer.id && a.student_id === p.id,
      ),
    );
  const total = people.length;
  const q =
    typeof searchParams.q === "string"
      ? searchParams.q.slice(0, 150).trim().toLowerCase()
      : "";
  people = people.filter((p) => p.full_name.toLowerCase().includes(q));
  if (searchParams.subject)
    people = people.filter((p) =>
      tutorSubjects.some(
        (ts) => ts.tutor_id === p.id && ts.subject_id === searchParams.subject,
      ),
    );
  if (searchParams.tutor)
    people = people.filter((p) =>
      assignments.some(
        (a) => a.student_id === p.id && a.tutor_id === searchParams.tutor,
      ),
    );
  people.sort((a, b) => a.full_name.localeCompare(b.full_name, "ru"));
  const title = kind === "tutors" ? "Репетиторы" : "Ученики";
  const subjectName = (id: string) =>
    subjects.find((s) => s.id === id)?.name ?? "Предмет";
  return (
    <>
      <PageHeading
        title={title}
        count={total}
        description={
          admin
            ? kind === "tutors"
              ? "Команда преподавателей и назначенные предметы."
              : "Ученики и их преподаватели по каждому предмету."
            : kind === "tutors"
              ? "Преподаватели, которые помогают вам двигаться вперёд."
              : "Ваши ученики и предметы, по которым вы занимаетесь."
        }
      />
      <section className="panel directory-panel">
        {admin && (
          <DirectoryFilters kind={kind} q={typeof searchParams.q === "string" ? searchParams.q : ""}
            filter={(kind === "tutors" ? searchParams.subject : searchParams.tutor) ?? ""}
            options={kind === "tutors" ? subjects.filter(s => s.is_active).map(s => ({ value: s.id, label: s.name })) : tutors.map(t => ({ value: t.id, label: t.full_name }))} />
        )}
        {!people.length ? (
          <EmptyState
            title={
              q || searchParams.subject || searchParams.tutor
                ? "Ничего не найдено"
                : admin
                  ? `Пока нет ${kind === "tutors" ? "репетиторов" : "учеников"}`
                  : `У вас пока нет назначенных ${kind === "tutors" ? "репетиторов" : "учеников"}.`
            }
            description={
              q || searchParams.subject || searchParams.tutor
                ? "Попробуйте изменить поиск или фильтр."
                : admin
                  ? "После регистрации пользователи появятся здесь."
                  : "Назначения появятся здесь, когда администратор их добавит."
            }
            icon={kind === "tutors" ? "books" : "users"}
          />
        ) : (
          <div className="people-table">
            <div className={`people-table-head ${!admin ? "compact" : ""}`}>
              <span>{kind === "tutors" ? "ПРЕПОДАВАТЕЛЬ" : "УЧЕНИК"}</span>
              <span>
                {kind === "students" && admin
                  ? "РЕПЕТИТОР · ПРЕДМЕТ"
                  : "ПРЕДМЕТЫ"}
              </span>
              {admin && <span>УПРАВЛЕНИЕ</span>}
            </div>
            {people.map((p) => {
              const assigned = assignments.filter((a) =>
                kind === "tutors"
                  ? a.tutor_id === p.id &&
                    (!admin ? a.student_id === viewer.id : true)
                  : a.student_id === p.id &&
                    (!admin ? a.tutor_id === viewer.id : true),
              );
              const ids =
                kind === "tutors" && admin
                  ? tutorSubjects
                      .filter((ts) => ts.tutor_id === p.id)
                      .map((ts) => ts.subject_id)
                  : assigned.map((a) => a.subject_id);
              return (
                <div
                  className={`person-row ${!admin ? "compact" : ""}`}
                  key={p.id}
                >
                  <div className="person-name">
                    <span className="avatar">{initials(p.full_name)}</span>
                    <div>
                      <strong>{p.full_name}</strong>
                      {admin && p.role === "admin" && (
                        <small>Администратор · Репетитор</small>
                      )}
                    </div>
                  </div>
                  <div className="person-subjects">
                    {kind === "students" && admin ? (
                      assigned.length ? (
                        assigned.map((a) => (
                          <span className="assignment-tag" key={a.id}>
                            {tutors.find((t) => t.id === a.tutor_id)?.full_name}
                            <span>· {subjectName(a.subject_id)}</span>
                          </span>
                        ))
                      ) : (
                        <span className="muted">Нет назначений</span>
                      )
                    ) : ids.length ? (
                      [...new Set(ids)].map((id) => (
                        <span className="badge subject-badge" key={id}>
                          <BookOpen size={12} />
                          {subjectName(id)}
                        </span>
                      ))
                    ) : (
                      <span className="muted">Предметы не назначены</span>
                    )}
                  </div>
                  {admin && (
                    <div className="person-actions">
                      <a
                        className="telegram-link"
                        href={`https://t.me/${p.telegram_username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Открыть Telegram
                        <ArrowUpRight size={13} />
                      </a>
                      {kind === "tutors" ? (
                        <TutorSubjectsDialog
                          tutor={p}
                          subjects={subjects}
                          assigned={ids}
                        />
                      ) : (
                        <AssignmentDialog
                          student={p}
                          subjects={subjects}
                          tutors={tutors}
                          tutorSubjects={tutorSubjects}
                          assignments={assigned}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="table-footer">
              {people.length} из {total}
              <span>TutorGate / {title}</span>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
