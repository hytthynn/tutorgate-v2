"use server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { saveLesson, patchLesson, scheduleError, revalidateSchedule } from "./service";
import { colorSchema, completedSchema, deleteSchema, moveSchema, offsetSchema } from "./validation";
import type { ScheduleResult } from "./types";
export async function createLessonAction(input: unknown) { return saveLesson(null, input); }
export async function updateLessonAction(id: unknown, input: unknown) { return saveLesson(id, input); }
export async function moveLessonAction(input: unknown): Promise<ScheduleResult> {
  await requireRole();
  try { const v = moveSchema.parse(input); return await patchLesson(v.id, { starts_at: v.startsAt }); }
  catch (error) { return scheduleError(error); }
}
export async function setLessonColorAction(input: unknown): Promise<ScheduleResult> {
  await requireRole();
  try { const v = colorSchema.parse(input); return await patchLesson(v.id, { color: v.color }); }
  catch (error) { return scheduleError(error); }
}
export async function setLessonCompletedAction(input: unknown): Promise<ScheduleResult> {
  await requireRole();
  try { const v = completedSchema.parse(input); return await patchLesson(v.id, { completed_at: v.completed ? new Date().toISOString() : null }); }
  catch (error) { return scheduleError(error); }
}
export async function deleteLessonsAction(input: unknown): Promise<ScheduleResult> {
  const user = await requireRole();
  if (user.role === "student") return { error: "Ученику доступен только просмотр расписания." };
  try {
    const ids = [...new Set(deleteSchema.parse(input))];
    const db = await createClient();
    const { error } = await db.rpc("delete_schedule_lessons", { p_ids: ids });
    if (error) return scheduleError(error);
    revalidateSchedule(); return {};
  } catch (error) { return scheduleError(error); }
}
export async function saveSchedulePreferenceAction(input: unknown): Promise<ScheduleResult> {
  const user = await requireRole();
  try {
    const offset = offsetSchema.parse(input);
    const db = await createClient();
    const { error } = await db.from("user_schedule_preferences").upsert({ user_id: user.id, msk_offset_hours: offset });
    if (error) return scheduleError(error);
    revalidateSchedule(); return {};
  } catch (error) { return scheduleError(error); }
}
export async function getLessonNoteAction(input: unknown): Promise<ScheduleResult> {
  const user = await requireRole();
  if (user.role === "student") return { error: "Заметка недоступна." };
  try {
    const id = z.uuid().parse(input);
    const db = await createClient();
    const lesson = await db.from("lessons").select("id").eq("id", id).eq("tutor_id", user.id).single();
    if (lesson.error) return scheduleError(lesson.error);
    const { data, error } = await db.from("lesson_private_notes").select("note").eq("lesson_id", id).maybeSingle();
    return error ? scheduleError(error) : { note: data?.note ?? "" };
  } catch (error) { return scheduleError(error); }
}
