/**
 * Shared helpers for catalog listing PAGES (T3, extended in T5). Keeps the
 * page-1-canonical rule and the `?page` href construction single-sourced so
 * `/sillas`, `/marcas/[slug]`, etc. all behave identically (AC-9).
 *
 * NOTE: page clamping lives in the query layer (`readProductPage` /
 * `readSearchPage` run a count/probe, compute `lastPage`, and clamp the raw
 * `?page` before the data read — M-2), so this module only owns href
 * construction.
 */

/**
 * Build an `hrefForPage(n)` function for a base path, optionally carrying an
 * active filter/sort/search query string so page links preserve state (T5
 * AC-15).
 *
 * Page 1 → the base path with just the filter query (NO `?page=1`, so page 1
 * self-canonicalizes to the clean filtered URL); pages 2+ → the filter query
 * plus `page=N`. The locale-aware `Link` adds the `/en` prefix; these hrefs stay
 * locale-agnostic.
 *
 * @param basePath e.g. "/sillas" or "/marcas/ergovita"
 * @param query pre-serialized "q=malla&marca=ergovita&orden=precio-asc" (no
 *   leading `?`, no `page`); omit/empty for the unfiltered listings (unchanged
 *   behavior).
 */
export function makeHrefForPage(
  basePath: string,
  query?: string,
): (page: number) => string {
  const params = query && query.length > 0 ? query : "";
  return (page: number): string => {
    if (page <= 1) {
      return params ? `${basePath}?${params}` : basePath;
    }
    const sep = params ? `${params}&` : "";
    return `${basePath}?${sep}page=${page}`;
  };
}
