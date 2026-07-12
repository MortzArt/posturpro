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
  DEFAULT_LOCALE,
  FREE_SHIPPING_THRESHOLD_CENTS,
  SEED_STORE_CONTACT_EMAIL,
  SEED_STORE_NAME,
  SHIPPING_FLAT_RATE_CENTS,
  SUPABASE_STORAGE_BUCKET,
  WHATSAPP_PHONE_E164,
  WHATSAPP_PREFILL_MESSAGE_ES,
} from "./config";
import { formatMXN } from "./money";
import { isWhatsAppConfigured } from "./whatsapp";

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

describe("T2 locale config (AC-1, AC-17)", () => {
  it("default UI locale is the Mexico-first es-MX tag", () => {
    expect(DEFAULT_LOCALE).toBe("es-MX");
  });

  it("keeps DEFAULT_LOCALE aligned with the currency-formatting locale (AC-17)", () => {
    // A single locale tag flows through UI (next-intl), money (formatMXN), and
    // a future DB translations layer. Drift here fractures the locale contract.
    expect(DEFAULT_LOCALE).toBe(CURRENCY_LOCALE);
  });
});

describe("T2 WhatsApp config (AC-8, edge case 7)", () => {
  it("ships an empty phone placeholder by default so the FAB stays hidden", () => {
    expect(WHATSAPP_PHONE_E164).toBe("");
    expect(isWhatsAppConfigured(WHATSAPP_PHONE_E164)).toBe(false);
  });

  it("provides a non-empty Spanish prefill message for when a number is set", () => {
    expect(WHATSAPP_PREFILL_MESSAGE_ES.trim().length).toBeGreaterThan(0);
  });
});
