import { describe, expect, it, vi } from "vitest";

/**
 * Server display-builder tests (T4 AC-7, AC-9). Verifies the panel-consumed
 * `variantDisplay` map + product-level display resolve prices/stock/compare-at
 * with the SAME pure helpers the behavior uses, so display can never drift from
 * the selected effective price. No I/O (mocks `server-only`).
 */
vi.mock("server-only", () => ({}));

import {
  buildProductDisplay,
  buildVariantDisplayMap,
  type DisplayResolvers,
} from "./product-display";
import type { ProductDetail } from "@/lib/catalog/product-detail.types";

/** Simple, deterministic resolvers that echo their inputs. */
const resolvers: DisplayResolvers = {
  stockLabel: (state, lowCount) =>
    state === "low" ? `Solo quedan ${lowCount}` : state === "out" ? "Agotado" : "En stock",
  colorLabel: (colorName) => `Color: ${colorName}`,
  swatchName: (colorName, isOut) => (isOut ? `${colorName} (agotado)` : colorName),
  liveStatus: (colorName, priceLabel, stockLabel) =>
    `${colorName} — ${priceLabel} — ${stockLabel}`,
};

function makeProduct(overrides: Partial<ProductDetail> = {}): ProductDetail {
  return {
    id: "p1",
    slug: "silla-milano",
    name: "Silla Milano",
    description: null,
    brandName: "ErgoVita",
    priceCents: 899_900,
    compareAtPriceCents: 1_079_880,
    stock: 10,
    stockState: "in",
    variants: [],
    images: [],
    questions: [],
    specs: {
      widthMm: null,
      depthMm: null,
      heightMm: null,
      seatHeightMm: null,
      weightG: null,
      materialFrame: null,
      materialUpholstery: null,
      materialFinish: null,
    },
    ...overrides,
  };
}

describe("buildVariantDisplayMap (AC-7, AC-9)", () => {
  it("resolves per-variant effective price + compare-at strike", () => {
    const product = makeProduct({
      variants: [
        {
          id: "v1",
          colorName: "Negro",
          colorHex: "#111",
          priceOverrideCents: null,
          stock: 10,
          sortOrder: 0,
        },
        {
          id: "v2",
          colorName: "Café",
          colorHex: "#642",
          priceOverrideCents: 929_900,
          stock: 4,
          sortOrder: 1,
        },
      ],
    });
    const map = buildVariantDisplayMap(product, resolvers);

    // Negro inherits base price 899,900 cents = $8,999.00; compare-at
    // 1,079,880 cents = $10,798.80 > effective → strikes.
    expect(map.v1.effectivePriceLabel).toMatch(/8,999\.00/);
    expect(map.v1.compareAtLabel).toMatch(/10,798\.80/);
    expect(map.v1.stockState).toBe("in");

    // Café override 929,900 cents = $9,299.00 < compare-at → still strikes.
    expect(map.v2.effectivePriceLabel).toMatch(/9,299\.00/);
    expect(map.v2.compareAtLabel).toMatch(/10,798\.80/);
    // Café stock 4 → low, label reflects its OWN count.
    expect(map.v2.stockState).toBe("low");
    expect(map.v2.stockLabel).toBe("Solo quedan 4");
  });

  it("drops the compare-at strike for a variant whose override >= compare-at (edge 3)", () => {
    const product = makeProduct({
      compareAtPriceCents: 1_000_000,
      variants: [
        {
          id: "v1",
          colorName: "Premium",
          colorHex: "#000",
          priceOverrideCents: 1_100_000,
          stock: 10,
          sortOrder: 0,
        },
      ],
    });
    const map = buildVariantDisplayMap(product, resolvers);
    expect(map.v1.compareAtLabel).toBeNull();
  });

  it("labels an out-of-stock variant swatch accessibly (edge 2)", () => {
    const product = makeProduct({
      variants: [
        {
          id: "v1",
          colorName: "Agotado Color",
          colorHex: "#000",
          priceOverrideCents: null,
          stock: 0,
          sortOrder: 0,
        },
      ],
    });
    const map = buildVariantDisplayMap(product, resolvers);
    expect(map.v1.stockState).toBe("out");
    expect(map.v1.swatchName).toContain("(agotado)");
  });

  it("returns an empty map for a product with no variants", () => {
    expect(buildVariantDisplayMap(makeProduct({ variants: [] }), resolvers)).toEqual(
      {},
    );
  });
});

describe("buildProductDisplay (AC-8, AC-9)", () => {
  it("uses product-level price/stock for a no-variant product", () => {
    const display = buildProductDisplay(makeProduct(), resolvers);
    expect(display.effectivePriceLabel).toMatch(/8,999\.00/);
    expect(display.compareAtLabel).toMatch(/10,798\.80/);
    expect(display.stockState).toBe("in");
  });

  it("omits the compare-at label when it is not greater than price", () => {
    const display = buildProductDisplay(
      makeProduct({ compareAtPriceCents: null }),
      resolvers,
    );
    expect(display.compareAtLabel).toBeNull();
  });
});
