export function DashboardLoading() {
  return (
    <div aria-label="Загрузка" role="status">
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-subtitle" />
      <div className="skeleton skeleton-panel" />
    </div>
  );
}
