"use server";
import { resolveScheduleOwner } from "./queries";
import { z } from "zod";
import { requireRole } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { saveLesson, patchLesson, scheduleError } from "./service";
import { colorSchema, completedSchema, deleteSchema, moveSchema, offsetSchema } from "./validation";
import type { ScheduleResult } from "./types";
import { commandSchema } from "./validation";
export async function scheduleCommandAction(input: unknown, requestedOwner?: unknown): Promise<ScheduleResult> {
  const user = await requireRole();
  try {
    const command = commandSchema.parse(input);
    const owner = await resolveScheduleOwner(requestedOwner);
    if (owner.delegated && (command.kind === "offset" || (command.kind === "restore" && (command.target.payload.offsetChanged || command.expected.payload.offsetChanged)))) return { error: "Сдвиг задаёт репетитор в своём расписании." };
    if (user.role === "student" && command.kind !== "offset" && command.kind !== "restore") return { error: "Ученику доступен только просмотр расписания." };
    const db = await createClient();
    const { data, error } = await db.rpc("schedule_command", { p_command: command, ...(user.role !== "student" ? { p_owner: owner.ownerId } : {}) });
    return error ? scheduleError(error) : data as ScheduleResult;
  } catch (error) { return scheduleError(error); }
}
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
  try { const v = completedSchema.parse(input); return await patchLesson(v.id, { completed: v.completed }); }
  catch (error) { return scheduleError(error); }
}
export async function deleteLessonsAction(input: unknown): Promise<ScheduleResult> {
  const user = await requireRole();
  if (user.role === "student") return { error: "Ученику доступен только просмотр расписания." };
  try {
    const ids = [...new Set(deleteSchema.parse(input))];
    const db = await createClient();
    const { data, error } = await db.rpc("delete_schedule_lessons", { p_ids: ids });
    if (error) return scheduleError(error);
    return data as ScheduleResult;
  } catch (error) { return scheduleError(error); }
}
export async function saveSchedulePreferenceAction(input: unknown): Promise<ScheduleResult> {
  const user = await requireRole();
  try {
    const offset = offsetSchema.parse(input);
    const db = await createClient();
    const { error } = await db.from("user_schedule_preferences").upsert({ user_id: user.id, msk_offset_hours: offset });
    if (error) return scheduleError(error);
    return {};
  } catch (error) { return scheduleError(error); }
}
export async function getLessonNoteAction(input: unknown, requestedOwner?: unknown): Promise<ScheduleResult> {
  const user = await requireRole();
  if (user.role === "student") return { error: "Заметка недоступна." };
  try {
    const id = z.uuid().parse(input);
    const db = await createClient();
    const owner = await resolveScheduleOwner(requestedOwner);
    const { data, error } = await db.rpc("schedule_lesson_note", { p_owner: owner.ownerId, p_lesson: id });
    return error ? scheduleError(error) : { note: data ?? "" };
  } catch (error) { return scheduleError(error); }
}

// Background incremental sync for cron-created lessons, independent of navigation.
export async function syncScheduleAction(since: string, requestedOwner?: unknown) {
  await requireRole();
  const cursor = z.iso.datetime({ offset: true }).parse(since);
  const { readScheduleUpdates } = await import("./queries");
  return readScheduleUpdates(cursor, requestedOwner);
}
