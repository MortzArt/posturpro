/**
 * Unit tests for email dispatch orchestration (T9 AC-13/AC-14/AC-15). The
 * provider, ledger, order reader, store settings, env, and next-intl translator
 * are ALL mocked — no network send (AC-9), no DB. Asserts: claim→send→finalize
 * on the happy path, no send on a duplicate claim, failure isolation (a provider
 * error never throws), and an unreadable order is a logged no-send.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const sendEmail = vi.fn();
vi.mock("./provider", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));

const claimEmailSend = vi.fn();
const finalizeEmailSend = vi.fn();
vi.mock("./ledger", () => ({
  claimEmailSend: (...a: unknown[]) => claimEmailSend(...a),
  finalizeEmailSend: (...a: unknown[]) => finalizeEmailSend(...a),
}));

const getOrderForEmail = vi.fn();
vi.mock("@/lib/checkout/order-read", () => ({
  getOrderForEmail: (...a: unknown[]) => getOrderForEmail(...a),
}));

vi.mock("@/lib/store-settings", () => ({
  getStoreSettingsStatic: async () => ({ store_name: "PosturPro" }),
}));

vi.mock("@/lib/env", () => ({
  getEmailEnv: () => ({ apiKey: "k", fromAddress: "from@t.com", ownerAddress: "owner@t.com" }),
}));

// A translator that echoes the key + interpolated values so assertions can
// target the recipient/kind, not the copy (copy is covered by templates.test).
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string, values?: Record<string, string | number>) =>
    values ? `${key}(${JSON.stringify(values)})` : key,
}));

const ORDER = {
  orderId: "11111111-1111-4111-8111-111111111111",
  orderNumber: "PP-000123",
  contactEmail: "customer@test.com",
  customerName: "María",
  locale: "es-MX",
  paymentMethod: "card",
  confirmationToken: "22222222-2222-4222-8222-222222222222",
  subtotalCents: 49999,
  shippingCents: 0,
  discountCents: 0,
  totalCents: 49999,
  items: [
    { productName: "Silla", variantLabel: null, quantity: 1, unitPriceCents: 49999, lineTotalCents: 49999 },
  ],
};

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://shop.test";
  sendEmail.mockReset().mockResolvedValue({ ok: true });
  claimEmailSend.mockReset().mockResolvedValue("new");
  finalizeEmailSend.mockReset().mockResolvedValue(undefined);
  getOrderForEmail.mockReset().mockResolvedValue(ORDER);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function dispatch() {
  return import("./dispatch");
}

describe("sendOrderConfirmation (AC-14)", () => {
  it("claims, sends to the customer, and finalizes on the happy path", async () => {
    const { sendOrderConfirmation } = await dispatch();
    const result = await sendOrderConfirmation(ORDER.orderId);
    expect(result).toEqual({ ok: true, sent: true });
    expect(claimEmailSend).toHaveBeenCalledWith(ORDER.orderId, "order_confirmation", "");
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "customer@test.com" }));
    expect(finalizeEmailSend).toHaveBeenCalledWith(ORDER.orderId, "order_confirmation", "");
  });

  it("does NOT send on a duplicate claim (exactly-once)", async () => {
    claimEmailSend.mockResolvedValue("duplicate");
    const { sendOrderConfirmation } = await dispatch();
    const result = await sendOrderConfirmation(ORDER.orderId);
    expect(result).toEqual({ ok: true, sent: false });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(finalizeEmailSend).not.toHaveBeenCalled();
  });

  it("isolates a provider failure — returns ok:false, never throws, never finalizes", async () => {
    sendEmail.mockResolvedValue({ ok: false, reason: "provider down" });
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { sendOrderConfirmation } = await dispatch();
    const result = await sendOrderConfirmation(ORDER.orderId);
    expect(result).toEqual({ ok: false, reason: "provider down" });
    expect(finalizeEmailSend).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledWith(expect.stringContaining("send failed"));
  });

  it("logs + skips when the order is unreadable", async () => {
    getOrderForEmail.mockResolvedValue(null);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { sendOrderConfirmation } = await dispatch();
    const result = await sendOrderConfirmation(ORDER.orderId);
    expect(result).toEqual({ ok: false, reason: "order unreadable" });
    expect(claimEmailSend).not.toHaveBeenCalled();
  });
});

describe("sendNewOrderOwnerAlert (AC-12/AC-14)", () => {
  it("sends to the owner address, not the customer", async () => {
    const { sendNewOrderOwnerAlert } = await dispatch();
    const result = await sendNewOrderOwnerAlert(ORDER.orderId);
    expect(result).toEqual({ ok: true, sent: true });
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "owner@t.com" }));
    expect(claimEmailSend).toHaveBeenCalledWith(ORDER.orderId, "new_order_owner", "");
  });
});

describe("sendPaymentReceived (AC-15)", () => {
  it("dedupes on the mp_payment_id", async () => {
    const { sendPaymentReceived } = await dispatch();
    const result = await sendPaymentReceived(ORDER.orderId, "MP-777", 49999);
    expect(result).toEqual({ ok: true, sent: true });
    expect(claimEmailSend).toHaveBeenCalledWith(ORDER.orderId, "payment_received", "MP-777");
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "customer@test.com" }));
  });

  it("does not send a second time for the same payment id (duplicate)", async () => {
    claimEmailSend.mockResolvedValue("duplicate");
    const { sendPaymentReceived } = await dispatch();
    const result = await sendPaymentReceived(ORDER.orderId, "MP-777", 49999);
    expect(result).toEqual({ ok: true, sent: false });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("sendVoucherInstructions (AC-16)", () => {
  it("dedupes on the mp_payment_id and sends the voucher email", async () => {
    const { sendVoucherInstructions } = await dispatch();
    const result = await sendVoucherInstructions(ORDER.orderId, "MP-888", {
      method: "oxxo",
      reference: "REF-1",
      voucherUrl: null,
      verificationCode: null,
      expiresLabel: null,
      amountCents: 49999,
    });
    expect(result).toEqual({ ok: true, sent: true });
    expect(claimEmailSend).toHaveBeenCalledWith(ORDER.orderId, "voucher_instructions", "MP-888");
  });
});

describe("sendContactRelay (AC-17, not order-scoped)", () => {
  it("sends to the owner with the customer as reply-to, no ledger claim", async () => {
    const { sendContactRelay } = await dispatch();
    const result = await sendContactRelay({
      fromName: "Juan",
      fromEmail: "juan@test.com",
      subject: null,
      message: "Hola",
    });
    expect(result).toEqual({ ok: true, sent: true });
    expect(claimEmailSend).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "owner@t.com", replyTo: "juan@test.com" }),
    );
  });
});
