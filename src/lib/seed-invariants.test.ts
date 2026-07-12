/**
 * Seed-data invariant tests (AC-15). These validate the seed FIXTURES (pure
 * data) without needing a live DB: counts, price ranges, referential
 * integrity, and the required edge-case coverage (variant price override,
 * single-vs-multi variant, nested category).
 */
import { describe, expect, it } from "vitest";
import {
  BRANDS,
  CATEGORIES,
  STYLES,
  TAGS,
} from "../../scripts/seed-data/taxonomy";
import { PRODUCTS, seedImageUrl } from "../../scripts/seed-data/products";

const brandSlugs = new Set(BRANDS.map((b) => b.slug));
const styleSlugs = new Set(STYLES.map((s) => s.slug));
const categorySlugs = new Set(CATEGORIES.map((c) => c.slug));
const tagSlugs = new Set(TAGS.map((t) => t.slug));

describe("taxonomy counts (AC-13)", () => {
  it("has ~5 brands", () => {
    expect(BRANDS.length).toBe(5);
  });
  it("has ~6 categories", () => {
    expect(CATEGORIES.length).toBe(6);
  });
  it("has ~6 styles", () => {
    expect(STYLES.length).toBe(6);
  });
  it("has a tag set", () => {
    expect(TAGS.length).toBeGreaterThanOrEqual(6);
  });
});

describe("taxonomy integrity", () => {
  it("has unique brand/category/style/tag slugs", () => {
    expect(new Set(BRANDS.map((b) => b.slug)).size).toBe(BRANDS.length);
    expect(new Set(CATEGORIES.map((c) => c.slug)).size).toBe(CATEGORIES.length);
    expect(new Set(STYLES.map((s) => s.slug)).size).toBe(STYLES.length);
    expect(new Set(TAGS.map((t) => t.slug)).size).toBe(TAGS.length);
  });

  it("has at least one nested category with a valid parent (edge case 4)", () => {
    const nested = CATEGORIES.filter((c) => c.parentSlug !== null);
    expect(nested.length).toBeGreaterThanOrEqual(1);
    for (const child of nested) {
      expect(categorySlugs.has(child.parentSlug as string)).toBe(true);
      expect(child.parentSlug).not.toBe(child.slug); // no self-parent
    }
  });

  it("has root categories with null parent", () => {
    expect(CATEGORIES.some((c) => c.parentSlug === null)).toBe(true);
  });
});

describe("product counts + prices (AC-13)", () => {
  it("has ~30 products", () => {
    expect(PRODUCTS.length).toBe(30);
  });

  it("has unique product slugs and SKUs", () => {
    expect(new Set(PRODUCTS.map((p) => p.slug)).size).toBe(PRODUCTS.length);
    expect(new Set(PRODUCTS.map((p) => p.sku)).size).toBe(PRODUCTS.length);
  });

  it("stores realistic MXN prices as positive integer cents", () => {
    for (const p of PRODUCTS) {
      expect(Number.isInteger(p.priceCents)).toBe(true);
      expect(p.priceCents).toBeGreaterThan(0);
      // Realistic chair range: MX$1,000 – MX$20,000.
      expect(p.priceCents).toBeGreaterThanOrEqual(100_000);
      expect(p.priceCents).toBeLessThanOrEqual(2_000_000);
    }
  });

  it("keeps cost price below retail and as integer cents", () => {
    for (const p of PRODUCTS) {
      expect(Number.isInteger(p.costPriceCents)).toBe(true);
      expect(p.costPriceCents).toBeLessThan(p.priceCents);
    }
  });
});

describe("product referential integrity", () => {
  it("references only existing brand/style/category/tag slugs", () => {
    for (const p of PRODUCTS) {
      expect(brandSlugs.has(p.brandSlug)).toBe(true);
      expect(styleSlugs.has(p.styleSlug)).toBe(true);
      for (const c of p.categorySlugs) expect(categorySlugs.has(c)).toBe(true);
      for (const t of p.tagSlugs) expect(tagSlugs.has(t)).toBe(true);
    }
  });

  it("generates unique variant SKUs across all products", () => {
    const skus = PRODUCTS.flatMap((p) =>
      p.variants.map((v) => `${p.sku}-V${v.skuSuffix}`),
    );
    expect(new Set(skus).size).toBe(skus.length);
  });
});

describe("variant edge cases", () => {
  it("every product has at least one variant (edge case 7)", () => {
    for (const p of PRODUCTS) expect(p.variants.length).toBeGreaterThanOrEqual(1);
  });

  it("has at least one single-variant and one multi-variant product", () => {
    expect(PRODUCTS.some((p) => p.variants.length === 1)).toBe(true);
    expect(PRODUCTS.some((p) => p.variants.length > 1)).toBe(true);
  });

  it("has at least one inherited price (null override) and one override (edge case 5)", () => {
    const allVariants = PRODUCTS.flatMap((p) => p.variants);
    expect(allVariants.some((v) => v.priceOverrideCents === null)).toBe(true);
    expect(allVariants.some((v) => v.priceOverrideCents !== null)).toBe(true);
  });

  it("uses valid 6-digit hex colors", () => {
    for (const p of PRODUCTS) {
      for (const v of p.variants) {
        expect(v.colorHex).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    }
  });
});

describe("seed image URLs (AC-7 / AC-16 / m-5)", () => {
  it("produces a valid, allow-listed https URL", () => {
    const url = seedImageUrl("silla-x", 1);
    expect(url).toBe("https://picsum.photos/seed/silla-x-1/800/800");
    expect(new URL(url).hostname).toBe("picsum.photos");
  });

  it("produces distinct URLs for product-level vs variant-specific images (M-1)", () => {
    const product = seedImageUrl("silla-x", 1);
    const variant = seedImageUrl("silla-x", 1, "1-2");
    expect(variant).not.toBe(product);
    expect(variant).toContain("1-2");
  });

  it("keeps every seeded image URL unique across products + variants (m-4)", () => {
    const urls: string[] = [];
    for (const p of PRODUCTS) {
      urls.push(seedImageUrl(p.slug, 1));
      p.variants.forEach((v, i) =>
        urls.push(seedImageUrl(p.slug, i + 1, v.skuSuffix)),
      );
    }
    expect(new Set(urls).size).toBe(urls.length);
  });
});
