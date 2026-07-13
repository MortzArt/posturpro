/**
 * Typed, guarded localStorage helpers for the recently-viewed strip (T4 AC-12,
 * edge 7).
 *
 * Stores the CARD VIEW MODEL (not just slugs) so the strip renders identically
 * to the grid with no re-fetch, staying client-only and instant (design Open
 * Question #1). Every access is guarded: SSR (`typeof window`), disabled/private
 * storage, quota, and malformed JSON all degrade to an empty read / swallowed
 * write with at most ONE guarded `console.warn` — the page is never affected.
 */
import {
  RECENTLY_VIEWED_MAX,
  RECENTLY_VIEWED_STORAGE_KEY,
} from "@/lib/config";
import type { StockState } from "@/lib/catalog/types";

/**
 * A stored recently-viewed entry — the minimal `CatalogProductCard` fields a
 * tile needs. Price/stock may be slightly stale (acceptable for a convenience
 * strip; the tile links to the live PDP).
 */
export interface RecentlyViewedEntry {
  id: string;
  slug: string;
  name: string;
  brandName: string | null;
  priceCents: number;
  compareAtPriceCents: number | null;
  coverImageUrl: string | null;
  coverAlt: string;
  colorCount: number;
  stockState: StockState;
  /** The `{n}` for "Solo quedan {n}"; null unless `stockState === "low"`. */
  lowStockN: number | null;
}

/** Whether a value is a plausible stored entry (defensive shape guard). */
function isEntry(value: unknown): value is RecentlyViewedEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    typeof entry.slug === "string" &&
    typeof entry.name === "string" &&
    typeof entry.priceCents === "number" &&
    typeof entry.coverAlt === "string" &&
    typeof entry.colorCount === "number" &&
    (entry.stockState === "in" ||
      entry.stockState === "low" ||
      entry.stockState === "out")
  );
}

/** Whether we already warned once this session (avoid console spam, edge 7). */
let warnedThisSession = false;

/** Log a single guarded warning per session; subsequent failures are silent. */
function warnOnce(message: string): void {
  if (!warnedThisSession) {
    warnedThisSession = true;
    console.warn(`[recently-viewed] ${message}`);
  }
}

/** Whether `window.localStorage` is available and usable. */
function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/**
 * Read the stored entries (newest-first). Returns `[]` on SSR, unavailable
 * storage, or malformed data — never throws (edge 7).
 */
export function readRecentlyViewed(): RecentlyViewedEntry[] {
  if (!hasStorage()) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(RECENTLY_VIEWED_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isEntry).slice(0, RECENTLY_VIEWED_MAX);
  } catch {
    warnOnce("read failed; the strip will be hidden this session.");
    return [];
  }
}

/**
 * Record the current product: prepend it (de-duped by slug), cap to
 * `RECENTLY_VIEWED_MAX`, and persist. Returns the updated list so the caller can
 * render without a second read. Writes are swallowed on failure (edge 7).
 */
export function recordRecentlyViewed(
  current: RecentlyViewedEntry,
): RecentlyViewedEntry[] {
  const existing = readRecentlyViewed().filter(
    (entry) => entry.slug !== current.slug,
  );
  const next = [current, ...existing].slice(0, RECENTLY_VIEWED_MAX);

  if (hasStorage()) {
    try {
      window.localStorage.setItem(
        RECENTLY_VIEWED_STORAGE_KEY,
        JSON.stringify(next),
      );
    } catch {
      warnOnce("write failed (storage full or disabled); not persisted.");
    }
  }
  return next;
}
