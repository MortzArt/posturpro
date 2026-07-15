/**
 * T11 inventory RPC integration (AC-25/26, edge 6) against a LIVE local
 * Supabase. Exercises `record_inventory_adjustment` end-to-end: it updates the
 * authoritative stock AND writes a ledger row ATOMICALLY, and rejects a result
 * below zero (the ledger never diverges from `products.stock`). Destructive —
 * relies on `supabase db reset` + seed (run-integration.sh).
 */
import { afterEach, describe, expect, it } from "vitest";
import { serviceClient } from "./local-supabase";

const db = serviceClient();

async function firstProduct(): Promise<{ id: string; stock: number }> {
  const { data, error } = await db.from("products").select("id, stock").limit(1).single();
  expect(error).toBeNull();
  return data as { id: string; stock: number };
}

describe("record_inventory_adjustment RPC (live local DB)", () => {
  afterEach(async () => {
    await db.from("inventory_adjustments").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  });

  it("applies a positive delta atomically (stock + ledger stay consistent)", async () => {
    const product = await firstProduct();
    const { data, error } = await db.rpc("record_inventory_adjustment", {
      p_product_id: product.id,
      p_variant_id: null,
      p_delta: 5,
      p_absolute: null,
      p_reason: "Recuento físico",
    });
    expect(error).toBeNull();
    const result = data as { resulting_stock: number; delta: number };
    expect(result.delta).toBe(5);
    expect(result.resulting_stock).toBe(product.stock + 5);

    const { data: after } = await db.from("products").select("stock").eq("id", product.id).single();
    expect(after?.stock).toBe(product.stock + 5);

    const { data: ledger } = await db
      .from("inventory_adjustments")
      .select("delta, resulting_stock, reason")
      .eq("product_id", product.id);
    expect(ledger).toHaveLength(1);
    expect(ledger?.[0]).toMatchObject({ delta: 5, resulting_stock: product.stock + 5, reason: "Recuento físico" });

    // Restore the seed stock so the suite stays idempotent.
    await db.rpc("record_inventory_adjustment", {
      p_product_id: product.id,
      p_variant_id: null,
      p_delta: -5,
      p_absolute: null,
      p_reason: "revert",
    });
  });

  it("sets an absolute total and derives the ledger delta", async () => {
    const product = await firstProduct();
    const { data, error } = await db.rpc("record_inventory_adjustment", {
      p_product_id: product.id,
      p_variant_id: null,
      p_delta: null,
      p_absolute: product.stock + 3,
      p_reason: "Inventario físico",
    });
    expect(error).toBeNull();
    const result = data as { resulting_stock: number; delta: number };
    expect(result.resulting_stock).toBe(product.stock + 3);
    expect(result.delta).toBe(3);
    // revert
    await db.rpc("record_inventory_adjustment", {
      p_product_id: product.id, p_variant_id: null, p_delta: -3, p_absolute: null, p_reason: "revert",
    });
  });

  it("rejects a result below zero and writes NOTHING (no ledger row)", async () => {
    const product = await firstProduct();
    const { error } = await db.rpc("record_inventory_adjustment", {
      p_product_id: product.id,
      p_variant_id: null,
      p_delta: -(product.stock + 1000),
      p_absolute: null,
      p_reason: "over-decrement",
    });
    expect(error).not.toBeNull();

    const { data: after } = await db.from("products").select("stock").eq("id", product.id).single();
    expect(after?.stock).toBe(product.stock); // unchanged
    const { count } = await db
      .from("inventory_adjustments")
      .select("id", { count: "exact", head: true })
      .eq("product_id", product.id);
    expect(count).toBe(0); // no ledger row on rejection
  });

  it("rejects a blank reason (DB CHECK backstop)", async () => {
    const product = await firstProduct();
    const { error } = await db.rpc("record_inventory_adjustment", {
      p_product_id: product.id, p_variant_id: null, p_delta: 1, p_absolute: null, p_reason: "   ",
    });
    expect(error).not.toBeNull();
  });
});
