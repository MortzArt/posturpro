import { describe, expect, it } from "vitest";
import { assembleOrder, formatOrderNumber, type OrderLine } from "@/lib/checkout/order";
import type { ShippingResult } from "@/lib/cart/shipping";

function line(overrides: Partial<OrderLine> = {}): OrderLine {
  return {
    productId: "11111111-1111-1111-1111-111111111111",
    variantId: null,
    productName: "Silla Ergo",
    productSku: "PP-0001",
    variantLabel: null,
    unitPriceCents: 150_000,
    quantity: 2,
    ...overrides,
  };
}

const FLAT: ShippingResult = { kind: "flat", cents: 50_000 };
const FREE: ShippingResult = { kind: "free" };

describe("assembleOrder", () => {
  it("computes line totals as unit_price * quantity (line-total identity)", () => {
    const totals = assembleOrder([line({ unitPriceCents: 150_000, quantity: 2 })], FREE, 0);
    expect(totals.lines[0].lineTotalCents).toBe(300_000);
  });

  it("satisfies the total identity: total = subtotal + shipping + tax - discount", () => {
    const totals = assembleOrder([line()], FLAT, 20_000);
    expect(totals.subtotalCents).toBe(300_000);
    expect(totals.shippingCents).toBe(50_000);
    expect(totals.taxCents).toBe(0);
    expect(totals.discountCents).toBe(20_000);
    expect(totals.totalCents).toBe(300_000 + 50_000 + 0 - 20_000);
  });

  it("adds nothing for free shipping", () => {
    const totals = assembleOrder([line()], FREE, 0);
    expect(totals.shippingCents).toBe(0);
    expect(totals.totalCents).toBe(300_000);
  });

  it("clamps an over-large discount to the subtotal (edge 6/8)", () => {
    const totals = assembleOrder([line({ quantity: 1, unitPriceCents: 10_000 })], FREE, 999_999);
    expect(totals.discountCents).toBe(10_000);
    expect(totals.totalCents).toBe(0);
    expect(totals.discountCents).toBeLessThanOrEqual(totals.subtotalCents);
  });

  it("clamps a negative discount to zero", () => {
    const totals = assembleOrder([line({ quantity: 1, unitPriceCents: 10_000 })], FREE, -500);
    expect(totals.discountCents).toBe(0);
    expect(totals.totalCents).toBe(10_000);
  });

  it("writes tax as 0 to both tax columns (Phase 1)", () => {
    const totals = assembleOrder([line()], FLAT, 0);
    expect(totals.taxCents).toBe(0);
    expect(totals.taxBaseCents).toBe(0);
  });

  it("sums multiple lines", () => {
    const totals = assembleOrder(
      [line({ quantity: 1, unitPriceCents: 100_000 }), line({ variantId: "22222222-2222-2222-2222-222222222222", quantity: 3, unitPriceCents: 20_000 })],
      FREE,
      0,
    );
    expect(totals.subtotalCents).toBe(100_000 + 60_000);
  });
});

describe("formatOrderNumber", () => {
  it("zero-pads to 6 digits with the PP prefix", () => {
    expect(formatOrderNumber(123)).toBe("PP-000123");
    expect(formatOrderNumber(1)).toBe("PP-000001");
  });
  it("grows past 6 digits", () => {
    expect(formatOrderNumber(1_234_567)).toBe("PP-1234567");
  });
});
