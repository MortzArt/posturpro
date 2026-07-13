import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Product-detail read-layer tests (T4 AC-1, AC-9, AC-13/m-6, AC-16, edge 6).
 *
 * Verifies the STITCH SHAPE and read discipline against a mocked Supabase
 * client, without a live DB (the integration suite covers the live PostgREST
 * contract). Focus:
 *   - slug bounding (`isCacheableSlug`) → junk slug returns null WITHOUT a DB
 *     round-trip (edge 6 / cache-key DoS discipline),
 *   - unknown slug (no row) → null (→ notFound, AC-1),
 *   - compare-at is kept only when `> price` (AC-9),
 *   - the published-question read filters `is_published=true AND answer IS NOT
 *     NULL` (m-6, strict AC-13),
 *   - the product SELECT never names `cost_price_cents` (AC-16),
 *   - stock state uses effective (variant-summed) stock.
 */

// `server-only` throws when imported outside an RSC; no-op it in tests.
vi.mock("server-only", () => ({}));

// Pass unstable_cache straight through (no caching in tests).
vi.mock("next/cache", () => ({
  unstable_cache: <T,>(fn: T) => fn,
}));

interface MockTable {
  data: unknown[];
}
interface MockTables {
  products_public: MockTable;
  product_images: MockTable;
  product_variants: MockTable;
  product_questions: MockTable;
}

let tables: MockTables;
/** Captured `.select(...)` column strings per table. */
let selectCalls: Partial<Record<keyof MockTables, string[]>>;
/** Captured `.eq`/`.not` filters applied to product_questions. */
let questionFilters: { eq: Record<string, unknown>; not: Array<[string, string, unknown]> };

function makeBuilder(table: keyof MockTables) {
  const builder: Record<string, unknown> = {};
  const eqFilters: Record<string, unknown> = {};
  const result = () => ({ data: tables[table].data, error: null });

  builder.select = vi.fn((cols: string) => {
    (selectCalls[table] ??= []).push(cols);
    return builder;
  });
  builder.order = vi.fn(() => builder);
  builder.eq = vi.fn((column: string, value: unknown) => {
    eqFilters[column] = value;
    if (table === "product_questions") questionFilters.eq[column] = value;
    return builder;
  });
  builder.not = vi.fn((column: string, op: string, value: unknown) => {
    if (table === "product_questions") questionFilters.not.push([column, op, value]);
    return builder;
  });
  builder.maybeSingle = vi.fn(async () => {
    const rows = tables[table].data as Array<Record<string, unknown>>;
    const row =
      "slug" in eqFilters
        ? (rows.find((r) => r.slug === eqFilters.slug) ?? null)
        : (rows[0] ?? null);
    return { data: row, error: null };
  });
  builder.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(result()).then(resolve);
  return builder;
}

const fromMock = vi.fn((table: keyof MockTables) => makeBuilder(table));

vi.mock("@/lib/supabase/public", () => ({
  createPublicClient: () => ({ from: fromMock }),
}));

// Import AFTER mocks are registered.
import { getProduct, productCacheTag } from "./product-detail";

const ACTIVE_ROW = {
  id: "11111111-2222-3333-4444-555555555555",
  slug: "silla-ejecutiva-milano",
  name: "Silla Ejecutiva Milano",
  description: "Comodidad premium.",
  price_cents: 899_900,
  compare_at_price_cents: 1_079_880,
  stock: 0,
  width_mm: 680,
  depth_mm: 700,
  height_mm: 1180,
  seat_height_mm: 450,
  weight_g: 15_000,
  material_frame: "Aluminio",
  material_upholstery: "Piel",
  material_finish: "Nylon",
  brands: { name: "ErgoVita" },
};

beforeEach(() => {
  fromMock.mockClear();
  selectCalls = {};
  questionFilters = { eq: {}, not: [] };
  tables = {
    products_public: { data: [] },
    product_images: { data: [] },
    product_variants: { data: [] },
    product_questions: { data: [] },
  };
});

describe("getProduct — slug bounding (edge 6, cache-key DoS)", () => {
  it("returns null WITHOUT any DB call for a URL-unsafe slug", async () => {
    const result = await getProduct("../../etc/passwd");
    expect(result).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns null without a DB call for an over-long slug", async () => {
    const result = await getProduct("a".repeat(200));
    expect(result).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns null without a DB call for an empty slug", async () => {
    expect(await getProduct("")).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejects uppercase / non-kebab slugs pre-cache", async () => {
    expect(await getProduct("Silla_Milano")).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe("getProduct — unknown / missing product (AC-1)", () => {
  it("returns null for a valid-shaped slug with no matching row (→ notFound)", async () => {
    tables.products_public = { data: [] };
    const result = await getProduct("silla-fantasma");
    expect(result).toBeNull();
  });
});

describe("getProduct — stitch shape (AC-9, AC-16)", () => {
  beforeEach(() => {
    tables.products_public = { data: [ACTIVE_ROW] };
    tables.product_variants = {
      data: [
        {
          id: "v1",
          color_name: "Negro",
          color_hex: "#111111",
          price_override_cents: null,
          stock: 3,
          sort_order: 0,
        },
        {
          id: "v2",
          color_name: "Café",
          color_hex: "#6B4423",
          price_override_cents: 929_900,
          stock: 4,
          sort_order: 1,
        },
      ],
    };
  });

  it("returns the product with brand, price, and variants stitched", async () => {
    const product = await getProduct("silla-ejecutiva-milano");
    expect(product).not.toBeNull();
    expect(product?.slug).toBe("silla-ejecutiva-milano");
    expect(product?.brandName).toBe("ErgoVita");
    expect(product?.priceCents).toBe(899_900);
    expect(product?.variants).toHaveLength(2);
  });

  it("keeps compare-at only because it is > price (AC-9)", async () => {
    const product = await getProduct("silla-ejecutiva-milano");
    expect(product?.compareAtPriceCents).toBe(1_079_880);
  });

  it("drops compare-at when it is <= price (AC-9)", async () => {
    tables.products_public = {
      data: [{ ...ACTIVE_ROW, compare_at_price_cents: 899_900 }],
    };
    const product = await getProduct("silla-ejecutiva-milano");
    expect(product?.compareAtPriceCents).toBeNull();
  });

  it("computes stock state from summed variant stock, not the stale product stock", async () => {
    // Product row says stock 0, variants sum to 7 → in stock.
    const product = await getProduct("silla-ejecutiva-milano");
    expect(product?.stockState).toBe("in");
  });

  it("never selects cost_price_cents from the view (AC-16)", async () => {
    await getProduct("silla-ejecutiva-milano");
    const selects = (selectCalls.products_public ?? []).join(" ");
    expect(selects).not.toContain("cost_price_cents");
  });
});

describe("getProduct — published+answered question filter (m-6, AC-13)", () => {
  beforeEach(() => {
    tables.products_public = { data: [ACTIVE_ROW] };
  });

  it("filters to is_published=true AND answer IS NOT NULL", async () => {
    await getProduct("silla-ejecutiva-milano");
    expect(questionFilters.eq.is_published).toBe(true);
    // The m-6 fix adds `.not("answer", "is", null)`.
    expect(questionFilters.not).toContainEqual(["answer", "is", null]);
  });

  it("maps question rows into the view model shape", async () => {
    tables.product_questions = {
      data: [
        {
          id: "q1",
          author_name: "Ana",
          question: "¿Es cómoda?",
          answer: "Sí, mucho.",
          answered_at: "2026-01-01T00:00:00Z",
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
    };
    const product = await getProduct("silla-ejecutiva-milano");
    expect(product?.questions).toHaveLength(1);
    expect(product?.questions[0]).toMatchObject({
      authorName: "Ana",
      question: "¿Es cómoda?",
      answer: "Sí, mucho.",
    });
  });
});

describe("productCacheTag", () => {
  it("builds a per-slug tag", () => {
    expect(productCacheTag("silla-milano")).toBe("product:silla-milano");
  });
});
