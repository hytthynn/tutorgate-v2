import Link from "next/link";
export function Brand({ href = "/login" }: { href?: string }) {
  return (
    <Link href={href} className="brand" aria-label="TutorGate — главная">
      <span className="brand-mark">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 20V7a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v13" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      <span>
        Tutor<span className="brand-light">Gate</span>
        <span className="brand-dot">.</span>
      </span>
    </Link>
  );
}
