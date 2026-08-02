/**
 * Unit tests for the contact rate limiter wrapper (T13 AC-14, edge 5). Asserts
 * the per-IP window, the disable escape hatch, and that the dedicated instance
 * is isolated. The sliding-window core is exhaustively tested separately.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  checkContactRateLimit,
  resetContactRateLimitState,
  contactRateLimitKeyCount,
} from "./rate-limit";
import { CONTACT_MAX_SUBMISSIONS_PER_WINDOW } from "@/lib/config";

afterEach(() => {
  resetContactRateLimitState();
  delete process.env.CONTACT_RATE_LIMIT_DISABLED;
});

describe("checkContactRateLimit", () => {
  it("allows submissions up to the per-window max, then denies", () => {
    const ip = "203.0.113.7";
    const now = 1_000_000;
    for (let i = 0; i < CONTACT_MAX_SUBMISSIONS_PER_WINDOW; i += 1) {
      expect(checkContactRateLimit(ip, now)).toBe(true);
    }
    // The next attempt within the same window is denied (edge 5).
    expect(checkContactRateLimit(ip, now)).toBe(false);
  });

  it("keys independently per IP", () => {
    const now = 2_000_000;
    for (let i = 0; i < CONTACT_MAX_SUBMISSIONS_PER_WINDOW; i += 1) {
      checkContactRateLimit("198.51.100.1", now);
    }
    // A different IP still has its full allowance.
    expect(checkContactRateLimit("198.51.100.2", now)).toBe(true);
    expect(contactRateLimitKeyCount()).toBe(2);
  });

  it("bypasses the limit when CONTACT_RATE_LIMIT_DISABLED=1 (test hatch)", () => {
    process.env.CONTACT_RATE_LIMIT_DISABLED = "1";
    const ip = "203.0.113.9";
    for (let i = 0; i < CONTACT_MAX_SUBMISSIONS_PER_WINDOW + 5; i += 1) {
      expect(checkContactRateLimit(ip)).toBe(true);
    }
  });
});
