/**
 * Unit tests for the email_sends ledger wrappers (T9 AC-5). The admin client is
 * mocked — no DB. Asserts new/duplicate/error mapping + failure isolation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const rpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc }),
}));

beforeEach(() => {
  rpc.mockReset();
});

async function ledger() {
  return import("./ledger");
}

describe("claimEmailSend", () => {
  it("returns 'new' when the RPC returns 'new'", async () => {
    rpc.mockResolvedValue({ data: "new", error: null });
    const { claimEmailSend } = await ledger();
    expect(await claimEmailSend("o1", "payment_received", "MP-1")).toBe("new");
    expect(rpc).toHaveBeenCalledWith("claim_email_send", {
      p_order_id: "o1",
      p_email_kind: "payment_received",
      p_dedupe_key: "MP-1",
    });
  });

  it("returns 'duplicate' when the RPC returns 'duplicate'", async () => {
    rpc.mockResolvedValue({ data: "duplicate", error: null });
    const { claimEmailSend } = await ledger();
    expect(await claimEmailSend("o1", "order_confirmation", "")).toBe("duplicate");
  });

  it("returns 'error' (logged) on a DB error — never throws", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { claimEmailSend } = await ledger();
    expect(await claimEmailSend("o1", "order_confirmation", "")).toBe("error");
  });

  it("returns 'error' when the client throws — never propagates", async () => {
    rpc.mockRejectedValue(new Error("network"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { claimEmailSend } = await ledger();
    expect(await claimEmailSend("o1", "order_confirmation", "")).toBe("error");
  });
});

describe("finalizeEmailSend", () => {
  it("calls the finalize RPC with the triple", async () => {
    rpc.mockResolvedValue({ error: null });
    const { finalizeEmailSend } = await ledger();
    await finalizeEmailSend("o1", "payment_received", "MP-1");
    expect(rpc).toHaveBeenCalledWith("finalize_email_send", {
      p_order_id: "o1",
      p_email_kind: "payment_received",
      p_dedupe_key: "MP-1",
    });
  });

  it("swallows a finalize error (harmless) — never throws", async () => {
    rpc.mockResolvedValue({ error: { message: "boom" } });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { finalizeEmailSend } = await ledger();
    await expect(finalizeEmailSend("o1", "order_confirmation", "")).resolves.toBeUndefined();
  });
});
