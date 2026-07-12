/**
 * store-settings wrapper tests (T2 AC-15, edge case 2).
 *
 * Verifies the graceful-degradation contract: the wrapper returns the typed row
 * on success, and `null` (with a logged warning, never a throw) when the row is
 * absent, when Supabase returns an error, or when the client itself throws.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `store-settings.ts` imports `server-only`, whose real module throws when
// loaded outside an RSC (as here, under jsdom). Stub it to a no-op.
vi.mock("server-only", () => ({}));

const maybeSingle = vi.fn();
const select = vi.fn(() => ({ maybeSingle }));
const from = vi.fn(() => ({ select }));
const createClient = vi.fn(async () => ({ from }));

vi.mock("./supabase/server", () => ({
  createClient: () => createClient(),
}));

// Import after the mock is registered.
const { getStoreSettings } = await import("./store-settings");

const ROW = {
  id: "00000000-0000-0000-0000-000000000000",
  store_name: "PosturPro",
  contact_email: "hola@posturpro.mx",
  shipping_flat_rate_cents: 50_000,
  free_shipping_threshold_cents: 1_000_000,
  currency: "MXN",
  updated_at: "2026-01-01T00:00:00.000Z",
};

describe("getStoreSettings", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it("returns the typed row on success without warning", async () => {
    maybeSingle.mockResolvedValueOnce({ data: ROW, error: null });
    await expect(getStoreSettings()).resolves.toEqual(ROW);
    expect(warn).not.toHaveBeenCalled();
  });

  it("returns null and warns when the row is absent (edge case 2)", async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(getStoreSettings()).resolves.toBeNull();
    expect(warn).toHaveBeenCalledOnce();
  });

  it("returns null and warns on a Supabase error (RLS/network)", async () => {
    maybeSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "permission denied" },
    });
    await expect(getStoreSettings()).resolves.toBeNull();
    expect(warn).toHaveBeenCalledOnce();
  });

  it("returns null and warns when the client itself throws", async () => {
    createClient.mockRejectedValueOnce(new Error("missing env"));
    await expect(getStoreSettings()).resolves.toBeNull();
    expect(warn).toHaveBeenCalledOnce();
  });
});
