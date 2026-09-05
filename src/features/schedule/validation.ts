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
