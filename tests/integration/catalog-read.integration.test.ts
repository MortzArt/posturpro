import { describe, expect, it } from "vitest";
import { anonClient } from "./local-supabase";

/**
 * Catalog READ-PATH integration (T3 AC-1, AC-2, AC-13) — NON-DESTRUCTIVE.
 *
 * Unlike the sibling integration suites (orders/questions) this file performs
 * ZERO writes and does NOT depend on `supabase db reset`: it reads only, against
 * whatever the local instance is currently seeded with, so it is safe to run
 * while a dev server is browsing the same database. It verifies the live
 * PostgREST contract the mocked `queries.test.ts` cannot:
 *   1. `products_public` embeds `brands(...)` cleanly through the view FK, and
 *      the payload NEVER carries `cost_price_cents` (the view omits it).
 *   2. The child tables (`product_images`, `product_variants`,
 *      `product_categories`) are readable by anon via `IN (...)` batches keyed
 *      by product id — i.e. the "separate batched read" half of the strategy
 *      returns consistent shapes for the same product-id set.
 *   3. A category parent (`oficina`) aggregates its nested child (`ejecutivas`)
 *      products — the seed assigns ejecutivas products to BOTH (edge case 4/8).
 *
 * The anon client is exactly the RLS-enforced role the storefront's publishable
 * key gets, so this also proves the anon RLS grants are correct for the read.
 */
describe("catalog read path (live local DB, read-only)", () => {
  it("embeds brands through products_public and never exposes cost_price_cents (AC-13)", async () => {
    const db = anonClient();
    const { data, error } = await db
      .from("products_public")
      .select("id,slug,name,price_cents,brands(name,slug,logo_url)")
      .eq("status", "active")
      .limit(5);

    expect(error).toBeNull();
    expect(data && data.length).toBeGreaterThan(0);

    for (const row of data ?? []) {
      // The view forwards the brand FK → embed resolves to a to-one object.
      expect(row.brands).not.toBeNull();
      // cost_price_cents must be absent from the raw payload (view omits it).
      expect(Object.keys(row)).not.toContain("cost_price_cents");
    }
    // Serialized payload carries no cost field at all.
    expect(JSON.stringify(data)).not.toContain("cost_price_cents");
  });

  it("base products table is NOT readable by anon (only the view is) — AC-13/RLS", async () => {
    const db = anonClient();
    const { data, error } = await db
      .from("products")
      .select("id,cost_price_cents")
      .limit(1);
    // RLS denies the base table → either an error or an empty result, but the
    // cost column can never come back with a row.
    const leaked = (data ?? []).some(
      (row) => (row as { cost_price_cents?: number }).cost_price_cents != null,
    );
    expect(leaked).toBe(false);
    if (!error) {
      expect(data ?? []).toHaveLength(0);
    }
  });

  it("returns consistent child batches (images + variants) for a product-id set", async () => {
    const db = anonClient();
    const { data: products } = await db
      .from("products_public")
      .select("id")
      .eq("status", "active")
      .limit(5);
    const ids = (products ?? [])
      .map((p) => p.id)
      .filter((id): id is string => typeof id === "string");
    expect(ids.length).toBeGreaterThan(0);

    const [images, variants] = await Promise.all([
      db
        .from("product_images")
        .select("product_id,url,is_primary,sort_order")
        .in("product_id", ids),
      db
        .from("product_variants")
        .select("product_id,stock,color_hex")
        .in("product_id", ids),
    ]);

    expect(images.error).toBeNull();
    expect(variants.error).toBeNull();
    // Every returned child row belongs to the requested id set (no bleed).
    for (const img of images.data ?? []) {
      expect(ids).toContain(img.product_id);
    }
    for (const v of variants.data ?? []) {
      expect(ids).toContain(v.product_id);
    }
    // Seed guarantees at least one primary cover image among these products.
    expect((images.data ?? []).some((img) => img.is_primary)).toBe(true);
  });

  it("parent category oficina aggregates its nested ejecutivas products (AC-2, edge case 4/8)", async () => {
    const db = anonClient();
    const oficina = await db
      .from("categories")
      .select("id")
      .eq("slug", "oficina")
      .single();
    const ejecutivas = await db
      .from("categories")
      .select("id,parent_id")
      .eq("slug", "ejecutivas")
      .single();

    expect(oficina.error).toBeNull();
    expect(ejecutivas.error).toBeNull();
    // ejecutivas is nested under oficina.
    expect(ejecutivas.data?.parent_id).toBe(oficina.data?.id);

    const oficinaMembers = await db
      .from("product_categories")
      .select("product_id")
      .eq("category_id", oficina.data!.id);
    const ejecutivasMembers = await db
      .from("product_categories")
      .select("product_id")
      .eq("category_id", ejecutivas.data!.id);

    const oficinaIds = new Set(
      (oficinaMembers.data ?? []).map((r) => r.product_id),
    );
    const ejecutivasIds = (ejecutivasMembers.data ?? []).map(
      (r) => r.product_id,
    );
    expect(ejecutivasIds.length).toBeGreaterThan(0);
    // Every ejecutivas product is also a member of oficina (seed assigns both).
    for (const id of ejecutivasIds) {
      expect(oficinaIds.has(id)).toBe(true);
    }
    // oficina therefore has at least as many members as its child.
    expect(oficinaIds.size).toBeGreaterThanOrEqual(ejecutivasIds.length);
  });
});
