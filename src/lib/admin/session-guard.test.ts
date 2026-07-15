/**
 * Guard-level fail-closed mapping (T10 M-2, edge 4/R5). `hasValidAdminSession`
 * wraps the authoritative `isSessionValid`, which THROWS `MissingEnvVarError` on a
 * missing/blank secret. This suite pins the contract that the guard MAPS that
 * throw to `false` (not authenticated) — a broken config must never grant access,
 * and must never verdict against an empty HMAC key.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const cookieValue = { value: undefined as string | undefined };
vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: () => (cookieValue.value === undefined ? undefined : { value: cookieValue.value }),
    }),
}));

import { hasValidAdminSession } from "./session-guard";
import { createSessionCookieValue } from "./session";

const SECRET = "guard-test-secret-0123456789abcdef";
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {
    ADMIN_SESSION_SECRET: process.env.ADMIN_SESSION_SECRET,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
  };
  process.env.ADMIN_SESSION_SECRET = SECRET;
  process.env.ADMIN_EMAIL = "owner@posturpro.mx";
  process.env.ADMIN_PASSWORD_HASH = "scrypt$16384$8$1$00$00";
  cookieValue.value = undefined;
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("hasValidAdminSession fail-closed mapping (M-2)", () => {
  it("returns true for a valid cookie when the secret is set", async () => {
    cookieValue.value = createSessionCookieValue(Math.floor(Date.now() / 1000));
    expect(await hasValidAdminSession()).toBe(true);
  });

  it("returns false (never throws) when the secret is unset — a valid cookie is NOT honored", async () => {
    cookieValue.value = createSessionCookieValue(Math.floor(Date.now() / 1000));
    delete process.env.ADMIN_SESSION_SECRET;
    await expect(hasValidAdminSession()).resolves.toBe(false);
  });

  it("returns false when there is no cookie at all", async () => {
    cookieValue.value = undefined;
    expect(await hasValidAdminSession()).toBe(false);
  });
});
