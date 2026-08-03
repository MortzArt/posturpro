/**
 * Manual-order end-to-end integration (T17 AC-19) against a LIVE local Supabase,
 * through the service-role client (exactly what the manual-order write uses). It
 * reuses the SHIPPED create_order / advance_order_status RPCs — NO new migration.
 * Verifies, for a real create_order payload built like `manual-order-write`:
 *   - stock decremented for the picked variant (guarded decrement),
 *   - an order number issued from the sequence (PP-XXXXXX),
 *   - the source marker stamped (payment_method='manual') via the post-create step,
 *   - the initial history row present,
 *   - PENDING path leaves payment_status='pending';
 *   - PAID path (advance_order_status payment-only, payment_method='manual')
 *     sets payment_status='paid' + a transition_kind='paid' history row;
 *   - EMAIL-LESS variant: the no-email sentinel satisfies NOT NULL, and the
 *     recipient guard resolves a subsequent send to the benign no-recipient skip
 *     (not an error) — proving a later T12 status email stays safe.
 *   - idempotency: a repeat key returns the original order (reused:true), one
 *     stock decrement.
 *
 * Each test creates its own order and cleans up after, restoring any perturbed
 * stock so the seed is untouched and the suite is repeatable.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { serviceClient } from "./local-supabase";
import { resolveCustomerRecipient, NO_EMAIL_PLACEHOLDER } from "@/lib/email/recipient";
import type { CreateOrderPayload } from "@/lib/supabase/database.types";

const db = serviceClient();

interface SeedVariant {
  variantId: string;
  productId: string;
  productSku: string;
  productName: string;
  colorName: string;
  unitPriceCents: number;
  startingStock: number;
}

let variant: SeedVariant;

beforeAll(async () => {
  const { data, error } = await db
    .from("product_variants")
    .select("id, product_id, sku, color_name, price_override_cents, stock, products!inner(name, price_cents, status, sku)")
    .gte("stock", 3)
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
    startingStock: data.stock,
  };
});

const createdOrderIds: string[] = [];

afterEach(async () => {
  if (createdOrderIds.length > 0) {
    await db.from("orders").delete().in("id", createdOrderIds.splice(0));
  }
  // Restore the seed variant's stock to its starting value (repeatable suite).
  if (variant) {
    await db.from("product_variants").update({ stock: variant.startingStock }).eq("id", variant.variantId);
  }
});

/** Build a create_order payload exactly like the manual-order write does. */
function buildPayload(overrides: Partial<CreateOrderPayload> = {}): CreateOrderPayload {
  const quantity = 2;
  const lineTotal = variant.unitPriceCents * quantity;
  return {
    idempotency_key: randomUUID(),
    locale: "es-MX",
    contact_email: "manual-buyer@example.com",
    contact_phone: "5512345678",
    shipping_full_name: "Pedido Manual",
    shipping_address_line1: "Reforma 100",
    shipping_address_line2: null,
    shipping_city: "Monterrey",
    shipping_state: "Nuevo León",
    shipping_postal_code: "64000",
    delivery_notes: null,
    rfc: null,
    subtotal_cents: lineTotal,
    shipping_cents: 50000,
    discount_cents: 0,
    tax_base_cents: lineTotal,
    tax_cents: 0,
    total_cents: lineTotal + 50000,
    discount_code: null,
    items: [
      {
        product_id: variant.productId,
        variant_id: variant.variantId,
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

async function createOrder(payload: CreateOrderPayload) {
  const { data, error } = await db.rpc("create_order", { payload });
  if (error || !data) throw new Error(`create_order failed: ${error?.message}`);
  createdOrderIds.push(data.order_id);
  return data;
}

describe("manual order — create + source mark (pending path)", () => {
  it("decrements stock, issues an order number, stamps manual source, leaves pending", async () => {
    const result = await createOrder(buildPayload());
    expect(result.order_number).toMatch(/^PP-\d{6,}$/);
    expect(result.reused).toBe(false);

    // Post-create source stamp (the write module's pending path).
    const { error: stampError } = await db
      .from("orders")
      .update({ payment_method: "manual" })
      .eq("id", result.order_id);
    expect(stampError).toBeNull();

    const { data: order } = await db
      .from("orders")
      .select("status, payment_status, payment_method")
      .eq("id", result.order_id)
      .single();
    expect(order).toMatchObject({ status: "pending_payment", payment_status: "pending", payment_method: "manual" });

    const { data: freshVariant } = await db
      .from("product_variants")
      .select("stock")
      .eq("id", variant.variantId)
      .single();
    expect(freshVariant?.stock).toBe(variant.startingStock - 2);

    const { data: history } = await db
      .from("order_status_history")
      .select("to_status")
      .eq("order_id", result.order_id);
    expect(history?.some((row) => row.to_status === "pending_payment")).toBe(true);
  });
});

describe("manual order — paid path (advance_order_status payment-only)", () => {
  it("marks paid + payment_method=manual + a transition_kind='paid' history row", async () => {
    const result = await createOrder(buildPayload());
    const { data: advance, error } = await db.rpc("advance_order_status", {
      p_order_id: result.order_id,
      p_order_status: null,
      p_payment_status: "paid",
      p_payment_method: "manual",
      p_mp_payment_id: null,
      p_note: null,
    });
    expect(error).toBeNull();
    expect(advance?.applied).toBe(true);

    const { data: order } = await db
      .from("orders")
      .select("payment_status, payment_method")
      .eq("id", result.order_id)
      .single();
    expect(order).toMatchObject({ payment_status: "paid", payment_method: "manual" });

    const { data: history } = await db
      .from("order_status_history")
      .select("transition_kind")
      .eq("order_id", result.order_id);
    expect(history?.some((row) => row.transition_kind === "paid")).toBe(true);
  });
});

describe("manual order — email-less (AC-11 + AC-13)", () => {
  it("creates with the no-email sentinel and the recipient guard skips a later send", async () => {
    const result = await createOrder(buildPayload({ contact_email: NO_EMAIL_PLACEHOLDER }));
    const { data: order } = await db
      .from("orders")
      .select("contact_email")
      .eq("id", result.order_id)
      .single();
    expect(order?.contact_email).toBe(NO_EMAIL_PLACEHOLDER);
    // A later shipped/cancelled email would resolve to the no-recipient skip.
    expect(resolveCustomerRecipient(order?.contact_email ?? null)).toBeNull();
  });
});

describe("manual order — idempotency (edge 3)", () => {
  it("a repeat key returns the original order with one stock decrement", async () => {
    const payload = buildPayload();
    const first = await createOrder(payload);
    const { data: second, error } = await db.rpc("create_order", { payload });
    expect(error).toBeNull();
    expect(second?.order_id).toBe(first.order_id);
    expect(second?.reused).toBe(true);

    const { data: freshVariant } = await db
      .from("product_variants")
      .select("stock")
      .eq("id", variant.variantId)
      .single();
    // Only ONE decrement despite two calls.
    expect(freshVariant?.stock).toBe(variant.startingStock - 2);
  });
});
