/**
 * `order-refund-input` unit tests (T12 AC-16/17). Pure parse/validate: `full` →
 * null amount (remaining balance); `partial` → a positive WHOLE-peso amount
 * converted to cents (no fractional centavos in Phase 1), bounded by the int4
 * cents ceiling. A crafted amount can neither mint a negative/zero refund nor
 * overflow the money column.
 */
import { describe, expect, it } from "vitest";
import { parseRefundInput } from "./order-refund-input";
import { INT4_MAX } from "@/lib/config";

describe("parseRefundInput — full", () => {
  it("returns a null amount for a full refund (remaining balance)", () => {
    expect(parseRefundInput({ mode: "full" })).toEqual({ ok: true, amountCents: null, mode: "full" });
  });

  it("ignores any amount supplied alongside mode:full", () => {
    expect(parseRefundInput({ mode: "full", amountMxn: 500 })).toEqual({
      ok: true,
      amountCents: null,
      mode: "full",
    });
  });
});

describe("parseRefundInput — partial (whole pesos → cents)", () => {
  it("converts a positive integer peso amount to cents", () => {
    expect(parseRefundInput({ mode: "partial", amountMxn: 250 })).toEqual({
      ok: true,
      amountCents: 25000,
      mode: "partial",
    });
  });

  it("accepts the minimum 1-peso refund", () => {
    expect(parseRefundInput({ mode: "partial", amountMxn: 1 })).toEqual({
      ok: true,
      amountCents: 100,
      mode: "partial",
    });
  });
});

describe("parseRefundInput — rejections", () => {
  it("rejects an unknown mode", () => {
    expect(parseRefundInput({ mode: "bogus" })).toEqual({ ok: false, reason: "amount-invalid" });
    expect(parseRefundInput({ mode: "" })).toEqual({ ok: false, reason: "amount-invalid" });
  });

  it("rejects a missing amount for a partial", () => {
    expect(parseRefundInput({ mode: "partial" })).toEqual({ ok: false, reason: "amount-invalid" });
  });

  it("rejects a zero or negative amount", () => {
    expect(parseRefundInput({ mode: "partial", amountMxn: 0 })).toEqual({ ok: false, reason: "amount-invalid" });
    expect(parseRefundInput({ mode: "partial", amountMxn: -5 })).toEqual({ ok: false, reason: "amount-invalid" });
  });

  it("rejects a fractional-peso amount (whole pesos only in Phase 1)", () => {
    expect(parseRefundInput({ mode: "partial", amountMxn: 10.5 })).toEqual({ ok: false, reason: "amount-invalid" });
  });

  it("rejects a non-finite amount (NaN / Infinity)", () => {
    expect(parseRefundInput({ mode: "partial", amountMxn: NaN })).toEqual({ ok: false, reason: "amount-invalid" });
    expect(parseRefundInput({ mode: "partial", amountMxn: Infinity })).toEqual({ ok: false, reason: "amount-invalid" });
  });

  it("rejects an amount whose cents value overflows the int4 ceiling", () => {
    // pesos * 100 must stay within INT4_MAX cents.
    const overflowPesos = Math.floor(INT4_MAX / 100) + 1;
    expect(parseRefundInput({ mode: "partial", amountMxn: overflowPesos })).toEqual({
      ok: false,
      reason: "amount-invalid",
    });
  });
});
