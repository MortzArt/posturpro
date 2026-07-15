/**
 * AdminPage (T10) — the generic content wrapper giving every admin section a
 * consistent header (title + optional description + divider). Reused by Settings
 * now, Products/Taxonomy/Q&A (T11), Orders (T12) — a section is a title + a body.
 * Purely presentational; a server component (no interactivity).
 *
 * T11 adds an optional `actions` slot (right-aligned header controls, e.g.
 * "Nuevo producto" / CSV buttons) that wraps below the title on narrow screens.
 */
export function AdminPage({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <header className="mb-6 flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </header>
      {children}
    </div>
  );
}
