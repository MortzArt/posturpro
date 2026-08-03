/**
 * `order-status-write` unit tests (T12 AC-8/9/10, edges 4/5). The wrapper is the
 * only status path (delegates to `advanceOrderStatus`) and branches the customer
 * email ON THE RPC-RETURNED `transition_kind` — NEVER the note text (AC-9):
 * `shipped` → `sendShipped` (with the persisted tracking), `cancelled` →
 * `sendCancelled`, everything else (paid/preparing/delivered/noop) → no email. An
 * email failure is isolated (AC-10). A regressive transition maps to a friendly
 * `regression` (never a 500). The advance RPC + dispatch are mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const advanceOrderStatus = vi.fn();
vi.mock("@/lib/payments/advance-order", () => ({
  advanceOrderStatus: (...args: unknown[]) => advanceOrderStatus(...args),
}));

const sendShipped = vi.fn();
const sendCancelled = vi.fn();
vi.mock("@/lib/email/dispatch", () => ({
  sendShipped: (...args: unknown[]) => sendShipped(...args),
  sendCancelled: (...args: unknown[]) => sendCancelled(...args),
}));

// Admin client returns the current order's payment_status + tracking.
const currentOrder: {
  data: {
    payment_status: string;
    tracking_number: string | null;
    tracking_carrier: string | null;
    tracking_url: string | null;
  } | null;
  error: { message: string } | null;
} = {
  data: { payment_status: "paid", tracking_number: "1Z9", tracking_carrier: "DHL", tracking_url: "https://d/1" },
  error: null,
};
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from() {
      const chain = {
        select: () => chain,
        eq: () => chain,
        async maybeSingle() {
          return { data: currentOrder.data, error: currentOrder.error };
        },
      };
      return chain;
    },
  }),
}));

import { advanceOrderTo, markOrderPaidOffline } from "./order-status-write";

const ORDER_ID = "33333333-3333-3333-3333-333333333333";

function advanced(transition_kind: string, reason = "advanced") {
  return { ok: true, result: { applied: true, reason, to_status: "shipped", transition_kind } };
}

beforeEach(() => {
  advanceOrderStatus.mockReset();
  sendShipped.mockReset();
  sendCancelled.mockReset();
  sendShipped.mockResolvedValue({ ok: true, sent: true });
  sendCancelled.mockResolvedValue({ ok: true, sent: true });
  currentOrder.data = { payment_status: "paid", tracking_number: "1Z9", tracking_carrier: "DHL", tracking_url: "https://d/1" };
  currentOrder.error = null;
});

describe("advanceOrderTo — email branches ONLY on transition_kind (AC-9)", () => {
  it("shipped kind → sendShipped with the persisted tracking, once", async () => {
    advanceOrderStatus.mockResolvedValue(advanced("shipped"));
    const result = await advanceOrderTo(ORDER_ID, "shipped", "en camino");
    expect(result).toEqual({ ok: true, emailSent: true });
    expect(sendShipped).toHaveBeenCalledTimes(1);
    expect(sendShipped).toHaveBeenCalledWith(ORDER_ID, {
      trackingNumber: "1Z9",
      carrier: "DHL",
      trackingUrl: "https://d/1",
    });
    expect(sendCancelled).not.toHaveBeenCalled();
  });

  it("threads a null trackingNumber to the shipped email (ship-without-tracking, AC-12)", async () => {
    currentOrder.data = { payment_status: "paid", tracking_number: null, tracking_carrier: null, tracking_url: null };
    advanceOrderStatus.mockResolvedValue(advanced("shipped"));
    await advanceOrderTo(ORDER_ID, "shipped", null);
    expect(sendShipped).toHaveBeenCalledWith(ORDER_ID, {
      trackingNumber: null,
      carrier: null,
      trackingUrl: null,
    });
  });

  it("cancelled kind → sendCancelled, once", async () => {
    advanceOrderStatus.mockResolvedValue(advanced("cancelled"));
    const result = await advanceOrderTo(ORDER_ID, "cancelled", null);
    expect(result).toEqual({ ok: true, emailSent: true });
    expect(sendCancelled).toHaveBeenCalledTimes(1);
    expect(sendShipped).not.toHaveBeenCalled();
  });

  it("fires NO customer email for non-material kinds (paid/preparing/delivered)", async () => {
    for (const kind of ["paid", "preparing", "delivered", "payment_pending"]) {
      advanceOrderStatus.mockResolvedValue(advanced(kind));
      const result = await advanceOrderTo(ORDER_ID, "preparing", null);
      expect(result).toEqual({ ok: true, emailSent: false });
    }
    expect(sendShipped).not.toHaveBeenCalled();
    expect(sendCancelled).not.toHaveBeenCalled();
  });

  it("fires NO email on a noop transition (double-click race, edge 4)", async () => {
    advanceOrderStatus.mockResolvedValue({
      ok: true,
      result: { applied: false, reason: "noop_same_status", to_status: "shipped", transition_kind: "noop" },
    });
    const result = await advanceOrderTo(ORDER_ID, "shipped", null);
    expect(result).toEqual({ ok: true, emailSent: false });
    expect(sendShipped).not.toHaveBeenCalled();
  });
});

describe("advanceOrderTo — never string-matches the note (AC-9)", () => {
  it("does NOT send a shipped email when the NOTE says 'shipped' but the kind is not", async () => {
    // The note text mentions shipping, but the RPC-returned kind is `preparing`.
    advanceOrderStatus.mockResolvedValue(advanced("preparing"));
    const result = await advanceOrderTo(ORDER_ID, "preparing", "will be shipped soon");
    expect(result).toEqual({ ok: true, emailSent: false });
    expect(sendShipped).not.toHaveBeenCalled();
  });
});

describe("advanceOrderTo — email-failure isolation (AC-10, edge 7)", () => {
  it("reports emailSent:false but the transition still succeeds", async () => {
    advanceOrderStatus.mockResolvedValue(advanced("shipped"));
    sendShipped.mockResolvedValue({ ok: false, reason: "provider down" });
    const result = await advanceOrderTo(ORDER_ID, "shipped", null);
    expect(result).toEqual({ ok: true, emailSent: false });
  });
});

describe("advanceOrderTo — failure mapping (edge 5)", () => {
  it("maps regression_blocked → ok:false/regression (friendly, no 500)", async () => {
    advanceOrderStatus.mockResolvedValue({
      ok: true,
      result: { applied: false, reason: "regression_blocked", to_status: null, transition_kind: null },
    });
    const result = await advanceOrderTo(ORDER_ID, "paid", null);
    expect(result).toEqual({ ok: false, reason: "regression" });
    expect(sendShipped).not.toHaveBeenCalled();
  });

  it("maps order_not_found → ok:false/not-found", async () => {
    advanceOrderStatus.mockResolvedValue({
      ok: true,
      result: { applied: false, reason: "order_not_found", to_status: null, transition_kind: null },
    });
    const result = await advanceOrderTo(ORDER_ID, "paid", null);
    expect(result).toEqual({ ok: false, reason: "not-found" });
  });

  it("maps an advance RPC error → ok:false/write-failed", async () => {
    advanceOrderStatus.mockResolvedValue({ ok: false, error: "db down" });
    const result = await advanceOrderTo(ORDER_ID, "paid", null);
    expect(result).toEqual({ ok: false, reason: "write-failed" });
  });

  it("returns not-found for a non-UUID id before any advance", async () => {
    const result = await advanceOrderTo("not-a-uuid", "paid", null);
    expect(result).toEqual({ ok: false, reason: "not-found" });
    expect(advanceOrderStatus).not.toHaveBeenCalled();
  });

  it("returns not-found when the current-order read finds nothing", async () => {
    currentOrder.data = null;
    const result = await advanceOrderTo(ORDER_ID, "paid", null);
    expect(result).toEqual({ ok: false, reason: "not-found" });
    expect(advanceOrderStatus).not.toHaveBeenCalled();
  });
});

describe("markOrderPaidOffline — record a non-MP payment", () => {
  it("flips payment_status→paid via the payment-only path (no lifecycle change), method=manual", async () => {
    currentOrder.data = { payment_status: "pending", tracking_number: null, tracking_carrier: null, tracking_url: null };
    advanceOrderStatus.mockResolvedValue({ ok: true, result: { applied: true, reason: "advanced", to_status: null, transition_kind: "paid" } });
    const result = await markOrderPaidOffline(ORDER_ID);
    expect(result).toEqual({ ok: true });
    expect(advanceOrderStatus).toHaveBeenCalledWith(
      expect.objectContaining({ p_order_id: ORDER_ID, p_order_status: null, p_payment_status: "paid", p_payment_method: "manual" }),
    );
    // Offline payment fires NO customer email.
    expect(sendShipped).not.toHaveBeenCalled();
    expect(sendCancelled).not.toHaveBeenCalled();
  });

  it("is idempotent — an already-paid order is not touched", async () => {
    currentOrder.data = { payment_status: "paid", tracking_number: null, tracking_carrier: null, tracking_url: null };
    const result = await markOrderPaidOffline(ORDER_ID);
    expect(result).toEqual({ ok: false, reason: "already-paid" });
    expect(advanceOrderStatus).not.toHaveBeenCalled();
  });

  it("refuses a refunded order (already-paid guard covers refunded)", async () => {
    currentOrder.data = { payment_status: "refunded", tracking_number: null, tracking_carrier: null, tracking_url: null };
    const result = await markOrderPaidOffline(ORDER_ID);
    expect(result).toEqual({ ok: false, reason: "already-paid" });
    expect(advanceOrderStatus).not.toHaveBeenCalled();
  });

  it("returns not-found for a bad UUID (no read/RPC)", async () => {
    const result = await markOrderPaidOffline("not-a-uuid");
    expect(result).toEqual({ ok: false, reason: "not-found" });
    expect(advanceOrderStatus).not.toHaveBeenCalled();
  });

  it("maps an RPC error to write-failed", async () => {
    currentOrder.data = { payment_status: "authorized", tracking_number: null, tracking_carrier: null, tracking_url: null };
    advanceOrderStatus.mockResolvedValue({ ok: false, error: "boom" });
    const result = await markOrderPaidOffline(ORDER_ID);
    expect(result).toEqual({ ok: false, reason: "write-failed" });
  });
});
