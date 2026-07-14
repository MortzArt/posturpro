/**
 * Unit tests for defensive voucher extraction (T8 AC-17, research §5 ambiguity).
 * Every field is nullable; the extractor prefers `transaction_details.*` and
 * falls back to `point_of_interaction.transaction_data.*`, never fabricating.
 */
import { describe, expect, it, vi } from "vitest";
import type { PaymentResponse } from "mercadopago/dist/clients/payment/commonTypes";

vi.mock("server-only", () => ({}));

import { extractVoucher } from "./order-payment-read";

describe("extractVoucher", () => {
  it("reads transaction_details.* first (the current OXXO/SPEI path)", () => {
    const payment = {
      transaction_details: {
        payment_method_reference_id: "9860 1234 5678 9012",
        external_resource_url: "https://mp.example/voucher.pdf",
      },
      date_of_expiration: "2026-07-14T23:59:00Z",
    } as unknown as PaymentResponse;

    expect(extractVoucher(payment)).toEqual({
      reference: "9860 1234 5678 9012",
      voucherUrl: "https://mp.example/voucher.pdf",
      expiresAt: "2026-07-14T23:59:00Z",
      verificationCode: null,
    });
  });

  it("falls back to point_of_interaction.transaction_data.* (legacy shape)", () => {
    const payment = {
      point_of_interaction: {
        transaction_data: {
          ticket_url: "https://mp.example/ticket",
          barcode: { content: "BARCODE-123" },
        },
      },
    } as unknown as PaymentResponse;

    const voucher = extractVoucher(payment);
    expect(voucher.reference).toBe("BARCODE-123");
    expect(voucher.voucherUrl).toBe("https://mp.example/ticket");
  });

  it("returns all-null for a payment with no voucher fields (degrade, no crash)", () => {
    expect(extractVoucher({} as PaymentResponse)).toEqual({
      reference: null,
      voucherUrl: null,
      expiresAt: null,
      verificationCode: null,
    });
  });

  it("ignores empty-string fields (never renders a blank reference)", () => {
    const payment = {
      transaction_details: { payment_method_reference_id: "   ", external_resource_url: "" },
    } as unknown as PaymentResponse;
    const voucher = extractVoucher(payment);
    expect(voucher.reference).toBeNull();
    expect(voucher.voucherUrl).toBeNull();
  });

  it("reads a loosely-typed verification_code when present", () => {
    const payment = {
      transaction_details: { verification_code: "VC-42" },
    } as unknown as PaymentResponse;
    expect(extractVoucher(payment).verificationCode).toBe("VC-42");
  });
});
