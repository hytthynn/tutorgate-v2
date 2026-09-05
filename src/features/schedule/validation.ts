import { z } from "zod";
import { lessonColors } from "./types";
import { validDate } from "./time";
export const offsetSchema = z.number().int().min(-12).max(12);
export const lessonSchema = z.object({
  studentId: z.uuid("Выберите ученика."),
  subjectId: z.uuid("Выберите предмет.").nullable(),
  subjectChanged: z.boolean().default(true),
  date: z.string().refine(validDate, "Укажите корректную дату."),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Укажите время в формате ЧЧ:ММ."),
  durationMinutes: z.number().int("Введите целое число минут.").min(1, "Минимум 1 минута.").max(600, "Максимум 600 минут."),
  note: z.string().max(4000, "Максимум 4000 символов."),
}).refine(v => v.subjectId !== null || !v.subjectChanged, { path: ["subjectId"], message: "Выберите предмет." });
export const moveSchema = z.object({ id: z.uuid(), startsAt: z.iso.datetime({ offset: true }) });
export const colorSchema = z.object({ id: z.uuid(), color: z.enum(lessonColors) });
export const completedSchema = z.object({ id: z.uuid(), completed: z.boolean() });
export const deleteSchema = z.array(z.uuid()).min(1).max(20000);
export type LessonInput = z.infer<typeof lessonSchema>;
const ids = z.array(z.uuid()).min(1).max(20000);
const instant = z.iso.datetime({ offset: true });
const signed = z.object({ payload: z.record(z.string(), z.unknown()), signature: z.string().regex(/^[a-f0-9]{64}$/) });
export const commandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("create"), id: z.null().optional(), ...lessonSchema.shape, startsAt: instant }),
  z.object({ kind: z.literal("edit"), id: z.uuid(), ...lessonSchema.shape, startsAt: instant }),
  z.object({ kind: z.literal("move"), ids, startsAt: instant }),
  z.object({ kind: z.literal("transfer"), ids, startsAt: instant, durationMinutes: z.number().int().min(1).max(600).optional() }),
  z.object({ kind: z.literal("paste"), ids, startsAt: instant }),
  z.object({ kind: z.literal("color"), ids, color: z.enum(lessonColors) }),
  z.object({ kind: z.literal("completed"), ids, completed: z.boolean() }),
  z.object({ kind: z.literal("delete"), ids }),
  z.object({ kind: z.literal("availability"), studentIds: ids, availableFrom: z.string().refine(validDate, "Укажите корректную дату.").nullable() }),
  z.object({ kind: z.literal("offset"), offset: offsetSchema }),
  z.object({ kind: z.literal("restore"), expected: signed, target: signed }),
]);
export type ScheduleCommand = z.infer<typeof commandSchema>;
