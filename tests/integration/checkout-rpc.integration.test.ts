/**
 * create_order RPC integration tests (T7 AC-9, AC-10, AC-11, AC-14, edges 2/6/8)
 * against a LIVE local Supabase. The RPC is the atomic reserve-and-create heart
 * of checkout, so it is exercised end-to-end through the service-role client
 * (exactly what the server action uses):
 *   - happy path: customer + order + items + status-history written; stock
 *     decremented; sales_count bumped; confirmation_token returned (AC-9/10/11).
 *   - idempotency: a repeat call with the same key returns the SAME order,
 *     reused:true, with NO second decrement (AC-14, edge 7).
 *   - out-of-stock: a line lacking live stock raises + FULL rollback — no order,
 *     no partial decrement, stock unchanged (AC-9, edge 2).
 *   - last-unit race: two concurrent calls for the last unit — exactly one wins.
 *   - discount redemption: an eligible code increments times_redeemed; an
 *     exhausted / expired code raises DISCOUNT_EXHAUSTED + rolls back (AC-6, m-2).
 *   - DB-CHECK backstop: a tampered total identity is rejected by the DB (edge 8).
 *
 * Every test restores the stock / sales_count / times_redeemed it perturbs and
 * deletes the orders it creates, so the suite is repeatable and leaves the seed
 * untouched.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { serviceClient } from "./local-supabase";
import type { CreateOrderPayload, CreateOrderResult } from "@/lib/supabase/database.types";

const db = serviceClient();

interface Variant {
  id: string;
  productId: string;
  productSku: string;
  productName: string;
  colorName: string;
  unitPriceCents: number;
  stock: number;
}

let inStock: Variant; // a comfortably-stocked variant
let zeroStock: Variant; // the seeded zero-stock variant

beforeAll(async () => {
  // A well-stocked active variant for the happy path (stock >= 3).
  const { data: rich, error: richErr } = await db
    .from("product_variants")
    .select("id, product_id, sku, color_name, price_override_cents, stock, products!inner(name, price_cents, status, sku)")
    .gte("stock", 3)
    .eq("products.status", "active")
    .limit(1)
    .single();
  if (richErr || !rich) throw new Error(`no in-stock variant: ${richErr?.message}`);
  const richProduct = rich.products as unknown as { name: string; price_cents: number; sku: string };
  inStock = {
    id: rich.id,
    productId: rich.product_id,
    productSku: rich.sku ?? richProduct.sku,
    productName: richProduct.name,
    colorName: rich.color_name,
    unitPriceCents: rich.price_override_cents ?? richProduct.price_cents,
    stock: rich.stock,
  };

  // The seeded zero-stock variant (T7 seed addition) for the oversell guard.
  const { data: zero, error: zeroErr } = await db
    .from("product_variants")
    .select("id, product_id, sku, color_name, price_override_cents, stock, products!inner(name, price_cents, sku)")
    .eq("stock", 0)
    .limit(1)
    .single();
  if (zeroErr || !zero) throw new Error(`no zero-stock variant seeded: ${zeroErr?.message}`);
  const zeroProduct = zero.products as unknown as { name: string; price_cents: number; sku: string };
  zeroStock = {
    id: zero.id,
    productId: zero.product_id,
    productSku: zero.sku ?? zeroProduct.sku,
    productName: zeroProduct.name,
    colorName: zero.color_name,
    unitPriceCents: zero.price_override_cents ?? zeroProduct.price_cents,
    stock: 0,
  };
});

const createdOrderIds: string[] = [];
const createdCustomerEmails: string[] = [];

afterEach(async () => {
  if (createdOrderIds.length > 0) {
    // order_items + order_status_history cascade on the order delete (FK on delete cascade).
    await db.from("orders").delete().in("id", createdOrderIds.splice(0));
  }
  if (createdCustomerEmails.length > 0) {
    await db.from("customers").delete().in("email", createdCustomerEmails.splice(0));
  }
});

/** Build a valid single-line payload for the given variant + quantity. */
function payloadFor(variant: Variant, quantity: number, overrides: Partial<CreateOrderPayload> = {}): CreateOrderPayload {
  const email = `qa-${randomUUID()}@example.com`;
  createdCustomerEmails.push(email);
  const lineTotal = variant.unitPriceCents * quantity;
  return {
    idempotency_key: randomUUID(),
    locale: "es-MX",
    contact_email: email,
    contact_phone: null,
    shipping_full_name: "QA Cliente",
    shipping_address_line1: "Calle QA 123",
    shipping_address_line2: null,
    shipping_city: "CDMX",
    shipping_state: "Ciudad de México",
    shipping_postal_code: "06700",
    delivery_notes: null,
    rfc: null,
    subtotal_cents: lineTotal,
    shipping_cents: 0,
    discount_cents: 0,
    tax_base_cents: 0,
    tax_cents: 0,
    total_cents: lineTotal,
    discount_code: null,
    items: [
      {
        product_id: variant.productId,
        variant_id: variant.id,
        product_name: variant.productName,
        product_sku: variant.productSku,
        variant_label: variant.colorName,
        unit_price_cents: variant.unitPriceCents,
        quantity,
        line_total_cents: lineTotal,
      },
    ],
    ...overrides,
  };
}

async function callRpc(payload: CreateOrderPayload) {
  const { data, error } = await db.rpc("create_order", { payload });
  if (data && typeof data === "object" && "order_id" in data) {
    createdOrderIds.push((data as CreateOrderResult).order_id);
  }
  return { data: data as CreateOrderResult | null, error };
}

async function variantStock(id: string): Promise<number> {
  const { data } = await db.from("product_variants").select("stock").eq("id", id).single();
  return data?.stock ?? -1;
}
async function productSalesCount(id: string): Promise<number> {
  const { data } = await db.from("products").select("sales_count").eq("id", id).single();
  return data?.sales_count ?? -1;
}

describe("create_order happy path (AC-9, AC-10, AC-11)", () => {
  it("creates the order + items + status-history, decrements stock, bumps sales_count", async () => {
    const stockBefore = await variantStock(inStock.id);
    const salesBefore = await productSalesCount(inStock.productId);

    const { data, error } = await callRpc(payloadFor(inStock, 2));
    expect(error).toBeNull();
    expect(data).toBeTruthy();
    expect(data?.reused).toBe(false);
    expect(data?.order_number).toMatch(/^PP-\d{6,}$/);
    // AC-11 (M-6): an unguessable uuid confirmation token is returned.
    expect(data?.confirmation_token).toMatch(/^[0-9a-f-]{36}$/i);

    // Order row is pending_payment / pending with the full financial snapshot.
    const { data: order } = await db
      .from("orders")
      .select("status, payment_status, tax_cents, tax_base_cents, currency, subtotal_cents, total_cents, confirmation_token")
      .eq("id", data!.order_id)
      .single();
    expect(order?.status).toBe("pending_payment");
    expect(order?.payment_status).toBe("pending");
    expect(order?.tax_cents).toBe(0);
    expect(order?.tax_base_cents).toBe(0);
    expect(order?.currency).toBe("MXN");
    expect(order?.confirmation_token).toBe(data!.confirmation_token);

    // One order_items row per line.
    const { data: items } = await db.from("order_items").select("quantity, line_total_cents").eq("order_id", data!.order_id);
    expect(items).toHaveLength(1);
    expect(items?.[0].quantity).toBe(2);

    // Initial status-history: from_status null → pending_payment.
    const { data: history } = await db
      .from("order_status_history")
      .select("from_status, to_status")
      .eq("order_id", data!.order_id);
    expect(history).toHaveLength(1);
    expect(history?.[0].from_status).toBeNull();
    expect(history?.[0].to_status).toBe("pending_payment");

    // Stock decremented by 2; sales_count bumped by 2 (same transaction).
    expect(await variantStock(inStock.id)).toBe(stockBefore - 2);
    expect(await productSalesCount(inStock.productId)).toBe(salesBefore + 2);

    // Restore the perturbed counters so the suite is repeatable.
    await db.from("product_variants").update({ stock: stockBefore }).eq("id", inStock.id);
    await db.from("products").update({ sales_count: salesBefore }).eq("id", inStock.productId);
  });
});

describe("idempotency (AC-14, edge 7)", () => {
  it("returns the SAME order with reused:true and does NOT decrement twice", async () => {
    const stockBefore = await variantStock(inStock.id);
    const salesBefore = await productSalesCount(inStock.productId);
    const key = randomUUID();

    const first = await callRpc(payloadFor(inStock, 1, { idempotency_key: key }));
    expect(first.error).toBeNull();
    expect(first.data?.reused).toBe(false);

    // Re-call with the SAME key → the original order, reused, no new decrement.
    const second = await callRpc(payloadFor(inStock, 1, { idempotency_key: key }));
    expect(second.error).toBeNull();
    expect(second.data?.reused).toBe(true);
    expect(second.data?.order_id).toBe(first.data?.order_id);
    expect(second.data?.confirmation_token).toBe(first.data?.confirmation_token);

    // Exactly ONE decrement of 1 unit; sales_count bumped once.
    expect(await variantStock(inStock.id)).toBe(stockBefore - 1);
    expect(await productSalesCount(inStock.productId)).toBe(salesBefore + 1);

    await db.from("product_variants").update({ stock: stockBefore }).eq("id", inStock.id);
    await db.from("products").update({ sales_count: salesBefore }).eq("id", inStock.productId);
  });
});

describe("out-of-stock guard + full rollback (AC-9, edge 2)", () => {
  it("raises OUT_OF_STOCK and writes NOTHING for a zero-stock line", async () => {
    const ordersBefore = (await db.from("orders").select("id", { count: "exact", head: true })).count ?? 0;

    const { data, error } = await callRpc(payloadFor(zeroStock, 1));
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toContain("OUT_OF_STOCK");

    // No order created; stock still 0 (never negative).
    const ordersAfter = (await db.from("orders").select("id", { count: "exact", head: true })).count ?? 0;
    expect(ordersAfter).toBe(ordersBefore);
    expect(await variantStock(zeroStock.id)).toBe(0);
  });

  it("rolls back the whole order when ONE line of a multi-line cart is out of stock", async () => {
    const stockBefore = await variantStock(inStock.id);
    const salesBefore = await productSalesCount(inStock.productId);

    const good = payloadFor(inStock, 1);
    // Append a zero-stock second line; the first line's decrement must roll back too.
    good.items.push({
      product_id: zeroStock.productId,
      variant_id: zeroStock.id,
      product_name: zeroStock.productName,
      product_sku: zeroStock.productSku,
      variant_label: zeroStock.colorName,
      unit_price_cents: zeroStock.unitPriceCents,
      quantity: 1,
      line_total_cents: zeroStock.unitPriceCents,
    });
    good.subtotal_cents = inStock.unitPriceCents + zeroStock.unitPriceCents;
    good.total_cents = good.subtotal_cents;

    const { error } = await callRpc(good);
    expect(error?.message ?? "").toContain("OUT_OF_STOCK");

    // The in-stock line's decrement + sales bump were rolled back (no partial write).
    expect(await variantStock(inStock.id)).toBe(stockBefore);
    expect(await productSalesCount(inStock.productId)).toBe(salesBefore);
  });
});

describe("last-unit race (edge 2)", () => {
  it("lets exactly one of two concurrent checkouts for the last unit win", async () => {
    // Force the variant to exactly 1 unit, then fire two concurrent single-unit orders.
    const stockBefore = await variantStock(inStock.id);
    await db.from("product_variants").update({ stock: 1 }).eq("id", inStock.id);
    const salesBefore = await productSalesCount(inStock.productId);

    const [a, b] = await Promise.all([callRpc(payloadFor(inStock, 1)), callRpc(payloadFor(inStock, 1))]);
    const winners = [a, b].filter((r) => r.error === null);
    const losers = [a, b].filter((r) => r.error !== null);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0].error?.message ?? "").toContain("OUT_OF_STOCK");

    // Stock landed at exactly 0 (never negative); one sale recorded.
    expect(await variantStock(inStock.id)).toBe(0);
    expect(await productSalesCount(inStock.productId)).toBe(salesBefore + 1);

    // Restore.
    await db.from("product_variants").update({ stock: stockBefore }).eq("id", inStock.id);
    await db.from("products").update({ sales_count: salesBefore }).eq("id", inStock.productId);
  });
});

describe("discount redemption inside the transaction (AC-6, m-2)", () => {
  it("increments times_redeemed for an eligible active code", async () => {
    const before = (await db.from("discount_codes").select("times_redeemed").eq("code", "AHORRA10").single()).data
      ?.times_redeemed ?? 0;
    const p = payloadFor(inStock, 1, { discount_code: "AHORRA10" });
    const stockBefore = await variantStock(inStock.id);
    const salesBefore = await productSalesCount(inStock.productId);

    const { error } = await callRpc(p);
    expect(error).toBeNull();
    const after = (await db.from("discount_codes").select("times_redeemed").eq("code", "AHORRA10").single()).data
      ?.times_redeemed ?? 0;
    expect(after).toBe(before + 1);

    // Restore the counter + stock so the seed is untouched.
    await db.from("discount_codes").update({ times_redeemed: before }).eq("code", "AHORRA10");
    await db.from("product_variants").update({ stock: stockBefore }).eq("id", inStock.id);
    await db.from("products").update({ sales_count: salesBefore }).eq("id", inStock.productId);
  });

  it("raises DISCOUNT_EXHAUSTED + rolls back for an exhausted code (no order, no decrement)", async () => {
    const stockBefore = await variantStock(inStock.id);
    const { data, error } = await callRpc(payloadFor(inStock, 1, { discount_code: "AGOTADO" }));
    expect(data).toBeNull();
    expect(error?.message ?? "").toContain("DISCOUNT_EXHAUSTED");
    // Full rollback: the stock decrement did not persist.
    expect(await variantStock(inStock.id)).toBe(stockBefore);
  });

  it("raises DISCOUNT_EXHAUSTED for an EXPIRED code (RPC re-asserts the window, m-2)", async () => {
    const stockBefore = await variantStock(inStock.id);
    const { data, error } = await callRpc(payloadFor(inStock, 1, { discount_code: "EXPIRADO" }));
    // The RPC re-checks is_active + window; an expired code fails the guard → raise.
    expect(data).toBeNull();
    expect(error?.message ?? "").toContain("DISCOUNT_EXHAUSTED");
    expect(await variantStock(inStock.id)).toBe(stockBefore);
  });
});

describe("DB CHECK backstop (edge 8)", () => {
  it("rejects a payload whose total violates the total identity (no order written)", async () => {
    const stockBefore = await variantStock(inStock.id);
    const bad = payloadFor(inStock, 1, { total_cents: 1 }); // != subtotal + shipping - discount
    const { data, error } = await callRpc(bad);
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    // Full rollback: the earlier stock decrement did not persist.
    expect(await variantStock(inStock.id)).toBe(stockBefore);
  });

  it("requires a non-empty idempotency_key", async () => {
    const { data, error } = await callRpc(payloadFor(inStock, 1, { idempotency_key: "" }));
    expect(data).toBeNull();
    expect(error?.message ?? "").toMatch(/idempotency_key/i);
  });
});

// Confirm the least-privilege grant: anon must NOT be able to call the RPC.
describe("create_order privilege (AC-12)", () => {
  it("is denied to the anon role", async () => {
    const { anonClient } = await import("./local-supabase");
    const anon = anonClient();
    const { error } = await anon.rpc("create_order", { payload: payloadFor(inStock, 1) });
    // anon has no execute grant → PostgREST returns a permission / not-found error.
    expect(error).not.toBeNull();
  });
});
