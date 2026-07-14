/**
 * Best-effort in-memory per-IP rate limiter for the checkout write path (T7
 * Security stage). `placeOrder` is unauthenticated and each success creates an
 * order + decrements finite stock + a discount's redemption cap, so unbounded
 * calls are an abuse/griefing vector the atomic RPC does NOT bound (it stops
 * oversell + double-orders, not spam volume).
 *
 * The sliding-window mechanics live in the shared, unit-tested
 * {@link createSlidingWindowLimiter} (T8 extracted the common core so the pay
 * path reuses ONE audited implementation); this module keeps the checkout-scoped
 * config + the E2E escape hatch.
 */
import {
  CHECKOUT_MAX_ORDERS_PER_WINDOW,
  CHECKOUT_RATE_LIMIT_MAX_KEYS,
  CHECKOUT_RATE_LIMIT_WINDOW_MS,
} from "@/lib/config";
import { createSlidingWindowLimiter } from "@/lib/rate-limit/sliding-window";

const limiter = createSlidingWindowLimiter({
  windowMs: CHECKOUT_RATE_LIMIT_WINDOW_MS,
  maxPerWindow: CHECKOUT_MAX_ORDERS_PER_WINDOW,
  maxKeys: CHECKOUT_RATE_LIMIT_MAX_KEYS,
});

/**
 * Record an order-placement attempt and report whether it is within the allowed
 * rate. Returns `true` when the caller MAY proceed, `false` when tripped.
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
  return limiter.check(ip, now);
}

/** Test-only: clear the in-memory state between cases. */
export function resetCheckoutRateLimitState(): void {
  limiter.reset();
}

/** Test-only: current distinct-key count (asserts the ceiling holds). */
export function checkoutRateLimitKeyCount(): number {
  return limiter.keyCount();
}
