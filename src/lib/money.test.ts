import { describe, expect, it } from "vitest";
import { centsToPesos, formatMXN, pesosToCents } from "./money";

describe("formatMXN", () => {
  it("formats whole pesos", () => {
    // Non-breaking space between symbol and amount in es-MX locale.
    expect(formatMXN(50_000)).toMatch(/\$\s?500\.00/);
  });

  it("formats sub-peso cents without float drift", () => {
    expect(formatMXN(49_999)).toMatch(/\$\s?499\.99/);
  });

  it("formats zero", () => {
    expect(formatMXN(0)).toMatch(/\$\s?0\.00/);
  });

  it("formats the free-shipping threshold", () => {
    expect(formatMXN(1_000_000)).toMatch(/\$\s?10,000\.00/);
  });

  it("throws on non-integer cents (guards against float money)", () => {
    expect(() => formatMXN(499.999)).toThrow(TypeError);
  });

  it("throws on NaN", () => {
    expect(() => formatMXN(Number.NaN)).toThrow(TypeError);
  });
});

describe("pesosToCents", () => {
  it("converts whole pesos to cents", () => {
    expect(pesosToCents(500)).toBe(50_000);
  });

  it("rounds fractional pesos to the nearest cent", () => {
    expect(pesosToCents(499.99)).toBe(49_999);
    expect(pesosToCents(4999.999)).toBe(500_000);
  });

  it("throws on non-finite input", () => {
    expect(() => pesosToCents(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });
});

describe("centsToPesos", () => {
  it("converts cents to pesos", () => {
    expect(centsToPesos(49_999)).toBe(499.99);
  });

  it("round-trips with pesosToCents on cent-aligned values", () => {
    expect(pesosToCents(centsToPesos(50_000))).toBe(50_000);
  });

  it("throws on non-integer cents", () => {
    expect(() => centsToPesos(1.5)).toThrow(TypeError);
  });
});
