import Link from "next/link";
import { PanelLeftClose } from "lucide-react";
export function Brand({ href = "/login" }: { href?: string }) {
  return (
    <Link href={href} className="brand" aria-label="TutorGate — главная">
      <span className="brand-mark">
        <PanelLeftClose size={21} strokeWidth={1.7} />
      </span>
      <span>
        Tutor<span className="brand-light">Gate</span>
        <span className="brand-dot">.</span>
      </span>
    </Link>
  );
}
