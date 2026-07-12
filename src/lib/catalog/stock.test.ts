import { describe, expect, it } from "vitest";
import { effectiveStock, stockState } from "./stock";
import { LOW_STOCK_THRESHOLD } from "@/lib/config";

describe("effectiveStock", () => {
  it("sums variant stock when variants exist (variant-authoritative)", () => {
    expect(effectiveStock(0, [{ stock: 3 }, { stock: 4 }])).toBe(7);
  });

  it("ignores stale product-level stock when variants exist (edge case 10)", () => {
    // Product says 50 but all variants are 0 → effective is 0, not 50.
    expect(effectiveStock(50, [{ stock: 0 }, { stock: 0 }])).toBe(0);
  });

  it("falls back to product stock when there are no variants", () => {
    expect(effectiveStock(12, [])).toBe(12);
  });

  it("treats null/undefined product stock as 0 with no variants", () => {
    expect(effectiveStock(null, [])).toBe(0);
    expect(effectiveStock(undefined, [])).toBe(0);
  });

  it("coerces negative or fractional stock to a non-negative integer", () => {
    expect(effectiveStock(-5, [])).toBe(0);
    expect(effectiveStock(3.9, [])).toBe(3);
    expect(effectiveStock(0, [{ stock: 2.7 }, { stock: -1 }])).toBe(2);
  });
});

describe("stockState", () => {
  it("returns 'out' at exactly 0", () => {
    expect(stockState(0)).toBe("out");
  });

  it("returns 'out' for negative (defensive)", () => {
    expect(stockState(-3)).toBe("out");
  });

  it("returns 'low' at 1 (lower boundary)", () => {
    expect(stockState(1)).toBe("low");
  });

  it("returns 'low' at exactly LOW_STOCK_THRESHOLD (upper boundary)", () => {
    expect(stockState(LOW_STOCK_THRESHOLD)).toBe("low");
  });

  it("returns 'in' just above the threshold", () => {
    expect(stockState(LOW_STOCK_THRESHOLD + 1)).toBe("in");
  });

  it("returns 'in' for a large count", () => {
    expect(stockState(999)).toBe("in");
  });
});
