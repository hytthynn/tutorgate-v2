import "server-only";
import { requireRole } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { parseWeek } from "./time";
import type { LessonColor, ScheduleData, ScheduleLesson } from "./types";

export async function getScheduleOffset() {
  const user = await requireRole();
  const db = await createClient();
  const { data, error } = await db.from("user_schedule_preferences").select("msk_offset_hours").eq("user_id", user.id).maybeSingle();
  if (error) throw new Error("Не удалось загрузить часовой сдвиг.");
  return (data?.msk_offset_hours ?? 0) as number;
}
export interface LessonRow {
  id: string; tutor_id: string; student_id: string; subject_id: string | null; subject_name_snapshot: string;
  starts_at: string; ends_at: string; duration_minutes: number; color: LessonColor; completed_at: string | null;
}
export async function readLessons(start: string | null, end: string | null, filter: { tutorId?: string; studentId?: string; completed?: boolean }) {
  const db = await createClient();
  const rows: LessonRow[] = [];
  // PostgREST caps each response; never silently truncate a busy period.
  for (let page = 0; ; page++) {
    let query = db.from("lessons").select("id,tutor_id,student_id,subject_id,starts_at,ends_at,duration_minutes,color,completed_at,subject_name_snapshot")
      .order("starts_at").order("id").range(page * 500, page * 500 + 499);
    if (start) query = query.gt("ends_at", start);
    if (end) query = query.lt("starts_at", end);
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
  const initialDb = await createClient();
  if (user.role !== "student") {
    const ensure = await initialDb.rpc("ensure_schedule_rollover");
    if (ensure.error) throw new Error("Не удалось подготовить текущую неделю.");
  }
  const rows = await readLessons(null, null, user.role === "student" ? { studentId: user.id } : { tutorId: user.id });
  const db = await createClient();
  const lessons = await normalizeLessons(rows);
  if (user.role === "student") return { now: now.toISOString(), role: user.role, week, offset, lessons, students: [], subjects: [] };
  const assignments: { student_id: string; subject_id: string }[] = [];
  const subjects: { subject_id: string; subjects: { id: string; name: string } | { id: string; name: string }[] }[] = [];
  const profiles: { id: string; role: string; full_name: string }[] = [];
  for (let page = 0; ; page++) {
    const result = await db.from("student_tutor_assignments").select("student_id,subject_id").eq("tutor_id", user.id).order("id").range(page*500,page*500+499);
    if (result.error) throw new Error("Не удалось загрузить назначения.");
    assignments.push(...result.data); if (result.data.length < 500) break;
  }
  for (let page = 0; ; page++) {
    const result = await db.from("tutor_subjects").select("subject_id,subjects!inner(id,name,is_active)").eq("tutor_id", user.id).eq("subjects.is_active", true).order("subject_id").range(page*500,page*500+499);
    if (result.error) throw new Error("Не удалось загрузить предметы.");
    subjects.push(...result.data); if (result.data.length < 500) break;
  }
  for (let page = 0; ; page++) {
    const result = await db.rpc("visible_profiles").select("id,full_name,role").order("id").range(page*500,page*500+499);
    if (result.error) throw new Error("Не удалось загрузить учеников.");
    // visible_profiles returns TABLE; the untyped RPC select also infers a single row.
    if (!Array.isArray(result.data)) throw new Error("Не удалось загрузить учеников.");
    profiles.push(...result.data); if (result.data.length < 500) break;
  }
  const studentIds = new Set(assignments.map(a => a.student_id));
  return { now: now.toISOString(), role: user.role, week, offset, lessons,
    students: profiles.filter(p => p.role === "student" && studentIds.has(p.id)).map(p => ({ id: p.id, name: p.full_name })),
    assignments: assignments.map(a => ({ studentId: a.student_id, subjectId: a.subject_id })),
    subjects: subjects.flatMap(s => (Array.isArray(s.subjects) ? s.subjects : [s.subjects]).map(subject => ({ id: subject.id, name: subject.name }))),
  };
}

export async function normalizeLessons(rows: LessonRow[]): Promise<ScheduleLesson[]> {
  const db = await createClient();
  const names = new Map<string, { student_name: string; tutor_name: string; subject_name: string }>();
  for (let i = 0; i < rows.length; i += 500) {
    const result = await db.rpc("schedule_lesson_names", { p_ids: rows.slice(i, i + 500).map((l) => l.id) });
    if (result.error) throw new Error("Не удалось загрузить участников занятий.");
    for (const row of result.data) names.set(row.id, row);
  }
  return rows.map((l) => ({
    id: l.id, tutorId: l.tutor_id, studentId: l.student_id, subjectId: l.subject_id,
    studentName: names.get(l.id)?.student_name ?? "Ученик", tutorName: names.get(l.id)?.tutor_name ?? "Репетитор",
    subjectName: names.get(l.id)?.subject_name ?? l.subject_name_snapshot, startsAt: l.starts_at, endsAt: l.ends_at,
    durationMinutes: l.duration_minutes, color: l.color, completed: l.completed_at !== null,
  }));
}
export async function readScheduleUpdates(since: string) {
  const user = await requireRole(), db = await createClient();
  const cursor = new Date().toISOString();
  if (user.role !== "student") {
    const ensure = await db.rpc("ensure_schedule_rollover");
    if (ensure.error) throw new Error("Не удалось подготовить текущую неделю.");
  }
  const rows: LessonRow[] = [];
  // Inclusive cursor plus a small overlap tolerates long-running cron transactions.
  const after = new Date(Date.parse(since)-10*60_000).toISOString();
  for (let page=0; ;page++) {
    const result = await db.from("lessons").select("id,tutor_id,student_id,subject_id,starts_at,ends_at,duration_minutes,color,completed_at,subject_name_snapshot")
      .eq(user.role === "student" ? "student_id" : "tutor_id",user.id).gte("updated_at",after)
      .order("updated_at").order("id").range(page*500,page*500+499);
    if (result.error) throw new Error("Не удалось загрузить новые занятия.");
    rows.push(...result.data as LessonRow[]); if (result.data.length<500) break;
  }
  return { lessons: await normalizeLessons(rows), cursor };
}
