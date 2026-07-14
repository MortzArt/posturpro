import { describe, expect, it } from "vitest";
import { toVoucherData } from "./voucher-data";
import type { VoucherView } from "@/lib/payments/order-payment-read";

const FULL: VoucherView = {
  reference: "9860 1234 5678 9012",
  voucherUrl: "https://mp.test/voucher.pdf",
  expiresAt: "2026-07-20T23:59:00Z",
  verificationCode: "ABC123",
};

describe("toVoucherData", () => {
  it("maps a full view + method + amount", () => {
    expect(toVoucherData(FULL, "oxxo", 49999)).toEqual({
      method: "oxxo",
      reference: "9860 1234 5678 9012",
      voucherUrl: "https://mp.test/voucher.pdf",
      verificationCode: "ABC123",
      expiresLabel: "2026-07-20T23:59:00Z",
      amountCents: 49999,
    });
  });

  it("returns null when the reference is missing (skip the email, AC-16)", () => {
    expect(toVoucherData({ ...FULL, reference: null }, "spei", 49999)).toBeNull();
  });

  it("returns null when the amount is unavailable (no partial email)", () => {
    expect(toVoucherData(FULL, "oxxo", null)).toBeNull();
  });

  it("preserves null optional fields", () => {
    const result = toVoucherData(
      { reference: "REF", voucherUrl: null, expiresAt: null, verificationCode: null },
      "spei",
      1000,
    );
    expect(result).toEqual({
      method: "spei",
      reference: "REF",
      voucherUrl: null,
      verificationCode: null,
      expiresLabel: null,
      amountCents: 1000,
    });
  });
});
