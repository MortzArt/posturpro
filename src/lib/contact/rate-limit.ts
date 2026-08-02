/**
 * Best-effort in-memory per-IP rate limiter for the contact-form relay (T13
 * AC-14, edge 5). `submitContactForm` is UNAUTHENTICATED and each success emails
 * the store owner, so unbounded calls are a spam/DoS vector — the sliding window
 * throttles the abuse rate while the honeypot handles crude bots.
 *
 * The window mechanics live in the shared, unit-tested
 * {@link createSlidingWindowLimiter} (same audited core as checkout/Q&A); this
 * module keeps the contact-scoped config + the test/E2E escape hatch. A dedicated
 * limiter INSTANCE (own map) so contact traffic never shares a bucket with
 * checkout, and its own `maxKeys` ceiling bounds a key-cardinality attack.
 */
import {
  CONTACT_MAX_SUBMISSIONS_PER_WINDOW,
  CONTACT_RATE_LIMIT_MAX_KEYS,
  CONTACT_RATE_LIMIT_WINDOW_MS,
} from "@/lib/config";
import { createSlidingWindowLimiter } from "@/lib/rate-limit/sliding-window";

const limiter = createSlidingWindowLimiter({
  windowMs: CONTACT_RATE_LIMIT_WINDOW_MS,
  maxPerWindow: CONTACT_MAX_SUBMISSIONS_PER_WINDOW,
  maxKeys: CONTACT_RATE_LIMIT_MAX_KEYS,
});

/**
 * Record a contact-submission attempt and report whether it is within the
 * allowed rate. Returns `true` when the caller MAY relay, `false` when tripped.
 *
 * @param ip best-effort client IP; a shared "unknown" bucket when absent
 *           (conservative — no-IP callers share one limit, never bypass it).
 * @param now injectable clock for tests (defaults to `Date.now()`)
 */
export function checkContactRateLimit(ip: string, now: number = Date.now()): boolean {
  // TEST/E2E ESCAPE HATCH: unit + integration + e2e submit several messages from
  // one localhost IP within a window against a single instance, which would
  // legitimately trip this limiter. The harness sets `CONTACT_RATE_LIMIT_DISABLED=1`
  // to bypass it. SERVER-only env var (never `NEXT_PUBLIC_`, unset in real
  // deploys), so production always enforces the limit. Documented, deliberate.
  if (process.env.CONTACT_RATE_LIMIT_DISABLED === "1") {
    return true;
  }
  return limiter.check(ip, now);
}

/** Test-only: clear the in-memory state between cases. */
export function resetContactRateLimitState(): void {
  limiter.reset();
}

/** Test-only: current distinct-key count (asserts the ceiling holds). */
export function contactRateLimitKeyCount(): number {
  return limiter.keyCount();
}
