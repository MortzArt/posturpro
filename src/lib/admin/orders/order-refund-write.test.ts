/**
 * `order-refund-write` unit tests (T12 AC-16..20, M-1, edges 1/2/6/10). This is
 * the FIRST caller of the T8 money-movement `refundOrderPayment`; its own job is
 * narrow but critical: thread the caller's stable idempotency key VERBATIM
 * (AC-19), map every typed `RefundResult` to the friendly UI bucket WITHOUT
 * echoing a raw MP error (AC-20), and — on success — fire `sendRefundIssued`
 * EXACTLY ONCE while reporting the real `emailSent` signal (M-1 regression: the
 * refund path previously hardcoded emailSent:true, swallowing edge 7). `refund.ts`
 * (the cumulative/over-refund guard authority) is mocked here — its own contract
 * is covered by refund.test.ts + payments.integration.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const refundOrderPayment = vi.fn();
vi.mock("@/lib/payments/refund", () => ({
  refundOrderPayment: (...args: unknown[]) => refundOrderPayment(...args),
}));

const sendRefundIssued = vi.fn();
vi.mock("@/lib/email/dispatch", () => ({
  sendRefundIssued: (...args: unknown[]) => sendRefundIssued(...args),
}));

// Admin client → returns the newest payment_refunds ledger row for the email.
const ledgerState: { row: { mp_refund_id: string; amount_cents: number } | null; error: { message: string } | null } = {
  row: { mp_refund_id: "RF-1", amount_cents: 100000 },
  error: null,
};
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from() {
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        async maybeSingle() {
          return { data: ledgerState.row, error: ledgerState.error };
        },
      };
      return chain;
    },
  }),
}));

import { refundOrder } from "./order-refund-write";

const ORDER_ID = "11111111-1111-1111-1111-111111111111";
const KEY = "refund:action:42";

beforeEach(() => {
  refundOrderPayment.mockReset();
  sendRefundIssued.mockReset();
  sendRefundIssued.mockResolvedValue({ ok: true, sent: true });
  ledgerState.row = { mp_refund_id: "RF-1", amount_cents: 100000 };
  ledgerState.error = null;
});

describe("refundOrder — success path + email once (AC-16/18)", () => {
  it("full refund → ok/full, emails once with the ledger's refund id + amount", async () => {
    refundOrderPayment.mockResolvedValue({ status: "refunded", kind: "full" });
    const result = await refundOrder(ORDER_ID, null, KEY);
    expect(result).toEqual({ ok: true, kind: "full", emailSent: true });
    expect(sendRefundIssued).toHaveBeenCalledTimes(1);
    expect(sendRefundIssued).toHaveBeenCalledWith(ORDER_ID, "RF-1", 100000);
  });

  it("partial refund → ok/partial, emails once", async () => {
    refundOrderPayment.mockResolvedValue({ status: "refunded", kind: "partial" });
    const result = await refundOrder(ORDER_ID, 50000, KEY);
    expect(result).toEqual({ ok: true, kind: "partial", emailSent: true });
    expect(sendRefundIssued).toHaveBeenCalledTimes(1);
  });
});

describe("refundOrder — idempotency key threading (AC-19)", () => {
  it("passes the caller's stable key VERBATIM to refundOrderPayment", async () => {
    refundOrderPayment.mockResolvedValue({ status: "refunded", kind: "full" });
    await refundOrder(ORDER_ID, null, KEY);
    expect(refundOrderPayment).toHaveBeenCalledWith(ORDER_ID, null, KEY);
  });

  it("passes the partial amount + key through unchanged", async () => {
    refundOrderPayment.mockResolvedValue({ status: "refunded", kind: "partial" });
    await refundOrder(ORDER_ID, 12345, "refund:action:99");
    expect(refundOrderPayment).toHaveBeenCalledWith(ORDER_ID, 12345, "refund:action:99");
  });
});

describe("refundOrder — emailSent propagation (M-1, edge 7)", () => {
  it("reports emailSent:false when the refund succeeded but the email failed", async () => {
    refundOrderPayment.mockResolvedValue({ status: "refunded", kind: "full" });
    sendRefundIssued.mockResolvedValue({ ok: false, reason: "provider down" });
    const result = await refundOrder(ORDER_ID, null, KEY);
    // The money moved → ok:true, but the customer email did NOT go out.
    expect(result).toEqual({ ok: true, kind: "full", emailSent: false });
  });

  it("reports emailSent:false when the send returns ok:true but sent:false (deduped)", async () => {
    refundOrderPayment.mockResolvedValue({ status: "refunded", kind: "partial" });
    sendRefundIssued.mockResolvedValue({ ok: true, sent: false });
    const result = await refundOrder(ORDER_ID, 10000, KEY);
    expect(result).toEqual({ ok: true, kind: "partial", emailSent: false });
  });

  it("reports emailSent:false (never throws) when the ledger read fails", async () => {
    refundOrderPayment.mockResolvedValue({ status: "refunded", kind: "full" });
    ledgerState.row = null;
    ledgerState.error = { message: "ledger read boom" };
    const result = await refundOrder(ORDER_ID, null, KEY);
    expect(result).toEqual({ ok: true, kind: "full", emailSent: false });
    expect(sendRefundIssued).not.toHaveBeenCalled();
  });

  it("reports emailSent:false (never throws) when sendRefundIssued throws", async () => {
    refundOrderPayment.mockResolvedValue({ status: "refunded", kind: "full" });
    sendRefundIssued.mockRejectedValue(new Error("kaboom"));
    const result = await refundOrder(ORDER_ID, null, KEY);
    expect(result).toEqual({ ok: true, kind: "full", emailSent: false });
  });
});

describe("refundOrder — friendly error mapping, no raw MP echo (AC-17/20)", () => {
  it("maps over-refund → ok:false/over-refund and does NOT email", async () => {
    refundOrderPayment.mockResolvedValue({ status: "not-refundable", reason: "over-refund" });
    const result = await refundOrder(ORDER_ID, 999999, KEY);
    expect(result).toEqual({ ok: false, reason: "over-refund" });
    expect(sendRefundIssued).not.toHaveBeenCalled();
  });

  it("maps a not-paid / no-payment-id / not-found reason → the generic not-refundable bucket", async () => {
    for (const reason of ["not-paid", "no-payment-id", "not-found", "amount-invalid"] as const) {
      refundOrderPayment.mockResolvedValue({ status: "not-refundable", reason });
      const result = await refundOrder(ORDER_ID, null, KEY);
      expect(result).toEqual({ ok: false, reason: "not-refundable" });
    }
  });

  it("maps a mp-error → ok:false/mp-error (raw MP detail never surfaced)", async () => {
    refundOrderPayment.mockResolvedValue({ status: "mp-error" });
    const result = await refundOrder(ORDER_ID, null, KEY);
    expect(result).toEqual({ ok: false, reason: "mp-error" });
  });

  it("maps a reconcile-by-hand error (MP moved, SQL guard rejected) → ok:false/error", async () => {
    refundOrderPayment.mockResolvedValue({ status: "error" });
    const result = await refundOrder(ORDER_ID, 50000, KEY);
    expect(result).toEqual({ ok: false, reason: "error" });
  });

  it("never leaks a raw MP message even if refund.ts returned one in reason", async () => {
    // Defense-in-depth: whatever the underlying reason string, the wrapper only
    // ever returns the fixed friendly bucket set.
    refundOrderPayment.mockResolvedValue({ status: "mp-error", detail: "SECRET-MP-DETAIL" });
    const result = await refundOrder(ORDER_ID, null, KEY);
    expect(JSON.stringify(result)).not.toContain("SECRET-MP-DETAIL");
  });
});

describe("refundOrder — UUID guard (AC-16, defense)", () => {
  it("rejects a non-UUID order id before any money movement", async () => {
    const result = await refundOrder("not-a-uuid", null, KEY);
    expect(result).toEqual({ ok: false, reason: "not-refundable" });
    expect(refundOrderPayment).not.toHaveBeenCalled();
  });
});
