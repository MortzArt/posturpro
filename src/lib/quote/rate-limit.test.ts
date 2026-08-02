/**
 * Unit tests for the quote rate limiter wrapper (T16 AC-7, edge 4). Asserts the
 * per-IP window, the disable escape hatch, and — critically — that the dedicated
 * quote instance is ISOLATED from the contact limiter's bucket (a legitimate
 * contact message must never be throttled by quote traffic, and vice versa). The
 * sliding-window core is exhaustively tested separately.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  checkQuoteRateLimit,
  resetQuoteRateLimitState,
  quoteRateLimitKeyCount,
} from "./rate-limit";
import {
  checkContactRateLimit,
  resetContactRateLimitState,
  contactRateLimitKeyCount,
} from "@/lib/contact/rate-limit";
import {
  QUOTE_MAX_SUBMISSIONS_PER_WINDOW,
  CONTACT_MAX_SUBMISSIONS_PER_WINDOW,
} from "@/lib/config";

afterEach(() => {
  resetQuoteRateLimitState();
  resetContactRateLimitState();
  delete process.env.QUOTE_RATE_LIMIT_DISABLED;
});

describe("checkQuoteRateLimit", () => {
  it("allows submissions up to the per-window max, then denies", () => {
    const ip = "203.0.113.7";
    const now = 1_000_000;
    for (let i = 0; i < QUOTE_MAX_SUBMISSIONS_PER_WINDOW; i += 1) {
      expect(checkQuoteRateLimit(ip, now)).toBe(true);
    }
    // The next attempt within the same window is denied (edge 4).
    expect(checkQuoteRateLimit(ip, now)).toBe(false);
  });

  it("keys independently per IP", () => {
    const now = 2_000_000;
    for (let i = 0; i < QUOTE_MAX_SUBMISSIONS_PER_WINDOW; i += 1) {
      checkQuoteRateLimit("198.51.100.1", now);
    }
    // A different IP still has its full allowance.
    expect(checkQuoteRateLimit("198.51.100.2", now)).toBe(true);
    expect(quoteRateLimitKeyCount()).toBe(2);
  });

  it("bypasses the limit when QUOTE_RATE_LIMIT_DISABLED=1 (test hatch)", () => {
    process.env.QUOTE_RATE_LIMIT_DISABLED = "1";
    const ip = "203.0.113.9";
    for (let i = 0; i < QUOTE_MAX_SUBMISSIONS_PER_WINDOW + 5; i += 1) {
      expect(checkQuoteRateLimit(ip)).toBe(true);
    }
  });
});

describe("quote ↔ contact limiter isolation (edge 4)", () => {
  it("does not share a bucket: exhausting the quote limit leaves contact unthrottled for the SAME IP", () => {
    const ip = "192.0.2.55";
    const now = 3_000_000;
    // Exhaust the quote limiter for this IP.
    for (let i = 0; i < QUOTE_MAX_SUBMISSIONS_PER_WINDOW; i += 1) {
      checkQuoteRateLimit(ip, now);
    }
    expect(checkQuoteRateLimit(ip, now)).toBe(false);
    // The SAME IP still has its full contact allowance — separate instance.
    for (let i = 0; i < CONTACT_MAX_SUBMISSIONS_PER_WINDOW; i += 1) {
      expect(checkContactRateLimit(ip, now)).toBe(true);
    }
  });

  it("does not share a bucket: exhausting the contact limit leaves quote unthrottled for the SAME IP", () => {
    const ip = "192.0.2.66";
    const now = 4_000_000;
    for (let i = 0; i < CONTACT_MAX_SUBMISSIONS_PER_WINDOW; i += 1) {
      checkContactRateLimit(ip, now);
    }
    expect(checkContactRateLimit(ip, now)).toBe(false);
    for (let i = 0; i < QUOTE_MAX_SUBMISSIONS_PER_WINDOW; i += 1) {
      expect(checkQuoteRateLimit(ip, now)).toBe(true);
    }
  });

  it("tracks key counts independently across the two instances", () => {
    const now = 5_000_000;
    checkQuoteRateLimit("192.0.2.1", now);
    checkQuoteRateLimit("192.0.2.2", now);
    checkContactRateLimit("192.0.2.3", now);
    expect(quoteRateLimitKeyCount()).toBe(2);
    expect(contactRateLimitKeyCount()).toBe(1);
  });
});
