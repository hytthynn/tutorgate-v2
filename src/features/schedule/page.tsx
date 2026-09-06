import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/access";
import { PageHeading } from "@/components/shared/page-heading";
import { ScheduleCalendar } from "@/components/schedule/calendar";
import { getSchedule } from "./queries";
export async function SchedulePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const actor = await requireRole();
  const requested = actor.role === "admin" ? params.tutor : undefined;
  const data = await getSchedule(params.week, requested).catch((error) => { if (requested !== undefined) notFound(); throw error; });
  return (
    <section className="schedule-page">
      <PageHeading
        title="Расписание"
        description={data.delegated ? `Расписание: ${data.ownerName}` : "Ваши занятия — в одном пространстве."}
      />
      {data.delegated && <Link href="/admin/tutors">← К репетиторам</Link>}
      <ScheduleCalendar key={data.ownerId} data={data} />
    </section>
  );
}
