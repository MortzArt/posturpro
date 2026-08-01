/**
 * PURE parse/normalize of the admin order-list URL search-params (T12 AC-2/3/4).
 * No I/O, no Next imports — unit-testable. Every field is bounded (search length
 * capped, status/payment constrained to the DB enums) so a crafted `?` param can
 * neither crash the read nor mint unbounded query shapes (AC-4). Mirrors
 * `products/list-filters.ts` verbatim in shape. The raw `page` string is carried
 * through untouched; `order-list-query.ts` clamps it with the shared
 * `parsePageParam` once it knows `lastPage`.
 */
import { ADMIN_SEARCH_MAX_LENGTH } from "@/lib/admin/products/list-filters";
import type { OrderStatus, PaymentStatus } from "@/lib/supabase/database.types";

/** Order-status filter (or "all"). */
export type OrderStatusFilter = OrderStatus | "all";

/** Payment-status filter (or "all"). */
export type PaymentStatusFilter = PaymentStatus | "all";

/** The normalized, bounded filter object the read layer + UI consume. */
export interface OrderListFilters {
  search: string;
  status: OrderStatusFilter;
  payment: PaymentStatusFilter;
  /** Raw `?page` value (clamped later by parsePageParam once lastPage is known). */
  rawPage: string;
}

/** Loose search-params shape (Next passes `Record<string, string | string[]>`). */
export type RawSearchParams = Record<string, string | string[] | undefined>;

const ORDER_STATUS_VALUES: readonly OrderStatus[] = [
  "pending_payment",
  "paid",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
];

const PAYMENT_STATUS_VALUES: readonly PaymentStatus[] = [
  "pending",
  "authorized",
  "paid",
  "failed",
  "refunded",
];

/** First value of a possibly-repeated param, trimmed; "" when absent. */
function firstValue(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value.trim() : "";
}

function asOrderStatus(raw: string | string[] | undefined): OrderStatusFilter {
  const value = firstValue(raw);
  return (ORDER_STATUS_VALUES as readonly string[]).includes(value)
    ? (value as OrderStatus)
    : "all";
}

function asPaymentStatus(raw: string | string[] | undefined): PaymentStatusFilter {
  const value = firstValue(raw);
  return (PAYMENT_STATUS_VALUES as readonly string[]).includes(value)
    ? (value as PaymentStatus)
    : "all";
}

/** Parse the raw search-params into the bounded, typed filter object (AC-4). */
export function parseOrderListFilters(params: RawSearchParams): OrderListFilters {
  return {
    search: firstValue(params.search).slice(0, ADMIN_SEARCH_MAX_LENGTH),
    status: asOrderStatus(params.status),
    payment: asPaymentStatus(params.payment),
    rawPage: firstValue(params.page),
  };
}

/** Whether any filter (other than page) is active — drives the "Limpiar" CTA. */
export function hasActiveOrderFilters(filters: OrderListFilters): boolean {
  return filters.search !== "" || filters.status !== "all" || filters.payment !== "all";
}

/** Build a query string preserving the active filters + an overridden page. */
export function buildOrderListQueryString(
  filters: OrderListFilters,
  overrides: { page?: number } = {},
): string {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.payment !== "all") params.set("payment", filters.payment);
  const page = overrides.page;
  if (page !== undefined && page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `?${query}` : "";
}
