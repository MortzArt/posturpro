/**
 * Tests for the MP payment-preference rate limiter (T8 Security stage, SEC-H-1).
 * Mirrors the checkout limiter suite — the pay action must throttle its
 * unauthenticated, MP-API-hitting preference creation per IP.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  PREFERENCE_MAX_PER_WINDOW,
  PREFERENCE_RATE_LIMIT_MAX_KEYS,
  PREFERENCE_RATE_LIMIT_WINDOW_MS,
} from "@/lib/config";
import {
  checkPreferenceRateLimit,
  preferenceRateLimitKeyCount,
  resetPreferenceRateLimitState,
} from "./preference-rate-limit";

afterEach(() => {
  resetPreferenceRateLimitState();
});

describe("checkPreferenceRateLimit", () => {
  it("allows up to the per-window limit then blocks", () => {
    const ip = "203.0.113.7";
    const now = 1_000_000;
    for (let i = 0; i < PREFERENCE_MAX_PER_WINDOW; i += 1) {
      expect(checkPreferenceRateLimit(ip, now)).toBe(true);
    }
    expect(checkPreferenceRateLimit(ip, now)).toBe(false);
  });

  it("allows again once the window has elapsed", () => {
    const ip = "203.0.113.8";
    const start = 2_000_000;
    for (let i = 0; i < PREFERENCE_MAX_PER_WINDOW; i += 1) {
      checkPreferenceRateLimit(ip, start);
    }
    expect(checkPreferenceRateLimit(ip, start)).toBe(false);
    const later = start + PREFERENCE_RATE_LIMIT_WINDOW_MS + 1;
    expect(checkPreferenceRateLimit(ip, later)).toBe(true);
  });

  it("isolates limits per IP", () => {
    const now = 3_000_000;
    for (let i = 0; i < PREFERENCE_MAX_PER_WINDOW; i += 1) {
      checkPreferenceRateLimit("198.51.100.1", now);
    }
    expect(checkPreferenceRateLimit("198.51.100.1", now)).toBe(false);
    expect(checkPreferenceRateLimit("198.51.100.2", now)).toBe(true);
  });

  it("collapses no-IP callers into one shared bucket", () => {
    const now = 4_000_000;
    for (let i = 0; i < PREFERENCE_MAX_PER_WINDOW; i += 1) {
      expect(checkPreferenceRateLimit("unknown", now)).toBe(true);
    }
    expect(checkPreferenceRateLimit("unknown", now)).toBe(false);
  });

  it("bypasses the limit when CHECKOUT_RATE_LIMIT_DISABLED=1 (e2e escape hatch)", () => {
    const previous = process.env.CHECKOUT_RATE_LIMIT_DISABLED;
    process.env.CHECKOUT_RATE_LIMIT_DISABLED = "1";
    try {
      const ip = "192.0.2.55";
      const now = 6_000_000;
      for (let i = 0; i < PREFERENCE_MAX_PER_WINDOW + 10; i += 1) {
        expect(checkPreferenceRateLimit(ip, now)).toBe(true);
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
    for (let i = 0; i < PREFERENCE_RATE_LIMIT_MAX_KEYS + 500; i += 1) {
      checkPreferenceRateLimit(`10.0.${Math.floor(i / 256)}.${i % 256}`, now);
    }
    expect(preferenceRateLimitKeyCount()).toBeLessThanOrEqual(PREFERENCE_RATE_LIMIT_MAX_KEYS);
  });
});
