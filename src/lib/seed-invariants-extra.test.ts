/**
 * Additional seed-fixture invariants closing QA coverage gaps for AC-6, AC-8,
 * AC-11, AC-13 and edge cases 4/5/7 that the original seed-invariants suite did
 * not assert. Pure-data checks (no live DB).
 */
import { describe, expect, it } from "vitest";
import { CATEGORIES, TAGS } from "../../scripts/seed-data/taxonomy";
import { PRODUCTS } from "../../scripts/seed-data/products";
import { STATIC_PAGES } from "../../scripts/seed-data/content";
import {
  FREE_SHIPPING_THRESHOLD_CENTS,
  SHIPPING_FLAT_RATE_CENTS,
} from "./config";

/** Resolve the parent chain of a category by slug; detect any cycle. */
function hasCycle(startSlug: string): boolean {
  const bySlug = new Map(CATEGORIES.map((c) => [c.slug, c]));
  const seen = new Set<string>();
  let cursor: string | null = startSlug;
  while (cursor !== null) {
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    const node = bySlug.get(cursor);
    if (!node) return false;
    cursor = node.parentSlug;
  }
  return false;
}

describe("category graph acyclicity (edge case 4)", () => {
  it("has no cycle reachable from any category", () => {
    for (const c of CATEGORIES) {
      expect(hasCycle(c.slug)).toBe(false);
    }
  });

  it("every non-null parentSlug resolves to a defined category", () => {
    const slugs = new Set(CATEGORIES.map((c) => c.slug));
    for (const c of CATEGORIES) {
      if (c.parentSlug !== null) {
        expect(slugs.has(c.parentSlug)).toBe(true);
      }
    }
  });
});

describe("product ↔ category M2M links (AC-13)", () => {
  it("links every ejecutiva product to BOTH the nested child and its parent", () => {
    const ejecutivas = PRODUCTS.filter((p) =>
      p.categorySlugs.includes("ejecutivas"),
    );
    expect(ejecutivas.length).toBeGreaterThan(0);
    for (const p of ejecutivas) {
      // Nested-category products belong to the child AND the parent (oficina).
      expect(p.categorySlugs).toContain("oficina");
    }
  });

  it("assigns at least one category to every product", () => {
    for (const p of PRODUCTS) {
      expect(p.categorySlugs.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("assigns at least one tag from the seeded tag set to every product", () => {
    const tagSlugs = new Set(TAGS.map((t) => t.slug));
    for (const p of PRODUCTS) {
      expect(p.tagSlugs.length).toBeGreaterThanOrEqual(1);
      for (const t of p.tagSlugs) expect(tagSlugs.has(t)).toBe(true);
    }
  });
});

describe("compare-at-price sanity (AC-6)", () => {
  it("keeps compare_at above retail when present (a strikethrough price)", () => {
    const withCompare = PRODUCTS.filter(
      (p) => p.compareAtPriceCents !== null,
    );
    expect(withCompare.length).toBeGreaterThan(0);
    for (const p of withCompare) {
      expect(p.compareAtPriceCents as number).toBeGreaterThan(p.priceCents);
      expect(Number.isInteger(p.compareAtPriceCents as number)).toBe(true);
    }
  });
});

describe("product dimensions + weight (AC-6)", () => {
  it("stores positive integer dimensions and weight for every product", () => {
    for (const p of PRODUCTS) {
      for (const value of [
        p.widthMm,
        p.depthMm,
        p.heightMm,
        p.seatHeightMm,
        p.weightG,
      ]) {
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThan(0);
      }
    }
  });
});

describe("variant price-override precedence data (edge case 5)", () => {
  it("keeps an overridden variant price as a positive integer distinct from base", () => {
    const overrides = PRODUCTS.flatMap((p) =>
      p.variants
        .filter((v) => v.priceOverrideCents !== null)
        .map((v) => ({ base: p.priceCents, override: v.priceOverrideCents })),
    );
    expect(overrides.length).toBeGreaterThan(0);
    for (const { base, override } of overrides) {
      expect(Number.isInteger(override as number)).toBe(true);
      expect(override).not.toBe(base);
      expect(override as number).toBeGreaterThan(0);
    }
  });
});

describe("store-settings seed values (AC-11)", () => {
  it("matches the documented flat-rate and free-shipping cents", () => {
    // The seed writes these constants into the single store_settings row.
    expect(SHIPPING_FLAT_RATE_CENTS).toBe(50_000);
    expect(FREE_SHIPPING_THRESHOLD_CENTS).toBe(1_000_000);
  });
});

describe("static-page fixtures (AC-5)", () => {
  it("has unique slugs and non-empty title/body for every page", () => {
    expect(new Set(STATIC_PAGES.map((p) => p.slug)).size).toBe(
      STATIC_PAGES.length,
    );
    for (const page of STATIC_PAGES) {
      expect(page.slug.length).toBeGreaterThan(0);
      expect(page.title.length).toBeGreaterThan(0);
      expect(page.body.length).toBeGreaterThan(0);
    }
  });
});
