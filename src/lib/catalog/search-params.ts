/**
 * Pure parse/serialize of the `/sillas` filter URL state ↔ typed
 * `CatalogFilters` (T5 AC-9, edge cases 3, 4, 7).
 *
 * DEFENSIVE BY DESIGN: every value is treated as hostile.
 * - Unknown category/brand/style/color/material values are DROPPED (never sent
 *   to the RPC), so a bad param can never inject or empty the catalog (edge 3).
 * - `q` is trimmed and truncated to `SEARCH_QUERY_MAX` (Constraint 3).
 * - Price bounds are carried in the URL as PESOS (what the shopper types), and
 *   converted to internal CENTS on parse / back to pesos on serialize, so the
 *   native JS-off field submit and the JS-on URL push have identical semantics
 *   (M-1). Non-numeric / negative / out-of-range bounds are dropped (edge 3).
 * - An inverted price pair (min > max) drops BOTH bounds and flags
 *   `priceRangeIgnored` so the UI can show a subtle note (edge 4).
 * - Sort outside the closed `SORT_KEYS` set falls back to `DEFAULT_SORT` (edge 3).
 * - Repeated params (`?marca=a&marca=a`) de-duplicate.
 *
 * No React, no DB — unit-tested in isolation. `serialize` produces a
 * deterministic, canonical query string (stable param + value order) so page
 * links and shareable URLs are reproducible.
 */
import {
  AVAILABILITY_ALL,
  DEFAULT_SORT,
  PRICE_BOUND_MAX_CENTS,
  SEARCH_PARAM_KEYS,
  SEARCH_QUERY_MAX,
  SORT_KEYS,
} from "@/lib/config";
import type { CatalogFilters, SortKey } from "@/lib/catalog/search.types";

/** The raw `searchParams` shape Next.js hands a server page. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

/** Known values a facet accepts, so unknowns can be dropped (edge 3). */
export interface KnownFacetValues {
  categoryIds: ReadonlySet<string>;
  brandIds: ReadonlySet<string>;
  styleIds: ReadonlySet<string>;
  /** Lowercase `#rrggbb` colors that exist in the catalog. */
  colors: ReadonlySet<string>;
  /** Known material search terms (unaccented lowercase). */
  materials: ReadonlySet<string>;
}

/** Delimiter for multi-value facets in a single param (`?color=a,b`). */
const VALUE_SEPARATOR = ",";

/** First value of a possibly-repeated param, as a trimmed string. */
function firstValue(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value.trim() : "";
}

/** Split a comma-list (and repeated params) into de-duplicated trimmed tokens. */
function multiValues(raw: string | string[] | undefined): string[] {
  const parts = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const tokens = parts
    .flatMap((part) => part.split(VALUE_SEPARATOR))
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  return [...new Set(tokens)];
}

/** Keep only tokens present in the known set, preserving order + de-duping. */
function keepKnown(tokens: string[], known: ReadonlySet<string>): string[] {
  return tokens.filter((token) => known.has(token));
}

/** Centavos in one peso — the URL price contract is PESOS, internals are cents. */
const CENTS_PER_PESO = 100;

/**
 * Parse a price bound. The URL value is in PESOS (the unit the shopper sees and
 * types in the field), so a native JS-off submit and the JS-on push carry
 * identical semantics (M-1). Returns INTERNAL cents (pesos × 100) so the rest of
 * the app — chips, RPC params, cache buckets — keeps working in cents. A
 * non-negative integer whose cents value is within `[0, PRICE_BOUND_MAX_CENTS]`;
 * anything else is dropped (edge 3).
 */
function parsePriceBound(raw: string | string[] | undefined): number | null {
  const value = firstValue(raw);
  if (!/^\d+$/.test(value)) return null;
  const pesos = Number.parseInt(value, 10);
  if (!Number.isFinite(pesos) || pesos < 0) return null;
  const cents = pesos * CENTS_PER_PESO;
  if (cents > PRICE_BOUND_MAX_CENTS) return null;
  return cents;
}

/** Internal cents → the whole-pesos string the URL/native field carries (M-1). */
function centsToPesosParam(cents: number): string {
  return String(Math.round(cents / CENTS_PER_PESO));
}

/**
 * Control characters meaningless as search input. The NUL byte is the
 * critical one: PostgreSQL `text` OUTRIGHT REJECTS it, so a raw `q=%00` would
 * reach the `search_products` RPC and throw `unsupported Unicode escape
 * sequence`, surfacing as a 500 that empties the catalog (edge 3: hostile
 * input must never 500). We strip the C0 range (U+0000..U+001F) and DEL
 * (U+007F); the result is re-trimmed, so a `q` of only control bytes collapses
 * to `null` (the filter-only view) rather than 500-ing. Legitimate whitespace
 * inside a real query is untouched.
 */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

/** Parse `q`: strip control bytes, trim, drop whitespace-only, truncate (AC-3, edge 3). */
function parseQuery(raw: string | string[] | undefined): string | null {
  const value = firstValue(raw).replace(CONTROL_CHARS, "").trim();
  if (value.length === 0) return null;
  return value.slice(0, SEARCH_QUERY_MAX);
}

/** Parse `orden` into a known SortKey, defaulting on anything unknown. */
function parseSort(raw: string | string[] | undefined): SortKey {
  const value = firstValue(raw);
  return (SORT_KEYS as readonly string[]).includes(value)
    ? (value as SortKey)
    : DEFAULT_SORT;
}

/** Normalize a color token to lowercase `#rrggbb` (accepts with/without `#`). */
export function normalizeColor(token: string): string {
  const hex = token.startsWith("#") ? token.slice(1) : token;
  return `#${hex}`.toLowerCase();
}

/**
 * Parse the raw `searchParams` into a validated, canonical `CatalogFilters`.
 *
 * @param params the raw Next.js `searchParams`
 * @param known the sets of valid facet values (unknowns dropped)
 */
export function parseCatalogFilters(
  params: RawSearchParams,
  known: KnownFacetValues,
): CatalogFilters {
  const keys = SEARCH_PARAM_KEYS;

  const colorTokens = multiValues(params[keys.color]).map(normalizeColor);

  let priceMin = parsePriceBound(params[keys.precioMin]);
  let priceMax = parsePriceBound(params[keys.precioMax]);
  let priceRangeIgnored = false;
  // Inverted pair → drop BOTH so the shopper still sees results (edge 4).
  if (priceMin !== null && priceMax !== null && priceMin > priceMax) {
    priceMin = null;
    priceMax = null;
    priceRangeIgnored = true;
  }

  return {
    query: parseQuery(params[keys.q]),
    categoryIds: keepKnown(multiValues(params[keys.categoria]), known.categoryIds),
    brandIds: keepKnown(multiValues(params[keys.marca]), known.brandIds),
    styleIds: keepKnown(multiValues(params[keys.estilo]), known.styleIds),
    colors: keepKnown(colorTokens, known.colors),
    materials: keepKnown(multiValues(params[keys.material]), known.materials),
    priceMin,
    priceMax,
    inStockOnly: firstValue(params[keys.disponibilidad]) !== AVAILABILITY_ALL,
    sort: parseSort(params[keys.orden]),
    priceRangeIgnored,
  };
}

/** True when no user-applied constraint is active (default catalog view). */
export function hasNoFilters(filters: CatalogFilters): boolean {
  return (
    filters.query === null &&
    filters.categoryIds.length === 0 &&
    filters.brandIds.length === 0 &&
    filters.styleIds.length === 0 &&
    filters.colors.length === 0 &&
    filters.materials.length === 0 &&
    filters.priceMin === null &&
    filters.priceMax === null &&
    filters.inStockOnly &&
    filters.sort === DEFAULT_SORT
  );
}

/**
 * Whether the filter-only path may be cached (Constraint 3): NEVER when a
 * free-text query is present (unbounded key cardinality = DoS). Filter/sort-only
 * requests are cacheable because their key parts are bounded (known ids, closed
 * sort set, bucketed price).
 */
export function isCacheableFilters(filters: CatalogFilters): boolean {
  return filters.query === null;
}

/**
 * Serialize filters into a deterministic, canonical query string (no leading
 * `?`, no `page`). Param + value order is fixed so shareable URLs and page
 * links are byte-stable (AC-9). `page` is intentionally excluded — callers add
 * it, and any filter change resets to page 1 (AC-8).
 */
export function serializeFilters(filters: CatalogFilters): string {
  const keys = SEARCH_PARAM_KEYS;
  const parts: Array<[string, string]> = [];

  if (filters.query !== null) parts.push([keys.q, filters.query]);
  if (filters.categoryIds.length > 0)
    parts.push([keys.categoria, [...filters.categoryIds].sort().join(VALUE_SEPARATOR)]);
  if (filters.brandIds.length > 0)
    parts.push([keys.marca, [...filters.brandIds].sort().join(VALUE_SEPARATOR)]);
  if (filters.styleIds.length > 0)
    parts.push([keys.estilo, [...filters.styleIds].sort().join(VALUE_SEPARATOR)]);
  if (filters.colors.length > 0)
    parts.push([keys.color, [...filters.colors].sort().join(VALUE_SEPARATOR)]);
  if (filters.materials.length > 0)
    parts.push([keys.material, [...filters.materials].sort().join(VALUE_SEPARATOR)]);
  // Price serializes back to PESOS (the URL contract), mirroring parsePriceBound.
  if (filters.priceMin !== null)
    parts.push([keys.precioMin, centsToPesosParam(filters.priceMin)]);
  if (filters.priceMax !== null)
    parts.push([keys.precioMax, centsToPesosParam(filters.priceMax)]);
  if (!filters.inStockOnly) parts.push([keys.disponibilidad, AVAILABILITY_ALL]);
  if (filters.sort !== DEFAULT_SORT) parts.push([keys.orden, filters.sort]);

  return parts
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

/**
 * Serialize filters WITH one facet value removed (chip removal / clear one).
 * Returns the canonical query string for the resulting state (page reset to 1
 * is implicit — `page` is never serialized here).
 */
export function serializeWithout(
  filters: CatalogFilters,
  facet: RemovableFacet,
  value?: string,
): string {
  return serializeFilters(removeFacet(filters, facet, value));
}

/** A facet dimension a chip can remove. */
export type RemovableFacet =
  | "query"
  | "categoria"
  | "marca"
  | "estilo"
  | "color"
  | "material"
  | "precio"
  | "disponibilidad";

/** Return a copy of `filters` with one facet value (or whole facet) removed. */
export function removeFacet(
  filters: CatalogFilters,
  facet: RemovableFacet,
  value?: string,
): CatalogFilters {
  const next: CatalogFilters = { ...filters, priceRangeIgnored: false };
  switch (facet) {
    case "query":
      next.query = null;
      break;
    case "categoria":
      next.categoryIds = dropValue(filters.categoryIds, value);
      break;
    case "marca":
      next.brandIds = dropValue(filters.brandIds, value);
      break;
    case "estilo":
      next.styleIds = dropValue(filters.styleIds, value);
      break;
    case "color":
      next.colors = dropValue(filters.colors, value);
      break;
    case "material":
      next.materials = dropValue(filters.materials, value);
      break;
    case "precio":
      next.priceMin = null;
      next.priceMax = null;
      break;
    case "disponibilidad":
      next.inStockOnly = true;
      break;
  }
  return next;
}

/** Remove a single value from a facet list, or clear it entirely if no value. */
function dropValue(values: string[], value: string | undefined): string[] {
  if (value === undefined) return [];
  return values.filter((existing) => existing !== value);
}
