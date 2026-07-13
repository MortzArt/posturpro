/**
 * Unit tests for the pure variant-selection helpers (T4 AC-7, AC-9, edges 3 & 8).
 *
 * These drive price/stock/gallery from a single source of truth on every swatch
 * selection, so they are exercised across happy paths and every boundary the
 * ticket calls out (override vs base, strike recompute, variant-image fallback,
 * idempotent default selection).
 */
import { describe, expect, it } from "vitest";
import {
  defaultVariant,
  effectivePriceCents,
  imagesForVariant,
  shouldStrikeCompareAt,
  variantStockState,
} from "./variant-selection";
import { LOW_STOCK_THRESHOLD } from "@/lib/config";
import type {
  ProductImageView,
  ProductVariantView,
} from "@/lib/catalog/product-detail.types";

/** Factory: a variant with sensible defaults, overridable per test. */
function makeVariant(
  overrides: Partial<ProductVariantView> = {},
): ProductVariantView {
  return {
    id: "v-1",
    colorName: "Negro",
    colorHex: "#000000",
    priceOverrideCents: null,
    stock: 10,
    sortOrder: 0,
    ...overrides,
  };
}

/** Factory: an image with sensible defaults, overridable per test. */
function makeImage(overrides: Partial<ProductImageView> = {}): ProductImageView {
  return {
    id: "img-1",
    url: "https://example.test/1.jpg",
    altText: null,
    isPrimary: false,
    sortOrder: 0,
    variantId: null,
    ...overrides,
  };
}

describe("effectivePriceCents", () => {
  it("uses the variant override when present (AC-7)", () => {
    const variant = makeVariant({ priceOverrideCents: 749_900 });
    expect(effectivePriceCents(variant, 999_900)).toBe(749_900);
  });

  it("falls back to the base price when the variant has no override", () => {
    const variant = makeVariant({ priceOverrideCents: null });
    expect(effectivePriceCents(variant, 999_900)).toBe(999_900);
  });

  it("uses the base price when there is no variant (no-variant product, AC-8)", () => {
    expect(effectivePriceCents(null, 999_900)).toBe(999_900);
  });

  it("honors an override of exactly 0 (falsy but valid cents)", () => {
    // A 0-cent override must NOT be treated as "no override" — typeof check, not truthiness.
    const variant = makeVariant({ priceOverrideCents: 0 });
    expect(effectivePriceCents(variant, 999_900)).toBe(0);
  });
});

describe("shouldStrikeCompareAt (AC-9, edge 3)", () => {
  it("strikes when compare-at is strictly greater than effective", () => {
    expect(shouldStrikeCompareAt(1_000_000, 749_900)).toBe(true);
  });

  it("does NOT strike when compare-at equals effective (never equal strike)", () => {
    expect(shouldStrikeCompareAt(749_900, 749_900)).toBe(false);
  });

  it("does NOT strike when compare-at is below effective", () => {
    expect(shouldStrikeCompareAt(500_000, 749_900)).toBe(false);
  });

  it("does NOT strike when compare-at is null", () => {
    expect(shouldStrikeCompareAt(null, 749_900)).toBe(false);
  });

  it("recomputes per selection: a higher override removes the strike (edge 3)", () => {
    const compareAt = 1_000_000;
    // Variant A override below compare-at → strike.
    expect(shouldStrikeCompareAt(compareAt, 749_900)).toBe(true);
    // Variant B override at/above compare-at → no strike.
    expect(shouldStrikeCompareAt(compareAt, 1_000_000)).toBe(false);
    expect(shouldStrikeCompareAt(compareAt, 1_200_000)).toBe(false);
  });
});

describe("imagesForVariant (AC-7, edges 1 & 8)", () => {
  const shared1 = makeImage({ id: "s1", variantId: null });
  const shared2 = makeImage({ id: "s2", variantId: null });
  const varA1 = makeImage({ id: "a1", variantId: "var-a" });
  const varA2 = makeImage({ id: "a2", variantId: "var-a" });
  const all = [shared1, shared2, varA1, varA2];

  it("returns only the shared images when variantId is null (no-variant product)", () => {
    expect(imagesForVariant(all, null)).toEqual([shared1, shared2]);
  });

  it("returns the variant's own images when it has some (AC-7)", () => {
    expect(imagesForVariant(all, "var-a")).toEqual([varA1, varA2]);
  });

  it("falls back to shared images when the selected variant has none (AC-7)", () => {
    // var-b has no images → fall back to the shared set.
    expect(imagesForVariant(all, "var-b")).toEqual([shared1, shared2]);
  });

  it("returns an empty array when there are no images at all (edge 1 placeholder)", () => {
    expect(imagesForVariant([], "var-a")).toEqual([]);
    expect(imagesForVariant([], null)).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const input = [...all];
    imagesForVariant(input, "var-a");
    expect(input).toEqual(all);
  });
});

describe("variantStockState (AC-11)", () => {
  it("is 'out' when the variant stock is 0 (edge 2)", () => {
    expect(variantStockState(makeVariant({ stock: 0 }))).toBe("out");
  });

  it("is 'low' at the low-stock threshold", () => {
    expect(variantStockState(makeVariant({ stock: LOW_STOCK_THRESHOLD }))).toBe(
      "low",
    );
  });

  it("is 'in' above the threshold", () => {
    expect(
      variantStockState(makeVariant({ stock: LOW_STOCK_THRESHOLD + 1 })),
    ).toBe("in");
  });

  it("reflects each variant's OWN stock independently (edge 2)", () => {
    // A shopper can inspect an out-of-stock color while another is in stock.
    expect(variantStockState(makeVariant({ id: "a", stock: 0 }))).toBe("out");
    expect(variantStockState(makeVariant({ id: "b", stock: 20 }))).toBe("in");
  });
});

describe("defaultVariant", () => {
  it("returns the first variant (deterministic order) — not first-in-stock", () => {
    const first = makeVariant({ id: "a", stock: 0 });
    const second = makeVariant({ id: "b", stock: 99 });
    // First is chosen even though it is out of stock (design: inspect any color).
    expect(defaultVariant([first, second])).toBe(first);
  });

  it("returns null for a product with no variants (AC-8)", () => {
    expect(defaultVariant([])).toBeNull();
  });

  it("is idempotent — same input yields same reference (edge 8)", () => {
    const variants = [makeVariant({ id: "a" }), makeVariant({ id: "b" })];
    expect(defaultVariant(variants)).toBe(defaultVariant(variants));
  });
});
