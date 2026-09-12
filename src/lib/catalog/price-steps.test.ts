import { describe, expect, it } from "vitest";
import { priceStepsPesos } from "./price-steps";

describe("priceStepsPesos", () => {
  it("returns ladder values strictly inside the range plus a covering top step", () => {
    // 1,799 – 11,999 pesos → steps between, then 12,000 covers the ceiling.
    expect(priceStepsPesos(179_900, 1_199_900)).toEqual([
      2_000, 2_500, 3_000, 4_000, 5_000, 6_000, 7_000, 8_000, 10_000, 12_000,
    ]);
  });

  it("never emits a step at or below the floor", () => {
    const steps = priceStepsPesos(500_000, 900_000);
    expect(steps.every((value) => value > 5_000)).toBe(true);
    expect(steps.at(-1)).toBe(10_000);
  });

  it("falls back to the raw ceiling when it exceeds the ladder", () => {
    expect(priceStepsPesos(0, 25_000_000).at(-1)).toBe(250_000);
  });

  it("returns an empty list for a degenerate range", () => {
    expect(priceStepsPesos(300_000, 300_000)).toEqual([]);
    expect(priceStepsPesos(-100, -50)).toEqual([]);
  });
});
