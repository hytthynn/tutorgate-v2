import "server-only";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { getScheduleOffset } from "./queries";
import { localToUtc } from "./time";
import { lessonSchema } from "./validation";
import type { ScheduleResult } from "./types";
export function scheduleError(error: unknown): ScheduleResult {
  if (error instanceof z.ZodError) return { error: "Проверьте поля формы.", errors: z.flattenError(error).fieldErrors as Record<string, string[]> };
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  if (code === "23P01") return { error: "Это время уже занято другим занятием." };
  if (code === "23514" || code === "23503") return { error: "Проверьте назначение ученика, доступность предмета и длительность занятия." };
  if (code === "42501" || code === "PGRST116") return { error: "Занятие недоступно для изменения." };
  return { error: "Не удалось сохранить изменения. Попробуйте ещё раз." };
}
export function revalidateSchedule() {
  for (const role of ["student", "tutor", "admin"]) revalidatePath(`/${role}/schedule`);
  for (const role of ["tutor", "admin"]) revalidatePath(`/${role}/statistics`);
}
export async function saveLesson(id: unknown, input: unknown): Promise<ScheduleResult> {
  const user = await requireRole();
  if (user.role === "student") return { error: "Ученику доступен только просмотр расписания." };
  try {
    const lessonId = id === null ? null : z.uuid().parse(id);
    const value = lessonSchema.parse(input);
    const offset = await getScheduleOffset();
    const db = await createClient();
    const { data, error } = await db.rpc("save_schedule_lesson", {
      p_id: lessonId, p_student: value.studentId, p_subject: value.subjectId,
      p_start: localToUtc(value.date, value.time, offset), p_duration: value.durationMinutes, p_note: value.note,
    });
    if (error) return scheduleError(error);
    revalidateSchedule();
    return { id: data as string };
  } catch (error) { return scheduleError(error); }
}
export async function patchLesson(id: string, patch: Record<string, unknown>): Promise<ScheduleResult> {
  const user = await requireRole();
  if (user.role === "student") return { error: "Ученику доступен только просмотр расписания." };
  const db = await createClient();
  const { error } = await db.from("lessons").update(patch).eq("id", id).eq("tutor_id", user.id).select("id").single();
  if (error) return scheduleError(error);
  revalidateSchedule();
  return { id };
}
