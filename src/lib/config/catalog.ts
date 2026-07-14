/**
 * Catalog + search/filter/sort non-secret tunables and path builders (T3, T5).
 *
 * A2 split (see `src/lib/config.ts` header): content moved VERBATIM from the
 * former monolithic `config.ts`. Single-sourced here (Rule 4) so pagination,
 * skeletons, links, breadcrumbs, and the search/filter parse lib never drift.
 */

/* ========================================================================= *
 * CATALOG (T3) — non-secret tunables, single-sourced here (Rule 4).
 * ========================================================================= */

/**
 * Products shown per catalog/category/brand/style grid page (T3 AC-9).
 * 12 is divisible by the 2 / 3 / 4 grid columns, so the last row is never
 * ragged at any breakpoint. Change this and pagination math + skeleton count
 * follow automatically (both read this constant).
 */
export const PRODUCTS_PER_PAGE = 12;

/**
 * Absolute upper bound on the `?page` value that is ever treated as distinct
 * (T3 security — cache-key cardinality / DoS bound). The `?page` query param is
 * attacker-controlled and flows into the `unstable_cache` key. Without a ceiling
 * an attacker could mint an unbounded number of distinct cache entries (and one
 * DB count+read per distinct value) with `?page=1`, `?page=2`, … `?page=1e9`,
 * random junk, etc. — unbounded cache growth + amplified DB load.
 *
 * The page always clamps to `[1, lastPage]` for the actual read, and no real
 * catalog will approach this many pages (12 items/page × 100 000 pages = 1.2M
 * products), so any value above this is functionally identical to "last page"
 * and is collapsed to a SINGLE cache key. This bounds distinct cache keys per
 * listing to `MAX_PAGE + 1` regardless of how many junk values are requested.
 */
export const MAX_PAGE = 100_000;

/**
 * Inclusive upper bound for the "low stock" badge state (T3 AC-8). Effective
 * stock `1..LOW_STOCK_THRESHOLD` renders "Solo quedan {n}"; `> threshold`
 * renders "En stock"; `0` renders "Agotado".
 */
export const LOW_STOCK_THRESHOLD = 5;

/**
 * ISR revalidation window (seconds) for cached catalog reads and the static
 * store-settings read (T3 AC-11). Catalog pages become static/ISR; admin CRUD
 * (T10) busts the relevant `unstable_cache` tag on demand, so this is only the
 * fallback staleness ceiling, not the primary freshness mechanism. 5 minutes.
 */
export const CATALOG_REVALIDATE_SECONDS = 300;

/* ------------------------------------------------------------------------- *
 * Catalog route segments — locale-agnostic Spanish paths (T3 routing
 * decision). The locale-aware `Link` adds the `/en` prefix automatically, so
 * these are single-sourced here rather than hardcoded across pages/breadcrumbs.
 * ------------------------------------------------------------------------- */

/** All-products catalog grid. */
export const CATALOG_PATH = "/sillas" as const;
/** Category index. */
export const CATEGORIES_PATH = "/categorias" as const;
/** Brand index. */
export const BRANDS_PATH = "/marcas" as const;
/** Style index. */
export const STYLES_PATH = "/estilos" as const;

/** Build the canonical category detail path for a slug. */
export function categoryPath(slug: string): string {
  return `${CATEGORIES_PATH}/${slug}`;
}
/** Build the canonical brand detail path for a slug. */
export function brandPath(slug: string): string {
  return `${BRANDS_PATH}/${slug}`;
}
/** Build the canonical style detail path for a slug. */
export function stylePath(slug: string): string {
  return `${STYLES_PATH}/${slug}`;
}
/**
 * Canonical product-detail (PDP) path for a slug (T3 AC-12). The route is
 * owned by T4 and may 404 via the catch-all until it ships — T3 only links to
 * it. Single-sourced so T4 need not hunt for hardcoded strings.
 */
export function productPath(slug: string): string {
  return `/producto/${slug}`;
}

/* ========================================================================= *
 * SEARCH / FILTERS / SORTING (T5) — non-secret tunables, single-sourced (AC-9).
 * ========================================================================= */

/**
 * URL query-param names for search/filter/sort state (AC-9). Spanish, matching
 * the store's Spanish route paths, single-sourced so pages, links, and the
 * parse lib never drift. `page` is the existing pagination param (reused).
 */
export const SEARCH_PARAM_KEYS = {
  q: "q",
  categoria: "categoria",
  marca: "marca",
  estilo: "estilo",
  color: "color",
  material: "material",
  precioMin: "precioMin",
  precioMax: "precioMax",
  disponibilidad: "disponibilidad", // "todos" opts into out-of-stock
  orden: "orden",
  page: "page",
} as const;

/** A single SEARCH_PARAM_KEYS map type (for typed component props). */
export type SearchParamKeys = typeof SEARCH_PARAM_KEYS;

/**
 * The closed set of sort keys (AC-7). Spanish values that appear verbatim in
 * the URL (`?orden=precio-asc`). Any value outside this set is dropped and the
 * default is used, so an attacker cannot inject a sort expression (edge 3).
 */
export const SORT_KEYS = [
  "mas-vendidas", // best-selling (default): sales_count DESC + tiebreak
  "precio-asc",
  "precio-desc",
  "novedades", // created_at DESC
  "nombre-asc",
  "nombre-desc",
] as const;

/** Default sort when `?orden` is absent or unknown — matches the T3 default. */
export const DEFAULT_SORT = "mas-vendidas" as const;

/** The value of `?disponibilidad` that opts into out-of-stock products. */
export const AVAILABILITY_ALL = "todos" as const;

/**
 * Hard cap on the free-text `q` length enforced BEFORE the RPC (Constraint 3).
 * Free-text search is never cached (unbounded key cardinality = cache-key DoS);
 * capping the length bounds the DB work per request. 80 chars comfortably fits
 * any real product query.
 */
export const SEARCH_QUERY_MAX = 80;

/** Products shown in the no-results "popular chairs" strip (AC-16). */
export const POPULAR_PRODUCTS_MAX = 8;

/** Facet-list length past which the filter panel collapses to "Ver más". */
export const FILTER_FACET_COLLAPSE_AFTER = 6;

/**
 * Absolute ceiling on a price bound (cents) accepted from the URL. Bounds the
 * cache-key space for the filter-only cache (a price snaps to a bucket within
 * [0, this]) and rejects absurd values (edge 3). 100_000_000 cents = MX$1,000,000
 * — far above any real chair price.
 */
export const PRICE_BOUND_MAX_CENTS = 100_000_000;

/**
 * Bucket size (cents) a price bound snaps to for the FILTER-ONLY cache key
 * (Constraint 3). The slider shows the real catalog price domain for UX, but
 * the cache key uses the bucketed value so an attacker cannot mint a distinct
 * cache entry per arbitrary price. 10_000 cents = MX$100 buckets.
 */
export const PRICE_BUCKET_CENTS = 10_000;
