/**
 * Admin product-list read (T11 Slice 1, AC-4/5/7). LIVE (uncached) read via the
 * admin client (RLS-bypass) against the BASE `products` table — so drafts and
 * archived products are visible and edits are never stale. NOT wrapped in
 * `unstable_cache`. Reuses ONLY the pure `pagination.ts` math (count → clamp →
 * range). Cover thumbnails + variant stock sums are batch-stitched (one extra
 * query each) to avoid an N+1 per row. `server-only`.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { lastPageFor, parsePageParam, rangeFor } from "@/lib/catalog/pagination";
import { ADMIN_PRODUCTS_PER_PAGE } from "@/lib/config";
import type { ProductListFilters } from "@/lib/admin/products/list-filters";

/** A single admin list row (see ui-design §1.1 `AdminProductRow`). */
export interface AdminProductRow {
  id: string;
  slug: string;
  name: string;
  sku: string;
  coverUrl: string | null;
  brandName: string | null;
  priceCents: number;
  stock: number;
  stockIsVariantSummed: boolean;
  status: "draft" | "active" | "archived";
  updatedAt: string;
}

/** The paginated list result the page renders. */
export interface AdminProductListResult {
  rows: AdminProductRow[];
  totalCount: number;
  page: number;
  lastPage: number;
}

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * A minimal structural view of a PostgREST filter builder — just the four
 * chainable methods `applyFilters` calls. Kept intentionally loose (each method
 * returns the same shape) so it works for both the count (head) and data
 * queries without fighting the deep generic instantiations.
 */
interface FilterableQuery {
  or(filter: string): FilterableQuery;
  eq(column: string, value: string | number): FilterableQuery;
  gt(column: string, value: number): FilterableQuery;
  in(column: string, values: readonly string[]): FilterableQuery;
}

/** Apply the shared filters to a products query (search/brand/status/stock). */
function applyFilters<T extends FilterableQuery>(query: T, filters: ProductListFilters): T {
  let next: FilterableQuery = query;
  if (filters.search) {
    // Case-insensitive substring on name OR sku. Strip PostgREST filter meta-
    // chars from the term so it cannot alter the `or` expression structure.
    const term = filters.search.replace(/[%,()*]/g, " ");
    next = next.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
  }
  if (filters.brandId) next = next.eq("brand_id", filters.brandId);
  if (filters.status !== "all") next = next.eq("status", filters.status);
  // Stock filter targets the product-level stock column; variant-summed stock is
  // a derived display value, so the coarse in/out filter uses products.stock.
  if (filters.stock === "in-stock") next = next.gt("stock", 0);
  if (filters.stock === "out-of-stock") next = next.eq("stock", 0);
  return next as T;
}

/**
 * Read a page of products matching the filters. Two-phase: count (clamp the
 * page), then the ranged data read; then batch-stitch covers + variant stock.
 * Category filter is applied via a pre-resolved product-id set (M2M join).
 */
export async function listAdminProducts(
  filters: ProductListFilters,
): Promise<AdminProductListResult> {
  const db = createAdminClient();
  const categoryProductIds = await resolveCategoryProductIds(db, filters.categoryId);
  if (categoryProductIds !== null && categoryProductIds.length === 0) {
    return { rows: [], totalCount: 0, page: 1, lastPage: 1 };
  }

  const totalCount = await countProducts(db, filters, categoryProductIds);
  const lastPage = lastPageFor(totalCount, ADMIN_PRODUCTS_PER_PAGE);
  const page = parsePageParam(filters.rawPage, lastPage);
  const { from, to } = rangeFor(page, ADMIN_PRODUCTS_PER_PAGE);

  const products = await readProductRows(db, filters, categoryProductIds, from, to);
  const rows = await stitchDerivedFields(db, products);
  return { rows, totalCount, page, lastPage };
}

/** Resolve product ids in a category (M2M), or null when no category filter. */
async function resolveCategoryProductIds(
  db: AdminClient,
  categoryId: string | null,
): Promise<string[] | null> {
  if (!categoryId) return null;
  const { data, error } = await db
    .from("product_categories")
    .select("product_id")
    .eq("category_id", categoryId);
  if (error) throw new Error(`[admin-list] category filter failed: ${error.message}`);
  return (data ?? []).map((row) => row.product_id);
}

/** Count matching products (head query) for pagination clamping. */
async function countProducts(
  db: AdminClient,
  filters: ProductListFilters,
  categoryProductIds: string[] | null,
): Promise<number> {
  const base = db.from("products").select("id", { count: "exact", head: true });
  let query = applyFilters(base as unknown as FilterableQuery, filters);
  if (categoryProductIds !== null) query = query.in("id", categoryProductIds);
  const { count, error } = await (query as unknown as typeof base);
  if (error) throw new Error(`[admin-list] count failed: ${error.message}`);
  return count ?? 0;
}

/** Raw product row shape read from the base table (+ brand name embed). */
interface RawProductRow {
  id: string;
  slug: string;
  name: string;
  sku: string;
  price_cents: number;
  stock: number;
  status: "draft" | "active" | "archived";
  updated_at: string;
  brands: { name: string } | { name: string }[] | null;
}

/** Read the ranged, ordered data rows for the current page. */
async function readProductRows(
  db: AdminClient,
  filters: ProductListFilters,
  categoryProductIds: string[] | null,
  from: number,
  to: number,
): Promise<RawProductRow[]> {
  const base = db
    .from("products")
    .select("id, slug, name, sku, price_cents, stock, status, updated_at, brands(name)")
    .order("updated_at", { ascending: false })
    .range(from, to);
  let query = applyFilters(base as unknown as FilterableQuery, filters);
  if (categoryProductIds !== null) query = query.in("id", categoryProductIds);
  const { data, error } = await (query as unknown as typeof base);
  if (error) throw new Error(`[admin-list] read failed: ${error.message}`);
  return (data ?? []) as unknown as RawProductRow[];
}

/** Batch-stitch cover thumbnails + variant stock sums onto the rows (no N+1). */
async function stitchDerivedFields(
  db: AdminClient,
  products: RawProductRow[],
): Promise<AdminProductRow[]> {
  if (products.length === 0) return [];
  const ids = products.map((product) => product.id);
  const [covers, variantStock] = await Promise.all([
    readCovers(db, ids),
    readVariantStock(db, ids),
  ]);
  return products.map((product) => {
    const summed = variantStock.get(product.id);
    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      sku: product.sku,
      coverUrl: covers.get(product.id) ?? null,
      brandName: brandName(product.brands),
      priceCents: product.price_cents,
      stock: summed !== undefined ? summed : product.stock,
      stockIsVariantSummed: summed !== undefined,
      status: product.status,
      updatedAt: product.updated_at,
    };
  });
}

/** Normalize the brand embed (may surface as an array) to a name or null. */
function brandName(brands: RawProductRow["brands"]): string | null {
  const brand = Array.isArray(brands) ? brands[0] : brands;
  return brand?.name ?? null;
}

/** Map product id → cover (primary) image URL, else the first image. */
async function readCovers(
  db: AdminClient,
  productIds: string[],
): Promise<Map<string, string>> {
  const { data, error } = await db
    .from("product_images")
    .select("product_id, url, is_primary, sort_order")
    .in("product_id", productIds)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`[admin-list] covers failed: ${error.message}`);
  const covers = new Map<string, string>();
  for (const row of data ?? []) {
    if (!covers.has(row.product_id)) covers.set(row.product_id, row.url);
  }
  return covers;
}

/** Map product id → summed variant stock, only for products that HAVE variants. */
async function readVariantStock(
  db: AdminClient,
  productIds: string[],
): Promise<Map<string, number>> {
  const { data, error } = await db
    .from("product_variants")
    .select("product_id, stock")
    .in("product_id", productIds);
  if (error) throw new Error(`[admin-list] variant stock failed: ${error.message}`);
  const sums = new Map<string, number>();
  for (const row of data ?? []) {
    sums.set(row.product_id, (sums.get(row.product_id) ?? 0) + row.stock);
  }
  return sums;
}
