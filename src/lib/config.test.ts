/**
 * Config-constant tests (AC-11, AC-17).
 *
 * These pin the seed-default monetary constants to their documented cents
 * values and assert the money convention (integer cents, unit-suffixed names).
 * AC-11 requires flat-rate = 50000 cents (MX$500) and free-shipping threshold
 * = 1000000 cents (MX$10,000).
 */
import { describe, expect, it } from "vitest";
import {
  CURRENCY,
  CURRENCY_LOCALE,
  FREE_SHIPPING_THRESHOLD_CENTS,
  SEED_STORE_CONTACT_EMAIL,
  SEED_STORE_NAME,
  SHIPPING_FLAT_RATE_CENTS,
  SUPABASE_STORAGE_BUCKET,
} from "./config";
import { formatMXN } from "./money";

describe("shipping constants (AC-11)", () => {
  it("flat rate is exactly 50000 cents (MX$500)", () => {
    expect(SHIPPING_FLAT_RATE_CENTS).toBe(50_000);
    expect(formatMXN(SHIPPING_FLAT_RATE_CENTS)).toMatch(/\$\s?500\.00/);
  });

  it("free-shipping threshold is exactly 1000000 cents (MX$10,000)", () => {
    expect(FREE_SHIPPING_THRESHOLD_CENTS).toBe(1_000_000);
    expect(formatMXN(FREE_SHIPPING_THRESHOLD_CENTS)).toMatch(
      /\$\s?10,000\.00/,
    );
  });

  it("stores shipping amounts as integer cents (no float money)", () => {
    expect(Number.isInteger(SHIPPING_FLAT_RATE_CENTS)).toBe(true);
    expect(Number.isInteger(FREE_SHIPPING_THRESHOLD_CENTS)).toBe(true);
  });
});

describe("currency + identity constants (AC-17)", () => {
  it("is single-currency MXN with es-MX locale", () => {
    expect(CURRENCY).toBe("MXN");
    expect(CURRENCY_LOCALE).toBe("es-MX");
  });

  it("names the product-images storage bucket", () => {
    expect(SUPABASE_STORAGE_BUCKET).toBe("product-images");
  });

  it("seeds a store name and a valid contact email", () => {
    expect(SEED_STORE_NAME.length).toBeGreaterThan(0);
    expect(SEED_STORE_CONTACT_EMAIL).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
  });
});
