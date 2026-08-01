/**
 * Order-list loading skeleton (T12 UX). Mirrors the list layout: a filter bar
 * placeholder + skeleton table rows (desktop) / cards (mobile). Pulse is opacity-
 * only (reduced-motion honored by the `animate-pulse` utility's config).
 */
export default function OrdersLoading() {
  return (
    <div>
      <div className="mb-6 border-b border-border pb-4">
        <div className="h-6 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-4 w-24 animate-pulse rounded bg-muted" />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="h-11 flex-1 animate-pulse rounded-md bg-muted sm:min-w-56" />
        <div className="h-11 w-40 animate-pulse rounded-md bg-muted" />
        <div className="h-11 w-40 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="hidden overflow-hidden rounded-lg border border-border sm:block">
        {Array.from({ length: 10 }).map((_, index) => (
          <div key={index} className="flex items-center gap-4 border-b border-border px-3 py-3 last:border-0">
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            <div className="ml-auto h-4 w-16 animate-pulse rounded bg-muted" />
            <div className="h-5 w-20 animate-pulse rounded-full bg-muted" />
            <div className="h-5 w-20 animate-pulse rounded-full bg-muted" />
          </div>
        ))}
      </div>
      <ul className="flex flex-col gap-2 sm:hidden">
        {Array.from({ length: 6 }).map((_, index) => (
          <li key={index} className="h-20 animate-pulse rounded-lg border border-border bg-muted/40" />
        ))}
      </ul>
    </div>
  );
}
