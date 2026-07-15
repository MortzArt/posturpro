/**
 * PURE parse/normalize of the admin product-list URL search-params (T11 Slice
 * 1, AC-6/7). No I/O, no Next imports — unit-testable. Every field is bounded
 * (search length capped, status/stock constrained to a known enum) so a crafted
 * `?` param can neither crash the read nor mint unbounded query shapes. The raw
 * `page` string is carried through untouched; `list-query.ts` clamps it with the
 * shared `parsePageParam` once it knows `lastPage`.
 */

/** Product status filter (or "all"). */
export type StatusFilter = "all" | "draft" | "active" | "archived";

/** Stock filter (or "all"). */
export type StockFilter = "all" | "in-stock" | "out-of-stock";

/** The normalized, bounded filter object the read layer + UI consume. */
export interface ProductListFilters {
  search: string;
  brandId: string | null;
  categoryId: string | null;
  status: StatusFilter;
  stock: StockFilter;
  /** Raw `?page` value (clamped later by parsePageParam once lastPage is known). */
  rawPage: string;
}

/** Max search length treated as meaningful (longer is truncated — cache/DoS bound). */
export const ADMIN_SEARCH_MAX_LENGTH = 120;

/** Loose search-params shape (Next passes `Record<string, string | string[]>`). */
export type RawSearchParams = Record<string, string | string[] | undefined>;

/** First value of a possibly-repeated param, trimmed; "" when absent. */
function firstValue(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value.trim() : "";
}

/** A UUID-ish value is passed through as an id filter; anything else → null. */
function asId(raw: string | string[] | undefined): string | null {
  const value = firstValue(raw);
  return /^[0-9a-fA-F-]{10,40}$/.test(value) ? value : null;
}

function asStatus(raw: string | string[] | undefined): StatusFilter {
  const value = firstValue(raw);
  return value === "draft" || value === "active" || value === "archived"
    ? value
    : "all";
}

function asStock(raw: string | string[] | undefined): StockFilter {
  const value = firstValue(raw);
  return value === "in-stock" || value === "out-of-stock" ? value : "all";
}

/** Parse the raw search-params into the bounded, typed filter object. */
export function parseListFilters(params: RawSearchParams): ProductListFilters {
  return {
    search: firstValue(params.search).slice(0, ADMIN_SEARCH_MAX_LENGTH),
    brandId: asId(params.brand),
    categoryId: asId(params.category),
    status: asStatus(params.status),
    stock: asStock(params.stock),
    rawPage: firstValue(params.page),
  };
}

/** Whether any filter (other than page) is active — drives the "Limpiar" CTA. */
export function hasActiveFilters(filters: ProductListFilters): boolean {
  return (
    filters.search !== "" ||
    filters.brandId !== null ||
    filters.categoryId !== null ||
    filters.status !== "all" ||
    filters.stock !== "all"
  );
}

/** Build a query string preserving the active filters + an overridden page. */
export function buildListQueryString(
  filters: ProductListFilters,
  overrides: { page?: number } = {},
): string {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.brandId) params.set("brand", filters.brandId);
  if (filters.categoryId) params.set("category", filters.categoryId);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.stock !== "all") params.set("stock", filters.stock);
  const page = overrides.page;
  if (page !== undefined && page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `?${query}` : "";
}
