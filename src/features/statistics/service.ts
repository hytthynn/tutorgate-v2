import "server-only";
import { z } from "zod";
import { format, isValid, parseISO, subDays } from "date-fns";
import { requireRole } from "@/lib/auth/access";
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
  .refine((v) => isValid(parseISO(v)));
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
): { query: StatisticsQuery; error?: string; period: string } {
  const period = ["7", "14", "30", "custom"].includes(params.period ?? "")
    ? params.period!
    : "7";
  const now = new Date();
  const fallback: StatisticsQuery = {
    from: format(
      subDays(now, Number(period === "custom" ? "7" : period) - 1),
      "yyyy-MM-dd",
    ),
    to: format(now, "yyyy-MM-dd"),
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
// Replace this datasource when the scheduling domain is designed. No lesson
// tables, simulated history or inferred earnings in MVP.
async function emptyDatasource(
  query: StatisticsQuery,
): Promise<StatisticsResult> {
  return { points: [], totals: { earnings: 0, hours: 0, lessons: 0 }, query };
}
export async function getTutorStatistics(query: StatisticsQuery) {
  const tutor = await requireRole("tutor");
  return emptyDatasource({ ...querySchema.parse(query), tutorId: tutor.id });
}
export async function getAdminStatistics(query: StatisticsQuery) {
  await requireRole("admin");
  return emptyDatasource(querySchema.parse(query));
}
