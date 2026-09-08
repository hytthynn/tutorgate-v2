import { SupportLink } from "@/components/shared/support-link";
import { Brand } from "@/components/shared/brand";
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="public-shell">
      <header className="public-header">
        <Brand />
        <SupportLink />
      </header>
      <main className="public-main">{children}</main>
    </div>
  );
}
