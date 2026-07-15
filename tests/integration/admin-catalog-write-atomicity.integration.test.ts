/**
 * T11 write-path ATOMICITY + cache-bust regression locks (Stage 6 fixes
 * M-1, M-2, M-3) against a LIVE local Supabase. These exercise the ACTUAL
 * `server-only` write modules (imported with `server-only` stubbed to a no-op
 * in the integration config) so the real compensation/rollback logic runs — not
 * a hand-replicated copy.
 *
 * `next/cache` is mocked so `bustCatalogTags` records the tag set instead of
 * throwing outside a request context — which also lets us assert M-2's old+new
 * taxonomy union.
 *
 * Each test would FAIL against the pre-fix code:
 *   - M-1: updateProduct had NO rollback → a failed link-sync left the product
 *     with ZERO categories. We assert the ORIGINAL categories survive.
 *   - M-2: the update bust ignored OLD slugs → moving a product between
 *     categories left the old facet stale. We assert BOTH old+new busted.
 *   - M-3: CSV upsertProduct committed the row before the link-sync → a link
 *     failure left a half-written product while reporting failure. We assert the
 *     new row is fully removed (create) and prior links survive (update).
 *
 * Destructive — cleans up after itself in afterAll.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Record every tag busted so we can assert M-2's union (and that success paths
// don't throw outside a request context).
const bustedTags: string[] = [];
vi.mock("next/cache", () => ({
  updateTag: (tag: string) => {
    bustedTags.push(tag);
  },
  revalidateTag: (tag: string) => {
    bustedTags.push(tag);
  },
}));

import { serviceClient } from "./local-supabase";
import { updateProduct } from "@/lib/admin/products/product-write";
import { upsertProduct, type TaxonomyMaps } from "@/lib/admin/csv/csv-import-write";
import type { ProductParsed } from "@/lib/admin/products/product-input";
import type { ImportProductValues } from "@/lib/admin/csv/csv-product-map";

const db = serviceClient();

const PRODUCT_SKUS = ["T11-ATOM-P1", "T11-ATOM-CSV-NEW", "T11-ATOM-CSV-UPD"];
const CATEGORY_SLUGS = ["t11-atom-cat-a", "t11-atom-cat-b"];
const MISSING_CATEGORY_ID = "00000000-0000-4000-8000-000000000000";

let catAId = "";
let catBId = "";

afterAll(async () => {
  await db.from("products").delete().in("sku", PRODUCT_SKUS);
  await db.from("categories").delete().in("slug", CATEGORY_SLUGS);
});

beforeEach(() => {
  bustedTags.length = 0;
});

/** Build a full ProductParsed with sane defaults + overrides. */
function parsed(overrides: Partial<ProductParsed>): ProductParsed {
  return {
    name: "T11 Atom",
    slug: "t11-atom-p1",
    description: null,
    brand_id: null,
    style_id: null,
    sku: "T11-ATOM-P1",
    price_cents: 100000,
    compare_at_price_cents: null,
    cost_price_cents: null,
    stock: 5,
    status: "active",
    width_mm: null,
    depth_mm: null,
    height_mm: null,
    seat_height_mm: null,
    weight_g: null,
    material_frame: null,
    material_upholstery: null,
    material_finish: null,
    is_featured: false,
    is_best_seller: false,
    ...overrides,
  };
}

/** Build ImportProductValues with defaults + overrides. */
function importRow(overrides: Partial<ImportProductValues>): ImportProductValues {
  return {
    slug: "t11-atom-csv",
    sku: "T11-ATOM-CSV",
    name: "CSV Row",
    description: null,
    brandSlug: null,
    styleSlug: null,
    categorySlugs: [],
    tagNames: [],
    price_cents: 100000,
    compare_at_price_cents: null,
    cost_price_cents: null,
    stock: 1,
    status: "active",
    width_mm: null,
    depth_mm: null,
    height_mm: null,
    seat_height_mm: null,
    weight_g: null,
    material_frame: null,
    material_upholstery: null,
    material_finish: null,
    ...overrides,
  };
}

async function categoryIdsFor(productId: string): Promise<string[]> {
  const { data } = await db
    .from("product_categories")
    .select("category_id")
    .eq("product_id", productId);
  return (data ?? []).map((row) => row.category_id).sort();
}

/** A taxonomy map whose category slug resolves to a NON-EXISTENT id → forces a
 * FK violation on the product_categories insert (the within-row link failure). */
function poisonedMaps(): TaxonomyMaps {
  return {
    brandBySlug: new Map(),
    styleBySlug: new Map(),
    categoryBySlug: new Map([["poison", MISSING_CATEGORY_ID]]),
  };
}

describe("T11 write-path atomicity + bust (live local DB)", () => {
  it("seeds two categories + one product in category A", async () => {
    const cats = await db
      .from("categories")
      .insert([
        { slug: CATEGORY_SLUGS[0], name: "Atom A" },
        { slug: CATEGORY_SLUGS[1], name: "Atom B" },
      ])
      .select("id, slug");
    expect(cats.error).toBeNull();
    catAId = cats.data!.find((row) => row.slug === CATEGORY_SLUGS[0])!.id;
    catBId = cats.data!.find((row) => row.slug === CATEGORY_SLUGS[1])!.id;

    const product = await db
      .from("products")
      .insert({ slug: "t11-atom-p1", name: "T11 Atom", sku: "T11-ATOM-P1", price_cents: 100000, status: "active" })
      .select("id")
      .single();
    expect(product.error).toBeNull();

    const link = await db
      .from("product_categories")
      .insert({ product_id: product.data!.id, category_id: catAId });
    expect(link.error).toBeNull();
  });

  it("M-1: a failed link-sync on updateProduct RESTORES the original categories (no zero-category corruption)", async () => {
    const product = await db.from("products").select("id").eq("sku", "T11-ATOM-P1").single();
    const productId = product.data!.id;

    // Force syncCategories to fail: a non-existent category id → 23503 on insert
    // (after the delete of existing links has already run).
    const result = await updateProduct(
      productId,
      "t11-atom-p1",
      parsed({ name: "T11 Atom (edited)" }),
      [MISSING_CATEGORY_ID],
      [],
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("write-failed");

    // The prior category link (A) must be restored — NOT left at zero.
    expect(await categoryIdsFor(productId)).toEqual([catAId]);
  });

  it("M-2: updateProduct busts BOTH the old and new category facet tags", async () => {
    const product = await db.from("products").select("id").eq("sku", "T11-ATOM-P1").single();
    const productId = product.data!.id;

    // Move the product from category A → category B (a valid update; succeeds).
    const result = await updateProduct(productId, "t11-atom-p1", parsed({}), [catBId], []);
    expect(result.ok).toBe(true);

    // The union of OLD (A) + NEW (B) category facet tags must both be busted.
    expect(bustedTags).toContain(`category:${CATEGORY_SLUGS[0]}`);
    expect(bustedTags).toContain(`category:${CATEGORY_SLUGS[1]}`);

    // And the DB reflects the move.
    expect(await categoryIdsFor(productId)).toEqual([catBId]);
  });

  it("M-3 (create): a within-row link failure fully DELETES the just-inserted product", async () => {
    const row = importRow({
      slug: "t11-atom-csv-new",
      sku: "T11-ATOM-CSV-NEW",
      name: "CSV New",
      categorySlugs: ["poison"], // resolves to a missing id → FK violation
    });

    await expect(upsertProduct(db, row, poisonedMaps())).rejects.toBeDefined();

    // The row must NOT persist — the insert was rolled back (no half-write).
    const created = await db.from("products").select("id").eq("sku", "T11-ATOM-CSV-NEW").maybeSingle();
    expect(created.data).toBeNull();
  });

  it("M-3 (update): a within-row link failure RESTORES the prior links on an existing product", async () => {
    // Seed an existing product already linked to category A.
    const seeded = await db
      .from("products")
      .insert({ slug: "t11-atom-csv-upd", name: "CSV Upd", sku: "T11-ATOM-CSV-UPD", price_cents: 100000, status: "active" })
      .select("id")
      .single();
    expect(seeded.error).toBeNull();
    const productId = seeded.data!.id;
    await db.from("product_categories").insert({ product_id: productId, category_id: catAId });

    const row = importRow({
      slug: "t11-atom-csv-upd",
      sku: "T11-ATOM-CSV-UPD",
      name: "CSV Upd Edited",
      categorySlugs: ["poison"], // missing id → FK violation mid-sync
    });

    await expect(upsertProduct(db, row, poisonedMaps())).rejects.toBeDefined();

    // Prior links (A) must be restored — not wiped by the failed re-sync.
    expect(await categoryIdsFor(productId)).toEqual([catAId]);
  });
});
