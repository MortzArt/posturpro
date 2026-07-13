import { PRODUCTS_PER_PAGE } from "@/lib/config";

/**
 * Loading skeletons (T3 UX — loading state). Card-shaped placeholders that
 * match the real `ProductGrid` columns and the `aspect-[4/5]` image box
 * PIXEL-FOR-PIXEL, so the swap to real content causes NO layout shift (Emil:
 * "reserve exact space; never pop content in"). Pulse is `motion-safe:` only —
 * reduced-motion users get static boxes, not a looping opacity animation.
 */

/** A single skeleton card (image box + two text bars). */
function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="aspect-[4/5] w-full bg-muted motion-safe:animate-pulse" />
      <div className="flex flex-col gap-2 p-3 md:p-4">
        <div className="h-3 w-1/3 rounded bg-muted motion-safe:animate-pulse" />
        <div className="h-4 w-2/3 rounded bg-muted motion-safe:animate-pulse" />
        <div className="h-3 w-1/4 rounded bg-muted motion-safe:animate-pulse" />
      </div>
    </div>
  );
}

/** A full skeleton grid of `PRODUCTS_PER_PAGE` cards in the real grid layout. */
export function ProductGridSkeleton() {
  return (
    <ul
      className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 md:gap-x-6 md:gap-y-10 lg:grid-cols-4"
      aria-hidden
      data-testid="product-grid-skeleton"
    >
      {Array.from({ length: PRODUCTS_PER_PAGE }).map((_, index) => (
        <li key={index}>
          <SkeletonCard />
        </li>
      ))}
    </ul>
  );
}
