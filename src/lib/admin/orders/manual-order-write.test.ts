/**
 * Unit tests for the manual-order write orchestration (T17 AC-18). All I/O deps
 * mocked (revalidateLines, assembleOrder, create_order RPC, advance_order_status,
 * sendOrderConfirmation). Asserts the branch map: line-issue abort BEFORE create;
 * create-failed error; the create_order payload shape (sentinel email, es-MX,
 * live-priced items, admin shipping); source-marking; the optional paid branch;
 * the optional confirmation branch (opted-in + valid email only); and that a
 * post-create paid/email failure NEVER rolls back the order.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const revalidateLines = vi.fn();
vi.mock("@/lib/checkout/checkout-read", () => ({
  revalidateLines: (...args: unknown[]) => revalidateLines(...args),
}));

const advanceOrderStatus = vi.fn();
vi.mock("@/lib/payments/advance-order", () => ({
  advanceOrderStatus: (...args: unknown[]) => advanceOrderStatus(...args),
}));

const sendOrderConfirmation = vi.fn();
vi.mock("@/lib/email/dispatch", () => ({
  sendOrderConfirmation: (...args: unknown[]) => sendOrderConfirmation(...args),
}));

// Capture the create_order payload + the source-stamp UPDATE.
const rpc = vi.fn();
const updateEq = vi.fn();
const update = vi.fn(() => ({ eq: updateEq }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: (...args: unknown[]) => rpc(...args),
    from: () => ({ update }),
  }),
}));

import { createManualOrder } from "./manual-order-write";
import type { ManualOrderInput } from "./manual-order-input";
import { NO_EMAIL_PLACEHOLDER } from "@/lib/email/recipient";

const PRODUCT = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

const VALIDATED_LINE = {
  productId: PRODUCT,
  variantId: null,
  productName: "Silla Aria",
  productSku: "AR-01",
  variantLabel: null,
  unitPriceCents: 499900,
  quantity: 2,
  coverImageUrl: null,
};

function input(overrides: Partial<ManualOrderInput> = {}): ManualOrderInput {
  return {
    contactName: "María",
    contactEmail: "maria@correo.mx",
    contactPhone: "5512345678",
    shippingFullName: "María López",
    addressLine1: "Reforma 100",
    addressLine2: null,
    city: "Monterrey",
    state: "Nuevo León",
    postalCode: "64000",
    deliveryNotes: null,
    rfc: null,
    shippingCents: 50000,
    internalNote: null,
    lines: [{ lineKey: "k1", productId: PRODUCT, variantId: null, quantity: 2 }],
    paymentChoice: "pending",
    sendConfirmation: false,
    ...overrides,
  };
}

beforeEach(() => {
  revalidateLines.mockReset().mockResolvedValue({ ok: true, lines: [VALIDATED_LINE] });
  rpc.mockReset().mockResolvedValue({
    data: { order_id: "order-1", order_number: "PP-000123", confirmation_token: "tok", reused: false },
    error: null,
  });
  advanceOrderStatus.mockReset().mockResolvedValue({ ok: true, result: { applied: true, reason: "payment_updated" } });
  sendOrderConfirmation.mockReset().mockResolvedValue({ ok: true, sent: true });
  update.mockClear();
  updateEq.mockReset().mockResolvedValue({ error: null });
});

describe("line-issue abort (AC-7, edges 1/5) — BEFORE create", () => {
  it("returns line issues mapped to the client lineKey and never calls create_order", async () => {
    revalidateLines.mockResolvedValue({
      ok: false,
      issues: [{ productId: PRODUCT, variantId: null, kind: "out-of-stock", liveUnitPriceCents: 499900 }],
    });
    const result = await createManualOrder({ input: input(), idempotencyKey: "idem-1" });
    expect(result.ok).toBe(false);
    if (result.ok || result.kind !== "line-issues") throw new Error("expected line-issues");
    expect(result.lineIssues[0]).toMatchObject({ lineKey: "k1", kind: "out-of-stock", liveUnitPriceCents: 499900 });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("create_order payload (AC-9/10/14)", () => {
  it("sends es-MX locale, live-priced items, admin shipping, real email; then stamps manual source", async () => {
    const result = await createManualOrder({ input: input(), idempotencyKey: "idem-1" });
    expect(result.ok).toBe(true);
    const payload = rpc.mock.calls[0][1].payload;
    expect(payload.locale).toBe("es-MX");
    expect(payload.idempotency_key).toBe("idem-1");
    expect(payload.contact_email).toBe("maria@correo.mx");
    expect(payload.shipping_cents).toBe(50000);
    expect(payload.items[0]).toMatchObject({ product_id: PRODUCT, unit_price_cents: 499900, quantity: 2 });
    // pending choice → source stamped via direct UPDATE
    expect(update).toHaveBeenCalledWith({ payment_method: "manual" });
  });

  it("substitutes the no-email sentinel when contactEmail is null (AC-11)", async () => {
    await createManualOrder({ input: input({ contactEmail: null }), idempotencyKey: "idem-1" });
    expect(rpc.mock.calls[0][1].payload.contact_email).toBe(NO_EMAIL_PLACEHOLDER);
  });

  it("returns an error (no throw) when create_order fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await createManualOrder({ input: input(), idempotencyKey: "idem-1" });
    expect(result).toEqual({ ok: false, kind: "error", reason: "create-failed" });
  });
});

describe("paid choice (AC-15/16)", () => {
  it("marks paid via advance_order_status payment-only carrying payment_method=manual, no confirmation", async () => {
    const result = await createManualOrder({ input: input({ paymentChoice: "paid" }), idempotencyKey: "idem-1" });
    expect(result.ok && result.markedPaid).toBe(true);
    expect(advanceOrderStatus).toHaveBeenCalledWith(
      expect.objectContaining({ p_order_status: null, p_payment_status: "paid", p_payment_method: "manual", p_mp_payment_id: null }),
    );
    // paid path carries the source marker on the advance call → no extra UPDATE
    expect(update).not.toHaveBeenCalled();
  });

  it("surfaces paidStepFailed (order NOT rolled back) when the paid step fails, and still stamps source", async () => {
    advanceOrderStatus.mockResolvedValue({ ok: false, error: "rpc down" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await createManualOrder({ input: input({ paymentChoice: "paid" }), idempotencyKey: "idem-1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.markedPaid).toBe(false);
    expect(result.paidStepFailed).toBe(true);
    expect(update).toHaveBeenCalledWith({ payment_method: "manual" });
  });
});

describe("confirmation branch (AC-12)", () => {
  it("does not send when not opted in", async () => {
    const result = await createManualOrder({ input: input({ sendConfirmation: false }), idempotencyKey: "idem-1" });
    expect(result.ok && result.emailSent).toBeNull();
    expect(sendOrderConfirmation).not.toHaveBeenCalled();
  });

  it("does not send when opted in but email is blank (AC-12 gate)", async () => {
    const result = await createManualOrder({
      input: input({ sendConfirmation: true, contactEmail: null }),
      idempotencyKey: "idem-1",
    });
    expect(result.ok && result.emailSent).toBeNull();
    expect(sendOrderConfirmation).not.toHaveBeenCalled();
  });

  it("sends when opted in with a valid email", async () => {
    const result = await createManualOrder({
      input: input({ sendConfirmation: true, contactEmail: "maria@correo.mx" }),
      idempotencyKey: "idem-1",
    });
    expect(result.ok && result.emailSent).toBe(true);
    expect(sendOrderConfirmation).toHaveBeenCalledWith("order-1");
  });

  it("surfaces emailSent:false (order NOT rolled back) when the send fails", async () => {
    sendOrderConfirmation.mockResolvedValue({ ok: false, reason: "provider down" });
    const result = await createManualOrder({
      input: input({ sendConfirmation: true }),
      idempotencyKey: "idem-1",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.emailSent).toBe(false);
  });
});
