import "server-only";
import { z } from "zod";
import { requireRole } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { getScheduleOffset, readLessons } from "@/features/schedule/queries";
import { addDays, localParts, localToUtc, validDate } from "@/features/schedule/time";
import { aggregateLessons } from "./aggregate";
export type StatisticsMetric = "earnings" | "hours" | "lessons";
export interface StatisticsPoint {
  date: string;
  value: number;
}
export interface StatisticsQuery {
  from: string;
  to: string;
  metric: StatisticsMetric;
  tutorId?: string;
}
export interface StatisticsResult {
  points: StatisticsPoint[];
  totals: Record<StatisticsMetric, number>;
  query: StatisticsQuery;
}
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(validDate);
const querySchema = z
  .object({
    from: date,
    to: date,
    metric: z.enum(["earnings", "hours", "lessons"]),
    tutorId: z.uuid().optional(),
  })
  .refine((q) => q.from <= q.to, {
    message: "Дата начала должна быть не позже даты окончания",
  });
export function parseStatisticsQuery(
  params: Record<string, string | undefined>,
  offset = 0,
): { query: StatisticsQuery; error?: string; period: string } {
  const period = ["7", "14", "30", "custom"].includes(params.period ?? "")
    ? params.period!
    : "7";
  const today = localParts(new Date(), offset).date;
  const fallback: StatisticsQuery = {
    from: addDays(today, -(Number(period === "custom" ? "7" : period) - 1)),
    to: today,
    metric: "earnings",
  };
  const result = querySchema.safeParse({
    from: period === "custom" ? params.from : fallback.from,
    to: period === "custom" ? params.to : fallback.to,
    metric: params.metric ?? "earnings",
    tutorId: params.tutor || undefined,
  });
  return result.success
    ? { query: result.data, period }
    : {
        query: fallback,
        period,
        error:
          "Проверьте период: укажите корректные даты, начало должно быть не позже окончания.",
      };
}
async function lessonsDatasource(
  query: StatisticsQuery,
): Promise<StatisticsResult> {
  const offset = await getScheduleOffset();
  const db = await createClient();
  const [rows, rate] = await Promise.all([
    readLessons(localToUtc(query.from, "00:00", offset), localToUtc(addDays(query.to, 1), "00:00", offset), { tutorId: query.tutorId, completed: true }),
    db.from("app_settings").select("hourly_rate").eq("id", true).single(),
  ]);
  if (rate.error) throw new Error("Не удалось загрузить ставку.");
  return { ...aggregateLessons(rows.map((l) => ({ startsAt: l.starts_at, endsAt: l.ends_at, completed: l.completed_at !== null })), query.from, query.to, offset, Number(rate.data.hourly_rate), query.metric), query };
}
export async function getTutorStatistics(query: StatisticsQuery) {
  const tutor = await requireRole("tutor");
  return lessonsDatasource({ ...querySchema.parse(query), tutorId: tutor.id });
}
export async function getAdminStatistics(query: StatisticsQuery) {
  await requireRole("admin");
  const parsed = querySchema.parse(query);
  if (parsed.tutorId) {
    const db = await createClient();
    const { data, error } = await db.rpc("visible_profiles").select("id,role").eq("id", parsed.tutorId).single();
    if (error || !data || data.role === "student") throw new Error("Выбранный репетитор недоступен.");
  }
  return lessonsDatasource(parsed);
}
