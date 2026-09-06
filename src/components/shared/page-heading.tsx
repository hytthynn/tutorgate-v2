export function PageHeading({
  title,
  description,
  count,
}: {
  title: string;
  description?: string;
  count?: number;
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
    </header>
  );
}
