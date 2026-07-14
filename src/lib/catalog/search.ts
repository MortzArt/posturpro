/**
 * Typed search/filter/sort read layer (T5).
 *
 * Calls the `search_products` RPC (migration 0007) through the cookie-free
 * public (anon) client. The RPC does the filtering, availability computation,
 * ordering, and pagination SERVER-SIDE and returns the page rows plus the exact
 * filtered `total_count` (`COUNT(*) OVER ()`) in one round trip — so no
 * count-then-read-then-variant-batch dance (T3) is needed. Card cover images
 * are the ONE thing the RPC does not return (they live in `product_images`), so
 * they are batch-fetched for the page's ids and stitched in.
 *
 * CACHING (Constraint 3)
 * ----------------------
 * - Free-text search (`q` present) is NEVER cached: unbounded key cardinality
 *   is the cache-key DoS vector T3 warned about. The RPC is called directly and
 *   the length cap + parameterization keep it safe.
 * - Filter/sort-only requests (no `q`) ARE cached, under a fully BOUNDED
 *   canonical key: known ids only, closed sort set, price snapped to buckets,
 *   page via `canonicalPageKey`. No unbounded value ever reaches the key.
 *
 * BEST-SELLING (Constraint 4)
 * ---------------------------
 * The RPC's `mas-vendidas` order is `sales_count DESC, is_best_seller DESC,
 * name ASC, id ASC` — deterministic and stable today (sales_count is seed-only
 * pre-T7), truthful automatically once T7 increments it. `listPopularProducts`
 * uses the SAME ordering so the no-results strip never diverges from the sort.
 */
import "server-only";
import {
  DEFAULT_SORT,
  POPULAR_PRODUCTS_MAX,
  PRICE_BUCKET_CENTS,
  PRODUCTS_PER_PAGE,
} from "@/lib/config";
import { createPublicClient } from "@/lib/supabase/public";
import { cachedRead, fail } from "@/lib/catalog/read-primitives";
import { CATALOG_CACHE_TAG } from "@/lib/catalog/queries";
import { stockState } from "@/lib/catalog/stock";
import {
  canonicalPageKey,
  lastPageFor,
  parsePageParam,
  rangeFor,
} from "@/lib/catalog/pagination";
import type { CatalogPage, CatalogProductCard } from "@/lib/catalog/types";
import type { CatalogFilters } from "@/lib/catalog/search.types";
import { isCacheableFilters } from "@/lib/catalog/search-params";

/** One row shape returned by the `search_products` RPC. */
interface SearchRow {
  id: string;
  slug: string;
  name: string;
  price_cents: number;
  compare_at_price_cents: number | null;
  is_best_seller: boolean;
  sales_count: number;
  stock: number;
  brand_name: string | null;
  brand_slug: string | null;
  brand_logo_url: string | null;
  effective_stock: number;
  distinct_color_count: number;
  total_count: number;
}

/** A cover-image row for the batched image read. */
interface CoverRow {
  product_id: string;
  url: string;
  alt_text: string | null;
}

/** The RPC argument object built from validated filters. */
interface SearchArgs {
  p_query: string | null;
  p_category_ids: string[] | null;
  p_brand_ids: string[] | null;
  p_style_ids: string[] | null;
  p_colors: string[] | null;
  p_materials: string[] | null;
  p_price_min: number | null;
  p_price_max: number | null;
  p_in_stock_only: boolean;
  p_sort: string;
  p_limit: number;
  p_offset: number;
}

/** Empty array → `null` so the RPC treats the facet as unconstrained. */
function orNull(values: string[]): string[] | null {
  return values.length > 0 ? values : null;
}

/** Build the RPC args for a given page/offset from validated filters. */
function buildArgs(
  filters: CatalogFilters,
  offset: number,
  limit: number,
): SearchArgs {
  return {
    p_query: filters.query,
    p_category_ids: orNull(filters.categoryIds),
    p_brand_ids: orNull(filters.brandIds),
    p_style_ids: orNull(filters.styleIds),
    p_colors: orNull(filters.colors),
    p_materials: orNull(filters.materials),
    p_price_min: filters.priceMin,
    p_price_max: filters.priceMax,
    p_in_stock_only: filters.inStockOnly,
    p_sort: filters.sort,
    p_limit: limit,
    p_offset: offset,
  };
}

/** Run the RPC and map rows → cards, batching cover images. */
async function runSearch(args: SearchArgs): Promise<{
  rows: SearchRow[];
  total: number;
}> {
  const db = createPublicClient();
  const { data, error } = await db.rpc("search_products", args);
  if (error) {
    fail("search_products rpc", error.message);
  }
  const rows = (data ?? []) as SearchRow[];
  const total = rows.length > 0 ? rows[0].total_count : 0;
  return { rows, total };
}

/** Batch-fetch cover images (is_primary first) for the page's product ids. */
async function coversFor(ids: string[]): Promise<Map<string, CoverRow>> {
  const covers = new Map<string, CoverRow>();
  if (ids.length === 0) return covers;

  const db = createPublicClient();
  const { data, error } = await db
    .from("product_images")
    .select("product_id,url,alt_text,is_primary,sort_order")
    .in("product_id", ids)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true });
  if (error) {
    fail("search cover images", error.message);
  }
  for (const image of (data ?? []) as CoverRow[]) {
    // Rows ordered is_primary desc, sort_order asc — first seen per product wins.
    if (!covers.has(image.product_id)) {
      covers.set(image.product_id, image);
    }
  }
  return covers;
}

/** Map one RPC row + its cover into a `CatalogProductCard`. */
function toCard(row: SearchRow, cover: CoverRow | undefined): CatalogProductCard {
  const compareAt = row.compare_at_price_cents;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    brandName: row.brand_name ?? "",
    priceCents: row.price_cents,
    compareAtPriceCents:
      typeof compareAt === "number" && compareAt > row.price_cents
        ? compareAt
        : null,
    coverImageUrl: cover?.url ?? null,
    coverAlt: cover?.alt_text?.trim() ? cover.alt_text : row.name,
    colorCount: row.distinct_color_count,
    stockState: stockState(row.effective_stock),
    lowStockN:
      stockState(row.effective_stock) === "low" ? row.effective_stock : null,
  };
}

/** Read one filtered page: RPC → count/clamp → cover batch → cards. */
async function readSearchPage(
  filters: CatalogFilters,
  rawPage: string | string[] | undefined,
  pageSize: number,
): Promise<CatalogPage<CatalogProductCard>> {
  // First pass at offset 0 learns the filtered total so we can clamp the page
  // before the real read — never a range-past-the-end (edge 2, AC-8). The RPC
  // is cheap at seed scale; the clamp read fetches the correct page's rows.
  const probe = await runSearch(buildArgs(filters, 0, pageSize));
  const total = probe.total;
  const lastPage = lastPageFor(total, pageSize);
  const page = parsePageParam(rawPage, lastPage);

  if (total === 0) {
    return { items: [], page, pageSize, total: 0, lastPage };
  }

  const { from } = rangeFor(page, pageSize);
  // Page 1 rows are already in `probe`; deeper pages need the offset read.
  const result = from === 0 ? probe : await runSearch(buildArgs(filters, from, pageSize));

  const ids = result.rows.map((row) => row.id);
  const covers = await coversFor(ids);
  const items = result.rows.map((row) => toCard(row, covers.get(row.id)));

  return { items, page, pageSize, total, lastPage };
}

/** Snap a price bound to its cache bucket (bounded key — Constraint 3). */
function priceBucketKey(value: number | null): string {
  if (value === null) return "-";
  return String(Math.floor(value / PRICE_BUCKET_CENTS));
}

/** Build the BOUNDED canonical cache key parts for a filter-only request. */
function filterCacheKey(
  filters: CatalogFilters,
  rawPage: string | string[] | undefined,
  pageSize: number,
): string[] {
  return [
    "catalog",
    "search",
    // known-id facets are bounded; sort each so key is order-independent
    `cat:${[...filters.categoryIds].sort().join("|")}`,
    `br:${[...filters.brandIds].sort().join("|")}`,
    `st:${[...filters.styleIds].sort().join("|")}`,
    `co:${[...filters.colors].sort().join("|")}`,
    `ma:${[...filters.materials].sort().join("|")}`,
    `pmin:${priceBucketKey(filters.priceMin)}`,
    `pmax:${priceBucketKey(filters.priceMax)}`,
    `stock:${filters.inStockOnly ? "in" : "all"}`,
    `sort:${filters.sort}`,
    `p:${canonicalPageKey(rawPage)}`,
    `sz:${pageSize}`,
  ];
}

/**
 * Search + filter + sort the catalog (AC-1..AC-8). Returns a
 * `CatalogPage<CatalogProductCard>` — the SAME shape T3 listings return, so the
 * grid/pagination are unchanged.
 *
 * Caching per Constraint 3: bypassed when a free-text `q` is present; otherwise
 * memoized under a bounded canonical key. NOTE: because the price cache key is
 * BUCKETED but the RPC receives the EXACT price, two exact prices in the same
 * bucket would share a cache entry keyed on the first — acceptable because the
 * bucket is small (MX$100) and the alternative (per-cent keys) is the DoS
 * vector; buckets are the deliberate display-domain-vs-cache-key split
 * (ui-design Open Question 5, resolved: accept the two-layer approach).
 */
export function searchProducts(
  filters: CatalogFilters,
  rawPage: string | string[] | undefined,
  pageSize: number = PRODUCTS_PER_PAGE,
): Promise<CatalogPage<CatalogProductCard>> {
  // CONDITIONAL CACHE (Constraint 3): the free-text (`q` present) branch must
  // NOT be memoized — unbounded key cardinality is the cache-key DoS vector — so
  // it stays an inline direct call and cannot use `cachedRead`. Only the bounded
  // filter-only branch below routes through the shared `cachedRead` wrapper.
  if (!isCacheableFilters(filters)) {
    return readSearchPage(filters, rawPage, pageSize);
  }
  return cachedRead(
    filterCacheKey(filters, rawPage, pageSize),
    [CATALOG_CACHE_TAG],
    () => readSearchPage(filters, rawPage, pageSize),
  );
}

/**
 * Read the top popular products (best-selling order — Constraint 4) for the
 * no-results strip (AC-16). Independent of the active filters. Always cached
 * (bounded key). Filters to in-stock, default sort, page 1.
 */
export function listPopularProducts(
  limit: number = POPULAR_PRODUCTS_MAX,
): Promise<CatalogProductCard[]> {
  return cachedRead(
    ["catalog", "popular-products", String(limit)],
    [CATALOG_CACHE_TAG],
    async () => {
      const args = buildArgs(
        {
          query: null,
          categoryIds: [],
          brandIds: [],
          styleIds: [],
          colors: [],
          materials: [],
          priceMin: null,
          priceMax: null,
          inStockOnly: true,
          sort: DEFAULT_SORT,
          priceRangeIgnored: false,
        },
        0,
        limit,
      );
      const { rows } = await runSearch(args);
      const covers = await coversFor(rows.map((row) => row.id));
      return rows.map((row) => toCard(row, covers.get(row.id)));
    },
  );
}
