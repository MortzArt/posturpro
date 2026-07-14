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

// --- Mock the T9 email dispatch (the webhook triggers it after a successful
//     advance; must never affect the ProcessResult / HTTP status, AC-13/AC-18). ---
const sendPaymentReceived = vi.fn();
const sendVoucherInstructions = vi.fn();
vi.mock("@/lib/email/dispatch", () => ({
  sendPaymentReceived: (...a: unknown[]) => sendPaymentReceived(...a),
  sendVoucherInstructions: (...a: unknown[]) => sendVoucherInstructions(...a),
}));

// --- Mock the admin client (order match + event claim/finalize RPCs) ---
interface OrderRow {
  id: string;
  total_cents: number;
}
/**
 * `claimResult` is what `record_payment_event` returns ("new" | "duplicate"), or
 * an error via `claimError`. `claimCalls` records each (id, status) claimed so a
 * test can assert a PROGRESSION claims a distinct status (M-1). `finalizeCalls`
 * records each finalize (M-6).
 */
const state: {
  orderByExternalRef: OrderRow | null;
  orderByToken: OrderRow | null;
  claimResult: string;
  claimError: { message: string } | null;
  claimCalls: Array<{ id: string; status: string }>;
  finalizeCalls: Array<{ id: string; status: string }>;
} = {
  orderByExternalRef: null,
  orderByToken: null,
  claimResult: "new",
  claimError: null,
  claimCalls: [],
  finalizeCalls: [],
};

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
    from() {
      // Only the `orders` table is read directly now; the event spine is an RPC.
      return makeSelectChain();
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      if (fn === "record_payment_event") {
        state.claimCalls.push({
          id: args.p_mp_payment_id as string,
          status: args.p_mp_status as string,
        });
        if (state.claimError) {
          return { data: null, error: state.claimError };
        }
        return { data: state.claimResult, error: null };
      }
      if (fn === "finalize_payment_event") {
        state.finalizeCalls.push({
          id: args.p_mp_payment_id as string,
          status: args.p_mp_status as string,
        });
        return { data: null, error: null };
      }
      return { data: null, error: null };
    },
  }),
}));

import { processPaymentNotification } from "./process-payment";

const ORDER: OrderRow = { id: "order-uuid-1", total_cents: 899990 };

beforeEach(() => {
  paymentGet.mockReset();
  advanceOrderStatus.mockReset();
  advanceOrderStatus.mockResolvedValue({
    ok: true,
    result: { applied: true, reason: "advanced", transition_kind: "paid" },
  });
  sendPaymentReceived.mockReset().mockResolvedValue({ ok: true, sent: true });
  sendVoucherInstructions.mockReset().mockResolvedValue({ ok: true, sent: true });
  state.orderByExternalRef = ORDER;
  state.orderByToken = null;
  state.claimResult = "new";
  state.claimError = null;
  state.claimCalls = [];
  state.finalizeCalls = [];
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

  it("is a no-op on a duplicate (finalized) claim for the SAME (id, status) (AC-10, edge 1)", async () => {
    paymentGet.mockResolvedValue({ id: 111, status: "approved", external_reference: "ext-ref", transaction_amount: 8999.9 });
    state.claimResult = "duplicate";
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

  it("returns 500 when the event claim RPC fails (transient DB error)", async () => {
    paymentGet.mockResolvedValue({ id: 111, status: "approved", external_reference: "ext-ref", transaction_amount: 8999.9 });
    state.claimError = { message: "connection failure" };
    const result = await processPaymentNotification("111", null);
    expect(result).toEqual({ kind: "error", httpOk: false });
  });

  it("finalizes the claim only AFTER a successful advance (M-6)", async () => {
    paymentGet.mockResolvedValue({
      id: 111,
      status: "approved",
      external_reference: "ext-ref",
      transaction_amount: 8999.9,
    });
    const result = await processPaymentNotification("111", null);
    expect(result).toEqual({ kind: "processed", httpOk: true });
    expect(state.finalizeCalls).toEqual([{ id: "111", status: "approved" }]);
  });

  it("does NOT finalize the claim when the advance RPC errors — MP retries (M-6)", async () => {
    paymentGet.mockResolvedValue({
      id: 111,
      status: "approved",
      external_reference: "ext-ref",
      transaction_amount: 8999.9,
    });
    advanceOrderStatus.mockResolvedValue({ ok: false, error: "deadlock detected" });
    const result = await processPaymentNotification("111", null);
    expect(result).toEqual({ kind: "error", httpOk: false });
    expect(state.finalizeCalls).toEqual([]); // unfinalized → retry reprocesses
  });

  it("treats a regression_blocked advance as a failure, not success (M-7)", async () => {
    paymentGet.mockResolvedValue({
      id: 111,
      status: "approved",
      external_reference: "ext-ref",
      transaction_amount: 8999.9,
    });
    advanceOrderStatus.mockResolvedValue({
      ok: true,
      result: { applied: false, reason: "regression_blocked" },
    });
    const result = await processPaymentNotification("111", null);
    expect(result).toEqual({ kind: "advance-blocked", httpOk: false });
    expect(state.finalizeCalls).toEqual([]); // unfinalized → can converge on retry
  });

  it("processes an OXXO pending→approved PROGRESSION for the same payment id (M-1, AC-18)", async () => {
    // First webhook: pending. Claims (id, "pending"), advances to pending, finalizes.
    paymentGet.mockResolvedValue({
      id: 555,
      status: "pending",
      status_detail: "pending_waiting_payment",
      external_reference: "ext-ref",
      transaction_amount: 8999.9,
      payment_type_id: "ticket",
      payment_method_id: "oxxo",
    });
    const pending = await processPaymentNotification("555", null);
    expect(pending).toEqual({ kind: "processed", httpOk: true });

    // Second webhook (out-of-band OXXO payment): approved. A DIFFERENT status →
    // a distinct claim (NOT swallowed as a duplicate) → advances to paid.
    paymentGet.mockResolvedValue({
      id: 555,
      status: "approved",
      status_detail: "accredited",
      external_reference: "ext-ref",
      transaction_amount: 8999.9,
      payment_type_id: "ticket",
      payment_method_id: "oxxo",
    });
    const approved = await processPaymentNotification("555", null);
    expect(approved).toEqual({ kind: "processed", httpOk: true });

    // Both statuses were claimed (progression NOT dropped) — the M-1 regression.
    expect(state.claimCalls).toEqual([
      { id: "555", status: "pending" },
      { id: "555", status: "approved" },
    ]);
    // The approved advance marked the order paid.
    expect(advanceOrderStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({ p_order_status: "paid", p_payment_status: "paid" }),
    );
  });

  it("advances a refunded webhook as PAYMENT-ONLY (order_status null, C-2)", async () => {
    paymentGet.mockResolvedValue({
      id: 111,
      status: "refunded",
      external_reference: "ext-ref",
      transaction_amount: 8999.9,
      payment_type_id: "credit_card",
    });
    const result = await processPaymentNotification("111", null);
    expect(result).toEqual({ kind: "processed", httpOk: true });
    expect(advanceOrderStatus).toHaveBeenCalledWith(
      expect.objectContaining({ p_order_status: null, p_payment_status: "refunded" }),
    );
  });
});

describe("T9 email trigger (AC-13/AC-15/AC-16/AC-18)", () => {
  const approved = {
    id: 111,
    status: "approved",
    external_reference: "ext-ref",
    transaction_amount: 8999.9,
    payment_type_id: "credit_card",
    payment_method_id: "visa",
  };

  it("triggers payment_received on a 'paid' transition, dedupe=mp_payment_id (AC-15)", async () => {
    paymentGet.mockResolvedValue(approved);
    const result = await processPaymentNotification("111", null);
    expect(result).toEqual({ kind: "processed", httpOk: true });
    expect(sendPaymentReceived).toHaveBeenCalledWith(ORDER.id, "111", 899990);
    expect(sendVoucherInstructions).not.toHaveBeenCalled();
  });

  it("triggers voucher_instructions on a 'payment_pending' OXXO transition (AC-16)", async () => {
    paymentGet.mockResolvedValue({
      id: 222,
      status: "pending",
      status_detail: "pending_waiting_payment",
      external_reference: "ext-ref",
      transaction_amount: 8999.9,
      payment_type_id: "ticket",
      payment_method_id: "oxxo",
      transaction_details: { payment_method_reference_id: "9860 1111 2222 3333" },
      date_of_expiration: "2026-07-20T23:59:00Z",
    });
    advanceOrderStatus.mockResolvedValue({
      ok: true,
      result: { applied: true, reason: "advanced", transition_kind: "payment_pending" },
    });
    const result = await processPaymentNotification("222", null);
    expect(result).toEqual({ kind: "processed", httpOk: true });
    expect(sendVoucherInstructions).toHaveBeenCalledWith(
      ORDER.id,
      "222",
      expect.objectContaining({ method: "oxxo", reference: "9860 1111 2222 3333" }),
    );
    expect(sendPaymentReceived).not.toHaveBeenCalled();
  });

  it("skips the voucher email when no voucher reference is present (no partial email, AC-16)", async () => {
    paymentGet.mockResolvedValue({
      id: 333,
      status: "pending",
      external_reference: "ext-ref",
      transaction_amount: 8999.9,
      payment_type_id: "ticket",
      payment_method_id: "oxxo",
      // no transaction_details → no reference
    });
    advanceOrderStatus.mockResolvedValue({
      ok: true,
      result: { applied: true, reason: "advanced", transition_kind: "payment_pending" },
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = await processPaymentNotification("333", null);
    expect(result).toEqual({ kind: "processed", httpOk: true });
    expect(sendVoucherInstructions).not.toHaveBeenCalled();
  });

  it("returns 'processed' 200 even when the email dispatch THROWS (failure isolation, AC-13/AC-18)", async () => {
    paymentGet.mockResolvedValue(approved);
    sendPaymentReceived.mockRejectedValue(new Error("email exploded"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await processPaymentNotification("111", null);
    // The webhook outcome is decided by payment processing ALONE (email never
    // changes it): still processed + 200, and the claim was finalized.
    expect(result).toEqual({ kind: "processed", httpOk: true });
    expect(state.finalizeCalls).toEqual([{ id: "111", status: "approved" }]);
  });

  it("sends NO customer email on a refund (payment-only, edge 5)", async () => {
    paymentGet.mockResolvedValue({ id: 111, status: "refunded", external_reference: "ext-ref", transaction_amount: 8999.9 });
    advanceOrderStatus.mockResolvedValue({
      ok: true,
      result: { applied: true, reason: "payment_updated", transition_kind: "refunded" },
    });
    const result = await processPaymentNotification("111", null);
    expect(result).toEqual({ kind: "processed", httpOk: true });
    expect(sendPaymentReceived).not.toHaveBeenCalled();
    expect(sendVoucherInstructions).not.toHaveBeenCalled();
  });
});
