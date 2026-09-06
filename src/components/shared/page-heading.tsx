import type { ReactNode } from "react";
export function PageHeading({
  title,
  description,
  count,
  actions,
}: {
  title: string;
  description?: string;
  count?: number;
  actions?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <h1>
          {title}
          {count !== undefined && <span className="count-badge">{count}</span>}
        </h1>
        {description && <p>{description}</p>}
      </div>
      {actions}
    </header>
  );
}
