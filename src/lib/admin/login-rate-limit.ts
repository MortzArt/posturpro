/**
 * Best-effort in-memory per-IP login rate limiter (T10 AC-15, R5).
 *
 * The login action is unauthenticated and each attempt runs a deliberately
 * expensive scrypt derivation (timing-parity, R3), so unbounded attempts are both
 * a credential-stuffing vector and a CPU-amplification vector. This throttles
 * attempts per client IP using the shared, audited sliding-window limiter (the
 * same core the checkout/pay limiters reuse).
 *
 * No `import "server-only"`: pure in-memory logic, no secret, imported only by
 * the `"use server"` login action and unit-tested (mirrors `checkout/rate-limit`).
 */
import {
  ADMIN_LOGIN_MAX_ATTEMPTS,
  ADMIN_LOGIN_RATE_LIMIT_MAX_KEYS,
  ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS,
} from "@/lib/admin/constants";
import { createSlidingWindowLimiter } from "@/lib/rate-limit/sliding-window";

const limiter = createSlidingWindowLimiter({
  windowMs: ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS,
  maxPerWindow: ADMIN_LOGIN_MAX_ATTEMPTS,
  maxKeys: ADMIN_LOGIN_RATE_LIMIT_MAX_KEYS,
});

/**
 * Record a login attempt and report whether it is within the allowed rate.
 * Returns `true` when the caller MAY proceed, `false` when tripped (AC-15).
 *
 * @param ip best-effort client IP; a shared "unknown" bucket when absent.
 * @param now injectable clock for tests (defaults to `Date.now()`).
 */
export function checkLoginRateLimit(ip: string, now: number = Date.now()): boolean {
  // E2E ESCAPE HATCH: the authoritative admin e2e run logs in several times from
  // a single localhost IP within one window against one `next start` instance,
  // which would legitimately trip this limiter. The harness sets
  // `ADMIN_LOGIN_RATE_LIMIT_DISABLED=1` to bypass it. SERVER-only env var (never
  // `NEXT_PUBLIC_`, never shipped to the client), unset in real deploys — so
  // production always enforces the limit. Documented, deliberate.
  if (process.env.ADMIN_LOGIN_RATE_LIMIT_DISABLED === "1") {
    return true;
  }
  return limiter.check(ip, now);
}

/** Test-only: clear the in-memory state between cases. */
export function resetLoginRateLimitState(): void {
  limiter.reset();
}

/** Test-only: current distinct-key count (asserts the ceiling holds). */
export function loginRateLimitKeyCount(): number {
  return limiter.keyCount();
}
