import { describe, expect, it } from "vitest";
import { computeSavings } from "@/lib/catalog/savings";
import {
  CALCULATOR_MIN_BAR_FRACTION,
  CALCULATOR_MODELS,
} from "@/lib/config/calculator";

describe("computeSavings", () => {
  it("computes the Aeron default (43% / $16,600) from reference prices", () => {
    const aeron = CALCULATOR_MODELS.find((c) => c.id === "aeron");
    if (!aeron) {
      throw new Error("expected an 'aeron' entry in CALCULATOR_MODELS");
    }
    const result = computeSavings(aeron);
    // new 38,500 − postur 21,900 = 16,600 MXN → 1,660,000 cents
    expect(result.savingsCents).toBe(1_660_000);
    expect(result.savingsPct).toBe(43);
    expect(result.newBarFraction).toBe(1);
    // 21,900 / 38,500 ≈ 0.569
    expect(result.posturBarFraction).toBeCloseTo(2_190_000 / 3_850_000, 5);
  });

  it("floors savings at 0 and clamps the bar when postur >= new (edge 9)", () => {
    const bad = {
      id: "bad",
      brand: "X",
      model: "Y",
      newPriceCents: 1_000_000,
      posturPriceCents: 1_500_000,
    };
    const result = computeSavings(bad);
    expect(result.savingsCents).toBe(0);
    expect(result.savingsPct).toBe(0);
    // fraction would be 1.5 → clamped to 1 (never exceeds the new bar)
    expect(result.posturBarFraction).toBe(1);
  });

  it("clamps a tiny PosturPro price to the minimum visible bar fraction", () => {
    const cheap = {
      id: "cheap",
      brand: "X",
      model: "Y",
      newPriceCents: 10_000_000,
      posturPriceCents: 100_000, // 1% — below the 8% floor
    };
    const result = computeSavings(cheap);
    expect(result.posturBarFraction).toBe(CALCULATOR_MIN_BAR_FRACTION);
    expect(result.savingsPct).toBe(99);
  });

  it("handles a zero new price without dividing by zero", () => {
    const zero = {
      id: "zero",
      brand: "X",
      model: "Y",
      newPriceCents: 0,
      posturPriceCents: 0,
    };
    const result = computeSavings(zero);
    expect(result.savingsPct).toBe(0);
    expect(result.savingsCents).toBe(0);
    expect(result.posturBarFraction).toBe(1);
  });

  it("computes correct savings for every configured model (no negatives)", () => {
    for (const chair of CALCULATOR_MODELS) {
      const result = computeSavings(chair);
      expect(result.savingsCents).toBeGreaterThanOrEqual(0);
      expect(result.savingsPct).toBeGreaterThanOrEqual(0);
      expect(result.posturBarFraction).toBeGreaterThanOrEqual(
        CALCULATOR_MIN_BAR_FRACTION,
      );
      expect(result.posturBarFraction).toBeLessThanOrEqual(1);
    }
  });
});
