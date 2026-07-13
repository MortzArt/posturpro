import { cn } from "@/lib/utils";

/**
 * PdpSkeleton (T4 UX loading state). Mirrors the real PDP layout so the swap to
 * content causes NO layout shift (gallery box + purchase-panel bars, spec rows,
 * Q&A block). Pulse is `motion-safe:` only. The recently-viewed strip is NOT
 * skeletoned — it is client-only with an empty SSR shell, so a skeleton there
 * would be a phantom (design spec).
 */

/** A single pulsing bar. */
function Bar({ className }: { className?: string }) {
  return (
    <div
      className={cn("rounded bg-muted motion-safe:animate-pulse", className)}
    />
  );
}

export function PdpSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "mx-auto max-w-(--breakpoint-xl) px-4 py-8 md:px-6 md:py-10 lg:px-8",
        className,
      )}
      aria-hidden
      data-testid="pdp-skeleton"
    >
      {/* breadcrumb row */}
      <div className="flex items-center gap-2 py-3">
        <Bar className="h-4 w-12" />
        <Bar className="h-4 w-16" />
        <Bar className="h-4 w-28" />
      </div>

      {/* two-column: gallery + purchase panel */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-10">
        <div className="flex flex-col gap-3">
          <div className="aspect-[4/5] w-full rounded-lg bg-muted motion-safe:animate-pulse" />
          <div className="flex gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Bar key={index} className="size-16 rounded-md" />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <Bar className="h-3 w-24" />
          <Bar className="h-8 w-3/4" />
          <Bar className="h-6 w-32" />
          <Bar className="h-6 w-24 rounded-full" />
          <div className="flex gap-2 pt-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Bar key={index} className="size-9 rounded-full" />
            ))}
          </div>
        </div>
      </div>

      {/* specs */}
      <div className="mt-10 flex flex-col gap-3 md:mt-12">
        <Bar className="h-4 w-40" />
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex justify-between gap-4">
            <Bar className="h-4 w-24" />
            <Bar className="h-4 w-16" />
          </div>
        ))}
      </div>

      {/* Q&A */}
      <div className="mt-10 flex max-w-2xl flex-col gap-4 md:mt-12">
        <Bar className="h-4 w-48" />
        <Bar className="h-16 w-full rounded-md" />
        <Bar className="h-16 w-full rounded-md" />
        <Bar className="h-10 w-full rounded-md" />
        <Bar className="h-24 w-full rounded-md" />
      </div>
    </div>
  );
}
