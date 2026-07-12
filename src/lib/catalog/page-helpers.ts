/**
 * Shared helpers for catalog listing PAGES (T3). Keeps the page-1-canonical
 * rule and the `?page` href construction single-sourced so `/sillas`,
 * `/marcas/[slug]`, etc. all behave identically (AC-9).
 */

import type { CatalogPage, CatalogProductCard } from "@/lib/catalog/types";
import { parsePageParam } from "@/lib/catalog/pagination";

/** A function that reads a specific 1-based page of products. */
type PageReader = (
  page: number,
) => Promise<CatalogPage<CatalogProductCard>>;

/**
 * Read a product page with correct `?page` clamping (AC-14, edge case 7).
 *
 * The total (and thus `lastPage`) is only known after a read. We ALWAYS read
 * page 1 first — its `.range()` offset is 0, which is always in-bounds, so an
 * out-of-range `?page=999` can never trigger a PostgREST "range not
 * satisfiable" error. Page 1 yields `lastPage`; we clamp the requested page to
 * `[1, lastPage]` and re-read only when the clamped page isn't 1. In the common
 * page-1 case this is a single read. Returns the clamped page + its result.
 *
 * @param rawPage the raw `searchParams.page` value
 * @param read a reader (e.g. `(p) => listProducts({ page: p })`)
 */
export async function readClampedProductPage(
  rawPage: string | string[] | undefined,
  read: PageReader,
): Promise<{
  page: number;
  result: CatalogPage<CatalogProductCard>;
}> {
  const firstPageResult = await read(1);
  const page = parsePageParam(rawPage, firstPageResult.lastPage);
  const result = page === 1 ? firstPageResult : await read(page);
  return { page, result };
}

/**
 * Build an `hrefForPage(n)` function for a base path.
 *
 * Page 1 → the bare `basePath` (NO `?page=1`, so page 1 self-canonicalizes to
 * the clean URL); pages 2+ → `${basePath}?page=N`. The locale-aware `Link`
 * adds the `/en` prefix; these hrefs stay locale-agnostic.
 *
 * @param basePath e.g. "/sillas" or "/marcas/ergovita"
 */
export function makeHrefForPage(basePath: string): (page: number) => string {
  return (page: number): string =>
    page <= 1 ? basePath : `${basePath}?page=${page}`;
}
