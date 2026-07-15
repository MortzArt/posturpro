import { describe, expect, it } from "vitest";
import {
  MAX_SAFE_PESOS,
  parseMoneyToCents,
  parseStoreSettingsInput,
  STORE_NAME_MAX_LENGTH,
} from "./settings-input";

describe("parseMoneyToCents (AC-10, edges 6/7, R7)", () => {
  it("accepts whole pesos", () => {
    expect(parseMoneyToCents("500")).toEqual({ ok: true, cents: 50000 });
  });

  it("accepts 2-decimal pesos", () => {
    expect(parseMoneyToCents("499.99")).toEqual({ ok: true, cents: 49999 });
  });

  it("accepts 1-decimal pesos", () => {
    expect(parseMoneyToCents("10.5")).toEqual({ ok: true, cents: 1050 });
  });

  it("accepts 0 and 0.00 as valid (edge 6)", () => {
    expect(parseMoneyToCents("0")).toEqual({ ok: true, cents: 0 });
    expect(parseMoneyToCents("0.00")).toEqual({ ok: true, cents: 0 });
  });

  it("strips one leading $ and surrounding whitespace (edge 7)", () => {
    expect(parseMoneyToCents("$500")).toEqual({ ok: true, cents: 50000 });
    expect(parseMoneyToCents("  500  ")).toEqual({ ok: true, cents: 50000 });
    expect(parseMoneyToCents(" $500.50 ")).toEqual({ ok: true, cents: 50050 });
  });

  it("rejects blank as money-required (blank != 0)", () => {
    expect(parseMoneyToCents("")).toEqual({ ok: false, error: "money-required" });
    expect(parseMoneyToCents("   ")).toEqual({ ok: false, error: "money-required" });
    expect(parseMoneyToCents("$")).toEqual({ ok: false, error: "money-required" });
  });

  it("rejects thousand separators, never silently coerces (R7)", () => {
    expect(parseMoneyToCents("1,000.00")).toEqual({ ok: false, error: "money-invalid" });
    expect(parseMoneyToCents("1.000,00")).toEqual({ ok: false, error: "money-invalid" });
    expect(parseMoneyToCents("1 000")).toEqual({ ok: false, error: "money-invalid" });
  });

  it("rejects more than 2 decimals", () => {
    expect(parseMoneyToCents("500.999")).toEqual({
      ok: false,
      error: "money-too-many-decimals",
    });
  });

  it("rejects negatives", () => {
    expect(parseMoneyToCents("-5")).toEqual({ ok: false, error: "money-negative" });
    expect(parseMoneyToCents("$-5")).toEqual({ ok: false, error: "money-negative" });
  });

  it("rejects non-numeric", () => {
    expect(parseMoneyToCents("abc")).toEqual({ ok: false, error: "money-invalid" });
    expect(parseMoneyToCents("5a")).toEqual({ ok: false, error: "money-invalid" });
    expect(parseMoneyToCents("5.5.5")).toEqual({ ok: false, error: "money-invalid" });
  });

  it("rejects a cents value beyond MAX_SAFE_INTEGER (overflow)", () => {
    const huge = `${MAX_SAFE_PESOS + 1000000}`;
    expect(parseMoneyToCents(huge)).toEqual({ ok: false, error: "money-overflow" });
  });
});

describe("parseStoreSettingsInput (AC-8, AC-10)", () => {
  const valid = {
    store_name: "PosturPro",
    contact_email: "hola@posturpro.mx",
    shipping_flat_rate: "500.00",
    free_shipping_threshold: "1500.00",
  };

  it("parses a fully valid form to DB-ready cents", () => {
    const result = parseStoreSettingsInput(valid);
    expect(result).toEqual({
      ok: true,
      values: {
        store_name: "PosturPro",
        contact_email: "hola@posturpro.mx",
        shipping_flat_rate_cents: 50000,
        free_shipping_threshold_cents: 150000,
      },
    });
  });

  it("trims the store name and email", () => {
    const result = parseStoreSettingsInput({
      ...valid,
      store_name: "  PosturPro  ",
      contact_email: "  hola@posturpro.mx  ",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.values.store_name).toBe("PosturPro");
      expect(result.values.contact_email).toBe("hola@posturpro.mx");
    }
  });

  it("rejects a blank name", () => {
    const result = parseStoreSettingsInput({ ...valid, store_name: "   " });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.store_name).toBe("name-required");
    }
  });

  it("rejects a name over the length cap", () => {
    const result = parseStoreSettingsInput({
      ...valid,
      store_name: "a".repeat(STORE_NAME_MAX_LENGTH + 1),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.store_name).toBe("name-too-long");
    }
  });

  it("rejects an invalid email", () => {
    const result = parseStoreSettingsInput({ ...valid, contact_email: "not-an-email" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.contact_email).toBe("email-invalid");
    }
  });

  it("collects ALL field errors in one pass", () => {
    const result = parseStoreSettingsInput({
      store_name: "",
      contact_email: "bad",
      shipping_flat_rate: "1,000",
      free_shipping_threshold: "-5",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors).toEqual({
        store_name: "name-required",
        contact_email: "email-invalid",
        shipping_flat_rate: "money-invalid",
        free_shipping_threshold: "money-negative",
      });
    }
  });

  it("accepts 0 for both money fields (edge 6)", () => {
    const result = parseStoreSettingsInput({
      ...valid,
      shipping_flat_rate: "0",
      free_shipping_threshold: "0.00",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.values.shipping_flat_rate_cents).toBe(0);
      expect(result.values.free_shipping_threshold_cents).toBe(0);
    }
  });
});
