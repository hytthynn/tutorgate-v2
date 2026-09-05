import {
  CalendarDays,
  Users,
  BookOpen,
  ChartNoAxesCombined,
} from "lucide-react";
const icons = {
  calendar: CalendarDays,
  users: Users,
  books: BookOpen,
  chart: ChartNoAxesCombined,
};
export function EmptyState({
  title,
  description,
  icon = "users",
  large = false,
}: {
  title: string;
  description?: string;
  icon?: keyof typeof icons;
  large?: boolean;
}) {
  const Icon = icons[icon];
  return (
    <div className={`empty-state ${large ? "empty-large" : ""}`}>
      <div className="empty-icon">
        <Icon size={26} strokeWidth={1.3} />
      </div>
      {large && <span className="eyebrow">НА СЛЕДУЮЩЕМ ЭТАПЕ</span>}
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
  );
}
