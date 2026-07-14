/**
 * Unit tests for the refund execution API (T8 AC-19, AC-20, edges 8/9/10). MP
 * SDK, admin client, and advance-order RPC are mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const refundCreate = vi.fn();
vi.mock("./mp-client", () => ({
  refundClient: () => ({ create: refundCreate }),
}));

const advanceOrderStatus = vi.fn();
vi.mock("./advance-order", () => ({
  advanceOrderStatus: (...args: unknown[]) => advanceOrderStatus(...args),
}));

interface OrderRow {
  id: string;
  total_cents: number;
  payment_status: string;
  mp_payment_id: string | null;
}
const state: {
  order: OrderRow | null;
  priorRefunded: number;
  recordRefundResult: { ok: boolean; reason: string } | null;
  recordRefundError: { message: string } | null;
  recordRefundCalls: Array<Record<string, unknown>>;
} = {
  order: null,
  priorRefunded: 0,
  recordRefundResult: null,
  recordRefundError: null,
  recordRefundCalls: [],
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from() {
      const chain = {
        select() {
          return chain;
        },
        eq() {
          return chain;
        },
        async maybeSingle() {
          return { data: state.order, error: null };
        },
      };
      return chain;
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      if (fn === "refunded_total") {
        return { data: state.priorRefunded, error: null };
      }
      if (fn === "record_refund") {
        state.recordRefundCalls.push(args);
        if (state.recordRefundError) {
          return { data: null, error: state.recordRefundError };
        }
        return {
          data: state.recordRefundResult ?? { ok: true, reason: "recorded" },
          error: null,
        };
      }
      return { data: null, error: null };
    },
  }),
}));

import { refundOrderPayment } from "./refund";

const PAID_ORDER: OrderRow = {
  id: "11111111-1111-1111-1111-111111111111",
  total_cents: 899990,
  payment_status: "paid",
  mp_payment_id: "MP-999",
};

beforeEach(() => {
  refundCreate.mockReset();
  refundCreate.mockResolvedValue({ id: 1, status: "approved" });
  advanceOrderStatus.mockReset();
  advanceOrderStatus.mockResolvedValue({ ok: true, result: { applied: true, reason: "payment_updated" } });
  state.order = { ...PAID_ORDER };
  state.priorRefunded = 0;
  state.recordRefundResult = null;
  state.recordRefundError = null;
  state.recordRefundCalls = [];
});

describe("refundOrderPayment", () => {
  it("full refund (null amount) → refunded, advances to refunded (AC-19)", async () => {
    const result = await refundOrderPayment(PAID_ORDER.id, null);
    expect(result).toEqual({ status: "refunded", kind: "full" });
    expect(refundCreate).toHaveBeenCalledWith(
      expect.objectContaining({ payment_id: "MP-999", body: undefined }),
    );
    expect(advanceOrderStatus).toHaveBeenCalledWith(
      expect.objectContaining({ p_order_status: null, p_payment_status: "refunded" }),
    );
    // Recorded durably in the ledger (M-3).
    expect(state.recordRefundCalls).toHaveLength(1);
    expect(state.recordRefundCalls[0]).toMatchObject({ p_is_full: true, p_mp_refund_id: "1" });
  });

  it("full refund when amount equals total → refunded/full", async () => {
    const result = await refundOrderPayment(PAID_ORDER.id, 899990);
    expect(result).toEqual({ status: "refunded", kind: "full" });
  });

  it("partial refund → refunded/partial, payment stays paid (no advance to refunded)", async () => {
    const result = await refundOrderPayment(PAID_ORDER.id, 100000);
    expect(result).toEqual({ status: "refunded", kind: "partial" });
    expect(refundCreate).toHaveBeenCalledWith(
      expect.objectContaining({ body: { amount: 1000 } }),
    );
    // Partial does NOT advance payment_status to refunded (documented rule).
    expect(advanceOrderStatus).not.toHaveBeenCalled();
    // But it IS recorded durably in the ledger (M-3).
    expect(state.recordRefundCalls).toHaveLength(1);
    expect(state.recordRefundCalls[0]).toMatchObject({ p_amount_cents: 100000, p_is_full: false });
  });

  it("refuses a second partial that would exceed the REMAINING balance (edge 9, M-2)", async () => {
    // 600000¢ already refunded; a further 400000¢ would exceed the 899990¢ total.
    state.priorRefunded = 600000;
    const result = await refundOrderPayment(PAID_ORDER.id, 400000);
    expect(result).toEqual({ status: "not-refundable", reason: "over-refund" });
    expect(refundCreate).not.toHaveBeenCalled(); // early pre-check, before MP
  });

  it("allows a second partial within the remaining balance (M-2)", async () => {
    state.priorRefunded = 600000; // remaining 299990¢
    const result = await refundOrderPayment(PAID_ORDER.id, 200000);
    expect(result).toEqual({ status: "refunded", kind: "partial" });
    expect(refundCreate).toHaveBeenCalledOnce();
  });

  it("refuses any refund once the order is fully refunded (M-2)", async () => {
    state.priorRefunded = 899990; // remaining 0
    const result = await refundOrderPayment(PAID_ORDER.id, null);
    expect(result).toEqual({ status: "not-refundable", reason: "over-refund" });
    expect(refundCreate).not.toHaveBeenCalled();
  });

  it("treats a full refund (null) as the REMAINING balance after prior partials (M-2)", async () => {
    state.priorRefunded = 300000; // remaining 599990¢
    const result = await refundOrderPayment(PAID_ORDER.id, null);
    expect(result).toEqual({ status: "refunded", kind: "full" });
    expect(state.recordRefundCalls[0]).toMatchObject({ p_amount_cents: 599990, p_is_full: true });
  });

  it("returns error (reconcile-by-hand) if MP succeeds but the SQL guard rejects (race, M-2)", async () => {
    // The pre-check passes but a concurrent refund raced past it → SQL guard rejects.
    state.recordRefundResult = { ok: false, reason: "over_refund" };
    const result = await refundOrderPayment(PAID_ORDER.id, 100000);
    expect(result).toEqual({ status: "error" });
    expect(refundCreate).toHaveBeenCalledOnce(); // money DID move at MP
  });

  it("sends a per-request idempotency key (AC-19)", async () => {
    await refundOrderPayment(PAID_ORDER.id, null);
    expect(refundCreate).toHaveBeenCalledWith(
      expect.objectContaining({ requestOptions: { idempotencyKey: expect.stringContaining("refund:") } }),
    );
  });

  it("refuses a pending (non-approved) payment → not-refundable/not-paid (edge 8)", async () => {
    state.order = { ...PAID_ORDER, payment_status: "pending" };
    const result = await refundOrderPayment(PAID_ORDER.id, null);
    expect(result).toEqual({ status: "not-refundable", reason: "not-paid" });
    expect(refundCreate).not.toHaveBeenCalled();
  });

  it("refuses a partial that exceeds the order total (edge 9)", async () => {
    const result = await refundOrderPayment(PAID_ORDER.id, 999999);
    expect(result).toEqual({ status: "not-refundable", reason: "amount-invalid" });
    expect(refundCreate).not.toHaveBeenCalled();
  });

  it("refuses a non-positive / non-integer amount", async () => {
    expect(await refundOrderPayment(PAID_ORDER.id, 0)).toMatchObject({ status: "not-refundable" });
    expect(await refundOrderPayment(PAID_ORDER.id, -5)).toMatchObject({ status: "not-refundable" });
    expect(await refundOrderPayment(PAID_ORDER.id, 1.5)).toMatchObject({ status: "not-refundable" });
  });

  it("refuses when the order has no mp_payment_id", async () => {
    state.order = { ...PAID_ORDER, mp_payment_id: null };
    const result = await refundOrderPayment(PAID_ORDER.id, null);
    expect(result).toEqual({ status: "not-refundable", reason: "no-payment-id" });
  });

  it("returns not-found for a bad order id (never a raw error)", async () => {
    const result = await refundOrderPayment("not-a-uuid", null);
    expect(result).toEqual({ status: "not-refundable", reason: "not-found" });
  });

  it("returns not-found when the order is absent", async () => {
    state.order = null;
    const result = await refundOrderPayment(PAID_ORDER.id, null);
    expect(result).toEqual({ status: "not-refundable", reason: "not-found" });
  });

  it("returns mp-error and leaves state UNCHANGED when MP fails (edge 10)", async () => {
    refundCreate.mockRejectedValue(new Error("MP 500 insufficient balance"));
    const result = await refundOrderPayment(PAID_ORDER.id, null);
    expect(result).toEqual({ status: "mp-error" });
    expect(advanceOrderStatus).not.toHaveBeenCalled();
  });

  it("never echoes the raw MP error to the caller (AC-20)", async () => {
    refundCreate.mockRejectedValue(new Error("SECRET internal MP detail"));
    const result = await refundOrderPayment(PAID_ORDER.id, null);
    expect(JSON.stringify(result)).not.toContain("SECRET internal MP detail");
  });
});
