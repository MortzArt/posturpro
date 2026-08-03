/**
 * Customer-detail loading skeleton (T18 UX). Covers the navigation gap: a
 * back-link + identity bars, then three panel skeletons of decreasing height for
 * the totals / order-history / contact sections. Pulse is opacity-only.
 */
export default function CustomerDetailLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="mb-2 h-4 w-16 animate-pulse rounded bg-muted" />
        <div className="h-7 w-56 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-4 w-64 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-32 animate-pulse rounded-lg border border-border bg-muted/40" />
      <div className="h-48 animate-pulse rounded-lg border border-border bg-muted/40" />
      <div className="h-40 animate-pulse rounded-lg border border-border bg-muted/40" />
    </div>
  );
}
