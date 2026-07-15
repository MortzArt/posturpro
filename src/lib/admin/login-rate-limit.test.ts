import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkLoginRateLimit,
  loginRateLimitKeyCount,
  resetLoginRateLimitState,
} from "./login-rate-limit";
import { ADMIN_LOGIN_MAX_ATTEMPTS } from "./constants";

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
});
