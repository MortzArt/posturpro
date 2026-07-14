/**
 * Pure checkout-helper transforms (T7 AC-1, edge 1/m-1). These map the client
 * cart snapshot to the summary view models and the serialized submit payloads,
 * and — critically — recompute the DISPLAY totals to the live prices the server
 * returned on price drift (m-1). They are the single source of truth for the
 * cart→checkout mapping, so every branch is unit-tested here.
 */
import { describe, expect, it } from "vitest";
import {
  applyLivePrices,
  buildLinesPayload,
  buildSnapshotPrices,
  buildSummaryLines,
} from "@/components/checkout/checkout-helpers";
import type { CartLine } from "@/lib/cart/cart-line";
import type { CheckoutSummaryLine } from "@/components/checkout/checkout-summary";

const PRODUCT_A = "11111111-1111-1111-1111-111111111111";
const VARIANT_A = "22222222-2222-2222-2222-222222222222";
const PRODUCT_B = "33333333-3333-3333-3333-333333333333";

function cartLine(overrides: Partial<CartLine> = {}): CartLine {
  return {
    productId: PRODUCT_A,
    slug: "silla-ergo",
    name: "Silla Ergo",
    variantId: VARIANT_A,
    variantLabel: "Negro",
    unitPriceCents: 150_000,
    coverImageUrl: "https://img/a.jpg",
    sku: "PP-0001",
    quantity: 2,
    ...overrides,
  };
}

describe("buildSummaryLines", () => {
  it("maps a cart line to a summary line with a variant key + computed line total", () => {
    const [summary] = buildSummaryLines([cartLine()]);
    expect(summary.key).toBe(`${PRODUCT_A}::${VARIANT_A}`);
    expect(summary.name).toBe("Silla Ergo");
    expect(summary.variantLabel).toBe("Negro");
    expect(summary.quantity).toBe(2);
    expect(summary.unitPriceCents).toBe(150_000);
    expect(summary.lineTotalCents).toBe(300_000);
    expect(summary.coverImageUrl).toBe("https://img/a.jpg");
  });

  it("uses the bare product id as the key for a no-variant line", () => {
    const [summary] = buildSummaryLines([cartLine({ variantId: null, variantLabel: null })]);
    expect(summary.key).toBe(PRODUCT_A);
    expect(summary.variantLabel).toBeNull();
  });

  it("maps every line and preserves order", () => {
    const lines = buildSummaryLines([
      cartLine({ productId: PRODUCT_A }),
      cartLine({ productId: PRODUCT_B, variantId: null, name: "Silla B" }),
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[1].name).toBe("Silla B");
  });

  it("returns an empty array for no lines", () => {
    expect(buildSummaryLines([])).toEqual([]);
  });
});

describe("buildLinesPayload", () => {
  it("keeps only the ids + quantity (server re-reads price/name/stock)", () => {
    const [payload] = buildLinesPayload([cartLine({ quantity: 3 })]);
    expect(payload).toEqual({ productId: PRODUCT_A, variantId: VARIANT_A, quantity: 3 });
  });

  it("carries a null variantId through for no-variant lines", () => {
    const [payload] = buildLinesPayload([cartLine({ variantId: null })]);
    expect(payload.variantId).toBeNull();
  });

  it("never leaks the snapshot price into the payload", () => {
    const [payload] = buildLinesPayload([cartLine({ unitPriceCents: 999_999 })]);
    expect(payload).not.toHaveProperty("unitPriceCents");
  });
});

describe("buildSnapshotPrices", () => {
  it("maps each line key to its snapshot unit price (for drift detection)", () => {
    const map = buildSnapshotPrices([
      cartLine({ unitPriceCents: 150_000 }),
      cartLine({ productId: PRODUCT_B, variantId: null, unitPriceCents: 80_000 }),
    ]);
    expect(map).toEqual({
      [`${PRODUCT_A}::${VARIANT_A}`]: 150_000,
      [PRODUCT_B]: 80_000,
    });
  });

  it("returns an empty object for no lines", () => {
    expect(buildSnapshotPrices([])).toEqual({});
  });
});

describe("applyLivePrices (m-1: totals refresh to live price on drift)", () => {
  const KEY = `${PRODUCT_A}::${VARIANT_A}`;

  function summaryLine(overrides: Partial<CheckoutSummaryLine> = {}): CheckoutSummaryLine {
    return {
      key: KEY,
      name: "Silla Ergo",
      variantLabel: "Negro",
      quantity: 2,
      unitPriceCents: 150_000,
      lineTotalCents: 300_000,
      coverImageUrl: null,
      ...overrides,
    };
  }

  it("recomputes the drifted line's unit + line total from the live price", () => {
    const { lines, subtotalCents } = applyLivePrices([summaryLine()], { [KEY]: 160_000 });
    expect(lines[0].unitPriceCents).toBe(160_000);
    expect(lines[0].lineTotalCents).toBe(320_000);
    expect(subtotalCents).toBe(320_000);
  });

  it("leaves lines whose key is NOT in the live map unchanged", () => {
    const other = summaryLine({ key: PRODUCT_B, unitPriceCents: 80_000, quantity: 1, lineTotalCents: 80_000 });
    const { lines, subtotalCents } = applyLivePrices([summaryLine(), other], { [KEY]: 160_000 });
    expect(lines[0].lineTotalCents).toBe(320_000);
    expect(lines[1].lineTotalCents).toBe(80_000); // untouched
    expect(subtotalCents).toBe(400_000);
  });

  it("returns the snapshot unchanged when the live map is undefined", () => {
    const { lines, subtotalCents } = applyLivePrices([summaryLine()], undefined);
    expect(lines[0].unitPriceCents).toBe(150_000);
    expect(subtotalCents).toBe(300_000);
  });

  it("returns the snapshot unchanged when the live map is empty", () => {
    const { subtotalCents } = applyLivePrices([summaryLine()], {});
    expect(subtotalCents).toBe(300_000);
  });

  it("recomputes to a LOWER live price too (drift can go either direction)", () => {
    const { subtotalCents } = applyLivePrices([summaryLine()], { [KEY]: 100_000 });
    expect(subtotalCents).toBe(200_000);
  });
});
