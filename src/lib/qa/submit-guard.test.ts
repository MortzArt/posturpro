/**
 * Unit tests for the pure Q&A submission guards (T4 AC-14, AC-15, edge 4, M-2).
 *
 * The first public write path's defense-in-depth composes these before touching
 * the DB. Covered: trim-BEFORE-length validation, honeypot detection, UUID
 * gating of the productId (M-2), the sliding rate-limit window (boundaries +
 * expiry), and the hard map-size ceiling with idle-then-oldest eviction (M-2).
 * The rate limiter uses an injectable clock so every window assertion is
 * deterministic — no sleeps.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkRateLimit,
  isHoneypotTripped,
  isValidProductId,
  rateLimitKeyCount,
  resetRateLimitState,
  validateQaSubmission,
} from "./submit-guard";
import {
  AUTHOR_NAME_MAX,
  QA_MAX_SUBMISSIONS_PER_WINDOW,
  QA_RATE_LIMIT_MAX_KEYS,
  QA_RATE_LIMIT_WINDOW_MS,
  QUESTION_MAX,
} from "@/lib/config";

const VALID_UUID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

beforeEach(() => {
  resetRateLimitState();
});

afterEach(() => {
  resetRateLimitState();
});

describe("validateQaSubmission — trim-before-length (edge 4)", () => {
  it("accepts a valid name + question and returns the TRIMMED values", () => {
    const result = validateQaSubmission("  Ana  ", "  ¿Es cómoda?  ");
    expect(result.ok).toBe(true);
    expect(result.values).toEqual({ authorName: "Ana", question: "¿Es cómoda?" });
    expect(result.fieldErrors).toEqual({});
  });

  it("rejects an all-whitespace question BEFORE the length check (never inserts empty)", () => {
    const result = validateQaSubmission("Ana", "      ");
    expect(result.ok).toBe(false);
    expect(result.fieldErrors.question).toBe("questionRequired");
  });

  it("rejects an all-whitespace / empty name", () => {
    expect(validateQaSubmission("   ", "q").fieldErrors.authorName).toBe(
      "nameRequired",
    );
    expect(validateQaSubmission("", "q").fieldErrors.authorName).toBe(
      "nameRequired",
    );
  });

  it("accepts a name at exactly AUTHOR_NAME_MAX (upper boundary)", () => {
    const name = "a".repeat(AUTHOR_NAME_MAX);
    expect(validateQaSubmission(name, "q").ok).toBe(true);
  });

  it("rejects a name one char over AUTHOR_NAME_MAX", () => {
    const name = "a".repeat(AUTHOR_NAME_MAX + 1);
    expect(validateQaSubmission(name, "q").fieldErrors.authorName).toBe(
      "nameTooLong",
    );
  });

  it("measures length AFTER trim (trailing spaces do not push a valid name over)", () => {
    const name = "a".repeat(AUTHOR_NAME_MAX) + "     ";
    expect(validateQaSubmission(name, "q").ok).toBe(true);
  });

  it("accepts a question at exactly QUESTION_MAX and rejects one char over", () => {
    expect(validateQaSubmission("Ana", "q".repeat(QUESTION_MAX)).ok).toBe(true);
    expect(
      validateQaSubmission("Ana", "q".repeat(QUESTION_MAX + 1)).fieldErrors
        .question,
    ).toBe("questionTooLong");
  });

  it("reports errors for both fields at once", () => {
    const result = validateQaSubmission("", "");
    expect(result.fieldErrors.authorName).toBe("nameRequired");
    expect(result.fieldErrors.question).toBe("questionRequired");
    expect(result.ok).toBe(false);
  });
});

describe("isHoneypotTripped (AC-15)", () => {
  it("is false for an empty honeypot (a real human)", () => {
    expect(isHoneypotTripped("")).toBe(false);
    expect(isHoneypotTripped("   ")).toBe(false);
  });

  it("is true for any filled honeypot (a bot)", () => {
    expect(isHoneypotTripped("http://spam.example")).toBe(true);
    expect(isHoneypotTripped("  x  ")).toBe(true);
  });
});

describe("isValidProductId (M-2 — UUID gate)", () => {
  it("accepts a canonical UUID", () => {
    expect(isValidProductId(VALID_UUID)).toBe(true);
  });

  it("rejects arbitrary strings an attacker would rotate to mint keys", () => {
    expect(isValidProductId("")).toBe(false);
    expect(isValidProductId("silla-milano")).toBe(false);
    expect(isValidProductId("1")).toBe(false);
    expect(isValidProductId(`${VALID_UUID}-extra`)).toBe(false);
  });
});

describe("checkRateLimit — sliding window (AC-15)", () => {
  const ip = "203.0.113.7";

  it("allows submissions up to the per-window max", () => {
    for (let i = 0; i < QA_MAX_SUBMISSIONS_PER_WINDOW; i += 1) {
      expect(checkRateLimit(ip, VALID_UUID, 1_000 + i)).toBe(true);
    }
  });

  it("rejects the submission that exceeds the max within the window", () => {
    const t = 1_000;
    for (let i = 0; i < QA_MAX_SUBMISSIONS_PER_WINDOW; i += 1) {
      checkRateLimit(ip, VALID_UUID, t + i);
    }
    // One more inside the window → tripped.
    expect(checkRateLimit(ip, VALID_UUID, t + QA_MAX_SUBMISSIONS_PER_WINDOW)).toBe(
      false,
    );
  });

  it("allows again once the window has fully slid past prior submissions", () => {
    const t = 1_000;
    for (let i = 0; i < QA_MAX_SUBMISSIONS_PER_WINDOW; i += 1) {
      checkRateLimit(ip, VALID_UUID, t + i);
    }
    expect(checkRateLimit(ip, VALID_UUID, t + QA_MAX_SUBMISSIONS_PER_WINDOW)).toBe(
      false,
    );
    // Advance strictly beyond the window from the newest timestamp.
    const later = t + QA_MAX_SUBMISSIONS_PER_WINDOW + QA_RATE_LIMIT_WINDOW_MS + 1;
    expect(checkRateLimit(ip, VALID_UUID, later)).toBe(true);
  });

  it("scopes the limit per IP+product (a different IP is independent)", () => {
    const t = 1_000;
    for (let i = 0; i < QA_MAX_SUBMISSIONS_PER_WINDOW; i += 1) {
      checkRateLimit(ip, VALID_UUID, t + i);
    }
    expect(checkRateLimit(ip, VALID_UUID, t + 10)).toBe(false);
    // A different IP for the same product is not affected.
    expect(checkRateLimit("198.51.100.1", VALID_UUID, t + 10)).toBe(true);
  });

  it("scopes the limit per product (a different product is independent)", () => {
    const other = "11111111-2222-3333-4444-555555555555";
    const t = 1_000;
    for (let i = 0; i < QA_MAX_SUBMISSIONS_PER_WINDOW; i += 1) {
      checkRateLimit(ip, VALID_UUID, t + i);
    }
    expect(checkRateLimit(ip, VALID_UUID, t + 10)).toBe(false);
    expect(checkRateLimit(ip, other, t + 10)).toBe(true);
  });
});

describe("checkRateLimit — map cardinality ceiling (M-2)", () => {
  it("does not grow the map for repeat calls on the same key", () => {
    checkRateLimit("ip-a", VALID_UUID, 1_000);
    checkRateLimit("ip-a", VALID_UUID, 1_001);
    expect(rateLimitKeyCount()).toBe(1);
  });

  it("prunes and never exceeds QA_RATE_LIMIT_MAX_KEYS distinct keys under a flood", () => {
    // Simulate an attacker rotating the IP (each a distinct key) well past the
    // ceiling, all within the same window instant.
    const now = 1_000;
    const flood = QA_RATE_LIMIT_MAX_KEYS + 500;
    for (let i = 0; i < flood; i += 1) {
      checkRateLimit(`ip-${i}`, VALID_UUID, now);
    }
    // The hard ceiling holds regardless of input cardinality.
    expect(rateLimitKeyCount()).toBeLessThanOrEqual(QA_RATE_LIMIT_MAX_KEYS);
  });

  it("evicts idle/expired keys first when the ceiling is breached", () => {
    // Fill to the ceiling at t0 with keys that will be EXPIRED by the time the
    // ceiling is next breached.
    const t0 = 1_000;
    for (let i = 0; i < QA_RATE_LIMIT_MAX_KEYS; i += 1) {
      checkRateLimit(`old-${i}`, VALID_UUID, t0);
    }
    expect(rateLimitKeyCount()).toBe(QA_RATE_LIMIT_MAX_KEYS);
    // Far in the future, all prior keys are expired; a fresh key triggers
    // eviction of the idle keys rather than unbounded growth.
    const future = t0 + QA_RATE_LIMIT_WINDOW_MS + 1;
    checkRateLimit("fresh", VALID_UUID, future);
    expect(rateLimitKeyCount()).toBeLessThanOrEqual(QA_RATE_LIMIT_MAX_KEYS);
  });
});
