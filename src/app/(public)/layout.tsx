import { Brand } from "@/components/shared/brand";
import { ArrowUpRight, LockKeyhole } from "lucide-react";
import Link from "next/link";
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="public-shell">
      <header className="public-header">
        <Brand />
        <Link href="/apply" className="header-link">
          Стать частью TutorGate
          <ArrowUpRight size={14} />
        </Link>
      </header>
      <main className="public-main">{children}</main>
      <footer className="public-footer">
        <span>© {new Date().getFullYear()} TutorGate</span>
        <span>
          <LockKeyhole size={12} />
          Закрытое пространство обучения
        </span>
      </footer>
    </div>
  );
}
