/**
 * Typed catalog data-read layer (T3).
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
 *
 * STATIC RENDERING (backlog item 2 — resolved)
 * --------------------------------------------
 * Every read uses the cookie-free `createPublicClient()` and is wrapped in
 * `unstable_cache` with per-entity tags (`catalog`, `brand:<slug>`,
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
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { CATALOG_REVALIDATE_SECONDS, PRODUCTS_PER_PAGE } from "@/lib/config";
import { effectiveStock, stockState } from "@/lib/catalog/stock";
import { lastPageFor, rangeFor } from "@/lib/catalog/pagination";
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

/** Columns selected from `products_public` for a card (never cost data). */
const PRODUCT_CARD_SELECT =
  "id,slug,name,price_cents,compare_at_price_cents,is_best_seller,sales_count,stock,brand_id,style_id,brands(name,slug,logo_url),styles(name,slug)" as const;

/** Options accepted by every product-listing read. */
export interface ListProductsOptions {
  /** 1-based page (caller clamps to `[1, lastPage]`). Defaults to 1. */
  page?: number;
  pageSize?: number;
}

/* ------------------------------------------------------------------------- *
 * Raw row shapes returned by the product-card select (embedded relations).
 * ------------------------------------------------------------------------- */

interface EmbeddedBrand {
  name: string | null;
  slug: string | null;
  logo_url: string | null;
}
interface EmbeddedStyle {
  name: string | null;
  slug: string | null;
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
  brand_id: string | null;
  style_id: string | null;
  // PostgREST returns an object for a to-one embed, but the generated types can
  // surface it as an array; normalize defensively when stitching.
  brands: EmbeddedBrand | EmbeddedBrand[] | null;
  styles: EmbeddedStyle | EmbeddedStyle[] | null;
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

/** Raise a typed error so the caller's boundary shows the localized panel. */
function fail(context: string, message: string): never {
  // Full detail logged server-side ONLY; never surfaced to the DOM (edge 9).
  console.error(`[catalog] ${context}: ${message}`);
  throw new Error(`Catalog read failed: ${context}`);
}

function firstOrSelf<T>(value: T | T[] | null): T | null {
  if (value === null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
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

/* ========================================================================= *
 * PRODUCT LISTINGS
 * ========================================================================= */

/** Build the base `products_public` card query (typed sample for inference). */
function productCardQuery(db: ReturnType<typeof createPublicClient>) {
  return db.from("products_public").select(PRODUCT_CARD_SELECT, {
    count: "exact",
  });
}

/** The exact filter/transform builder type the card query yields. */
type ProductCardQuery = ReturnType<typeof productCardQuery>;

/** Internal: run a (possibly filtered) product page read + stitch. */
async function readProductPage(
  filter: (query: ProductCardQuery) => ProductCardQuery,
  page: number,
  pageSize: number,
): Promise<CatalogPage<CatalogProductCard>> {
  const db = createPublicClient();
  const { from, to } = rangeFor(page, pageSize);

  const base = productCardQuery(db);

  // Callers narrow the query (brand/style eq, or id set for category).
  const query = filter(base);

  const { data, count, error } = await query
    .order("is_best_seller", { ascending: false })
    .order("sales_count", { ascending: false })
    .order("name", { ascending: true })
    .range(from, to);

  if (error) {
    fail("products_public page", error.message);
  }

  const total = count ?? 0;
  const rows = (data ?? []) as unknown as ProductCardRow[];
  const items = await stitchCards(rows);

  return {
    items,
    page,
    pageSize,
    total,
    lastPage: lastPageFor(total, pageSize),
  };
}

/**
 * List a page of ALL active products (T3 AC-1). Cached under the `catalog` tag.
 */
export function listProducts(
  opts: ListProductsOptions = {},
): Promise<CatalogPage<CatalogProductCard>> {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? PRODUCTS_PER_PAGE;
  const cached = unstable_cache(
    () => readProductPage((query) => query, page, pageSize),
    ["catalog", "products", String(page), String(pageSize)],
    { tags: [CATALOG_CACHE_TAG], revalidate: CATALOG_REVALIDATE_SECONDS },
  );
  return cached();
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
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? PRODUCTS_PER_PAGE;
  const cached = unstable_cache(
    () =>
      readProductPage(
        (query) => query.eq("brand_id", brandId),
        page,
        pageSize,
      ),
    ["catalog", "brand-products", slug, String(page), String(pageSize)],
    {
      tags: [CATALOG_CACHE_TAG, `brand:${slug}`],
      revalidate: CATALOG_REVALIDATE_SECONDS,
    },
  );
  return cached();
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
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? PRODUCTS_PER_PAGE;
  const cached = unstable_cache(
    () =>
      readProductPage(
        (query) => query.eq("style_id", styleId),
        page,
        pageSize,
      ),
    ["catalog", "style-products", slug, String(page), String(pageSize)],
    {
      tags: [CATALOG_CACHE_TAG, `style:${slug}`],
      revalidate: CATALOG_REVALIDATE_SECONDS,
    },
  );
  return cached();
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
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? PRODUCTS_PER_PAGE;
  const cached = unstable_cache(
    () => readCategoryProductPage(categoryId, page, pageSize),
    ["catalog", "category-products", slug, String(page), String(pageSize)],
    {
      tags: [CATALOG_CACHE_TAG, `category:${slug}`],
      revalidate: CATALOG_REVALIDATE_SECONDS,
    },
  );
  return cached();
}

/**
 * Category products need the member ids first (from the M2M join), then a
 * `products_public` page filtered to those ids. `count: "exact"` on the filtered
 * view query gives the correct per-category total (only active products count).
 */
async function readCategoryProductPage(
  categoryId: string,
  page: number,
  pageSize: number,
): Promise<CatalogPage<CatalogProductCard>> {
  const db = createPublicClient();

  const membership = await db
    .from("product_categories")
    .select("product_id")
    .eq("category_id", categoryId);

  if (membership.error) {
    fail("product_categories membership", membership.error.message);
  }

  const memberIds = (membership.data ?? []).map((row) => row.product_id);
  if (memberIds.length === 0) {
    return { items: [], page, pageSize, total: 0, lastPage: 1 };
  }

  return readProductPage(
    (query) => query.in("id", memberIds),
    page,
    pageSize,
  );
}

/* ========================================================================= *
 * TAXONOMY (brands / styles / categories) — indexes + detail lookups
 * ========================================================================= */

/** List all active brands for the index (T3 AC-5). */
export function listBrands(): Promise<CatalogBrand[]> {
  const cached = unstable_cache(
    async () => {
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
    },
    ["catalog", "brands-index"],
    { tags: [CATALOG_CACHE_TAG], revalidate: CATALOG_REVALIDATE_SECONDS },
  );
  return cached();
}

/** Get one active brand by slug, or `null` if missing/inactive (T3 AC-14). */
export function getBrand(slug: string): Promise<CatalogBrand | null> {
  const cached = unstable_cache(
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
    ["catalog", "brand", slug],
    {
      tags: [CATALOG_CACHE_TAG, `brand:${slug}`],
      revalidate: CATALOG_REVALIDATE_SECONDS,
    },
  );
  return cached();
}

/** List all active styles for the index (T3 AC-6). */
export function listStyles(): Promise<CatalogStyle[]> {
  const cached = unstable_cache(
    async () => {
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
    },
    ["catalog", "styles-index"],
    { tags: [CATALOG_CACHE_TAG], revalidate: CATALOG_REVALIDATE_SECONDS },
  );
  return cached();
}

/** Get one active style by slug, or `null` if missing/inactive (T3 AC-14). */
export function getStyle(slug: string): Promise<CatalogStyle | null> {
  const cached = unstable_cache(
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
    ["catalog", "style", slug],
    {
      tags: [CATALOG_CACHE_TAG, `style:${slug}`],
      revalidate: CATALOG_REVALIDATE_SECONDS,
    },
  );
  return cached();
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
  const cached = unstable_cache(
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
    ["catalog", "categories-tree"],
    { tags: [CATALOG_CACHE_TAG], revalidate: CATALOG_REVALIDATE_SECONDS },
  );
  return cached();
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
  const cached = unstable_cache(
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
    ["catalog", "category", slug],
    {
      tags: [CATALOG_CACHE_TAG, `category:${slug}`],
      revalidate: CATALOG_REVALIDATE_SECONDS,
    },
  );
  return cached();
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
