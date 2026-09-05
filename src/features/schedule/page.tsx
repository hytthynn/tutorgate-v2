import { PageHeading } from "@/components/shared/page-heading";
import { ScheduleCalendar } from "@/components/schedule/calendar";
import { getSchedule } from "./queries";
export async function SchedulePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const data = await getSchedule(params.week);
  return (
    <section className="schedule-page">
      <PageHeading
        title="Расписание"
        description="Ваши занятия — в одном пространстве."
      />
      <ScheduleCalendar data={data} />
    </section>
  );
}
