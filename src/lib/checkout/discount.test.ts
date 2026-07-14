import { describe, expect, it } from "vitest";
import {
  applyDiscount,
  normalizeDiscountCode,
  type DiscountCodeRow,
} from "@/lib/checkout/discount";

const NOW = Date.parse("2026-06-01T00:00:00.000Z");

function code(overrides: Partial<DiscountCodeRow> = {}): DiscountCodeRow {
  return {
    code: "AHORRA10",
    discount_type: "percentage",
    value: 10,
    min_subtotal_cents: null,
    max_redemptions: null,
    times_redeemed: 0,
    starts_at: null,
    ends_at: null,
    is_active: true,
    ...overrides,
  };
}

describe("normalizeDiscountCode", () => {
  it("trims and upper-cases", () => {
    expect(normalizeDiscountCode("  ahorra10 ")).toBe("AHORRA10");
  });
  it("returns empty for whitespace-only", () => {
    expect(normalizeDiscountCode("   ")).toBe("");
  });
});

describe("applyDiscount", () => {
  it("returns invalid/unknown for a null row", () => {
    expect(applyDiscount(null, 100_000, NOW)).toEqual({ kind: "invalid", reason: "unknown" });
  });

  it("applies a percentage discount, rounded to integer cents", () => {
    const outcome = applyDiscount(code({ value: 10 }), 345_055, NOW);
    expect(outcome).toEqual({ kind: "applied", code: "AHORRA10", discountCents: 34_506 });
  });

  it("applies a fixed-amount discount", () => {
    const outcome = applyDiscount(
      code({ discount_type: "fixed_amount", value: 20_000, code: "MENOS200" }),
      100_000,
      NOW,
    );
    expect(outcome).toEqual({ kind: "applied", code: "MENOS200", discountCents: 20_000 });
  });

  it("clamps a fixed-amount discount to the subtotal (edge 6)", () => {
    const outcome = applyDiscount(
      code({ discount_type: "fixed_amount", value: 500_000, code: "MENOS200" }),
      30_000,
      NOW,
    );
    expect(outcome).toEqual({ kind: "applied", code: "MENOS200", discountCents: 30_000 });
  });

  it("rejects an inactive code", () => {
    expect(applyDiscount(code({ is_active: false }), 100_000, NOW).kind).toBe("invalid");
    expect(applyDiscount(code({ is_active: false }), 100_000, NOW)).toEqual({
      kind: "invalid",
      reason: "inactive",
    });
  });

  it("rejects a not-yet-started code as inactive", () => {
    const outcome = applyDiscount(code({ starts_at: "2027-01-01T00:00:00.000Z" }), 100_000, NOW);
    expect(outcome).toEqual({ kind: "invalid", reason: "inactive" });
  });

  it("rejects an expired code", () => {
    const outcome = applyDiscount(code({ ends_at: "2020-01-01T00:00:00.000Z" }), 100_000, NOW);
    expect(outcome).toEqual({ kind: "invalid", reason: "expired" });
  });

  it("rejects a below-minimum subtotal", () => {
    const outcome = applyDiscount(code({ min_subtotal_cents: 500_000 }), 100_000, NOW);
    expect(outcome).toEqual({ kind: "invalid", reason: "below-min" });
  });

  it("rejects an exhausted code", () => {
    const outcome = applyDiscount(
      code({ max_redemptions: 5, times_redeemed: 5 }),
      100_000,
      NOW,
    );
    expect(outcome).toEqual({ kind: "invalid", reason: "exhausted" });
  });

  it("returns none for a zero-cent effective discount", () => {
    expect(applyDiscount(code({ value: 0 }), 100_000, NOW)).toEqual({ kind: "none" });
  });
});
