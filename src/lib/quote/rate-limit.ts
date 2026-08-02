/**
 * Best-effort in-memory per-IP rate limiter for the B2B quote-form relay (T16
 * AC-7, edge 4). `submitQuoteForm` is UNAUTHENTICATED and each success emails the
 * store owner, so unbounded calls are a spam/DoS vector — the sliding window
 * throttles the abuse rate while the honeypot handles crude bots.
 *
 * The window mechanics live in the shared, unit-tested
 * {@link createSlidingWindowLimiter} (same audited core as contact/checkout/Q&A);
 * this module keeps the quote-scoped config + the test/E2E escape hatch. A
 * DEDICATED limiter INSTANCE (own map/key-space) so quote traffic never shares a
 * bucket with the contact form (edge 4 — a legitimate contact message must never
 * be throttled by quote abuse, and vice versa); its own `maxKeys` ceiling bounds
 * a key-cardinality attack.
 */
import {
  QUOTE_MAX_SUBMISSIONS_PER_WINDOW,
  QUOTE_RATE_LIMIT_MAX_KEYS,
  QUOTE_RATE_LIMIT_WINDOW_MS,
} from "@/lib/config";
import { createSlidingWindowLimiter } from "@/lib/rate-limit/sliding-window";

const limiter = createSlidingWindowLimiter({
  windowMs: QUOTE_RATE_LIMIT_WINDOW_MS,
  maxPerWindow: QUOTE_MAX_SUBMISSIONS_PER_WINDOW,
  maxKeys: QUOTE_RATE_LIMIT_MAX_KEYS,
});

/**
 * Record a quote-submission attempt and report whether it is within the allowed
 * rate. Returns `true` when the caller MAY relay, `false` when tripped.
 *
 * @param ip best-effort client IP; a shared "unknown" bucket when absent
 *           (conservative — no-IP callers share one limit, never bypass it).
 * @param now injectable clock for tests (defaults to `Date.now()`)
 */
export function checkQuoteRateLimit(ip: string, now: number = Date.now()): boolean {
  // TEST/E2E ESCAPE HATCH: unit + integration + e2e submit several quotes from
  // one localhost IP within a window against a single instance, which would
  // legitimately trip this limiter. The harness sets `QUOTE_RATE_LIMIT_DISABLED=1`
  // to bypass it. SERVER-only env var (never `NEXT_PUBLIC_`, unset in real
  // deploys), so production always enforces the limit. Documented, deliberate.
  if (process.env.QUOTE_RATE_LIMIT_DISABLED === "1") {
    return true;
  }
  return limiter.check(ip, now);
}

/** Test-only: clear the in-memory state between cases. */
export function resetQuoteRateLimitState(): void {
  limiter.reset();
}

/** Test-only: current distinct-key count (asserts the ceiling holds). */
export function quoteRateLimitKeyCount(): number {
  return limiter.keyCount();
}
