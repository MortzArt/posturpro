/**
 * AdminPage (T10) — the generic content wrapper giving every admin section a
 * consistent header (title + optional description + divider). Reused by Settings
 * now, Products/Orders later (T11/T12) — a section is a title + a body. Purely
 * presentational; a server component (no interactivity).
 */
export function AdminPage({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <header className="mb-6 border-b border-border pb-4">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </header>
      {children}
    </div>
  );
}
