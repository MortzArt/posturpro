/**
 * Typed catalog data-read layer (T3) — stable public LIST + TAXONOMY API.
 *
 * The internal product-page orchestration/stitching (`readProductPage`,
 * `readCategoryProductPage`, `stitchCards`, `toCard`, `countProducts`, and their
 * private row shapes/helpers) lives in `queries-internal.ts` (split under A3 to
 * keep both files under the ~400-line guidance). This module exposes only the
 * public read surface every route imports.
 *
 * READ STRATEGY (backlog item 1 — resolved; see research report)
 * --------------------------------------------------------------
 * Anon can ONLY read product rows through the `products_public` VIEW (the base
 * `products` table is ungranted and the view omits `cost_price_cents`). The
 * view forwards the `brand_id`/`style_id` FKs, so `brands`/`styles` embed
 * cleanly through it. The child tables (`product_images`, `product_variants`,
 * `product_categories`) declare their FK to the BASE `products` table, not the
 * view. See `queries-internal.ts` for the batched-read + stitch machinery.
 *
 * STATIC RENDERING (backlog item 2 — resolved)
 * --------------------------------------------
 * Every read uses the cookie-free `createPublicClient()` and is wrapped via
 * `cachedRead` with per-entity tags (`catalog`, `brand:<slug>`,
 * `category:<slug>`, `style:<slug>`) + `CATALOG_REVALIDATE_SECONDS`. Pages stay
 * static/ISR; T10 busts a tag on admin save via `revalidateTag`.
 *
 * ERROR CONTRACT
 * --------------
 * A hard read failure (RLS/network/env) THROWS — the page's route boundary
 * (`[locale]/error.tsx`) catches it and renders the localized error panel
 * (edge case 9). A valid-but-empty result is NOT an error (empty state / 404
 * decisions are made by the caller). Slug lookups return `null` on miss so the
 * page can call `notFound()`.
 */
import "server-only";
import { createPublicClient } from "@/lib/supabase/public";
import { PRODUCTS_PER_PAGE } from "@/lib/config";
import { cachedRead, fail } from "@/lib/catalog/read-primitives";
import {
  cacheKeyForPage,
  readCategoryProductPage,
  readProductPage,
} from "@/lib/catalog/queries-internal";
import type {
  CatalogBrand,
  CatalogCategory,
  CatalogPage,
  CatalogProductCard,
  CatalogStyle,
  CategoryWithAncestors,
} from "@/lib/catalog/types";

/** Base cache tag busted whenever any product/taxonomy row changes (T10). */
export const CATALOG_CACHE_TAG = "catalog" as const;

/** Max ancestor depth walked when building a category breadcrumb (cycle guard). */
const MAX_CATEGORY_DEPTH = 10;

/** Options accepted by every product-listing read. */
export interface ListProductsOptions {
  /**
   * The RAW `?page` search-param value. The read layer resolves the true
   * `lastPage` from a count-only query, then clamps this to `[1, lastPage]`
   * (AC-14, edge case 7) — so an out-of-range/malformed page never triggers a
   * PostgREST "range not satisfiable" error and never needs a throwaway page-1
   * read to discover the ceiling (M-2). The clamped page is returned on the
   * `CatalogPage`.
   */
  rawPage?: string | string[];
  pageSize?: number;
}

/* ========================================================================= *
 * PRODUCT LISTINGS
 * ========================================================================= */

/**
 * List a page of ALL active products (T3 AC-1). Cached under the `catalog` tag.
 */
export function listProducts(
  opts: ListProductsOptions = {},
): Promise<CatalogPage<CatalogProductCard>> {
  const rawPage = opts.rawPage;
  const pageSize = opts.pageSize ?? PRODUCTS_PER_PAGE;
  return cachedRead(
    ["catalog", "products", cacheKeyForPage(rawPage), String(pageSize)],
    [CATALOG_CACHE_TAG],
    () => readProductPage((query) => query, rawPage, pageSize),
  );
}

/**
 * List a page of a brand's active products (T3 AC-4). Assumes the brand exists
 * (caller validates via `getBrand` and 404s on miss). Cached under
 * `brand:<slug>`.
 */
export function listProductsByBrand(
  brandId: string,
  slug: string,
  opts: ListProductsOptions = {},
): Promise<CatalogPage<CatalogProductCard>> {
  const rawPage = opts.rawPage;
  const pageSize = opts.pageSize ?? PRODUCTS_PER_PAGE;
  return cachedRead(
    ["catalog", "brand-products", slug, cacheKeyForPage(rawPage), String(pageSize)],
    [CATALOG_CACHE_TAG, `brand:${slug}`],
    () =>
      readProductPage(
        (query) => query.eq("brand_id", brandId),
        rawPage,
        pageSize,
      ),
  );
}

/**
 * List a page of a style's active products (T3 AC-6). Cached under
 * `style:<slug>`.
 */
export function listProductsByStyle(
  styleId: string,
  slug: string,
  opts: ListProductsOptions = {},
): Promise<CatalogPage<CatalogProductCard>> {
  const rawPage = opts.rawPage;
  const pageSize = opts.pageSize ?? PRODUCTS_PER_PAGE;
  return cachedRead(
    ["catalog", "style-products", slug, cacheKeyForPage(rawPage), String(pageSize)],
    [CATALOG_CACHE_TAG, `style:${slug}`],
    () =>
      readProductPage(
        (query) => query.eq("style_id", styleId),
        rawPage,
        pageSize,
      ),
  );
}

/**
 * List a page of a category's active products (T3 AC-2). The `product_id`
 * membership comes from `product_categories`; the products themselves are read
 * from `products_public` (view enforces active-only), so an inactive product's
 * id in the join is naturally excluded. Cached under `category:<slug>`.
 */
export function listProductsByCategory(
  categoryId: string,
  slug: string,
  opts: ListProductsOptions = {},
): Promise<CatalogPage<CatalogProductCard>> {
  const rawPage = opts.rawPage;
  const pageSize = opts.pageSize ?? PRODUCTS_PER_PAGE;
  return cachedRead(
    ["catalog", "category-products", slug, cacheKeyForPage(rawPage), String(pageSize)],
    [CATALOG_CACHE_TAG, `category:${slug}`],
    () => readCategoryProductPage(categoryId, rawPage, pageSize),
  );
}

/* ========================================================================= *
 * TAXONOMY (brands / styles / categories) — indexes + detail lookups
 * ========================================================================= */

/** List all active brands for the index (T3 AC-5). */
export function listBrands(): Promise<CatalogBrand[]> {
  return cachedRead(["catalog", "brands-index"], [CATALOG_CACHE_TAG], async () => {
    const db = createPublicClient();
    const { data, error } = await db
      .from("brands")
      .select("id,slug,name,description,logo_url")
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (error) fail("brands index", error.message);
    return (data ?? []).map(
      (row): CatalogBrand => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description,
        logoUrl: row.logo_url,
      }),
    );
  });
}

/** Get one active brand by slug, or `null` if missing/inactive (T3 AC-14). */
export function getBrand(slug: string): Promise<CatalogBrand | null> {
  return cachedRead(
    ["catalog", "brand", slug],
    [CATALOG_CACHE_TAG, `brand:${slug}`],
    async () => {
      const db = createPublicClient();
      const { data, error } = await db
        .from("brands")
        .select("id,slug,name,description,logo_url")
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();
      if (error) fail(`brand:${slug}`, error.message);
      if (!data) return null;
      return {
        id: data.id,
        slug: data.slug,
        name: data.name,
        description: data.description,
        logoUrl: data.logo_url,
      } satisfies CatalogBrand;
    },
  );
}

/** List all active styles for the index (T3 AC-6). */
export function listStyles(): Promise<CatalogStyle[]> {
  return cachedRead(["catalog", "styles-index"], [CATALOG_CACHE_TAG], async () => {
    const db = createPublicClient();
    const { data, error } = await db
      .from("styles")
      .select("id,slug,name,description")
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (error) fail("styles index", error.message);
    return (data ?? []).map(
      (row): CatalogStyle => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description,
      }),
    );
  });
}

/** Get one active style by slug, or `null` if missing/inactive (T3 AC-14). */
export function getStyle(slug: string): Promise<CatalogStyle | null> {
  return cachedRead(
    ["catalog", "style", slug],
    [CATALOG_CACHE_TAG, `style:${slug}`],
    async () => {
      const db = createPublicClient();
      const { data, error } = await db
        .from("styles")
        .select("id,slug,name,description")
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();
      if (error) fail(`style:${slug}`, error.message);
      if (!data) return null;
      return {
        id: data.id,
        slug: data.slug,
        name: data.name,
        description: data.description,
      } satisfies CatalogStyle;
    },
  );
}

/** Map a raw categories row to the view model (no children). */
function toCategory(row: {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  sort_order: number;
}): CatalogCategory {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    parentId: row.parent_id,
    sortOrder: row.sort_order,
  };
}

/**
 * List all active categories as a tree (roots with nested `children`), sorted
 * by `sort_order` then name at each level (T3 AC-3).
 */
export function listCategories(): Promise<CatalogCategory[]> {
  return cachedRead(
    ["catalog", "categories-tree"],
    [CATALOG_CACHE_TAG],
    async () => {
      const db = createPublicClient();
      const { data, error } = await db
        .from("categories")
        .select("id,slug,name,description,parent_id,sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) fail("categories index", error.message);
      return buildCategoryTree((data ?? []).map(toCategory));
    },
  );
}

/** Assemble a flat, pre-sorted category list into a root→children tree. */
function buildCategoryTree(flat: CatalogCategory[]): CatalogCategory[] {
  const byId = new Map<string, CatalogCategory>();
  for (const node of flat) {
    byId.set(node.id, { ...node, children: [] });
  }
  const roots: CatalogCategory[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)?.children?.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

/**
 * Get a category by slug WITH its ancestor chain (root-first) for the nested
 * breadcrumb, or `null` if missing/inactive (T3 AC-7, AC-14, edge case 4).
 * The ancestor walk is depth-bounded (a DB trigger already forbids cycles).
 */
export function getCategory(
  slug: string,
): Promise<CategoryWithAncestors | null> {
  return cachedRead(
    ["catalog", "category", slug],
    [CATALOG_CACHE_TAG, `category:${slug}`],
    async () => {
      const db = createPublicClient();
      const { data, error } = await db
        .from("categories")
        .select("id,slug,name,description,parent_id,sort_order")
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();
      if (error) fail(`category:${slug}`, error.message);
      if (!data) return null;

      const category = toCategory(data);
      const ancestors = await walkAncestors(db, category.parentId);
      return { category, ancestors } satisfies CategoryWithAncestors;
    },
  );
}

/** Walk parent links upward (depth-bounded), returning ancestors root-first. */
async function walkAncestors(
  db: ReturnType<typeof createPublicClient>,
  startParentId: string | null,
): Promise<CatalogCategory[]> {
  const chain: CatalogCategory[] = [];
  let parentId = startParentId;
  let depth = 0;
  while (parentId && depth < MAX_CATEGORY_DEPTH) {
    const { data, error } = await db
      .from("categories")
      .select("id,slug,name,description,parent_id,sort_order")
      .eq("id", parentId)
      .eq("is_active", true)
      .maybeSingle();
    if (error) fail("category ancestor walk", error.message);
    if (!data) break;
    const node = toCategory(data);
    chain.unshift(node); // prepend → root ends up first
    parentId = node.parentId;
    depth += 1;
  }
  return chain;
}
