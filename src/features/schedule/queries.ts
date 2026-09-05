import "server-only";
import { requireRole } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { parseWeek, weekBounds } from "./time";
import type { LessonColor, ScheduleData, ScheduleLesson } from "./types";

export async function getScheduleOffset() {
  const user = await requireRole();
  const db = await createClient();
  const { data, error } = await db.from("user_schedule_preferences").select("msk_offset_hours").eq("user_id", user.id).maybeSingle();
  if (error) throw new Error("Не удалось загрузить часовой сдвиг.");
  return (data?.msk_offset_hours ?? 0) as number;
}
export interface LessonRow {
  id: string; tutor_id: string; student_id: string; subject_id: string;
  starts_at: string; ends_at: string; duration_minutes: number; color: LessonColor; completed_at: string | null;
}
export async function readLessons(start: string, end: string, filter: { tutorId?: string; studentId?: string; completed?: boolean }) {
  const db = await createClient();
  const rows: LessonRow[] = [];
  // PostgREST caps each response; never silently truncate a busy period.
  for (let page = 0; ; page++) {
    let query = db.from("lessons").select("id,tutor_id,student_id,subject_id,starts_at,ends_at,duration_minutes,color,completed_at")
      .lt("starts_at", end).gt("ends_at", start).order("starts_at").order("id").range(page * 500, page * 500 + 499);
    if (filter.tutorId) query = query.eq("tutor_id", filter.tutorId);
    if (filter.studentId) query = query.eq("student_id", filter.studentId);
    if (filter.completed) query = query.not("completed_at", "is", null);
    const { data, error } = await query;
    if (error) throw new Error("Не удалось загрузить занятия.");
    rows.push(...(data as LessonRow[]));
    if (data.length < 500) break;
  }
  return rows;
}
export async function getSchedule(weekParam: unknown): Promise<ScheduleData> {
  const user = await requireRole();
  const offset = await getScheduleOffset();
  const now = new Date();
  const week = parseWeek(weekParam, offset, now);
  const { start, end } = weekBounds(week, offset);
  const rows = await readLessons(start, end, user.role === "student" ? { studentId: user.id } : { tutorId: user.id });
  const db = await createClient();
  const names = new Map<string, { student_name: string; tutor_name: string; subject_name: string }>();
  for (let i = 0; i < rows.length; i += 500) {
    const result = await db.rpc("schedule_lesson_names", { p_ids: rows.slice(i, i + 500).map((l) => l.id) });
    if (result.error) throw new Error("Не удалось загрузить участников занятий.");
    for (const row of result.data) names.set(row.id, row);
  }
  const lessons: ScheduleLesson[] = rows.map((l) => ({
    id: l.id, tutorId: l.tutor_id, studentId: l.student_id, subjectId: l.subject_id,
    studentName: names.get(l.id)?.student_name ?? "Ученик", tutorName: names.get(l.id)?.tutor_name ?? "Репетитор",
    subjectName: names.get(l.id)?.subject_name ?? "Предмет", startsAt: l.starts_at, endsAt: l.ends_at,
    durationMinutes: l.duration_minutes, color: l.color, completed: l.completed_at !== null,
  }));
  if (user.role === "student") return { now: now.toISOString(), role: user.role, week, offset, lessons, students: [], subjects: [] };
  const [assignments, subjects, profiles] = await Promise.all([
    db.from("student_tutor_assignments").select("student_id").eq("tutor_id", user.id),
    db.from("tutor_subjects").select("subject_id,subjects!inner(id,name,is_active)").eq("tutor_id", user.id).eq("subjects.is_active", true),
    db.rpc("visible_profiles").select("id,full_name,role"),
  ]);
  if ([assignments, subjects, profiles].some((r) => r.error)) throw new Error("Не удалось загрузить учеников и предметы.");
  const studentIds = new Set(assignments.data?.map((a) => a.student_id));
  return { now: now.toISOString(), role: user.role, week, offset, lessons,
    students: ((profiles.data ?? []) as { id: string; role: string; full_name: string }[]).filter((p) => p.role === "student" && studentIds.has(p.id)).map((p) => ({ id: p.id, name: p.full_name })),
    subjects: (subjects.data ?? []).flatMap((s) => {
      const rows = Array.isArray(s.subjects) ? s.subjects : [s.subjects];
      return rows.map((subject: { id: string; name: string }) => ({ id: subject.id, name: subject.name }));
    }),
  };
}
