"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  Users,
  GraduationCap,
  ChartNoAxesCombined,
  Settings2,
  Menu,
  ChevronRight,
  LogOut,
} from "lucide-react";
import { Brand } from "@/components/shared/brand";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/features/auth/actions";
import { initials } from "@/lib/utils";
import type { Profile } from "@/types";
const items = [
  { key: "schedule", label: "Расписание", icon: CalendarDays },
  { key: "tutors", label: "Репетиторы", icon: GraduationCap },
  { key: "students", label: "Ученики", icon: Users },
  { key: "statistics", label: "Статистика", icon: ChartNoAxesCombined },
  { key: "settings", label: "Настройки", icon: Settings2 },
];
const allowed = {
  student: ["schedule", "tutors"],
  tutor: ["schedule", "students", "statistics"],
  admin: ["schedule", "tutors", "students", "statistics", "settings"],
};
const roleNames = {
  student: "Ученик",
  tutor: "Репетитор",
  admin: "Администратор",
};
export function Navigation({ profile }: { profile: Profile }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const links = (
    <nav aria-label="Основная навигация">
      {items
        .filter((i) => allowed[profile.role].includes(i.key))
        .map(({ key, label, icon: Icon }) => (
          <Link
            key={key}
            href={`/${profile.role}/${key}`}
            onClick={() => setOpen(false)}
            className={`nav-item ${pathname.endsWith(`/${key}`) ? "active" : ""}`}
            aria-current={pathname.endsWith(`/${key}`) ? "page" : undefined}
          >
            <Icon size={17} />
            {label}
            {pathname.endsWith(`/${key}`) && (
              <ChevronRight size={14} className="nav-chevron" />
            )}
          </Link>
        ))}
    </nav>
  );
  const account = (
    <div className="account">
      <span className="avatar">{initials(profile.full_name)}</span>
      <span className="account-text">
        <strong>{profile.full_name}</strong>
        <small>{roleNames[profile.role]}</small>
      </span>
      <form noValidate action={logoutAction}>
        <LogoutButton />
      </form>
    </div>
  );
  return (
    <>
      <aside className="sidebar">
        <Brand href={`/${profile.role}/schedule`} />
        <div className="workspace-label">ЛИЧНЫЙ КАБИНЕТ</div>
        {links}
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="status-dot" />
            Всё начинается с знаний
          </div>
          {account}
        </div>
      </aside>
      <header className="mobile-header">
        <Brand href={`/${profile.role}/schedule`} />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Открыть меню">
              <Menu size={22} />
            </Button>
          </DialogTrigger>
          <DialogContent className="mobile-sheet">
            <DialogTitle>Личный кабинет</DialogTitle>
            <DialogDescription>{roleNames[profile.role]}</DialogDescription>
            {links}
            {account}
          </DialogContent>
        </Dialog>
      </header>
    </>
  );
}

function LogoutButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" size="icon" variant="ghost" loading={pending} aria-label={pending ? "Выход из аккаунта…" : "Выйти из аккаунта"}><LogOut size={16} /></Button>;
}
