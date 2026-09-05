import { EmptyState } from "@/components/shared/empty-state";
import { PageHeading } from "@/components/shared/page-heading";
export function SchedulePage() {
  return (
    <>
      <PageHeading
        title="Расписание"
        description="Ваши занятия — в одном пространстве."
      />
      <section className="panel schedule-panel">
        <div className="panel-topline">
          <span>Моё расписание</span>
          <span className="badge">Скоро</span>
        </div>
        <EmptyState
          title="Расписание пока недоступно"
          description="Этот раздел будет реализован на следующем этапе."
          icon="calendar"
          large
        />
      </section>
    </>
  );
}
