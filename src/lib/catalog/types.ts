/**
 * Catalog view models (T3).
 *
 * These are the STITCHED shapes the data layer (`queries.ts`) returns after
 * joining `products_public` + embedded brand/style + the separately-fetched
 * images/variants/category batches. Pages and components consume ONLY these
 * types, never the raw Supabase rows — so the read strategy stays an
 * implementation detail and no `cost_price_cents`-bearing shape ever escapes.
 */

/** The three stock badge states, computed from effective stock (`stock.ts`). */
export type StockState = "in" | "low" | "out";

/**
 * One product as rendered in a grid card. Fully derived — contains no raw DB
 * row and no cost data. `coverImageUrl === null` → the card renders a
 * placeholder tile. `compareAtPriceCents` is only struck when `> priceCents`.
 */
export interface CatalogProductCard {
  id: string;
  slug: string;
  name: string;
  brandName: string;
  priceCents: number;
  /** Struck original — only render when present AND `> priceCents`. */
  compareAtPriceCents: number | null;
  /** Cover image URL, or `null` → placeholder tile. */
  coverImageUrl: string | null;
  /** `alt_text ?? name` — never empty (AC-17). */
  coverAlt: string;
  /** Distinct variant colors; the card omits the line when `< 2`. */
  colorCount: number;
  stockState: StockState;
  /** The `{n}` for "Solo quedan {n}"; `null` unless `stockState === "low"`. */
  lowStockN: number | null;
}

/** A single page of catalog items with the totals pagination needs. */
export interface CatalogPage<T> {
  items: T[];
  /** 1-based, already clamped to `[1, lastPage]`. */
  page: number;
  pageSize: number;
  /** Total matching active products (across all pages). */
  total: number;
  /** `max(1, ceil(total / pageSize))`. */
  lastPage: number;
}

/** A brand as rendered on the index tile and detail-page header. */
export interface CatalogBrand {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
}

/** A style as rendered on the index tile and detail-page header. */
export interface CatalogStyle {
  id: string;
  slug: string;
  name: string;
  description: string | null;
}

/** A category node; `children` present only for tree (index) rendering. */
export interface CatalogCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
  children?: CatalogCategory[];
}

/**
 * A category plus its ancestor chain (root-first), used to build a nested
 * breadcrumb (`Oficina › Ejecutivas`) without re-deriving the tree.
 */
export interface CategoryWithAncestors {
  category: CatalogCategory;
  /** Ancestors ordered root-first (excludes the category itself). */
  ancestors: CatalogCategory[];
}
