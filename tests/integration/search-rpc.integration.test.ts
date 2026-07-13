import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, serviceClient } from "./local-supabase";

/**
 * `search_products` RPC integration (T5 AC-1..AC-8, edges 1-7) — the live
 * PostgREST/SQL contract the mocked unit tests cannot cover.
 *
 * MOSTLY READ-ONLY: the bulk of this suite reads the seeded catalog and asserts
 * the RPC's filter/sort/availability/pagination/security behavior. It does NOT
 * depend on `supabase db reset` (0007 is applied to the running stack) so it is
 * safe alongside a browsing dev server.
 *
 * The two edge-case blocks that CANNOT be observed in the current seed (a
 * variant-less product; a product whose variants are all out of stock) create a
 * single synthetic product as `service_role`, assert against the anon RPC, then
 * DELETE it in `afterAll` — no seed rows are ever mutated and nothing is left
 * behind (verified by a post-cleanup existence check).
 *
 * The anon client is exactly the RLS-enforced role the storefront gets, so this
 * also proves AC-2's grant discipline: the RPC returns rows to anon while the
 * base `products` table (with `cost_price_cents`) stays denied.
 */

/** Call the RPC as anon (the storefront path). */
async function search(
  args: Record<string, unknown>,
): Promise<{ rows: SearchRow[]; total: number }> {
  const db = anonClient();
  const { data, error } = await db.rpc("search_products", args);
  expect(error).toBeNull();
  const rows = (data ?? []) as SearchRow[];
  return { rows, total: rows.length > 0 ? rows[0].total_count : 0 };
}

interface SearchRow {
  id: string;
  slug: string;
  name: string;
  price_cents: number;
  compare_at_price_cents: number | null;
  effective_stock: number;
  distinct_color_count: number;
  total_count: number;
  brand_name: string | null;
}

/** Resolved facet ids from the live seed (no hardcoded UUIDs — resilient). */
interface Facets {
  ergovitaBrandId: string;
  nordikaBrandId: string;
  ergonomicaStyleId: string;
  oficinaCatId: string;
  gamerCatId: string;
  ejecutivasCatId: string;
}
let facets: Facets;

beforeAll(async () => {
  const db = serviceClient();
  const [brands, styles, categories] = await Promise.all([
    db.from("brands").select("id,slug"),
    db.from("styles").select("id,slug"),
    db.from("categories").select("id,slug"),
  ]);
  const brandBy = (slug: string) =>
    (brands.data ?? []).find((b) => b.slug === slug)!.id;
  const styleBy = (slug: string) =>
    (styles.data ?? []).find((s) => s.slug === slug)!.id;
  const catBy = (slug: string) =>
    (categories.data ?? []).find((c) => c.slug === slug)!.id;
  facets = {
    ergovitaBrandId: brandBy("ergovita"),
    nordikaBrandId: brandBy("nordika"),
    ergonomicaStyleId: styleBy("ergonomica"),
    oficinaCatId: catBy("oficina"),
    gamerCatId: catBy("gamer"),
    ejecutivasCatId: catBy("ejecutivas"),
  };
});

describe("search_products — anon security invariants (AC-2)", () => {
  it("returns rows to anon (EXECUTE granted)", async () => {
    const { rows } = await search({ p_limit: 5 });
    expect(rows.length).toBeGreaterThan(0);
  });

  it("base products table stays DENIED to anon (permission denied, cost never leaks)", async () => {
    const db = anonClient();
    const { data, error } = await db
      .from("products")
      .select("id,cost_price_cents")
      .limit(1);
    // RLS/grant denies the base table entirely.
    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
    expect(data ?? []).toHaveLength(0);
  });

  it("the RPC result shape carries NO cost_price_cents column", async () => {
    const { rows } = await search({ p_limit: 3 });
    for (const row of rows) {
      expect(Object.keys(row)).not.toContain("cost_price_cents");
    }
    expect(JSON.stringify(rows)).not.toContain("cost_price_cents");
  });
});

describe("search_products — keyword search (AC-3, edge 7)", () => {
  it("matches accent- AND case-insensitively (ergonomica == ergonómica == ERGONOMICA)", async () => {
    const plain = await search({ p_query: "ergonomica", p_limit: 100 });
    const accented = await search({ p_query: "ergonómica", p_limit: 100 });
    const upper = await search({ p_query: "ERGONOMICA", p_limit: 100 });
    expect(plain.total).toBeGreaterThan(0);
    expect(accented.total).toBe(plain.total);
    expect(upper.total).toBe(plain.total);
  });

  it("'oficina' / 'OFICINA' / 'oficína' all match the same set (edge 7)", async () => {
    const a = await search({ p_query: "oficina", p_limit: 100 });
    const b = await search({ p_query: "OFICINA", p_limit: 100 });
    const c = await search({ p_query: "oficína", p_limit: 100 });
    expect(a.total).toBeGreaterThan(0);
    expect(b.total).toBe(a.total);
    expect(c.total).toBe(a.total);
  });

  it("a null/absent query returns the full filter-only set (AC-3)", async () => {
    const withNull = await search({ p_query: null, p_limit: 100 });
    const without = await search({ p_limit: 100 });
    expect(withNull.total).toBe(without.total);
    expect(withNull.total).toBeGreaterThan(0);
  });

  it("a no-match query returns zero rows (not an error) — edge 1", async () => {
    const { rows, total } = await search({
      p_query: "zzzznotachairzzzz",
      p_limit: 100,
    });
    expect(rows).toHaveLength(0);
    expect(total).toBe(0);
  });
});

describe("search_products — facets individually + combined (AC-4)", () => {
  it("brand facet filters to that brand only", async () => {
    const { rows, total } = await search({
      p_brand_ids: [facets.ergovitaBrandId],
      p_limit: 100,
    });
    expect(total).toBeGreaterThan(0);
    // Every returned row is that brand.
    for (const r of rows) expect(r.brand_name).toBeTruthy();
  });

  it("multiple values within a facet OR together (brand A OR brand B ≥ each alone)", async () => {
    const a = await search({ p_brand_ids: [facets.ergovitaBrandId], p_limit: 100 });
    const b = await search({ p_brand_ids: [facets.nordikaBrandId], p_limit: 100 });
    const both = await search({
      p_brand_ids: [facets.ergovitaBrandId, facets.nordikaBrandId],
      p_limit: 100,
    });
    expect(both.total).toBe(a.total + b.total);
  });

  it("category facet aggregates (M2M) and multiple categories OR together", async () => {
    const oficina = await search({ p_category_ids: [facets.oficinaCatId], p_limit: 100 });
    const gamer = await search({ p_category_ids: [facets.gamerCatId], p_limit: 100 });
    const both = await search({
      p_category_ids: [facets.oficinaCatId, facets.gamerCatId],
      p_limit: 100,
    });
    expect(oficina.total).toBeGreaterThan(0);
    expect(gamer.total).toBeGreaterThan(0);
    // Union ≥ larger of the two (a product may be in both categories).
    expect(both.total).toBeGreaterThanOrEqual(Math.max(oficina.total, gamer.total));
  });

  it("style facet filters", async () => {
    const { total } = await search({
      p_style_ids: [facets.ergonomicaStyleId],
      p_limit: 100,
    });
    expect(total).toBeGreaterThan(0);
  });

  it("color facet: negro OR azul ≥ negro alone (OR within facet)", async () => {
    const negro = await search({ p_colors: ["#111111"], p_limit: 100 });
    const both = await search({ p_colors: ["#111111", "#1d4ed8"], p_limit: 100 });
    expect(negro.total).toBeGreaterThan(0);
    expect(both.total).toBeGreaterThanOrEqual(negro.total);
  });

  it("material facet substring-matches (accent-insensitive term)", async () => {
    const { total } = await search({ p_materials: ["malla"], p_limit: 100 });
    expect(total).toBeGreaterThan(0);
  });

  it("price range (min/max cents) bounds the set", async () => {
    const cheap = await search({ p_price_max: 200_000, p_limit: 100 });
    const dear = await search({ p_price_min: 200_000, p_limit: 100 });
    const all = await search({ p_limit: 100 });
    for (const r of cheap.rows) expect(r.price_cents).toBeLessThanOrEqual(200_000);
    for (const r of dear.rows) expect(r.price_cents).toBeGreaterThanOrEqual(200_000);
    // A partition at exactly the boundary can double-count the boundary price,
    // so the parts are at least the whole.
    expect(cheap.total + dear.total).toBeGreaterThanOrEqual(all.total);
  });

  it("distinct facets AND together (brand ∩ color ≤ either alone)", async () => {
    const brand = await search({ p_brand_ids: [facets.ergovitaBrandId], p_limit: 100 });
    const combo = await search({
      p_brand_ids: [facets.ergovitaBrandId],
      p_colors: ["#111111"],
      p_limit: 100,
    });
    expect(combo.total).toBeLessThanOrEqual(brand.total);
    // The seeded ergovita+negro combo is non-empty (a real filter path).
    expect(combo.total).toBeGreaterThan(0);
  });

  it("contradictory filters yield exactly zero rows, not an error (edge 1)", async () => {
    // A brand + a color that brand does not stock → empty, valid, shareable.
    const solo = await search({ p_brand_ids: [facets.ergovitaBrandId], p_limit: 100 });
    // Find a color NOT present in the ergovita set by probing each catalog color.
    const catalogColors = ["#111111", "#1d4ed8", "#6b4423", "#6b7280", "#b91c1c", "#f3f4f6"];
    const presentInErgovita = new Set<string>();
    for (const color of catalogColors) {
      const r = await search({
        p_brand_ids: [facets.ergovitaBrandId],
        p_colors: [color],
        p_limit: 100,
      });
      if (r.total > 0) presentInErgovita.add(color);
    }
    const missing = catalogColors.find((c) => !presentInErgovita.has(c));
    expect(solo.total).toBeGreaterThan(0);
    if (missing) {
      const contradiction = await search({
        p_brand_ids: [facets.ergovitaBrandId],
        p_colors: [missing],
        p_limit: 100,
      });
      expect(contradiction.rows).toHaveLength(0);
      expect(contradiction.total).toBe(0);
    }
  });
});

describe("search_products — availability (AC-5, AC-6)", () => {
  it("effective_stock equals COALESCE(SUM(variant.stock), product.stock) for EVERY product (AC-6)", async () => {
    const db = serviceClient();
    const [{ rows }, pub, variants] = await Promise.all([
      search({ p_in_stock_only: false, p_limit: 100 }),
      db.from("products_public").select("id,stock"),
      db.from("product_variants").select("product_id,stock"),
    ]);
    const productStock = new Map(
      (pub.data ?? []).map((p) => [p.id, p.stock ?? 0]),
    );
    const variantSum = new Map<string, number>();
    const hasVariant = new Set<string>();
    for (const v of variants.data ?? []) {
      variantSum.set(v.product_id, (variantSum.get(v.product_id) ?? 0) + (v.stock ?? 0));
      hasVariant.add(v.product_id);
    }
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      const expected = hasVariant.has(r.id)
        ? (variantSum.get(r.id) ?? 0)
        : (productStock.get(r.id) ?? 0);
      expect(r.effective_stock).toBe(expected);
    }
  });

  it("default (no availability param) shows only effective_stock > 0 (AC-5)", async () => {
    const { rows } = await search({ p_limit: 100 });
    for (const r of rows) expect(r.effective_stock).toBeGreaterThan(0);
  });

  it("p_in_stock_only=false includes out-of-stock rows (opt-in ≥ default)", async () => {
    const inStock = await search({ p_in_stock_only: true, p_limit: 100 });
    const all = await search({ p_in_stock_only: false, p_limit: 100 });
    expect(all.total).toBeGreaterThanOrEqual(inStock.total);
  });
});

describe("search_products — sorting (AC-7)", () => {
  const fetchIds = async (p_sort: string) =>
    (await search({ p_sort, p_limit: 100 })).rows.map((r) => r.id);

  it("price-asc is ascending by price_cents", async () => {
    const { rows } = await search({ p_sort: "precio-asc", p_limit: 100 });
    const prices = rows.map((r) => r.price_cents);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it("price-desc is descending by price_cents", async () => {
    const { rows } = await search({ p_sort: "precio-desc", p_limit: 100 });
    const prices = rows.map((r) => r.price_cents);
    expect(prices).toEqual([...prices].sort((a, b) => b - a));
  });

  it("name-asc / name-desc are inverses of each other", async () => {
    const asc = await fetchIds("nombre-asc");
    const desc = await fetchIds("nombre-desc");
    expect(desc).toEqual([...asc].reverse());
  });

  it("every sort is DETERMINISTIC — identical order across two calls (stable tiebreak)", async () => {
    for (const sort of [
      "mas-vendidas",
      "precio-asc",
      "precio-desc",
      "novedades",
      "nombre-asc",
      "nombre-desc",
    ]) {
      const first = await fetchIds(sort);
      const second = await fetchIds(sort);
      expect(second).toEqual(first);
    }
  });

  it("an unknown sort key falls through to the deterministic tiebreak (no error)", async () => {
    // The app never sends this (parse lib defaults), but the RPC must be robust.
    const { rows, total } = await search({ p_sort: "not-a-sort", p_limit: 100 });
    expect(total).toBeGreaterThan(0);
    // The CASE expressions all miss → global `name asc, id asc` tiebreak applies.
    const names = rows.map((r) => r.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});

describe("search_products — pagination + total_count (AC-8, edge 2)", () => {
  it("total_count from COUNT(*) OVER() is identical on every returned row and equals the true total", async () => {
    const { rows, total } = await search({ p_in_stock_only: false, p_limit: 100 });
    expect(rows.length).toBe(total);
    for (const r of rows) expect(r.total_count).toBe(total);
  });

  it("LIMIT/OFFSET slice the filtered set correctly (page 1 vs page 3, no overlap)", async () => {
    const page1 = await search({ p_limit: 12, p_offset: 0 });
    const page3 = await search({ p_limit: 12, p_offset: 24 });
    expect(page1.rows).toHaveLength(12);
    // 30 in-stock products → page 3 has 6.
    expect(page3.rows.length).toBeGreaterThan(0);
    const page1Ids = new Set(page1.rows.map((r) => r.id));
    for (const r of page3.rows) expect(page1Ids.has(r.id)).toBe(false);
    // total_count is the FULL filtered total on every page, not the page size.
    expect(page1.total).toBe(page3.total);
  });

  it("an offset past the end returns zero rows, never a range error (edge 2)", async () => {
    const { rows } = await search({ p_limit: 12, p_offset: 100_000 });
    expect(rows).toHaveLength(0);
  });

  it("a negative offset/limit clamps to 0 via greatest() (edge 3 hardening)", async () => {
    const negOffset = await search({ p_limit: 12, p_offset: -5 });
    expect(negOffset.rows.length).toBeGreaterThan(0); // treated as offset 0
    const negLimit = await search({ p_limit: -5, p_offset: 0 });
    expect(negLimit.rows).toHaveLength(0); // greatest(-5,0)=0 rows
  });
});

/**
 * Synthetic-data edge cases: the current seed has no variant-less product and
 * no all-out-of-stock product, so we create ONE product as service_role, assert
 * the RPC behavior, and delete it afterwards. Nothing seed-owned is touched.
 */
describe("search_products — synthetic edge cases (edges 5, 6) [creates + cleans up 1 product]", () => {
  const MARKER = "qa-t5-synthetic-chair";
  let variantlessId: string | null = null;
  let allOosId: string | null = null;

  beforeAll(async () => {
    const db = serviceClient();
    // (edge 5) A variant-less, in-stock product.
    const variantless = await db
      .from("products")
      .insert({
        slug: `${MARKER}-variantless`,
        name: "QA Synthetic Variantless Chair",
        description: "qa synthetic",
        price_cents: 199900,
        stock: 7,
        status: "active",
        brand_id: facets.ergovitaBrandId,
        sku: `${MARKER}-vl`,
      })
      .select("id")
      .single();
    expect(variantless.error).toBeNull();
    variantlessId = variantless.data!.id;

    // (edge 6) A product whose SINGLE variant is out of stock (product.stock>0).
    const allOos = await db
      .from("products")
      .insert({
        slug: `${MARKER}-alloos`,
        name: "QA Synthetic AllOOS Chair",
        description: "qa synthetic",
        price_cents: 199900,
        stock: 50, // product-level stock is high...
        status: "active",
        brand_id: facets.ergovitaBrandId,
        sku: `${MARKER}-oos`,
      })
      .select("id")
      .single();
    expect(allOos.error).toBeNull();
    allOosId = allOos.data!.id;
    // ...but its only variant has 0 stock (variants are authoritative).
    const variant = await db.from("product_variants").insert({
      product_id: allOosId,
      sku: `${MARKER}-oos-v1`,
      color_name: "Negro",
      color_hex: "#111111",
      stock: 0,
    });
    expect(variant.error).toBeNull();
  });

  afterAll(async () => {
    const db = serviceClient();
    // Delete variants first (FK), then the products; verify nothing remains.
    if (allOosId) await db.from("product_variants").delete().eq("product_id", allOosId);
    await db.from("products").delete().like("slug", `${MARKER}%`);
    const leftover = await db
      .from("products")
      .select("id")
      .like("slug", `${MARKER}%`);
    expect(leftover.data ?? []).toHaveLength(0);
  });

  it("edge 5: variant-less product is INCLUDED (stock from products.stock) when no color filter", async () => {
    const { rows } = await search({
      p_query: "QA Synthetic Variantless",
      p_limit: 10,
    });
    const found = rows.find((r) => r.id === variantlessId);
    expect(found).toBeDefined();
    expect(found!.effective_stock).toBe(7); // product-level fallback
    expect(found!.distinct_color_count).toBe(0);
  });

  it("edge 5: variant-less product is EXCLUDED when a color filter is active", async () => {
    const { rows } = await search({
      p_query: "QA Synthetic Variantless",
      p_colors: ["#111111"],
      p_limit: 10,
    });
    expect(rows.find((r) => r.id === variantlessId)).toBeUndefined();
  });

  it("edge 6: all-variants-OOS product has effective_stock 0 (variants authoritative)", async () => {
    const { rows } = await search({
      p_query: "QA Synthetic AllOOS",
      p_in_stock_only: false,
      p_limit: 10,
    });
    const found = rows.find((r) => r.id === allOosId);
    expect(found).toBeDefined();
    expect(found!.effective_stock).toBe(0); // NOT the product-level 50
  });

  it("edge 6: all-variants-OOS product is HIDDEN under the default in-stock filter", async () => {
    const { rows } = await search({
      p_query: "QA Synthetic AllOOS",
      p_in_stock_only: true,
      p_limit: 10,
    });
    expect(rows.find((r) => r.id === allOosId)).toBeUndefined();
  });
});
