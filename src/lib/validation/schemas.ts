import { z } from "zod";
export const goals = [
  "ЕГЭ / ОГЭ",
  "Школьная программа",
  "Для себя",
  "Работа / карьера",
  "Другое",
] as const;
export const experiences = [
  "До 1 года",
  "1–3 года",
  "3–5 лет",
  "5+ лет",
] as const;
export const username = z
  .string()
  .transform((v) => v.trim().toLowerCase())
  .pipe(
    z
      .string()
      .regex(/^[a-z0-9_]{3,32}$/, "От 3 до 32 символов: латиница, цифры и _"),
  );
export const telegram = z
  .string()
  .trim()
  .transform((v) => v.replace(/^@/, "").toLowerCase())
  .pipe(
    z
      .string()
      .regex(
        /^[a-z][a-z0-9_]{4,31}$/,
        "Укажите Telegram username, например @ivanov",
      ),
  );
const password = z
  .string()
  .min(8, "Минимум 8 символов")
  .max(128, "Не более 128 символов");
const applicationBase = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, "Введите ФИО")
    .max(150, "Не более 150 символов"),
  telegram_username: telegram,
  subject_ids: z
    .array(z.uuid())
    .min(1, "Выберите хотя бы один предмет")
    .max(30),
  privacy: z.literal(true, {
    error: "Необходимо согласие на обработку данных",
  }),
});
export const applicationStudentSchema = applicationBase.extend({
  role: z.literal("student"),
  student_goal: z.enum(goals, { error: "Выберите цель занятий" }),
});
export const applicationTutorSchema = applicationBase.extend({
  role: z.literal("tutor"),
  teaching_experience: z.enum(experiences, {
    error: "Выберите опыт преподавания",
  }),
});
export const applicationSchema = z.discriminatedUnion("role", [
  applicationStudentSchema,
  applicationTutorSchema,
]);
export const loginSchema = z.object({
  username,
  password: z.string().min(1, "Введите пароль").max(128),
});
export const registrationSchema = z
  .object({
    username,
    password,
    confirm: z.string(),
    token: z.string().regex(/^[\w-]{43}$/, "Недействительная ссылка"),
  })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "Пароли не совпадают",
  });
export const forgotPasswordSchema = z.object({ telegram_username: telegram });
export const resetPasswordSchema = z
  .object({
    password,
    confirm: z.string(),
    token: z.string().regex(/^[\w-]{43}$/, "Недействительная ссылка"),
  })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "Пароли не совпадают",
  });
export const subjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Введите название предмета")
    .max(80, "Не более 80 символов"),
});
export const hourlyRateSchema = z.object({
  hourly_rate: z.preprocess(v => v === "" || v === null ? NaN : v, z.coerce
    .number({ error: "Введите ставку числом" })
    .min(0, "Ставка не может быть отрицательной")
    .max(1000000, "Не более 1 000 000 ₽")
    .multipleOf(0.01, "Не более двух знаков после запятой")),
});
export const assignmentSchema = z.object({
  student_id: z.uuid(),
  subject_id: z.uuid("Выберите предмет"),
  tutor_id: z.uuid("Выберите репетитора"),
});
export const tutorSubjectsSchema = z.object({
  tutor_id: z.uuid(),
  subject_ids: z.array(z.uuid()).max(100),
});
export const idSchema = z.object({ id: z.uuid() });
