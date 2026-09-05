import { requireRole } from "@/lib/auth/access";
import { Navigation } from "./navigation";
import type { Role } from "@/types";
export async function DashboardShell({
  role,
  children,
}: {
  role: Role;
  children: React.ReactNode;
}) {
  const profile = await requireRole(role);
  return (
    <div className="dashboard">
      <Navigation profile={profile} />
      <main className="dashboard-main">
        <div className="dashboard-topbar">
          <span>
            TutorGate<span className="breadcrumb-divider">/</span>Личный кабинет
          </span>
          <span className="workspace-badge">
            {role === "admin"
              ? "Администрирование"
              : role === "tutor"
                ? "Преподавание"
                : "Обучение"}
          </span>
        </div>
        <div className="dashboard-content">{children}</div>
      </main>
    </div>
  );
}
