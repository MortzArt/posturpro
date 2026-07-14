/**
 * Unit tests for the pure shipping + free-shipping-progress helpers (T6 AC-8,
 * AC-9, edge 6, 7).
 *
 * Covers: free-vs-flat resolution, the `>=` threshold boundary (edge 7,
 * threshold-crossed state), settings-null degradation (edge 6 — `unavailable`
 * shipping, `null` progress so the bar hides, total == subtotal, never `$NaN`),
 * progress fraction clamping `0..1`, and remaining-cents math. Both the flat
 * rate and threshold come from store settings; config holds only seed defaults.
 */
import { describe, expect, it } from "vitest";
import {
  computeShipping,
  freeShippingProgress,
  totalCents,
  type ShippingSettings,
} from "./shipping";
import {
  FREE_SHIPPING_THRESHOLD_CENTS,
  SHIPPING_FLAT_RATE_CENTS,
} from "@/lib/config";

const SEED: ShippingSettings = {
  flatRateCents: SHIPPING_FLAT_RATE_CENTS, // 50_000
  freeThresholdCents: FREE_SHIPPING_THRESHOLD_CENTS, // 1_000_000
};

describe("computeShipping — free vs flat (AC-8)", () => {
  it("charges the flat rate below the threshold", () => {
    const result = computeShipping(500_000, SEED);
    expect(result).toEqual({ kind: "flat", cents: 50_000 });
  });

  it("is free at exactly the threshold (>= not >, edge 7)", () => {
    expect(computeShipping(1_000_000, SEED)).toEqual({ kind: "free" });
  });

  it("is free above the threshold", () => {
    expect(computeShipping(2_000_000, SEED)).toEqual({ kind: "free" });
  });

  it("is free just one cent below is still flat (boundary − 1)", () => {
    expect(computeShipping(999_999, SEED)).toEqual({ kind: "flat", cents: 50_000 });
  });

  it("charges flat at subtotal 0", () => {
    expect(computeShipping(0, SEED)).toEqual({ kind: "flat", cents: 50_000 });
  });

  it("reads the flat rate from settings, never a hardcoded value", () => {
    const custom = computeShipping(100, { flatRateCents: 12_345, freeThresholdCents: 900_000 });
    expect(custom).toEqual({ kind: "flat", cents: 12_345 });
  });
});

describe("computeShipping — settings unavailable (edge 6)", () => {
  it("returns unavailable when the flat rate is null", () => {
    expect(computeShipping(500_000, { flatRateCents: null, freeThresholdCents: 1_000_000 })).toEqual({
      kind: "unavailable",
    });
  });

  it("returns unavailable when the threshold is null", () => {
    expect(computeShipping(500_000, { flatRateCents: 50_000, freeThresholdCents: null })).toEqual({
      kind: "unavailable",
    });
  });

  it("returns unavailable when both are null", () => {
    expect(computeShipping(500_000, { flatRateCents: null, freeThresholdCents: null })).toEqual({
      kind: "unavailable",
    });
  });

  it("returns unavailable for a non-integer / negative / NaN settings value", () => {
    expect(computeShipping(0, { flatRateCents: 50.5, freeThresholdCents: 1_000_000 }).kind).toBe(
      "unavailable",
    );
    expect(computeShipping(0, { flatRateCents: -1, freeThresholdCents: 1_000_000 }).kind).toBe(
      "unavailable",
    );
    expect(computeShipping(0, { flatRateCents: Number.NaN, freeThresholdCents: 1_000_000 }).kind).toBe(
      "unavailable",
    );
  });
});

describe("totalCents (AC-8, AC-12)", () => {
  it("adds the flat rate to the subtotal", () => {
    expect(totalCents(500_000, { kind: "flat", cents: 50_000 })).toBe(550_000);
  });

  it("adds nothing when shipping is free", () => {
    expect(totalCents(1_000_000, { kind: "free" })).toBe(1_000_000);
  });

  it("equals the subtotal when shipping is unavailable (edge 6, never $NaN)", () => {
    const total = totalCents(500_000, { kind: "unavailable" });
    expect(total).toBe(500_000);
    expect(Number.isInteger(total)).toBe(true);
  });
});

describe("freeShippingProgress (AC-9, edge 6, 7)", () => {
  it("returns null when the threshold is unavailable → bar hidden (edge 6)", () => {
    expect(freeShippingProgress(500_000, null)).toBeNull();
  });

  it("returns null when the threshold is 0 (avoids divide-by-zero / degenerate bar)", () => {
    expect(freeShippingProgress(500_000, 0)).toBeNull();
  });

  it("returns null for a non-integer / negative threshold", () => {
    expect(freeShippingProgress(100, 999.9)).toBeNull();
    expect(freeShippingProgress(100, -5)).toBeNull();
  });

  it("reports remaining cents and a partial fraction below the threshold", () => {
    const p = freeShippingProgress(500_000, 1_000_000);
    expect(p).not.toBeNull();
    expect(p?.remainingCents).toBe(500_000);
    expect(p?.achieved).toBe(false);
    expect(p?.pct).toBeCloseTo(0.5, 5);
  });

  it("achieves at exactly the threshold with pct 1 and remaining 0 (edge 7)", () => {
    const p = freeShippingProgress(1_000_000, 1_000_000);
    expect(p?.achieved).toBe(true);
    expect(p?.remainingCents).toBe(0);
    expect(p?.pct).toBe(1);
  });

  it("clamps pct to 1 above the threshold and keeps remaining at 0", () => {
    const p = freeShippingProgress(5_000_000, 1_000_000);
    expect(p?.achieved).toBe(true);
    expect(p?.remainingCents).toBe(0);
    expect(p?.pct).toBe(1);
  });

  it("clamps pct to 0 and remaining to the full threshold at subtotal 0", () => {
    const p = freeShippingProgress(0, 1_000_000);
    expect(p?.pct).toBe(0);
    expect(p?.remainingCents).toBe(1_000_000);
    expect(p?.achieved).toBe(false);
  });

  it("never yields a NaN or out-of-range pct for a negative subtotal (defensive)", () => {
    const p = freeShippingProgress(-1000, 1_000_000);
    expect(p?.pct).toBe(0);
    expect(Number.isNaN(p?.pct)).toBe(false);
    expect(p?.remainingCents).toBe(1_000_000);
  });
});
