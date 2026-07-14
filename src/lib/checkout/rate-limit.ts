/**
 * Best-effort in-memory per-IP rate limiter for the checkout write path (T7
 * Security stage). `placeOrder` is unauthenticated and each success creates an
 * order + decrements finite stock + a discount's redemption cap, so unbounded
 * calls are an abuse/griefing vector the atomic RPC does NOT bound (it stops
 * oversell + double-orders, not spam volume). This is the exact sliding-window
 * pattern proven on the Q&A path (`src/lib/qa/submit-guard.ts`), scoped to IP.
 *
 * MEMORY SAFETY (cardinality-DoS bound): (a) timestamps older than the window are
 * pruned before every count; (b) a key is deleted when it goes empty; (c) a hard
 * ceiling ({@link CHECKOUT_RATE_LIMIT_MAX_KEYS}) evicts idle/expired then oldest
 * keys, so the map size is bounded regardless of IP rotation.
 *
 * BEST-EFFORT: per-instance memory (a horizontally-scaled deploy has one map per
 * instance) and IP-keyed (shared NATs bucket together, spoofable XFF weakens it
 * without a trusted edge). The DB atomicity + `stock >= 0` floor remain the hard
 * backstops; this only trims the abuse rate.
 *
 * No `import "server-only"` (matching the Q&A `submit-guard.ts` precedent): this
 * is pure in-memory logic with no secret, imported only by the `"use server"`
 * checkout action, and unit-tested. The `server-only` guard exists to keep
 * secrets out of the client bundle — there is nothing secret here to protect,
 * and the guard would break the unit tests for no security benefit.
 */
import {
  CHECKOUT_MAX_ORDERS_PER_WINDOW,
  CHECKOUT_RATE_LIMIT_MAX_KEYS,
  CHECKOUT_RATE_LIMIT_WINDOW_MS,
} from "@/lib/config";

/** timestamps (ms epoch) of recent order attempts, keyed by IP. */
const attemptLog = new Map<string, number[]>();

/**
 * Drop keys whose every timestamp is older than the window, then — if still over
 * the ceiling — the oldest-inserted keys (Map preserves insertion order) until
 * the map is back under {@link CHECKOUT_RATE_LIMIT_MAX_KEYS}. Called only when the
 * ceiling is breached, so the O(n) sweep is rare.
 */
function evictToCeiling(windowStart: number): void {
  for (const [key, timestamps] of attemptLog) {
    if (timestamps.every((timestamp) => timestamp <= windowStart)) {
      attemptLog.delete(key);
    }
  }
  while (attemptLog.size >= CHECKOUT_RATE_LIMIT_MAX_KEYS) {
    const oldest = attemptLog.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    attemptLog.delete(oldest);
  }
}

/**
 * Record an order-placement attempt and report whether it is within the allowed
 * rate. Prunes timestamps older than the window before counting, keeps the map
 * bounded, and returns `true` when the caller MAY proceed, `false` when the
 * limit is tripped.
 *
 * @param ip best-effort client IP; a shared "unknown" bucket when absent
 *           (conservative — no-IP callers share one limit, never bypass it).
 * @param now injectable clock for tests (defaults to `Date.now()`)
 */
export function checkCheckoutRateLimit(ip: string, now: number = Date.now()): boolean {
  // E2E ESCAPE HATCH: the authoritative checkout e2e run places several REAL
  // orders from a single localhost IP within one window against one `next start`
  // instance, which would legitimately trip this limiter. The harness sets
  // `CHECKOUT_RATE_LIMIT_DISABLED=1` to bypass it. This is a SERVER-only env var
  // (never `NEXT_PUBLIC_`, never shipped to the client) and is unset in real
  // deploys, so production always enforces the limit. Documented, deliberate.
  if (process.env.CHECKOUT_RATE_LIMIT_DISABLED === "1") {
    return true;
  }

  const windowStart = now - CHECKOUT_RATE_LIMIT_WINDOW_MS;
  const recent = (attemptLog.get(ip) ?? []).filter(
    (timestamp) => timestamp > windowStart,
  );

  if (recent.length >= CHECKOUT_MAX_ORDERS_PER_WINDOW) {
    attemptLog.set(ip, recent);
    return false;
  }

  recent.push(now);
  if (!attemptLog.has(ip) && attemptLog.size >= CHECKOUT_RATE_LIMIT_MAX_KEYS) {
    evictToCeiling(windowStart);
  }
  attemptLog.set(ip, recent);
  return true;
}

/** Test-only: clear the in-memory state between cases. */
export function resetCheckoutRateLimitState(): void {
  attemptLog.clear();
}

/** Test-only: current distinct-key count (asserts the ceiling holds). */
export function checkoutRateLimitKeyCount(): number {
  return attemptLog.size;
}
