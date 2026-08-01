/**
 * `order-cancel-write` unit tests (T12 AC-13/14/15, edges 3/4/11). The wrapper
 * calls the transactional `cancel_order` RPC (whose transactionality + stock
 * restore is covered by the integration suite) and — crucially — fires
 * `sendCancelled` EXACTLY ONCE on a fresh cancel and NEVER on an idempotent
 * re-cancel (noop). An email failure does NOT roll back the cancel (AC-10). The
 * RPC + email dispatch are mocked here so the branching contract is asserted in
 * isolation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const rpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: (fn: string, args: Record<string, unknown>) => rpc(fn, args),
  }),
}));

const sendCancelled = vi.fn();
vi.mock("@/lib/email/dispatch", () => ({
  sendCancelled: (...args: unknown[]) => sendCancelled(...args),
}));

import { cancelOrder } from "./order-cancel-write";

const ORDER_ID = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  rpc.mockReset();
  sendCancelled.mockReset();
  sendCancelled.mockResolvedValue({ ok: true, sent: true });
});

describe("cancelOrder — fresh cancel (AC-13/14)", () => {
  it("emails once with the trimmed reason when applied:true", async () => {
    rpc.mockResolvedValue({ data: { applied: true, reason: "cancelled", from_status: "paid" }, error: null });
    const result = await cancelOrder(ORDER_ID, "  cliente lo pidió  ");
    expect(result).toEqual({ ok: true, emailSent: true });
    expect(rpc).toHaveBeenCalledWith("cancel_order", { p_order_id: ORDER_ID, p_note: "cliente lo pidió" });
    expect(sendCancelled).toHaveBeenCalledTimes(1);
    expect(sendCancelled).toHaveBeenCalledWith(ORDER_ID, "cliente lo pidió");
  });

  it("passes a null reason (nullable) through to the RPC + email", async () => {
    rpc.mockResolvedValue({ data: { applied: true, reason: "cancelled", from_status: "shipped" }, error: null });
    const result = await cancelOrder(ORDER_ID, null);
    expect(result).toEqual({ ok: true, emailSent: true });
    expect(rpc).toHaveBeenCalledWith("cancel_order", { p_order_id: ORDER_ID, p_note: null });
    expect(sendCancelled).toHaveBeenCalledWith(ORDER_ID, null);
  });

  it("normalizes a whitespace-only reason to null", async () => {
    rpc.mockResolvedValue({ data: { applied: true, reason: "cancelled", from_status: "paid" }, error: null });
    await cancelOrder(ORDER_ID, "   ");
    expect(rpc).toHaveBeenCalledWith("cancel_order", { p_order_id: ORDER_ID, p_note: null });
  });
});

describe("cancelOrder — idempotent re-cancel (edge 4)", () => {
  it("fires NO email on a noop (already cancelled)", async () => {
    rpc.mockResolvedValue({ data: { applied: false, reason: "noop", from_status: "cancelled" }, error: null });
    const result = await cancelOrder(ORDER_ID, "again");
    expect(result).toEqual({ ok: true, emailSent: false });
    expect(sendCancelled).not.toHaveBeenCalled();
  });
});

describe("cancelOrder — email-failure isolation (AC-10, edge 7)", () => {
  it("reports emailSent:false but the cancel still succeeds when the email fails", async () => {
    rpc.mockResolvedValue({ data: { applied: true, reason: "cancelled", from_status: "paid" }, error: null });
    sendCancelled.mockResolvedValue({ ok: false, reason: "provider down" });
    const result = await cancelOrder(ORDER_ID, "reason");
    expect(result).toEqual({ ok: true, emailSent: false });
  });
});

describe("cancelOrder — failure mapping", () => {
  it("maps order_not_found → ok:false/not-found (no email)", async () => {
    rpc.mockResolvedValue({ data: { applied: false, reason: "order_not_found", from_status: null }, error: null });
    const result = await cancelOrder(ORDER_ID, null);
    expect(result).toEqual({ ok: false, reason: "not-found" });
    expect(sendCancelled).not.toHaveBeenCalled();
  });

  it("maps a DB error → ok:false/write-failed (no email)", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "deadlock" } });
    const result = await cancelOrder(ORDER_ID, null);
    expect(result).toEqual({ ok: false, reason: "write-failed" });
    expect(sendCancelled).not.toHaveBeenCalled();
  });

  it("maps a null RPC payload → ok:false/write-failed", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const result = await cancelOrder(ORDER_ID, null);
    expect(result).toEqual({ ok: false, reason: "write-failed" });
  });

  it("maps a thrown RPC → ok:false/write-failed (never propagates)", async () => {
    rpc.mockRejectedValue(new Error("connection reset"));
    const result = await cancelOrder(ORDER_ID, null);
    expect(result).toEqual({ ok: false, reason: "write-failed" });
  });

  it("rejects a non-UUID order id before touching the DB", async () => {
    const result = await cancelOrder("not-a-uuid", null);
    expect(result).toEqual({ ok: false, reason: "not-found" });
    expect(rpc).not.toHaveBeenCalled();
  });
});
