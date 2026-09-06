import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
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
        actions={data.delegated && (
          <Button asChild variant="secondary" size="sm" className="schedule-back">
            <Link href="/admin/tutors"><ArrowLeft size={16} aria-hidden="true" />К репетиторам</Link>
          </Button>
        )}
        description={data.delegated ? `Расписание: ${data.ownerName}` : "Ваши занятия — в одном пространстве."}
      />
      <ScheduleCalendar key={data.ownerId} data={data} />
    </section>
  );
}
