import { describe, expect, it } from "vitest";
import {
  centsToDecimalString,
  centsToMpAmount,
  mpAmountToCents,
} from "./money-boundary";

describe("centsToDecimalString", () => {
  it("formats whole and fractional amounts exactly", () => {
    expect(centsToDecimalString(49999)).toBe("499.99");
    expect(centsToDecimalString(10000)).toBe("100.00");
    expect(centsToDecimalString(5)).toBe("0.05");
    expect(centsToDecimalString(0)).toBe("0.00");
    expect(centsToDecimalString(899990)).toBe("8999.90");
  });

  it("pads single-digit centavos", () => {
    expect(centsToDecimalString(101)).toBe("1.01");
    expect(centsToDecimalString(1)).toBe("0.01");
  });

  it("handles negatives (refund adjustments)", () => {
    expect(centsToDecimalString(-5)).toBe("-0.05");
    expect(centsToDecimalString(-49999)).toBe("-499.99");
  });

  it("throws on non-integer input", () => {
    expect(() => centsToDecimalString(1.5)).toThrow(TypeError);
    expect(() => centsToDecimalString(Number.NaN)).toThrow(TypeError);
  });
});

describe("centsToMpAmount", () => {
  it("produces the decimal number MP expects", () => {
    expect(centsToMpAmount(49999)).toBe(499.99);
    expect(centsToMpAmount(899990)).toBe(8999.9);
    expect(centsToMpAmount(100)).toBe(1);
  });

  it("each single conversion is exact (we never SUM MP decimals — we sum cents)", () => {
    // The drift-avoidance guarantee is that money is summed in INTEGER CENTS and
    // converted to a decimal only at the final per-value boundary. A single
    // conversion is always exact; reconciliation converts the MP total BACK to
    // cents (mpAmountToCents) rather than summing floats.
    expect(mpAmountToCents(centsToMpAmount(10) + centsToMpAmount(20))).toBe(30);
    expect(centsToMpAmount(30)).toBe(0.3);
  });
});

describe("mpAmountToCents", () => {
  it("round-trips exactly with centsToMpAmount for many values", () => {
    for (const cents of [0, 1, 5, 99, 100, 49999, 899990, 100000000]) {
      expect(mpAmountToCents(centsToMpAmount(cents))).toBe(cents);
    }
  });

  it("accepts a numeric string", () => {
    expect(mpAmountToCents("499.99")).toBe(49999);
    expect(mpAmountToCents("8999.90")).toBe(899990);
  });

  it("absorbs float representation noise without swallowing real diffs", () => {
    expect(mpAmountToCents(499.99)).toBe(49999);
    // A real 1-centavo difference survives the round.
    expect(mpAmountToCents(500.0)).not.toBe(mpAmountToCents(499.99));
  });

  it("throws on a non-finite amount", () => {
    expect(() => mpAmountToCents("not-a-number")).toThrow(TypeError);
    expect(() => mpAmountToCents(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });
});
