/**
 * Per-IP rate limiter for MP payment-preference creation (T8 Security stage,
 * SEC-H-1). `createPaymentPreference` is an UNAUTHENTICATED `"use server"` action
 * that, per call, reads the order + items and makes a LIVE MP `Preference.create`
 * API call. Without a throttle, anyone holding one valid `confirmation_token` can
 * loop it unbounded — an amplification vector against a rate-quota'd, paid third-
 * party API and the DB. Same abuse class as `placeOrder`; reuses the exact shared
 * sliding-window limiter.
 *
 * The same E2E escape hatch as the checkout limiter applies: the payment e2e run
 * exercises the pay CTA repeatedly from one localhost IP.
 */
import {
  PREFERENCE_MAX_PER_WINDOW,
  PREFERENCE_RATE_LIMIT_MAX_KEYS,
  PREFERENCE_RATE_LIMIT_WINDOW_MS,
} from "@/lib/config";
import { createSlidingWindowLimiter } from "@/lib/rate-limit/sliding-window";

const limiter = createSlidingWindowLimiter({
  windowMs: PREFERENCE_RATE_LIMIT_WINDOW_MS,
  maxPerWindow: PREFERENCE_MAX_PER_WINDOW,
  maxKeys: PREFERENCE_RATE_LIMIT_MAX_KEYS,
});

/**
 * Record a preference-creation attempt and report whether it is within the
 * allowed rate. Returns `true` when the caller MAY proceed, `false` when tripped.
 *
 * @param ip best-effort client IP; a shared "unknown" bucket when absent.
 * @param now injectable clock for tests (defaults to `Date.now()`)
 */
export function checkPreferenceRateLimit(ip: string, now: number = Date.now()): boolean {
  // E2E ESCAPE HATCH — see checkout/rate-limit.ts. Server-only env var, never
  // NEXT_PUBLIC_, unset in real deploys so production always enforces the limit.
  if (process.env.CHECKOUT_RATE_LIMIT_DISABLED === "1") {
    return true;
  }
  return limiter.check(ip, now);
}

/** Test-only: clear the in-memory state between cases. */
export function resetPreferenceRateLimitState(): void {
  limiter.reset();
}

/** Test-only: current distinct-key count (asserts the ceiling holds). */
export function preferenceRateLimitKeyCount(): number {
  return limiter.keyCount();
}
