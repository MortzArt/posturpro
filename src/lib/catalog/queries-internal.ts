/**
 * Internal orchestration + stitching for the catalog product-listing reads (T3).
 *
 * Extracted verbatim from `queries.ts` (Uncle Bob split — A3) to keep both files
 * under the ~400-line guidance. This module owns the PRIVATE read machinery:
 *   - `productCardQuery` / `ProductCardQuery` — the typed `products_public` card query
 *   - `countProducts` — the count-only head read (M-2)
 *   - `readProductPage` — count → clamp → single `.range()` read → stitch
 *   - `readCategoryProductPage` — membership `.in(...)` read → `readProductPage`
 *   - `stitchCards` / `toCard` — batch images + variants and map rows → cards
 *   - `cacheKeyForPage` — bounded `?page` → cache-key segment
 *
 * The stable, public LIST/TAXONOMY API stays in `queries.ts` and imports from here.
 * Behavior is byte-identical to the pre-split code: only file boundaries changed.
 *
 * READ STRATEGY (backlog item 1 — resolved; see research report)
 * --------------------------------------------------------------
 * Anon can ONLY read product rows through the `products_public` VIEW (the base
 * `products` table is ungranted and the view omits `cost_price_cents`). The
 * view forwards the `brand_id`/`style_id` FKs, so `brands`/`styles` embed
 * cleanly through it. The child tables (`product_images`, `product_variants`,
 * `product_categories`) declare their FK to the BASE `products` table, not the
 * view — PostgREST cannot embed them through `products_public`. So we:
 *   1. page `products_public` with `brands(...)`/`styles(...)` embedded, and
 *   2. batch-fetch images + variants by `product_id IN (ids)`, then stitch.
 * This is the ONE standardized shape every catalog read uses.
 */
import "server-only";
import { createPublicClient } from "@/lib/supabase/public";
import { fail, firstOrSelf } from "@/lib/catalog/read-primitives";
import { effectiveStock, stockState } from "@/lib/catalog/stock";
import {
  canonicalPageKey,
  lastPageFor,
  parsePageParam,
  rangeFor,
} from "@/lib/catalog/pagination";
import type {
  CatalogPage,
  CatalogProductCard,
} from "@/lib/catalog/types";

/**
 * Columns selected from `products_public` for a card (never cost data).
 *
 * Only what `toCard` actually consumes: the card fields, `stock` (effective-stock
 * fallback), and the `brands` embed. `is_best_seller`/`sales_count` back the
 * server-side ORDER BY (PostgREST orders on the column regardless of select).
 * The `styles` embed and the `brand_id`/`style_id` scalars are intentionally NOT
 * selected — they were never read on the card, so fetching them was pure
 * over-fetch on every product query (m-1, m-4).
 */
const PRODUCT_CARD_SELECT =
  "id,slug,name,price_cents,compare_at_price_cents,is_best_seller,sales_count,stock,brands(name,slug,logo_url)" as const;

/* ------------------------------------------------------------------------- *
 * Raw row shapes returned by the product-card select (embedded relations).
 * ------------------------------------------------------------------------- */

interface EmbeddedBrand {
  name: string | null;
  slug: string | null;
  logo_url: string | null;
}
interface ProductCardRow {
  id: string | null;
  slug: string | null;
  name: string | null;
  price_cents: number | null;
  compare_at_price_cents: number | null;
  is_best_seller: boolean | null;
  sales_count: number | null;
  stock: number | null;
  // PostgREST returns an object for a to-one embed, but the generated types can
  // surface it as an array; normalize defensively when stitching.
  brands: EmbeddedBrand | EmbeddedBrand[] | null;
}

interface ImageRow {
  product_id: string;
  url: string;
  alt_text: string | null;
  is_primary: boolean;
  sort_order: number;
}
interface VariantRow {
  product_id: string;
  stock: number;
  color_hex: string;
}

/**
 * Normalize a raw `?page` value into a stable, BOUNDED `unstable_cache` key
 * segment (T3 security — cache-key cardinality / DoS bound). Delegates to
 * `canonicalPageKey`, which collapses every malformed / out-of-range / huge
 * value into an integer in `[1, MAX_PAGE]`. This guarantees at most `MAX_PAGE`
 * distinct cache keys per listing regardless of how much junk an attacker sends
 * via `?page=<anything>` — `?page=abc`, `?page=1e9`, `?page=-5`, `?page=00001`
 * all map onto an existing bounded key instead of minting a fresh cache entry
 * (and a fresh DB count+read) each time.
 */
export function cacheKeyForPage(rawPage: string | string[] | undefined): string {
  return `p:${canonicalPageKey(rawPage)}`;
}

/**
 * Fetch cover images + variants for a set of product ids and stitch the
 * page rows into `CatalogProductCard`s. Shared by every listing read.
 */
async function stitchCards(
  rows: ProductCardRow[],
): Promise<CatalogProductCard[]> {
  const ids = rows
    .map((row) => row.id)
    .filter((id): id is string => typeof id === "string");
  if (ids.length === 0) {
    return [];
  }

  const db = createPublicClient();

  // Child FKs point at base `products`, so these are SEPARATE batched queries
  // (cannot embed through the view). One query per resource, not per product.
  const [imagesResult, variantsResult] = await Promise.all([
    db
      .from("product_images")
      .select("product_id,url,alt_text,is_primary,sort_order")
      .in("product_id", ids)
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true }),
    db
      .from("product_variants")
      .select("product_id,stock,color_hex")
      .in("product_id", ids),
  ]);

  if (imagesResult.error) {
    fail("product_images batch", imagesResult.error.message);
  }
  if (variantsResult.error) {
    fail("product_variants batch", variantsResult.error.message);
  }

  const images = (imagesResult.data ?? []) as ImageRow[];
  const variants = (variantsResult.data ?? []) as VariantRow[];

  const coverByProduct = new Map<string, ImageRow>();
  for (const image of images) {
    // Rows are ordered is_primary desc, sort_order asc — first seen wins.
    if (!coverByProduct.has(image.product_id)) {
      coverByProduct.set(image.product_id, image);
    }
  }

  const variantsByProduct = new Map<string, VariantRow[]>();
  for (const variant of variants) {
    const list = variantsByProduct.get(variant.product_id);
    if (list) {
      list.push(variant);
    } else {
      variantsByProduct.set(variant.product_id, [variant]);
    }
  }

  const cards: CatalogProductCard[] = [];
  for (const row of rows) {
    const card = toCard(row, coverByProduct, variantsByProduct);
    if (card) {
      cards.push(card);
    }
  }
  return cards;
}

/** Map one page row + its batched children into a card view model. */
function toCard(
  row: ProductCardRow,
  coverByProduct: Map<string, ImageRow>,
  variantsByProduct: Map<string, VariantRow[]>,
): CatalogProductCard | null {
  // A view row with null id/slug/name is corrupt; skip rather than crash.
  if (!row.id || !row.slug || !row.name) {
    return null;
  }

  const brand = firstOrSelf(row.brands);
  const productVariants = variantsByProduct.get(row.id) ?? [];
  const effective = effectiveStock(row.stock, productVariants);
  const state = stockState(effective);
  const distinctColors = new Set(
    productVariants.map((variant) => variant.color_hex),
  ).size;

  const cover = coverByProduct.get(row.id) ?? null;
  const priceCents = row.price_cents ?? 0;
  const compareAt = row.compare_at_price_cents;

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    brandName: brand?.name ?? "",
    priceCents,
    compareAtPriceCents:
      typeof compareAt === "number" && compareAt > priceCents ? compareAt : null,
    coverImageUrl: cover?.url ?? null,
    coverAlt: cover?.alt_text?.trim() ? cover.alt_text : row.name,
    colorCount: distinctColors,
    stockState: state,
    lowStockN: state === "low" ? effective : null,
  };
}

/** Build the base `products_public` card query (typed sample for inference). */
function productCardQuery(db: ReturnType<typeof createPublicClient>) {
  return db.from("products_public").select(PRODUCT_CARD_SELECT, {
    count: "exact",
  });
}

/** The exact filter/transform builder type the card query yields. */
export type ProductCardQuery = ReturnType<typeof productCardQuery>;

/**
 * Count-only read (`head: true, count: "exact"`) for a (possibly filtered)
 * product query. Fetches ZERO rows — only the total — so the caller can compute
 * `lastPage` and clamp the requested page BEFORE the single data read (M-2).
 */
async function countProducts(
  filter: (query: ProductCardQuery) => ProductCardQuery,
): Promise<number> {
  const db = createPublicClient();
  const base = db
    .from("products_public")
    .select("id", { count: "exact", head: true }) as unknown as ProductCardQuery;
  const { count, error } = await filter(base);
  if (error) {
    fail("products_public count", error.message);
  }
  return count ?? 0;
}

/**
 * Internal: read a single product page + stitch, clamping the requested page to
 * `[1, lastPage]`.
 *
 * Strategy (M-2): a count-only head query first learns the real `total`, from
 * which we derive `lastPage` and clamp the requested page. Then ONE `.range()`
 * data read fetches exactly the clamped page's rows. This replaces the old
 * "always read page 1 to discover the ceiling" approach (which cost two full
 * reads for every non-first page) while preserving the never-416 guarantee: the
 * range is always in-bounds because we clamp before reading.
 */
export async function readProductPage(
  filter: (query: ProductCardQuery) => ProductCardQuery,
  rawPage: string | string[] | undefined,
  pageSize: number,
): Promise<CatalogPage<CatalogProductCard>> {
  const total = await countProducts(filter);
  const lastPage = lastPageFor(total, pageSize);
  const page = parsePageParam(rawPage, lastPage);

  if (total === 0) {
    return { items: [], page, pageSize, total: 0, lastPage };
  }

  const db = createPublicClient();
  const { from, to } = rangeFor(page, pageSize);
  const query = filter(productCardQuery(db));

  const { data, error } = await query
    .order("is_best_seller", { ascending: false })
    .order("sales_count", { ascending: false })
    .order("name", { ascending: true })
    .range(from, to);

  if (error) {
    fail("products_public page", error.message);
  }

  const rows = (data ?? []) as unknown as ProductCardRow[];
  const items = await stitchCards(rows);

  return { items, page, pageSize, total, lastPage };
}

/**
 * Upper bound on the number of category-member product ids loaded into the
 * `.in(...)` filter (M-3). At seed scale a category has ≤30 members; this cap
 * keeps the generated PostgREST `IN (...)` list — and its URL length — bounded
 * as the catalog grows. If a category ever exceeds this, the read is truncated
 * to the first CATEGORY_MEMBER_ID_CAP ids (still correct for the visible pages)
 * and the ceiling is logged. SCALE CEILING: when a category can legitimately hold
 * more than CATEGORY_MEMBER_ID_CAP products, migrate this to a category-scoped
 * view / RPC so pagination happens server-side (tracked in
 * tasks/clean-code-backlog.md).
 */
const CATEGORY_MEMBER_ID_CAP = 1000;

/**
 * Category products need the member ids first (from the M2M join), then a
 * `products_public` page filtered to those ids. `count: "exact"` on the filtered
 * view query gives the correct per-category total (only active products count).
 *
 * The membership ids are de-duplicated (M-4, edge case 8): a defensive guard so
 * a stray duplicate `(product_id, category_id)` row can never double-count the
 * `total` nor render a product card twice. The id set is also bounded to
 * `CATEGORY_MEMBER_ID_CAP` to keep the `.in(...)` list and URL length bounded
 * (M-3).
 */
export async function readCategoryProductPage(
  categoryId: string,
  rawPage: string | string[] | undefined,
  pageSize: number,
): Promise<CatalogPage<CatalogProductCard>> {
  const db = createPublicClient();

  // Bound the membership read: at most CATEGORY_MEMBER_ID_CAP rows leave the DB.
  const membership = await db
    .from("product_categories")
    .select("product_id")
    .eq("category_id", categoryId)
    .range(0, CATEGORY_MEMBER_ID_CAP - 1);

  if (membership.error) {
    fail("product_categories membership", membership.error.message);
  }

  // De-duplicate defensively — one product must map to at most one filter id
  // regardless of how many membership rows exist (M-4).
  const memberIds = [
    ...new Set((membership.data ?? []).map((row) => row.product_id)),
  ];
  if (memberIds.length === 0) {
    return { items: [], page: parsePageParam(rawPage, 1), pageSize, total: 0, lastPage: 1 };
  }
  if (memberIds.length >= CATEGORY_MEMBER_ID_CAP) {
    console.warn(
      `[catalog] category ${categoryId} membership hit the ${CATEGORY_MEMBER_ID_CAP} id cap; ` +
        "migrate to a category-scoped view/RPC (see clean-code-backlog.md).",
    );
  }

  return readProductPage(
    (query) => query.in("id", memberIds),
    rawPage,
    pageSize,
  );
}
