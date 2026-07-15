import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkLoginRateLimit,
  loginRateLimitKeyCount,
  resetLoginRateLimitState,
} from "./login-rate-limit";
import {
  ADMIN_LOGIN_MAX_ATTEMPTS,
  ADMIN_LOGIN_RATE_LIMIT_MAX_KEYS,
  ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS,
} from "./constants";

let savedDisable: string | undefined;

beforeEach(() => {
  savedDisable = process.env.ADMIN_LOGIN_RATE_LIMIT_DISABLED;
  delete process.env.ADMIN_LOGIN_RATE_LIMIT_DISABLED;
  resetLoginRateLimitState();
});

afterEach(() => {
  process.env.ADMIN_LOGIN_RATE_LIMIT_DISABLED = savedDisable;
  resetLoginRateLimitState();
});

describe("checkLoginRateLimit (AC-15)", () => {
  it("allows up to the max attempts, then blocks", () => {
    const now = 1_000_000;
    for (let i = 0; i < ADMIN_LOGIN_MAX_ATTEMPTS; i += 1) {
      expect(checkLoginRateLimit("1.2.3.4", now)).toBe(true);
    }
    expect(checkLoginRateLimit("1.2.3.4", now)).toBe(false);
  });

  it("tracks IPs independently", () => {
    const now = 1_000_000;
    for (let i = 0; i < ADMIN_LOGIN_MAX_ATTEMPTS; i += 1) {
      checkLoginRateLimit("1.2.3.4", now);
    }
    expect(checkLoginRateLimit("1.2.3.4", now)).toBe(false);
    expect(checkLoginRateLimit("5.6.7.8", now)).toBe(true);
  });

  it("bypasses the limit under the E2E escape hatch", () => {
    process.env.ADMIN_LOGIN_RATE_LIMIT_DISABLED = "1";
    const now = 1_000_000;
    for (let i = 0; i < ADMIN_LOGIN_MAX_ATTEMPTS + 5; i += 1) {
      expect(checkLoginRateLimit("1.2.3.4", now)).toBe(true);
    }
  });

  it("exposes a bounded key count", () => {
    checkLoginRateLimit("a", 1);
    checkLoginRateLimit("b", 1);
    expect(loginRateLimitKeyCount()).toBe(2);
  });

  it("caps distinct keys at the cardinality ceiling (AC-15, M-4)", () => {
    // Push well past the ceiling from distinct IPs within one window; the map
    // must never exceed the bound (the cardinality-DoS / memory defense).
    const now = 2_000_000;
    const overshoot = 200;
    for (let i = 0; i < ADMIN_LOGIN_RATE_LIMIT_MAX_KEYS + overshoot; i += 1) {
      checkLoginRateLimit(`ip-${i}`, now);
    }
    expect(loginRateLimitKeyCount()).toBeLessThanOrEqual(
      ADMIN_LOGIN_RATE_LIMIT_MAX_KEYS,
    );
  });

  it("releases access after the window expires (sliding release, M-4)", () => {
    const start = 3_000_000;
    for (let i = 0; i < ADMIN_LOGIN_MAX_ATTEMPTS; i += 1) {
      checkLoginRateLimit("9.9.9.9", start);
    }
    // Tripped at the same instant.
    expect(checkLoginRateLimit("9.9.9.9", start)).toBe(false);
    // Advance PAST the window: every prior attempt ages out → access restored.
    const afterWindow = start + ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS + 1;
    expect(checkLoginRateLimit("9.9.9.9", afterWindow)).toBe(true);
  });

  it("still enforces the limit just before the window fully elapses", () => {
    const start = 4_000_000;
    for (let i = 0; i < ADMIN_LOGIN_MAX_ATTEMPTS; i += 1) {
      checkLoginRateLimit("8.8.8.8", start);
    }
    // One ms before the window elapses, the first attempt is still within the
    // window (`ts > now - windowMs`), so the count holds → blocked.
    expect(
      checkLoginRateLimit("8.8.8.8", start + ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS - 1),
    ).toBe(false);
  });

  it("escape hatch enforces unless the flag is EXACTLY \"1\" (M-4, security-strict)", () => {
    const now = 5_000_000;
    // A non-"1" truthy-looking value must STILL enforce (source is `=== "1"`).
    for (const value of ["true", "0", "yes", "on", " 1 ", ""]) {
      resetLoginRateLimitState();
      process.env.ADMIN_LOGIN_RATE_LIMIT_DISABLED = value;
      for (let i = 0; i < ADMIN_LOGIN_MAX_ATTEMPTS; i += 1) {
        checkLoginRateLimit("7.7.7.7", now);
      }
      expect(checkLoginRateLimit("7.7.7.7", now)).toBe(false);
    }
    // Only the exact string "1" bypasses.
    resetLoginRateLimitState();
    process.env.ADMIN_LOGIN_RATE_LIMIT_DISABLED = "1";
    for (let i = 0; i < ADMIN_LOGIN_MAX_ATTEMPTS + 5; i += 1) {
      expect(checkLoginRateLimit("7.7.7.7", now)).toBe(true);
    }
  });
});
