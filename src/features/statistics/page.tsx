import { PageHeading } from "@/components/shared/page-heading";
import { StatisticsView } from "@/components/statistics/statistics-view";
import { getDirectory } from "@/features/people/queries";
import { getScheduleOffset } from "@/features/schedule/queries";
import {
  parseStatisticsQuery,
  getAdminStatistics,
  getTutorStatistics,
} from "./service";
export async function StatisticsPage({
  admin,
  params,
}: {
  admin: boolean;
  params: Record<string, string | undefined>;
}) {
  const { query, period, error } = parseStatisticsQuery(params, await getScheduleOffset());
  const data = await (admin
    ? getAdminStatistics(query)
    : getTutorStatistics(query));
  const tutors = admin
    ? (await getDirectory()).profiles.filter((p) => p.role !== "student")
    : undefined;
  return (
    <>
      <PageHeading
        title="Статистика"
        description={
          admin
            ? "Общая картина занятий и результаты преподавателей."
            : "Ваши занятия, часы и заработок."
        }
      />
      <StatisticsView
        data={data}
        period={period}
        tutors={tutors}
        error={error}
      />
    </>
  );
}
