import { describe, expect, it } from "vitest";
import {
  AMOUNT_RECONCILIATION_TOLERANCE_CENTS,
  MP_CURRENCY_ID,
  resolvePaymentMethod,
} from "./config";

describe("MP config invariants", () => {
  it("amount reconciliation tolerance is ZERO (hard invariant, AC-12)", () => {
    expect(AMOUNT_RECONCILIATION_TOLERANCE_CENTS).toBe(0);
  });

  it("currency is MXN", () => {
    expect(MP_CURRENCY_ID).toBe("MXN");
  });
});

describe("resolvePaymentMethod", () => {
  it("maps card types → card", () => {
    expect(resolvePaymentMethod("credit_card", "visa")).toBe("card");
    expect(resolvePaymentMethod("debit_card", "debvisa")).toBe("card");
    expect(resolvePaymentMethod("prepaid_card", "x")).toBe("card");
  });

  it("maps oxxo (method id wins) → oxxo", () => {
    expect(resolvePaymentMethod("ticket", "oxxo")).toBe("oxxo");
  });

  it("maps spei / bank_transfer → spei", () => {
    expect(resolvePaymentMethod("bank_transfer", "spei")).toBe("spei");
    expect(resolvePaymentMethod("bank_transfer", "clabe")).toBe("spei");
  });

  it("M-8: 'atm' payment_type is NOT spei (unmapped → null unless method id disambiguates)", () => {
    // Bare atm type with no OXXO/SPEI method id → null (no wrong guess).
    expect(resolvePaymentMethod("atm", null)).toBeNull();
    expect(resolvePaymentMethod("atm", "unknown")).toBeNull();
    // A clabe method id still correctly wins (method id is the primary signal).
    expect(resolvePaymentMethod("atm", "clabe")).toBe("spei");
  });

  it("maps account_money / digital_wallet → wallet", () => {
    expect(resolvePaymentMethod("account_money", "account_money")).toBe("wallet");
    expect(resolvePaymentMethod("digital_wallet", "x")).toBe("wallet");
  });

  it("returns null for an unknown type/method (no guess)", () => {
    expect(resolvePaymentMethod("crypto", "bitcoin")).toBeNull();
    expect(resolvePaymentMethod(null, null)).toBeNull();
    expect(resolvePaymentMethod(undefined, undefined)).toBeNull();
  });

  it("is case-insensitive on the method id", () => {
    expect(resolvePaymentMethod("ticket", "OXXO")).toBe("oxxo");
  });
});
