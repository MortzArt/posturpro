import { HugeiconsIcon } from "@hugeicons/react";
import { SearchRemoveIcon } from "@hugeicons/core-free-icons";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { ProductGrid } from "@/components/catalog/product-grid";
import type { CatalogProductCard } from "@/lib/catalog/types";

/**
 * NoResults (T5 AC-16, edges 1, 6, 8). The zero-match state — NOT the generic
 * `EmptyState`, NOT a 404, NOT an error. States nothing matched (echoing the
 * query/filters), offers "Limpiar filtros" (→ clean `/sillas`), and shows a
 * "Sillas populares" strip (best-selling order, ≤ POPULAR_PRODUCTS_MAX,
 * independent of the active filters).
 *
 * Server component. Reuses `.enter-fade` for the message block (low-frequency)
 * and renders the popular strip through the SAME `ProductGrid` so cards/stagger/
 * badges are identical to the catalog. If `popular` is empty (edge 8 — empty
 * catalog or a failed-and-degraded popular read), the strip + heading are
 * omitted; the message + CTA still render (never a broken layout).
 */

interface NoResultsProps {
  heading: string;
  /** Echo of what was searched/filtered; `null` when nothing to echo. */
  queryEcho: string | null;
  clearLabel: string;
  clearHref: string;
  popular: CatalogProductCard[];
  popularHeading: string;
}

export async function NoResults({
  heading,
  queryEcho,
  clearLabel,
  clearHref,
  popular,
  popularHeading,
}: NoResultsProps) {
  return (
    <div className="flex flex-col gap-10" data-testid="no-results">
      <div className="enter-fade flex flex-col items-center gap-4 px-4 py-8 text-center">
        <HugeiconsIcon
          icon={SearchRemoveIcon}
          size={48}
          strokeWidth={1.5}
          aria-hidden
          className="text-muted-foreground"
        />
        <div className="flex w-full max-w-prose flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight break-words">
            {heading}
          </h2>
          {queryEcho ? (
            <p
              className="text-sm text-muted-foreground break-words"
              data-testid="no-results-echo"
            >
              {queryEcho}
            </p>
          ) : null}
        </div>
        <Button asChild size="lg" className="min-h-11 px-4">
          <Link href={clearHref} data-testid="no-results-clear">
            {clearLabel}
          </Link>
        </Button>
      </div>

      {popular.length > 0 ? (
        <section aria-label={popularHeading} data-testid="popular-strip">
          <h2 className="mb-6 text-center text-sm font-semibold tracking-tight text-muted-foreground">
            {popularHeading}
          </h2>
          <ProductGrid products={popular} />
        </section>
      ) : null}
    </div>
  );
}
