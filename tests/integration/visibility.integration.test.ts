/**
 * Catalog visibility + updated_at trigger behavior (AC-6, AC-12) against a live
 * local Supabase. Verifies that non-active products (and their variants/images)
 * are hidden from the anon role, and that the set_updated_at() trigger bumps
 * updated_at on UPDATE. All fixtures are created + torn down by the service
 * client so the suite is repeatable.
 */
import { afterEach, describe, expect, it } from "vitest";
import { anonClient, serviceClient } from "./local-supabase";

const anon = anonClient();
const service = serviceClient();

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

const createdProductSlugs: string[] = [];

afterEach(async () => {
  if (createdProductSlugs.length > 0) {
    await service
      .from("products")
      .delete()
      .in("slug", createdProductSlugs.splice(0));
  }
});

async function createProduct(status: "draft" | "active" | "archived") {
  const slug = `qa-vis-${status}-${uid()}`;
  createdProductSlugs.push(slug);
  const { data, error } = await service
    .from("products")
    .insert({
      slug,
      name: `QA Visibility ${status}`,
      sku: `QA-${uid().toUpperCase()}`,
      price_cents: 100_000,
      cost_price_cents: 50_000,
      status,
    } as never)
    .select("id, slug")
    .single();
  expect(error, `creating ${status} product`).toBeNull();
  return data as { id: string; slug: string };
}

describe("draft/archived products are hidden from anon (AC-12)", () => {
  it("hides a draft product from products_public", async () => {
    const product = await createProduct("draft");
    const { data, error } = await anon
      .from("products_public")
      .select("id")
      .eq("id", product.id);
    expect(error).toBeNull();
    expect(data?.length).toBe(0);
  });

  it("hides an archived product from products_public", async () => {
    const product = await createProduct("archived");
    const { data, error } = await anon
      .from("products_public")
      .select("id")
      .eq("id", product.id);
    expect(error).toBeNull();
    expect(data?.length).toBe(0);
  });

  it("shows a newly-created active product to anon", async () => {
    const product = await createProduct("active");
    const { data, error } = await anon
      .from("products_public")
      .select("id")
      .eq("id", product.id);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });

  it("hides variants of a draft product from anon", async () => {
    const product = await createProduct("draft");
    const { error: vErr } = await service.from("product_variants").insert({
      product_id: product.id,
      sku: `QA-V-${uid()}`,
      color_name: "Negro",
      color_hex: "#111111",
      stock: 1,
    } as never);
    expect(vErr).toBeNull();
    const { data } = await anon
      .from("product_variants")
      .select("id")
      .eq("product_id", product.id);
    expect(data?.length ?? 0).toBe(0);
  });
});

describe("set_updated_at() trigger (schema hygiene)", () => {
  it("bumps updated_at when a product row is updated", async () => {
    const product = await createProduct("active");
    const before = await service
      .from("products")
      .select("updated_at")
      .eq("id", product.id)
      .single();
    // Small delay so the timestamp can differ.
    await new Promise((resolve) => setTimeout(resolve, 25));
    await service
      .from("products")
      .update({ name: "QA Visibility active (edited)" })
      .eq("id", product.id);
    const after = await service
      .from("products")
      .select("updated_at")
      .eq("id", product.id)
      .single();
    expect(before.error).toBeNull();
    expect(after.error).toBeNull();
    expect(
      new Date(after.data?.updated_at ?? 0).getTime(),
    ).toBeGreaterThan(new Date(before.data?.updated_at ?? 0).getTime());
  });
});

describe("order_items snapshot survives product deletion (edge case 8)", () => {
  it("nulls the product FK but keeps the snapshot columns", async () => {
    const product = await createProduct("active");
    // Create an order + item referencing the product.
    const order = (
      await service
        .from("orders")
        .insert({
          order_number: `SNAP-${uid()}`,
          contact_email: "snap@example.com",
          shipping_full_name: "Snap",
          shipping_address_line1: "L1",
          shipping_city: "CDMX",
          shipping_state: "CDMX",
          shipping_postal_code: "01000",
          subtotal_cents: 100_000,
          shipping_cents: 0,
          discount_cents: 0,
          tax_cents: 0,
          total_cents: 100_000,
        } as never)
        .select("id")
        .single()
    ).data as { id: string };

    await service.from("order_items").insert({
      order_id: order.id,
      product_id: product.id,
      product_name: "Snapshot Name",
      product_sku: "SNAP-SKU",
      unit_price_cents: 100_000,
      quantity: 1,
      line_total_cents: 100_000,
    } as never);

    // Delete the product; the item must survive with product_id null.
    await service.from("products").delete().eq("id", product.id);
    createdProductSlugs.length = 0; // already deleted

    const { data, error } = await service
      .from("order_items")
      .select("product_id, product_name, product_sku, line_total_cents")
      .eq("order_id", order.id)
      .single();
    expect(error).toBeNull();
    expect(data?.product_id).toBeNull();
    expect(data?.product_name).toBe("Snapshot Name");
    expect(data?.product_sku).toBe("SNAP-SKU");

    // Cleanup the order.
    await service.from("orders").delete().eq("id", order.id);
  });
});
