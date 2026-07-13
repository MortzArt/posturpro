/**
 * Typed filter model for the T5 search/filter/sort path.
 *
 * `CatalogFilters` is the CANONICALIZED, VALIDATED shape produced by
 * `search-params.ts` from the raw URL `searchParams` — every value here is
 * already bounded (unknown ids dropped, `q` truncated, price sanitized, sort
 * from the closed set). The query layer (`search.ts`) and the UI both consume
 * ONLY this shape, never raw params.
 */
import type { SORT_KEYS } from "@/lib/config";

/** One of the closed set of sort keys (AC-7). */
export type SortKey = (typeof SORT_KEYS)[number];

/**
 * The parsed, canonical filter state for a `/sillas` request. All array facets
 * hold KNOWN values only (unknown ids/colors/materials are dropped upstream).
 */
export interface CatalogFilters {
  /** Trimmed, length-capped free-text query; `null` when absent/whitespace. */
  query: string | null;
  /** Known category ids (M2M). */
  categoryIds: string[];
  /** Known brand ids. */
  brandIds: string[];
  /** Known style ids. */
  styleIds: string[];
  /** Normalized lowercase `#rrggbb` color values that exist in the catalog. */
  colors: string[];
  /** Known material facet values (their unaccented lowercase search terms). */
  materials: string[];
  /** Lower price bound in cents, or `null`. */
  priceMin: number | null;
  /** Upper price bound in cents, or `null`. */
  priceMax: number | null;
  /**
   * `true` (default) → only effective_stock > 0 (AC-5). `false` → include
   * out-of-stock (the shopper opted in via `?disponibilidad=todos`).
   */
  inStockOnly: boolean;
  /** Sort key (default when unspecified/unknown = best-selling). */
  sort: SortKey;
  /** Whether an inverted price pair (min > max) was dropped (edge 4). */
  priceRangeIgnored: boolean;
}

/** A generic selectable facet option (category/brand/style/material). */
export interface FacetOption {
  /** Stable value sent to the URL (a known id or material term). */
  value: string;
  /** Pre-resolved display label. */
  label: string;
}

/** A color facet option (swatch): url key, display name, CSS hex. */
export interface ColorFacetOption {
  /** Normalized lowercase `#rrggbb` — the value sent to `?color=`. */
  value: string;
  /** Accessible color name ("Negro"). */
  label: string;
  /** CSS color for the swatch fill ("#111111"). */
  hex: string;
  /** Whether a checkmark should render dark (light swatch) or light (dark). */
  checkOnLight: boolean;
}

/** All facet options for the filter panel, sourced from real DB values. */
export interface FacetOptions {
  categories: FacetOption[];
  brands: FacetOption[];
  styles: FacetOption[];
  materials: FacetOption[];
  colors: ColorFacetOption[];
  /** Real catalog price domain (cents) for the slider display. */
  priceFloorCents: number;
  priceCeilCents: number;
}
