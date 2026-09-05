import "server-only";
import { z } from "zod";
import { requireRole } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { getScheduleOffset } from "./queries";
import { localToUtc } from "./time";
import { lessonSchema } from "./validation";
import type { ScheduleResult } from "./types";
export function scheduleError(error: unknown): ScheduleResult {
  if (error instanceof z.ZodError) return { errors: z.flattenError(error).fieldErrors as Record<string, string[]> };
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  if (code === "P0002") return { error: "В этот день нет свободного интервала такой длительности." };
  if (code === "PT001") return { errors: { date: ["Создавать занятия можно только в текущей неделе."] } };
  if (code === "PT002") return { error: "Будущая неделя заполняется автоматически после её начала." };
  if (code === "PT003") return { errors: { date: ["Выберите день недели редактируемого занятия."] } };
  if (code === "23514" || code === "23503") return { error: "Проверьте назначение ученика, доступность предмета и длительность занятия." };
  if (code === "42501" || code === "PGRST116") return { error: "Занятие недоступно для изменения." };
  return { error: "Не удалось сохранить изменения. Попробуйте ещё раз." };
}
// Protected pages are force-dynamic. No revalidatePath in schedule actions:
// it can cause Next to stream a replacement RSC tree after the action itself.
export async function saveLesson(id: unknown, input: unknown): Promise<ScheduleResult> {
  const user = await requireRole();
  if (user.role === "student") return { error: "Ученику доступен только просмотр расписания." };
  try {
    const lessonId = id === null ? null : z.uuid().parse(id);
    const value = lessonSchema.parse(input);
    if (!lessonId && !value.subjectId) return { errors: { subjectId: ["Выберите предмет."] } };
    const offset = await getScheduleOffset(), db = await createClient();
    const { data, error } = await db.rpc("save_schedule_lesson", {
      p_id: lessonId, p_student: value.studentId, p_subject: value.subjectId, p_subject_changed: lessonId ? value.subjectChanged : true,
      p_start: localToUtc(value.date, value.time, offset), p_duration: value.durationMinutes, p_note: value.note,
    });
    return error ? scheduleError(error) : data as ScheduleResult;
  } catch (error) { return scheduleError(error); }
}
export async function patchLesson(id: string, patch: { starts_at?: string; color?: string; completed?: boolean }): Promise<ScheduleResult> {
  const user = await requireRole();
  if (user.role === "student") return { error: "Ученику доступен только просмотр расписания." };
  const db = await createClient();
  const { data, error } = await db.rpc("patch_schedule_lesson", { p_id: id, p_start: patch.starts_at ?? null, p_color: patch.color ?? null, p_completed: patch.completed ?? null });
  return error ? scheduleError(error) : data as ScheduleResult;
}
