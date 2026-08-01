/**
 * Order-detail loading skeleton (T12 UX). Section skeletons for the stepper,
 * summary, items, and history. Pulse is opacity-only.
 */
export default function OrderDetailLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="mb-2 h-4 w-16 animate-pulse rounded bg-muted" />
        <div className="h-7 w-56 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-4 w-64 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-16 animate-pulse rounded-lg border border-border bg-muted/40" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div className="h-40 animate-pulse rounded-lg border border-border bg-muted/40" />
          <div className="h-48 animate-pulse rounded-lg border border-border bg-muted/40" />
        </div>
        <div className="flex flex-col gap-4">
          <div className="h-32 animate-pulse rounded-lg border border-border bg-muted/40" />
          <div className="h-40 animate-pulse rounded-lg border border-border bg-muted/40" />
        </div>
      </div>
    </div>
  );
}
