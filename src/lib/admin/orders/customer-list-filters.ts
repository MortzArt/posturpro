/**
 * PURE parse/normalize of the admin customer-list URL search-params (T12 AC-24).
 * No I/O. Search is length-bounded (mirrors the products/orders search bound); the
 * raw `page` is carried through for later clamping.
 */
import { ADMIN_SEARCH_MAX_LENGTH } from "@/lib/admin/products/list-filters";

/** The normalized, bounded customer-filter object. */
export interface CustomerListFilters {
  search: string;
  rawPage: string;
}

/** Loose search-params shape. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

function firstValue(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value.trim() : "";
}

/** Parse the raw search-params into the bounded, typed filter object. */
export function parseCustomerListFilters(params: RawSearchParams): CustomerListFilters {
  return {
    search: firstValue(params.search).slice(0, ADMIN_SEARCH_MAX_LENGTH),
    rawPage: firstValue(params.page),
  };
}

/** Whether the search filter is active — drives the "Limpiar" CTA. */
export function hasActiveCustomerFilters(filters: CustomerListFilters): boolean {
  return filters.search !== "";
}

/** Build a query string preserving the search + an overridden page. */
export function buildCustomerListQueryString(
  filters: CustomerListFilters,
  overrides: { page?: number } = {},
): string {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  const page = overrides.page;
  if (page !== undefined && page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `?${query}` : "";
}
