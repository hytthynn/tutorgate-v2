import { readBackground } from "./background-service";
import "server-only";
import { z } from "zod";
import { requireRole } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { parseWeek } from "./time";
import type { AvailabilityRule, LessonColor, ScheduleData, ScheduleLesson } from "./types";

export async function getScheduleOffset() {
  const user = await requireRole();
  const db = await createClient();
  const { data, error } = await db.from("user_schedule_preferences").select("msk_offset_hours").eq("user_id", user.id).maybeSingle();
  if (error) throw new Error("Не удалось загрузить часовой сдвиг.");
  return (data?.msk_offset_hours ?? 0) as number;
}
export interface LessonRow {
  id: string; tutor_id: string; student_id: string; subject_id: string | null; subject_name_snapshot: string;
  starts_at: string; ends_at: string; duration_minutes: number; color: LessonColor; completed_at: string | null; hourly_rate_snapshot: number | null;
  inactive_reason: ScheduleLesson["inactiveReason"]; inactive_until: string | null; is_transfer_target: boolean; transfer_source_id: string | null; transfer_source_starts_at: string | null;
}
export async function readLessons(start: string | null, end: string | null, filter: { tutorId?: string; studentId?: string; completed?: boolean }) {
  const db = await createClient();
  const rows: LessonRow[] = [];
  // PostgREST caps each response; never silently truncate a busy period.
  for (let page = 0; ; page++) {
    let query = db.from("lessons").select("id,tutor_id,student_id,subject_id,starts_at,ends_at,duration_minutes,color,completed_at,hourly_rate_snapshot,subject_name_snapshot,inactive_reason,inactive_until,is_transfer_target,transfer_source_id,transfer_source_starts_at")
      .order("starts_at").order("id").range(page * 500, page * 500 + 499);
    if (start) query = query.gt("ends_at", start);
    if (end) query = query.lt("starts_at", end);
    if (filter.tutorId) query = query.eq("tutor_id", filter.tutorId);
    if (filter.studentId) query = query.eq("student_id", filter.studentId);
    if (filter.completed) query = query.not("completed_at", "is", null).is("inactive_reason", null);
    const { data, error } = await query;
    if (error) throw new Error("Не удалось загрузить занятия.");
    rows.push(...(data as LessonRow[]));
    if (data.length < 500) break;
  }
  return rows;
}
export async function getSchedule(weekParam: unknown, requestedOwner?: unknown, includeBackground=true): Promise<ScheduleData> {
  const user = await requireRole();
  const context = await resolveScheduleOwner(requestedOwner);
  const { ownerId, offset } = context;
  const now = new Date();
  const week = parseWeek(weekParam, offset, now);
  const db = await createClient();
  const { data, error } = await db.rpc("schedule_week_snapshot", { p_owner: ownerId, p_week: week });
  if (error) throw new Error("Не удалось загрузить неделю.");
  const snapshot = data as Pick<ScheduleData, "lessons" | "students" | "subjects" | "assignments">;
  return { ...snapshot, now: now.toISOString(), role: user.role, week, offset, ownerId,
    ownerName: context.ownerName, delegated: context.delegated, canEdit: user.role !== "student",
    canEditOffset: !context.delegated, canManagePersonalRates: user.role === "admin", canManageBackground: user.role !== "student" && !context.delegated, ...(includeBackground ? {background: user.role === "student" ? null : await readBackground(ownerId)} : {}), studentAvailability: context.rules };
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
    inactiveReason: l.inactive_reason ?? null, inactiveUntil: l.inactive_until ?? null, isTransferTarget: l.is_transfer_target ?? false, transferSourceId: l.transfer_source_id ?? null, transferSourceStartsAt: l.transfer_source_starts_at ?? null,
  }));
}
export async function readScheduleUpdates(since: string, requestedOwner?: unknown) {
  const user = await requireRole(), db = await createClient();
  const cursor = new Date().toISOString();
  const context = await resolveScheduleOwner(requestedOwner);
  const rows: LessonRow[] = [];
  // Inclusive cursor plus a small overlap tolerates long-running cron transactions.
  const after = new Date(Date.parse(since)-10*60_000).toISOString();
  for (let page=0; ;page++) {
    const result = await db.from("lessons").select("id,tutor_id,student_id,subject_id,starts_at,ends_at,duration_minutes,color,completed_at,hourly_rate_snapshot,subject_name_snapshot,inactive_reason,inactive_until,is_transfer_target,transfer_source_id,transfer_source_starts_at")
      .eq(user.role === "student" ? "student_id" : "tutor_id",context.ownerId).gte("updated_at",after)
      .order("updated_at").order("id").range(page*500,page*500+499);
    if (result.error) throw new Error("Не удалось загрузить новые занятия.");
    rows.push(...result.data as LessonRow[]); if (result.data.length<500) break;
  }
  return { lessons: await normalizeLessons(rows), cursor, rules: context.rules, offset: context.offset };
}

export async function resolveScheduleOwner(requested?: unknown) {
  const user = await requireRole();
  const ownerId = requested === undefined ? user.id : z.uuid().parse(requested);
  if (ownerId !== user.id && user.role !== "admin") throw new Error("Расписание недоступно.");
  if (user.role === "student") {
    if (requested !== undefined && ownerId !== user.id) throw new Error("Расписание недоступно.");
    return { ownerId, ownerName: user.full_name, delegated: false, offset: await getScheduleOffset(), rules: [] as AvailabilityRule[] };
  }
  const db = await createClient();
  const {data,error} = await db.rpc("schedule_owner_context", {p_owner: ownerId});
  if (error || !data) throw new Error("Расписание недоступно.");
  return { ...(data as {ownerId: string; ownerName: string; offset: number; rules: AvailabilityRule[]}), delegated: ownerId !== user.id };
}
