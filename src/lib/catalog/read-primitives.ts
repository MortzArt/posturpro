/**
 * Shared catalog read primitives (T5 Constraint 2 — extracted, behavior-preserving).
 *
 * `fail()`, `firstOrSelf()`, and the `unstable_cache` tag-boilerplate were
 * DUPLICATED across `queries.ts` (T3) and `product-detail.ts` (T4). T5 adds a
 * third read module (`search.ts`), so the primitives are extracted here ONCE
 * and imported by all three — no fourth copy, one place to reason about the
 * error contract and cache discipline.
 *
 * This extraction is BEHAVIOR-PRESERVING: `fail()` logs the same
 * `[catalog] <context>: <message>` line and throws the same redacted message;
 * `firstOrSelf` is byte-identical to both prior copies; `cachedRead` wraps
 * `unstable_cache` with the same `revalidate: CATALOG_REVALIDATE_SECONDS`
 * contract the existing reads used inline. The ~415-test suite must stay green
 * with no assertion changes — that is the acceptance signal for this step.
 *
 * ERROR CONTRACT (unchanged)
 * --------------------------
 * A hard read failure (RLS/network/env) is logged in FULL server-side and
 * re-thrown as a REDACTED `Error` so the route boundary (`[locale]/error.tsx`)
 * renders the localized panel without leaking internal detail to the DOM
 * (T3 edge case 9).
 */
import "server-only";
import { unstable_cache } from "next/cache";
import { CATALOG_REVALIDATE_SECONDS } from "@/lib/config";

/**
 * Raise a typed error so the caller's route boundary shows the localized error
 * panel (edge case 9). Full detail is logged server-side ONLY; the thrown
 * message is redacted to the bare context so nothing internal reaches the DOM.
 *
 * @param context short label of the failing read (e.g. `"products_public page"`)
 * @param message the underlying error message (logged, never surfaced)
 */
export function fail(context: string, message: string): never {
  console.error(`[catalog] ${context}: ${message}`);
  throw new Error(`Catalog read failed: ${context}`);
}

/**
 * Normalize a PostgREST embedded relation into a single value. A to-one embed
 * is an object, but the generated types can surface it as an array; this
 * collapses either shape (and `null`) to a single `T | null`.
 */
export function firstOrSelf<T>(value: T | T[] | null): T | null {
  if (value === null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Wrap a read in `unstable_cache` with the catalog revalidate window.
 *
 * Single-sources the `{ tags, revalidate: CATALOG_REVALIDATE_SECONDS }` shape
 * every cached catalog read used inline. Callers supply the (already-bounded)
 * key parts and the per-entity tag set; T10 busts a tag on admin save via
 * `revalidateTag`.
 *
 * IMPORTANT (T5 Constraint 3): only wrap reads whose key parts are BOUNDED.
 * Free-text search results must NOT be cached (unbounded key cardinality =
 * cache-key DoS), so `search.ts` calls the RPC directly when `q` is present and
 * only reaches for this wrapper on the bounded filter-only path.
 *
 * @param keyParts bounded, canonical `unstable_cache` key segments
 * @param tags per-entity cache tags (busted on write)
 * @param read the read function to memoize
 */
export function cachedRead<T>(
  keyParts: string[],
  tags: string[],
  read: () => Promise<T>,
): Promise<T> {
  const cached = unstable_cache(read, keyParts, {
    tags,
    revalidate: CATALOG_REVALIDATE_SECONDS,
  });
  return cached();
}
