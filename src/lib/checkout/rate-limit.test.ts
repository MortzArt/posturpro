import { afterEach, describe, expect, it } from "vitest";
import {
  CHECKOUT_MAX_ORDERS_PER_WINDOW,
  CHECKOUT_RATE_LIMIT_MAX_KEYS,
  CHECKOUT_RATE_LIMIT_WINDOW_MS,
} from "@/lib/config";
import {
  checkCheckoutRateLimit,
  checkoutRateLimitKeyCount,
  resetCheckoutRateLimitState,
} from "./rate-limit";

afterEach(() => {
  resetCheckoutRateLimitState();
});

describe("checkCheckoutRateLimit", () => {
  it("allows up to the per-window limit then blocks", () => {
    const ip = "203.0.113.7";
    const now = 1_000_000;
    for (let i = 0; i < CHECKOUT_MAX_ORDERS_PER_WINDOW; i += 1) {
      expect(checkCheckoutRateLimit(ip, now)).toBe(true);
    }
    // One over the limit within the same window → blocked.
    expect(checkCheckoutRateLimit(ip, now)).toBe(false);
  });

  it("allows again once the window has elapsed", () => {
    const ip = "203.0.113.8";
    const start = 2_000_000;
    for (let i = 0; i < CHECKOUT_MAX_ORDERS_PER_WINDOW; i += 1) {
      checkCheckoutRateLimit(ip, start);
    }
    expect(checkCheckoutRateLimit(ip, start)).toBe(false);
    // After the window slides past every recorded attempt → allowed again.
    const later = start + CHECKOUT_RATE_LIMIT_WINDOW_MS + 1;
    expect(checkCheckoutRateLimit(ip, later)).toBe(true);
  });

  it("isolates limits per IP", () => {
    const now = 3_000_000;
    for (let i = 0; i < CHECKOUT_MAX_ORDERS_PER_WINDOW; i += 1) {
      checkCheckoutRateLimit("198.51.100.1", now);
    }
    expect(checkCheckoutRateLimit("198.51.100.1", now)).toBe(false);
    // A different IP has its own fresh budget.
    expect(checkCheckoutRateLimit("198.51.100.2", now)).toBe(true);
  });

  it("collapses no-IP callers into one shared bucket", () => {
    const now = 4_000_000;
    for (let i = 0; i < CHECKOUT_MAX_ORDERS_PER_WINDOW; i += 1) {
      expect(checkCheckoutRateLimit("unknown", now)).toBe(true);
    }
    expect(checkCheckoutRateLimit("unknown", now)).toBe(false);
  });

  it("bypasses the limit when CHECKOUT_RATE_LIMIT_DISABLED=1 (e2e escape hatch)", () => {
    const previous = process.env.CHECKOUT_RATE_LIMIT_DISABLED;
    process.env.CHECKOUT_RATE_LIMIT_DISABLED = "1";
    try {
      const ip = "192.0.2.55";
      const now = 6_000_000;
      // Far beyond the per-window limit — every call still allowed.
      for (let i = 0; i < CHECKOUT_MAX_ORDERS_PER_WINDOW + 10; i += 1) {
        expect(checkCheckoutRateLimit(ip, now)).toBe(true);
      }
    } finally {
      if (previous === undefined) {
        delete process.env.CHECKOUT_RATE_LIMIT_DISABLED;
      } else {
        process.env.CHECKOUT_RATE_LIMIT_DISABLED = previous;
      }
    }
  });

  it("keeps the key map bounded under IP rotation (cardinality-DoS bound)", () => {
    const now = 5_000_000;
    // Push well past the ceiling with distinct IPs; eviction must keep it bounded.
    for (let i = 0; i < CHECKOUT_RATE_LIMIT_MAX_KEYS + 500; i += 1) {
      checkCheckoutRateLimit(`10.0.${Math.floor(i / 256)}.${i % 256}`, now);
    }
    expect(checkoutRateLimitKeyCount()).toBeLessThanOrEqual(CHECKOUT_RATE_LIMIT_MAX_KEYS);
  });
});
