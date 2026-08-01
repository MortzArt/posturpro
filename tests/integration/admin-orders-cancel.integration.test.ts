/**
 * cancel_order RPC integration tests (T12 AC-13/14/15, edges 3/4/11) against a
 * LIVE local Supabase, through the service-role client (exactly what the admin
 * write layer uses). cancel_order is a NEW single-SQL transaction (0012) mirroring
 * create_order's decrement in reverse. Verifies:
 *   - stock restore for a VARIANT line (product_variants.stock += snapshot qty).
 *   - stock restore for a NO-VARIANT line (products.stock += snapshot qty).
 *   - status → cancelled + a history row with transition_kind='cancelled'.
 *   - payment_status is left UNTOUCHED (edge 6 — a paid-cancelled order stays refundable).
 *   - idempotent re-cancel: NO second stock restore, NO duplicate history row (AC-13).
 *   - cancel AFTER shipped still restores + cancels (rank 5 is highest, no regression, edge 3).
 *   - a since-deleted product/variant (FK set null) is SKIPPED without failing (edge 11 / AC-14).
 *   - order_not_found for a random id (typed no-op, never an error).
 *   - least privilege: anon cannot call the RPC.
 *
 * Every test creates its own order + line items directly and deletes them after
 * (items + history cascade), restoring any stock it perturbed so the seed is
 * untouched and the suite is repeatable.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { serviceClient } from "./local-supabase";

const db = serviceClient();

interface SeedVariant {
  variantId: string;
  productId: string;
  productSku: string;
  productName: string;
  colorName: string;
  unitPriceCents: number;
}

let variant: SeedVariant; // a well-stocked variant for restore assertions

beforeAll(async () => {
  const { data, error } = await db
    .from("product_variants")
    .select("id, product_id, sku, color_name, price_override_cents, stock, products!inner(name, price_cents, status, sku)")
    .gte("stock", 1)
    .eq("products.status", "active")
    .limit(1)
    .single();
  if (error || !data) throw new Error(`no seed variant: ${error?.message}`);
  const product = data.products as unknown as { name: string; price_cents: number; sku: string };
  variant = {
    variantId: data.id,
    productId: data.product_id,
    productSku: data.sku ?? product.sku,
    productName: product.name,
    colorName: data.color_name,
    unitPriceCents: data.price_override_cents ?? product.price_cents,
  };
});

const createdOrderIds: string[] = [];

afterEach(async () => {
  if (createdOrderIds.length > 0) {
    await db.from("orders").delete().in("id", createdOrderIds.splice(0));
  }
});

/** Insert a bare paid order (no create_order side effects) to cancel. */
async function makePaidOrder(status: "paid" | "shipped" = "paid"): Promise<string> {
  const { data, error } = await db
    .from("orders")
    .insert({
      order_number: `PP-CX-${randomUUID().slice(0, 8)}`,
      contact_email: "cancel-it@example.com",
      shipping_full_name: "Cancel Test",
      shipping_address_line1: "Line 1",
      shipping_city: "City",
      shipping_state: "Jalisco",
      shipping_postal_code: "44100",
      subtotal_cents: 10000,
      shipping_cents: 0,
      discount_cents: 0,
      tax_base_cents: 10000,
      tax_cents: 0,
      total_cents: 10000,
      status,
      payment_status: "paid",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`could not create order: ${error?.message}`);
  createdOrderIds.push(data.id);
  return data.id;
}

/** Add one order_items line (variant-scoped unless variantId=null). */
async function addLine(
  orderId: string,
  quantity: number,
  opts: { productId: string | null; variantId: string | null },
): Promise<void> {
  const { error } = await db.from("order_items").insert({
    order_id: orderId,
    product_id: opts.productId,
    variant_id: opts.variantId,
    product_name: variant.productName,
    product_sku: variant.productSku,
    variant_label: variant.colorName,
    unit_price_cents: variant.unitPriceCents,
    quantity,
    line_total_cents: variant.unitPriceCents * quantity,
  });
  if (error) throw new Error(`could not add line: ${error.message}`);
}

async function variantStock(id: string): Promise<number> {
  const { data } = await db.from("product_variants").select("stock").eq("id", id).single();
  return data?.stock ?? -1;
}
async function productStock(id: string): Promise<number> {
  const { data } = await db.from("products").select("stock").eq("id", id).single();
  return data?.stock ?? -1;
}
interface CancelResult {
  applied: boolean;
  reason: string;
  from_status: string | null;
}
async function callCancel(orderId: string, note: string | null = null) {
  const { data, error } = await db.rpc("cancel_order", { p_order_id: orderId, p_note: note });
  return { data: data as CancelResult | null, error };
}

describe("cancel_order — stock restore (AC-13/14)", () => {
  it("restores a VARIANT line's snapshot quantity to product_variants.stock", async () => {
    const before = await variantStock(variant.variantId);
    const orderId = await makePaidOrder();
    await addLine(orderId, 3, { productId: variant.productId, variantId: variant.variantId });

    const { data, error } = await callCancel(orderId, "cliente canceló");
    expect(error).toBeNull();
    expect(data).toMatchObject({ applied: true, reason: "cancelled", from_status: "paid" });
    expect(await variantStock(variant.variantId)).toBe(before + 3);

    // Restore.
    await db.from("product_variants").update({ stock: before }).eq("id", variant.variantId);
  });

  it("restores a NO-VARIANT line to products.stock", async () => {
    const before = await productStock(variant.productId);
    const orderId = await makePaidOrder();
    await addLine(orderId, 2, { productId: variant.productId, variantId: null });

    const { data } = await callCancel(orderId, null);
    expect(data).toMatchObject({ applied: true, reason: "cancelled" });
    expect(await productStock(variant.productId)).toBe(before + 2);

    await db.from("products").update({ stock: before }).eq("id", variant.productId);
  });

  it("leaves payment_status UNTOUCHED (edge 6 — a paid-cancelled order stays refundable)", async () => {
    const before = await variantStock(variant.variantId);
    const orderId = await makePaidOrder();
    await addLine(orderId, 1, { productId: variant.productId, variantId: variant.variantId });
    await callCancel(orderId, null);

    const { data: order } = await db.from("orders").select("status, payment_status").eq("id", orderId).single();
    expect(order).toMatchObject({ status: "cancelled", payment_status: "paid" });

    await db.from("product_variants").update({ stock: before }).eq("id", variant.variantId);
  });

  it("writes a history row with transition_kind='cancelled' and the note", async () => {
    const before = await variantStock(variant.variantId);
    const orderId = await makePaidOrder();
    await addLine(orderId, 1, { productId: variant.productId, variantId: variant.variantId });
    await callCancel(orderId, "razón de prueba");

    const { data: history } = await db
      .from("order_status_history")
      .select("from_status, to_status, transition_kind, note")
      .eq("order_id", orderId);
    expect(history).toEqual([
      { from_status: "paid", to_status: "cancelled", transition_kind: "cancelled", note: "razón de prueba" },
    ]);

    await db.from("product_variants").update({ stock: before }).eq("id", variant.variantId);
  });
});

describe("cancel_order — idempotent re-cancel (AC-13, edge 4)", () => {
  it("a second cancel is a noop: NO second stock restore, NO duplicate history row", async () => {
    const before = await variantStock(variant.variantId);
    const orderId = await makePaidOrder();
    await addLine(orderId, 2, { productId: variant.productId, variantId: variant.variantId });

    const first = await callCancel(orderId, "first");
    expect(first.data).toMatchObject({ applied: true, reason: "cancelled" });
    expect(await variantStock(variant.variantId)).toBe(before + 2);

    // Re-cancel: idempotent no-op.
    const second = await callCancel(orderId, "second");
    expect(second.data).toMatchObject({ applied: false, reason: "noop", from_status: "cancelled" });
    // Stock did NOT restore a second time.
    expect(await variantStock(variant.variantId)).toBe(before + 2);

    const { data: history } = await db.from("order_status_history").select("id").eq("order_id", orderId);
    expect(history).toHaveLength(1); // no duplicate history row

    await db.from("product_variants").update({ stock: before }).eq("id", variant.variantId);
  });
});

describe("cancel_order — cancel after shipped (edge 3)", () => {
  it("still restores stock + marks cancelled (rank 5, no regression block)", async () => {
    const before = await variantStock(variant.variantId);
    const orderId = await makePaidOrder("shipped");
    await addLine(orderId, 1, { productId: variant.productId, variantId: variant.variantId });

    const { data } = await callCancel(orderId, "devuelto");
    expect(data).toMatchObject({ applied: true, reason: "cancelled", from_status: "shipped" });
    expect(await variantStock(variant.variantId)).toBe(before + 1);

    const { data: order } = await db.from("orders").select("status").eq("id", orderId).single();
    expect(order).toMatchObject({ status: "cancelled" });

    await db.from("product_variants").update({ stock: before }).eq("id", variant.variantId);
  });
});

describe("cancel_order — since-deleted FK skip (edge 11 / AC-14)", () => {
  it("skips a line with BOTH product_id + variant_id null without failing the cancel", async () => {
    const orderId = await makePaidOrder();
    // A line whose product + variant were both since-deleted (FK on delete set null).
    await addLine(orderId, 5, { productId: null, variantId: null });

    const { data, error } = await callCancel(orderId, null);
    expect(error).toBeNull();
    expect(data).toMatchObject({ applied: true, reason: "cancelled" });

    // The order IS cancelled; no stock row to restore, no crash.
    const { data: order } = await db.from("orders").select("status").eq("id", orderId).single();
    expect(order).toMatchObject({ status: "cancelled" });
  });

  it("restores the LIVE line while skipping the null-FK line in the same cancel", async () => {
    const before = await variantStock(variant.variantId);
    const orderId = await makePaidOrder();
    await addLine(orderId, 2, { productId: variant.productId, variantId: variant.variantId }); // live
    await addLine(orderId, 9, { productId: null, variantId: null }); // since-deleted, skipped

    const { data } = await callCancel(orderId, null);
    expect(data).toMatchObject({ applied: true, reason: "cancelled" });
    // Only the live line's 2 units restored; the null-FK 9 units are skipped.
    expect(await variantStock(variant.variantId)).toBe(before + 2);

    await db.from("product_variants").update({ stock: before }).eq("id", variant.variantId);
  });
});

describe("cancel_order — not found + privilege", () => {
  it("returns order_not_found (typed, no error) for a random id", async () => {
    const { data, error } = await callCancel(randomUUID());
    expect(error).toBeNull();
    expect(data).toMatchObject({ applied: false, reason: "order_not_found", from_status: null });
  });

  it("is denied to the anon role (least privilege)", async () => {
    const { anonClient } = await import("./local-supabase");
    const anon = anonClient();
    const { error } = await anon.rpc("cancel_order", { p_order_id: randomUUID(), p_note: null });
    expect(error).not.toBeNull();
  });
});
