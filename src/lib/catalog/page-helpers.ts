/**
 * Shared helpers for catalog listing PAGES (T3). Keeps the page-1-canonical
 * rule and the `?page` href construction single-sourced so `/sillas`,
 * `/marcas/[slug]`, etc. all behave identically (AC-9).
 *
 * NOTE: page clamping now lives in the query layer (`readProductPage` runs a
 * count-only query, computes `lastPage`, and clamps the raw `?page` before a
 * single data read — M-2), so this module only owns href construction.
 */

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
