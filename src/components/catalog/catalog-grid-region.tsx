"use client";

import { useFilterNavigation } from "@/components/catalog/filter-navigation";
import { cn } from "@/lib/utils";

/**
 * Applies the pending dim (M-7) to the grid region while a client-initiated
 * filter/sort change re-queries. Reads `isPending` from the shared filter
 * navigation and swaps `.grid-idle`↔`.grid-pending` (opacity-only, RM-safe).
 * The children are the server-rendered grid/no-results — dimming the stale
 * results avoids a skeleton flash on fast local reads (Emil: prevent jarring
 * changes). This transition-driven dim is the sole in-page pending indication
 * for client-side filter/sort/search: `/sillas` renders its results INLINE
 * (no route `loading.tsx`, no `<Suspense>` — QA-BUG-1) so a no-JS browser sees
 * real content, and a JS-on navigation keeps the previous results visible-but-
 * dimmed until the new RSC payload lands rather than flashing a skeleton.
 */
export function CatalogGridRegion({ children }: { children: React.ReactNode }) {
  const { isPending } = useFilterNavigation();
  return (
    <div
      className={cn(isPending ? "grid-pending" : "grid-idle")}
      aria-busy={isPending}
      data-testid="grid-region"
    >
      {children}
    </div>
  );
}
