import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Catalog data-layer tests (T3 AC-18, AC-13). These verify the STITCH SHAPE —
 * that the read strategy (view page + separate image/variant batches) maps into
 * `CatalogProductCard`s correctly — against a mocked Supabase client, without a
 * live DB. `unstable_cache` is stubbed to pass the read function through so we
 * exercise the real query/stitch logic.
 */

// `server-only` throws when imported outside an RSC; no-op it in tests.
vi.mock("server-only", () => ({}));

// Pass unstable_cache straight through (no caching in tests).
vi.mock("next/cache", () => ({
  unstable_cache: <T>(fn: T) => fn,
}));

// Mocked query result rows, set per-test.
interface MockTables {
  products_public: { data: unknown[]; count: number };
  product_images: { data: unknown[] };
  product_variants: { data: unknown[] };
  product_categories: { data: unknown[] };
  brands: { data: unknown[] };
  styles: { data: unknown[] };
  categories: { data: unknown[] };
}

let tables: MockTables;

/**
 * A chainable query-builder mock. Every filter/order method returns `this`;
 * awaiting or `.maybeSingle()`/`.range()` resolves to the table's data. This
 * mirrors the PostgREST builder surface the queries use.
 */
function makeBuilder(table: keyof MockTables) {
  const result = () => {
    const entry = tables[table];
    const count = "count" in entry ? (entry as { count: number }).count : null;
    return { data: entry.data, count, error: null };
  };
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const method of ["select", "eq", "in", "order"]) {
    builder[method] = vi.fn(chain);
  }
  builder.range = vi.fn(async () => result());
  builder.maybeSingle = vi.fn(async () => {
    const rows = tables[table].data;
    return { data: rows[0] ?? null, count: null, error: null };
  });
  // Awaiting the builder directly (e.g. product_categories membership).
  builder.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(result()).then(resolve);
  return builder;
}

const fromMock = vi.fn((table: keyof MockTables) => makeBuilder(table));

vi.mock("@/lib/supabase/public", () => ({
  createPublicClient: () => ({ from: fromMock }),
}));

// Import AFTER mocks are registered.
import { listProducts, getBrand, listCategories } from "./queries";

beforeEach(() => {
  fromMock.mockClear();
  tables = {
    products_public: { data: [], count: 0 },
    product_images: { data: [] },
    product_variants: { data: [] },
    product_categories: { data: [] },
    brands: { data: [] },
    styles: { data: [] },
    categories: { data: [] },
  };
});

describe("listProducts stitch shape (AC-13)", () => {
  it("stitches view rows + image + variant batches into cards", async () => {
    tables.products_public = {
      count: 1,
      data: [
        {
          id: "p1",
          slug: "silla-milano",
          name: "Silla Milano",
          price_cents: 899900,
          compare_at_price_cents: 1049900,
          is_best_seller: true,
          sales_count: 10,
          stock: 0,
          brand_id: "b1",
          style_id: "s1",
          brands: { name: "ErgoVita", slug: "ergovita", logo_url: null },
          styles: { name: "Ejecutiva", slug: "ejecutiva" },
        },
      ],
    };
    tables.product_images = {
      data: [
        {
          product_id: "p1",
          url: "https://picsum.photos/seed/silla-milano-1/800/800",
          alt_text: "Silla Milano",
          is_primary: true,
          sort_order: 0,
        },
      ],
    };
    tables.product_variants = {
      data: [
        { product_id: "p1", stock: 3, color_hex: "#111111" },
        { product_id: "p1", stock: 4, color_hex: "#8B5E3C" },
      ],
    };

    const page = await listProducts({ page: 1 });

    expect(page.total).toBe(1);
    expect(page.lastPage).toBe(1);
    expect(page.items).toHaveLength(1);

    const card = page.items[0];
    expect(card.slug).toBe("silla-milano");
    expect(card.brandName).toBe("ErgoVita");
    expect(card.priceCents).toBe(899900);
    // compare-at kept only because it is > price
    expect(card.compareAtPriceCents).toBe(1049900);
    expect(card.coverImageUrl).toContain("silla-milano-1");
    expect(card.coverAlt).toBe("Silla Milano");
    // 2 distinct variant colors → "N colores" line will show
    expect(card.colorCount).toBe(2);
    // effective stock = 3 + 4 = 7 (> threshold 5) → in stock
    expect(card.stockState).toBe("in");
    expect(card.lowStockN).toBeNull();
  });

  it("never leaks cost_price_cents into the card shape", async () => {
    tables.products_public = {
      count: 1,
      data: [
        {
          id: "p1",
          slug: "s",
          name: "N",
          price_cents: 1000,
          compare_at_price_cents: null,
          is_best_seller: false,
          sales_count: 0,
          stock: 10,
          brand_id: "b1",
          style_id: "s1",
          brands: { name: "B", slug: "b", logo_url: null },
          styles: { name: "S", slug: "s" },
        },
      ],
    };

    const page = await listProducts({ page: 1 });
    expect(JSON.stringify(page.items)).not.toContain("cost_price_cents");
  });

  it("drops the struck compare-at price when it is not a real discount", async () => {
    tables.products_public = {
      count: 1,
      data: [
        {
          id: "p1",
          slug: "s",
          name: "N",
          price_cents: 1000,
          compare_at_price_cents: 900, // <= price → not a discount
          is_best_seller: false,
          sales_count: 0,
          stock: 10,
          brand_id: "b1",
          style_id: "s1",
          brands: { name: "B", slug: "b", logo_url: null },
          styles: { name: "S", slug: "s" },
        },
      ],
    };

    const page = await listProducts({ page: 1 });
    expect(page.items[0].compareAtPriceCents).toBeNull();
  });

  it("renders a placeholder (null cover) and falls back alt to the name", async () => {
    tables.products_public = {
      count: 1,
      data: [
        {
          id: "p1",
          slug: "s",
          name: "Sin Imagen",
          price_cents: 1000,
          compare_at_price_cents: null,
          is_best_seller: false,
          sales_count: 0,
          stock: 0,
          brand_id: "b1",
          style_id: "s1",
          brands: { name: "B", slug: "b", logo_url: null },
          styles: { name: "S", slug: "s" },
        },
      ],
    };
    // No images, no variants → out of stock, placeholder cover.
    const page = await listProducts({ page: 1 });
    expect(page.items[0].coverImageUrl).toBeNull();
    expect(page.items[0].coverAlt).toBe("Sin Imagen");
    expect(page.items[0].stockState).toBe("out");
  });

  it("reads products from the view (never the base products table) — AC-13", async () => {
    await listProducts({ page: 1 });
    const readTables = fromMock.mock.calls.map((call) => call[0]);
    expect(readTables).toContain("products_public");
    expect(readTables).not.toContain("products");
  });
});

describe("getBrand", () => {
  it("returns null for an unknown/inactive slug (→ 404, AC-14)", async () => {
    tables.brands = { data: [] };
    expect(await getBrand("fantasma")).toBeNull();
  });

  it("maps a found brand row to the view model", async () => {
    tables.brands = {
      data: [
        {
          id: "b1",
          slug: "ergovita",
          name: "ErgoVita",
          description: "Diseño ergonómico",
          logo_url: null,
        },
      ],
    };
    const brand = await getBrand("ergovita");
    expect(brand).toEqual({
      id: "b1",
      slug: "ergovita",
      name: "ErgoVita",
      description: "Diseño ergonómico",
      logoUrl: null,
    });
  });
});

describe("listCategories tree (AC-3, edge case 4)", () => {
  it("nests children under their parent", async () => {
    tables.categories = {
      data: [
        {
          id: "c1",
          slug: "oficina",
          name: "Oficina",
          description: null,
          parent_id: null,
          sort_order: 1,
        },
        {
          id: "c2",
          slug: "ejecutivas",
          name: "Ejecutivas",
          description: null,
          parent_id: "c1",
          sort_order: 1,
        },
        {
          id: "c3",
          slug: "gamer",
          name: "Gamer",
          description: null,
          parent_id: null,
          sort_order: 2,
        },
      ],
    };
    const tree = await listCategories();
    const roots = tree.map((node) => node.slug);
    expect(roots).toEqual(["oficina", "gamer"]);
    const oficina = tree.find((node) => node.slug === "oficina");
    expect(oficina?.children?.map((child) => child.slug)).toEqual([
      "ejecutivas",
    ]);
  });
});
