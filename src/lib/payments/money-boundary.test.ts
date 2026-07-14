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

describe("money boundary — exactness hardening (QA Stage-7 property-ish sweep)", () => {
  it("round-trips exactly across a dense sweep including .x5 centavo boundaries", () => {
    // Every cents value from 0..2000 (covers all 100 fractional centavos, incl.
    // the .05/.15/.25/.35/.45/.55/.65/.75/.85/.95 cases that trip naive rounding).
    for (let cents = 0; cents <= 2000; cents += 1) {
      const back = mpAmountToCents(centsToMpAmount(cents));
      expect(back).toBe(cents);
    }
  });

  it("round-trips exactly for large realistic MXN totals (no drift near safe-int)", () => {
    // Up to ~1,000,000 MXN (100,000,000 cents) — well within Number.MAX_SAFE_INTEGER.
    for (const cents of [999999, 1234567, 99999999, 100000000, 123456789]) {
      expect(mpAmountToCents(centsToMpAmount(cents))).toBe(cents);
      // The string form always has exactly two fractional digits.
      expect(centsToDecimalString(cents)).toMatch(/^\d+\.\d{2}$/);
    }
  });

  it("string and number forms agree at every centavo of a peso", () => {
    for (let c = 0; c < 100; c += 1) {
      const cents = 10000 + c; // 100.00 .. 100.99
      expect(centsToMpAmount(cents)).toBe(Number(centsToDecimalString(cents)));
    }
  });

  it("a half-centavo MP amount rounds to the nearest centavo (documented behavior)", () => {
    // 499.995 is not a valid 2-decimal MXN amount; Math.round takes it up. A
    // genuine payment amount is always 2-decimal, so this only documents the guard.
    expect(mpAmountToCents(499.995)).toBe(50000);
    expect(mpAmountToCents(499.994)).toBe(49999);
  });
});
