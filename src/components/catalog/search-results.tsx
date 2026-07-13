import { getTranslations } from "next-intl/server";
import { CATALOG_PATH, POPULAR_PRODUCTS_MAX } from "@/lib/config";
import { makeHrefForPage } from "@/lib/catalog/page-helpers";
import { serializeFilters } from "@/lib/catalog/search-params";
import { searchProducts, listPopularProducts } from "@/lib/catalog/search";
import { ProductGrid } from "@/components/catalog/product-grid";
import { Pagination } from "@/components/catalog/pagination";
import { NoResults } from "@/components/catalog/no-results";
import type { CatalogFilters } from "@/lib/catalog/search.types";
import type { CatalogProductCard } from "@/lib/catalog/types";

/**
 * SearchResults (T5 AC-8, AC-15, AC-16) — the `searchParams`-dependent slice of
 * `/sillas`, isolated in the page's `<Suspense>` so the shell/toolbar/chips
 * render immediately and only this region shows the skeleton while the RPC runs.
 *
 * Runs `searchProducts` on the FILTERED set; on ≥1 match renders `ProductGrid` +
 * crawlable pagination whose page links PRESERVE the active filters (AC-15). On
 * 0 matches renders `NoResults` with the best-selling popular strip (AC-16). The
 * popular read is wrapped so its failure degrades gracefully — the no-results
 * message + CTA still render (error-states table, edge 8).
 */

interface SearchResultsProps {
  filters: CatalogFilters;
  rawPage: string | string[] | undefined;
}

/** Load the popular strip, degrading to an empty strip on failure (edge 8). */
async function safePopular(): Promise<CatalogProductCard[]> {
  try {
    return await listPopularProducts(POPULAR_PRODUCTS_MAX);
  } catch (error) {
    console.error(
      `[catalog] popular strip read failed (degraded): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return [];
  }
}

export async function SearchResults({ filters, rawPage }: SearchResultsProps) {
  const t = await getTranslations("catalog");
  const result = await searchProducts(filters, rawPage);

  // aria-live result count — reflects the FILTERED total, doubles as the
  // loading→done cue for screen readers (AC-14).
  const countNode = (
    <p
      aria-live="polite"
      className="mb-4 text-sm font-medium tabular-nums text-muted-foreground"
      data-testid="result-count"
    >
      {t("results.count", { count: result.total })}
    </p>
  );

  if (result.total === 0) {
    const popular = await safePopular();
    return (
      <>
        {countNode}
        <NoResults
          heading={t("noResults.heading")}
          queryEcho={buildEcho(filters, t)}
          clearLabel={t("noResults.clear")}
          clearHref={CATALOG_PATH}
          popular={popular}
          popularHeading={t("noResults.popularHeading")}
        />
      </>
    );
  }

  const query = serializeFilters(filters);
  const hrefForPage = makeHrefForPage(CATALOG_PATH, query);

  return (
    <>
      {countNode}
      <ProductGrid products={result.items} />
      <Pagination
        currentPage={result.page}
        lastPage={result.lastPage}
        hrefForPage={hrefForPage}
        labels={{
          label: t("pagination.label"),
          previous: t("pagination.previous"),
          next: t("pagination.next"),
          pageOf: t("pagination.pageOf", {
            page: result.page,
            total: result.lastPage,
          }),
          goToPage: (n) => t("pagination.goToPage", { page: n }),
          morePages: t("pagination.morePages"),
        }}
      />
    </>
  );
}

/** The no-results echo: the query if present, else "selected filters". */
function buildEcho(
  filters: CatalogFilters,
  t: Awaited<ReturnType<typeof getTranslations>>,
): string | null {
  if (filters.query !== null) {
    return t("noResults.echoQuery", { query: filters.query });
  }
  const hasFilters =
    filters.categoryIds.length > 0 ||
    filters.brandIds.length > 0 ||
    filters.styleIds.length > 0 ||
    filters.colors.length > 0 ||
    filters.materials.length > 0 ||
    filters.priceMin !== null ||
    filters.priceMax !== null ||
    !filters.inStockOnly;
  return hasFilters ? t("noResults.echoFilters") : null;
}
