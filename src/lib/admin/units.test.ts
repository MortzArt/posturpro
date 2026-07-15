import { describe, expect, it } from "vitest";
import {
  parseCmToMm,
  parseKgToG,
  formatMmToCm,
  formatGToKg,
} from "./units";

describe("parseCmToMm", () => {
  it("treats blank as null (optional field)", () => {
    expect(parseCmToMm("")).toEqual({ ok: true, value: null });
    expect(parseCmToMm("   ")).toEqual({ ok: true, value: null });
  });
  it("scales cm → integer mm", () => {
    expect(parseCmToMm("50")).toEqual({ ok: true, value: 500 });
    expect(parseCmToMm("12.1")).toEqual({ ok: true, value: 121 });
    expect(parseCmToMm("0")).toEqual({ ok: true, value: 0 });
  });
  it("rejects negatives", () => {
    expect(parseCmToMm("-5")).toEqual({ ok: false, error: "unit-negative" });
  });
  it("rejects 3+ decimals", () => {
    expect(parseCmToMm("1.234")).toEqual({
      ok: false,
      error: "unit-too-many-decimals",
    });
  });
  it("rejects thousand separators and junk", () => {
    expect(parseCmToMm("1,500")).toEqual({ ok: false, error: "unit-invalid" });
    expect(parseCmToMm("abc")).toEqual({ ok: false, error: "unit-invalid" });
    expect(parseCmToMm("1.2.3")).toEqual({ ok: false, error: "unit-invalid" });
  });
  it("avoids float drift", () => {
    expect(parseCmToMm("12.1")).toEqual({ ok: true, value: 121 });
    expect(parseCmToMm("0.1")).toEqual({ ok: true, value: 1 });
  });
});

describe("parseKgToG", () => {
  it("scales kg → integer grams", () => {
    expect(parseKgToG("1")).toEqual({ ok: true, value: 1000 });
    expect(parseKgToG("2.5")).toEqual({ ok: true, value: 2500 });
  });
  it("blank → null", () => {
    expect(parseKgToG("")).toEqual({ ok: true, value: null });
  });
  it("rejects overflow-scale junk", () => {
    expect(parseKgToG("-1")).toEqual({ ok: false, error: "unit-negative" });
  });
  it("rejects a value that scales past the int4 column ceiling (hacker)", () => {
    // 9,999,999 kg → 9,999,999,000 g > INT4_MAX: overflow, not a valid write.
    expect(parseKgToG("9999999")).toEqual({ ok: false, error: "unit-overflow" });
    expect(parseCmToMm("300000000")).toEqual({ ok: false, error: "unit-overflow" });
  });
});

describe("format round-trip", () => {
  it("mm → cm drops trailing zeros", () => {
    expect(formatMmToCm(500)).toBe("50");
    expect(formatMmToCm(121)).toBe("12.1");
    expect(formatMmToCm(null)).toBe("");
    expect(formatMmToCm(undefined)).toBe("");
  });
  it("g → kg drops trailing zeros", () => {
    expect(formatGToKg(1000)).toBe("1");
    expect(formatGToKg(2500)).toBe("2.5");
    expect(formatGToKg(null)).toBe("");
  });
  it("parse(format(x)) === x", () => {
    for (const mm of [0, 1, 121, 500, 9999]) {
      expect(parseCmToMm(formatMmToCm(mm))).toEqual({ ok: true, value: mm });
    }
  });
});
