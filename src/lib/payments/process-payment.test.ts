/**
 * Unit tests for the webhook processing core (T8 AC-9..AC-15, edges 1/2/3/6/7).
 * The MP SDK, the admin Supabase client, and the advance-order RPC wrapper are
 * ALL mocked — no live MP call, no live DB (AC-22).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// --- Mock the MP payment fetch ---
const paymentGet = vi.fn();
vi.mock("./mp-client", () => ({
  paymentClient: () => ({ get: paymentGet }),
}));

// --- Mock the advance-order RPC wrapper ---
const advanceOrderStatus = vi.fn();
vi.mock("./advance-order", () => ({
  advanceOrderStatus: (...args: unknown[]) => advanceOrderStatus(...args),
}));

// --- Mock the admin client (order match + event claim) ---
interface OrderRow {
  id: string;
  total_cents: number;
}
const state: {
  orderByExternalRef: OrderRow | null;
  orderByToken: OrderRow | null;
  eventInsertError: { code?: string; message: string } | null;
} = { orderByExternalRef: null, orderByToken: null, eventInsertError: null };

function makeSelectChain() {
  // Chainable: .select().eq().maybeSingle(); the column decides which store.
  let column = "";
  const chain = {
    select() {
      return chain;
    },
    eq(col: string) {
      column = col;
      return chain;
    },
    async maybeSingle() {
      if (column === "mp_external_reference") {
        return { data: state.orderByExternalRef, error: null };
      }
      if (column === "confirmation_token") {
        return { data: state.orderByToken, error: null };
      }
      return { data: null, error: null };
    },
  };
  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === "mp_payment_events") {
        return {
          async insert() {
            return { error: state.eventInsertError };
          },
        };
      }
      // orders
      return makeSelectChain();
    },
  }),
}));

import { processPaymentNotification } from "./process-payment";

const ORDER: OrderRow = { id: "order-uuid-1", total_cents: 899990 };

beforeEach(() => {
  paymentGet.mockReset();
  advanceOrderStatus.mockReset();
  advanceOrderStatus.mockResolvedValue({ ok: true, result: { applied: true, reason: "advanced" } });
  state.orderByExternalRef = ORDER;
  state.orderByToken = null;
  state.eventInsertError = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("processPaymentNotification", () => {
  it("advances an approved payment whose amount matches the order (AC-9/12/13)", async () => {
    paymentGet.mockResolvedValue({
      id: 111,
      status: "approved",
      status_detail: "accredited",
      external_reference: "ext-ref",
      transaction_amount: 8999.9,
      payment_type_id: "credit_card",
      payment_method_id: "visa",
    });
    const result = await processPaymentNotification("111", "payment.updated");
    expect(result).toEqual({ kind: "processed", httpOk: true });
    expect(advanceOrderStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        p_order_id: ORDER.id,
        p_order_status: "paid",
        p_payment_status: "paid",
        p_payment_method: "card",
        p_mp_payment_id: "111",
      }),
    );
  });

  it("does NOT mark paid on an amount mismatch (AC-12, edge 7)", async () => {
    paymentGet.mockResolvedValue({
      id: 111,
      status: "approved",
      external_reference: "ext-ref",
      transaction_amount: 100.0, // ≠ 8999.90
      payment_type_id: "credit_card",
    });
    const result = await processPaymentNotification("111", null);
    expect(result).toEqual({ kind: "amount-mismatch", httpOk: true });
    expect(advanceOrderStatus).not.toHaveBeenCalled();
  });

  it("is a no-op on a duplicate payment id (AC-10, edge 1)", async () => {
    paymentGet.mockResolvedValue({ id: 111, status: "approved", external_reference: "ext-ref", transaction_amount: 8999.9 });
    state.eventInsertError = { code: "23505", message: "duplicate key" };
    const result = await processPaymentNotification("111", null);
    expect(result).toEqual({ kind: "duplicate", httpOk: true });
    expect(advanceOrderStatus).not.toHaveBeenCalled();
  });

  it("accepts (200) an unknown/unmatched payment without mutating (AC-11, edge 3)", async () => {
    state.orderByExternalRef = null;
    state.orderByToken = null;
    paymentGet.mockResolvedValue({ id: 111, status: "approved", external_reference: "nope", transaction_amount: 8999.9 });
    const result = await processPaymentNotification("111", null);
    expect(result).toEqual({ kind: "unknown-order", httpOk: true });
    expect(advanceOrderStatus).not.toHaveBeenCalled();
  });

  it("flags a chargeback without advancing (AC-14)", async () => {
    paymentGet.mockResolvedValue({ id: 111, status: "charged_back", external_reference: "ext-ref", transaction_amount: 8999.9 });
    const result = await processPaymentNotification("111", null);
    expect(result).toEqual({ kind: "flagged", httpOk: true });
    expect(advanceOrderStatus).not.toHaveBeenCalled();
  });

  it("advances a pending OXXO payment to pending (no amount gate)", async () => {
    paymentGet.mockResolvedValue({
      id: 111,
      status: "pending",
      status_detail: "pending_waiting_payment",
      external_reference: "ext-ref",
      transaction_amount: 8999.9,
      payment_type_id: "ticket",
      payment_method_id: "oxxo",
    });
    const result = await processPaymentNotification("111", null);
    expect(result).toEqual({ kind: "processed", httpOk: true });
    expect(advanceOrderStatus).toHaveBeenCalledWith(
      expect.objectContaining({ p_payment_status: "pending", p_payment_method: "oxxo" }),
    );
  });

  it("maps a rejected payment to failed, order stays pending (AC-16)", async () => {
    paymentGet.mockResolvedValue({
      id: 111,
      status: "rejected",
      status_detail: "cc_rejected_other_reason",
      external_reference: "ext-ref",
      transaction_amount: 8999.9,
      payment_type_id: "credit_card",
    });
    const result = await processPaymentNotification("111", null);
    expect(result).toEqual({ kind: "processed", httpOk: true });
    expect(advanceOrderStatus).toHaveBeenCalledWith(
      expect.objectContaining({ p_order_status: "pending_payment", p_payment_status: "failed" }),
    );
  });

  it("returns 500 (retry) when the MP fetch throws a transient error", async () => {
    paymentGet.mockRejectedValue(new Error("ECONNRESET"));
    const result = await processPaymentNotification("111", null);
    expect(result.httpOk).toBe(false);
    expect(result.kind).toBe("mp-unavailable");
  });

  it("treats an empty data id as ignored", async () => {
    const result = await processPaymentNotification("   ", null);
    expect(result).toEqual({ kind: "ignored", httpOk: true });
    expect(paymentGet).not.toHaveBeenCalled();
  });

  it("returns 500 when the event insert fails with a non-conflict error", async () => {
    paymentGet.mockResolvedValue({ id: 111, status: "approved", external_reference: "ext-ref", transaction_amount: 8999.9 });
    state.eventInsertError = { code: "08006", message: "connection failure" };
    const result = await processPaymentNotification("111", null);
    expect(result).toEqual({ kind: "error", httpOk: false });
  });
});
