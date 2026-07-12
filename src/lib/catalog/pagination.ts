/**
 * Pure pagination math (T3 AC-9, AC-14, edge case 7).
 *
 * Parsing/clamping the `?page` param and computing the windowed number set are
 * pure functions so they can be unit-tested in isolation and reused by every
 * listing page + the `Pagination` component. No React, no DB.
 */
import { MAX_PAGE, PRODUCTS_PER_PAGE } from "@/lib/config";

/**
 * Canonicalize a raw `?page` value into a bounded integer in `[1, MAX_PAGE]`
 * WITHOUT knowing `lastPage`. This is the stable, low-cardinality form used as
 * an `unstable_cache` key segment (T3 security — cache-key DoS bound): any
 * malformed / out-of-range / huge value collapses deterministically so an
 * attacker cannot mint unbounded distinct cache entries via `?page=<junk>`.
 *
 * - non-digit / empty / negative / zero / float / "1e9" → 1 (clamps to page 1)
 * - digits above MAX_PAGE (incl. values beyond safe-integer range) → MAX_PAGE
 *   (any such value clamps to the real last page at read time anyway)
 *
 * The ACTUAL page shown is still `parsePageParam(raw, lastPage)`, which clamps
 * to the true `[1, lastPage]`; this function only bounds the cache-key space.
 */
export function canonicalPageKey(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return 1;
  const trimmed = value.trim();
  // Only a pure run of digits is a candidate; everything else clamps to page 1.
  if (!/^\d+$/.test(trimmed)) return 1;
  // Compare as digit-string length/value to survive values beyond Number range.
  const stripped = trimmed.replace(/^0+(?=\d)/, "");
  if (stripped === "0") return 1;
  const parsed = Number.parseInt(stripped, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(parsed, MAX_PAGE);
}

/** The compact sentinel a windowed pagination uses in place of skipped pages. */
export const PAGINATION_ELLIPSIS = "ellipsis" as const;

/** A windowed pagination entry: a real page number or an ellipsis gap. */
export type PaginationItem = number | typeof PAGINATION_ELLIPSIS;

/** `max(1, ceil(total / pageSize))` — always at least 1 page. */
export function lastPageFor(
  total: number,
  pageSize: number = PRODUCTS_PER_PAGE,
): number {
  const safeTotal = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
  const safeSize =
    Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 1;
  return Math.max(1, Math.ceil(safeTotal / safeSize));
}

/**
 * Parse a raw `?page` search-param value into a clamped 1-based page number.
 *
 * Handles arrays (repeated param), non-numeric, float, zero, negative, and
 * out-of-range inputs deterministically — always returns an integer in
 * `[1, lastPage]` (edge case 7). Malformed input clamps to page 1.
 *
 * @param raw the `searchParams.page` value (string | string[] | undefined)
 * @param lastPage the highest valid page (from {@link lastPageFor})
 */
export function parsePageParam(
  raw: string | string[] | undefined,
  lastPage: number,
): number {
  const ceiling = Number.isFinite(lastPage)
    ? Math.min(MAX_PAGE, Math.max(1, Math.floor(lastPage)))
    : 1;
  // Reuse the bounded canonical form (handles arrays, junk, floats, huge values,
  // and the MAX_PAGE absolute cap), then clamp to the real last page.
  const canonical = canonicalPageKey(raw);
  return Math.min(canonical, ceiling);
}

/**
 * The zero-based `[from, to]` inclusive range for a Supabase `.range()` call.
 *
 * @param page 1-based, already-clamped page
 * @param pageSize items per page
 */
export function rangeFor(
  page: number,
  pageSize: number = PRODUCTS_PER_PAGE,
): { from: number; to: number } {
  const safePage = Math.max(1, Math.floor(page));
  const safeSize = pageSize > 0 ? Math.floor(pageSize) : 1;
  const from = (safePage - 1) * safeSize;
  return { from, to: from + safeSize - 1 };
}

/**
 * Build the windowed pagination number set: always first + last, the current
 * page ±1, and an ellipsis sentinel where pages are skipped. Never emits a
 * number outside `[1, lastPage]` and never emits duplicates (AC-9, AC-14).
 *
 * Examples (currentPage in brackets):
 * - `lastPage=5`  → `[1,2,3,4,5]` (≤ 7 → all numbers, no ellipsis)
 * - `lastPage=10, current=1` → `[1,2,…,10]`
 * - `lastPage=10, current=5` → `[1,…,4,5,6,…,10]`
 * - `lastPage=10, current=10` → `[1,…,9,10]`
 */
export function paginationWindow(
  currentPage: number,
  lastPage: number,
): PaginationItem[] {
  const last = Math.max(1, Math.floor(lastPage));
  const current = Math.min(Math.max(1, Math.floor(currentPage)), last);

  // Small ranges show every page — no ellipsis noise.
  if (last <= 7) {
    return Array.from({ length: last }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, last, current]);
  if (current - 1 >= 1) pages.add(current - 1);
  if (current + 1 <= last) pages.add(current + 1);

  const sorted = [...pages].sort((a, b) => a - b);
  const items: PaginationItem[] = [];
  let previous = 0;
  for (const page of sorted) {
    if (page - previous > 1) {
      items.push(PAGINATION_ELLIPSIS);
    }
    items.push(page);
    previous = page;
  }
  return items;
}
