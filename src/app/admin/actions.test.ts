import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * `saveStoreSettings` trust-boundary tests (T10 AC-9, edge 9).
 *
 * The action re-verifies the admin session server-side BEFORE touching the DB
 * (never trusts the middleware alone). These tests prove the composition: a
 * direct POST with an ABSENT or TAMPERED session cookie must `redirect()` to
 * login and MUST NOT reach `updateStoreSettings` (the DB write). The session
 * predicate itself (`isSessionValid`) is exhaustively covered in session.test.ts;
 * here we fence the wiring so a future refactor can't accidentally let a
 * mutation through without a valid session.
 *
 * We mock the Next boundaries (`next/headers` cookies, `next/navigation`
 * redirect) and the DB write module so the test is pure and hits no I/O.
 */

// --- Mocks for the Next boundaries + the DB write path -----------------------
let cookieValue: string | undefined;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "posturpro_admin_session" && cookieValue !== undefined
        ? { value: cookieValue }
        : undefined,
    set: vi.fn(),
  }),
}));

class RedirectError extends Error {
  constructor(public readonly to: string) {
    super(`REDIRECT:${to}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectError(to);
  },
}));

const updateStoreSettingsMock = vi.fn(
  (): Promise<{ ok: true }> => Promise.resolve({ ok: true }),
);
vi.mock("@/lib/store-settings", () => ({
  updateStoreSettings: () => updateStoreSettingsMock(),
}));

// `isSessionValid` is the authoritative predicate; drive it per-test.
const isSessionValidMock = vi.fn<(value: string | undefined) => boolean>();
vi.mock("@/lib/admin/session", () => ({
  isSessionValid: (value: string | undefined) => isSessionValidMock(value),
  createSessionCookieValue: () => "minted.session",
}));

import { saveStoreSettings } from "./actions";
import { initialAdminSettingsState } from "./admin-form-state";

function validFormData(): FormData {
  const fd = new FormData();
  fd.set("store_name", "Valid Store");
  fd.set("contact_email", "owner@example.com");
  fd.set("shipping_flat_rate", "500.00");
  fd.set("free_shipping_threshold", "10000.00");
  return fd;
}

beforeEach(() => {
  cookieValue = undefined;
  updateStoreSettingsMock.mockClear();
  isSessionValidMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("saveStoreSettings session re-verification (edge 9)", () => {
  it("redirects to login and never writes the DB when the cookie is ABSENT", async () => {
    cookieValue = undefined;
    isSessionValidMock.mockReturnValue(false);

    await expect(
      saveStoreSettings(initialAdminSettingsState, validFormData()),
    ).rejects.toMatchObject({ to: "/admin/login" });

    expect(updateStoreSettingsMock).not.toHaveBeenCalled();
  });

  it("redirects to login and never writes the DB when the cookie is TAMPERED", async () => {
    cookieValue = "forged.payload.signature";
    isSessionValidMock.mockReturnValue(false);

    await expect(
      saveStoreSettings(initialAdminSettingsState, validFormData()),
    ).rejects.toBeInstanceOf(Error);

    expect(isSessionValidMock).toHaveBeenCalledWith("forged.payload.signature");
    expect(updateStoreSettingsMock).not.toHaveBeenCalled();
  });

  it("writes the DB only after a VALID session verifies", async () => {
    cookieValue = "valid.session.cookie";
    isSessionValidMock.mockReturnValue(true);

    const result = await saveStoreSettings(
      initialAdminSettingsState,
      validFormData(),
    );

    expect(updateStoreSettingsMock).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("success");
  });

  it("with a VALID session but INVALID input, returns field errors and does NOT write", async () => {
    cookieValue = "valid.session.cookie";
    isSessionValidMock.mockReturnValue(true);

    const fd = validFormData();
    fd.set("shipping_flat_rate", "1,000.00"); // thousand separator → invalid

    const result = await saveStoreSettings(initialAdminSettingsState, fd);

    expect(result.status).toBe("invalid");
    expect(result.fieldErrors?.shipping_flat_rate).toBeDefined();
    expect(updateStoreSettingsMock).not.toHaveBeenCalled();
  });
});
