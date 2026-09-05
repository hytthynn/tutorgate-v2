import { type ReactNode, useId } from "react";
export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  const id = useId();
  return <span className="tg-tooltip" tabIndex={0} aria-describedby={id}>{children}<span id={id} role="tooltip">{text}</span></span>;
}
