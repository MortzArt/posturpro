/**
 * Financial CHECK constraints, immutability triggers, and integrity triggers
 * (AC-8, AC-9, AC-10, edge cases 4/6/8) against a live local Supabase.
 *
 * All writes go through the service (RLS-bypassing) client — these tables are
 * server-only — so failures here are genuine DB-constraint failures, not RLS.
 * Every test cleans up the rows it creates so the suite is repeatable.
 */
import { afterEach, describe, expect, it } from "vitest";
import { serviceClient } from "./local-supabase";

const db = serviceClient();

/** Unique-ish suffix so parallel-safe even if the DB is not freshly reset. */
function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

const createdOrderIds: string[] = [];
const createdCategorySlugs: string[] = [];

afterEach(async () => {
  if (createdOrderIds.length > 0) {
    await db.from("orders").delete().in("id", createdOrderIds.splice(0));
  }
  if (createdCategorySlugs.length > 0) {
    await db.from("categories").delete().in("slug", createdCategorySlugs.splice(0));
  }
});

/** Build a minimal, VALID order insert payload; caller can override fields. */
function validOrder(overrides: Record<string, unknown> = {}) {
  const subtotal = 100_000;
  const shipping = 50_000;
  const discount = 0;
  const tax = 0;
  return {
    order_number: `TEST-${uid()}`,
    contact_email: "buyer@example.com",
    shipping_full_name: "Cliente Prueba",
    shipping_address_line1: "Calle 1",
    shipping_city: "CDMX",
    shipping_state: "CDMX",
    shipping_postal_code: "01000",
    subtotal_cents: subtotal,
    shipping_cents: shipping,
    discount_cents: discount,
    tax_cents: tax,
    total_cents: subtotal + shipping + tax - discount,
    ...overrides,
  };
}

async function insertOrder(payload: Record<string, unknown>) {
  const { data, error } = await db
    .from("orders")
    .insert(payload as never)
    .select("id")
    .single();
  if (data?.id) createdOrderIds.push(data.id);
  return { data, error };
}

describe("orders financial CHECK constraints (AC-8)", () => {
  it("accepts a valid, internally-consistent order", async () => {
    const { data, error } = await insertOrder(validOrder());
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
  });

  it("rejects a total that violates the total identity", async () => {
    const { error } = await insertOrder(
      validOrder({ total_cents: 1 }), // does not equal subtotal+shipping+tax-discount
    );
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toMatch(/orders_total_identity/);
  });

  it("rejects a discount greater than the subtotal", async () => {
    const { error } = await insertOrder(
      validOrder({
        subtotal_cents: 100_000,
        discount_cents: 150_000,
        shipping_cents: 0,
        tax_cents: 0,
        total_cents: 100_000 + 0 + 0 - 150_000, // negative-ish; also fails >=0
      }),
    );
    expect(error).not.toBeNull();
    // Either the discount-within-subtotal check or the total >= 0 check fires.
    expect(error?.message ?? "").toMatch(
      /orders_discount_within_subtotal|total_cents|check/i,
    );
  });

  it("rejects a non-MXN currency", async () => {
    const { error } = await insertOrder(validOrder({ currency: "USD" }));
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toMatch(/currency/i);
  });
});

describe("order snapshot immutability (edge case 8)", () => {
  it("blocks UPDATE of a financial/contact snapshot column", async () => {
    const { data: order, error: insErr } = await insertOrder(validOrder());
    expect(insErr).toBeNull();
    const { error } = await db
      .from("orders")
      .update({ total_cents: 999_999 })
      .eq("id", order?.id ?? "");
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toMatch(/immutable/i);
  });

  it("ALLOWS mutating an operational column (status)", async () => {
    const { data: order, error: insErr } = await insertOrder(validOrder());
    expect(insErr).toBeNull();
    const { error } = await db
      .from("orders")
      .update({ status: "paid" })
      .eq("id", order?.id ?? "");
    expect(error).toBeNull();
  });
});

describe("order_items line-total identity + immutability (AC-9)", () => {
  it("rejects a line total that does not equal unit_price * quantity", async () => {
    const { data: order } = await insertOrder(validOrder());
    const { error } = await db.from("order_items").insert({
      order_id: order?.id ?? "",
      product_name: "Silla Prueba",
      product_sku: "PP-TEST",
      unit_price_cents: 10_000,
      quantity: 3,
      line_total_cents: 12_345, // != 30000
    } as never);
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toMatch(/order_items_line_total_identity/);
  });

  it("accepts a consistent line and then blocks any UPDATE to it", async () => {
    const { data: order } = await insertOrder(validOrder());
    const { data: item, error: insErr } = await db
      .from("order_items")
      .insert({
        order_id: order?.id ?? "",
        product_name: "Silla Prueba",
        product_sku: "PP-TEST",
        unit_price_cents: 10_000,
        quantity: 2,
        line_total_cents: 20_000,
      } as never)
      .select("id")
      .single();
    expect(insErr).toBeNull();
    const { error } = await db
      .from("order_items")
      .update({ quantity: 5 })
      .eq("id", item?.id ?? "");
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toMatch(/immutable/i);
  });
});

describe("order_status_history (AC-10)", () => {
  it("records a transition row with from/to status + note", async () => {
    const { data: order } = await insertOrder(validOrder());
    const { data, error } = await db
      .from("order_status_history")
      .insert({
        order_id: order?.id ?? "",
        from_status: "pending_payment",
        to_status: "paid",
        note: "Pago confirmado",
      } as never)
      .select("id, from_status, to_status, note")
      .single();
    expect(error).toBeNull();
    expect(data?.to_status).toBe("paid");
    expect(data?.note).toBe("Pago confirmado");
  });
});

describe("category cycle + self-parent triggers (edge case 4)", () => {
  it("rejects a category that is its own parent", async () => {
    const slug = `cat-self-${uid()}`;
    createdCategorySlugs.push(slug);
    const { data, error: insErr } = await db
      .from("categories")
      .insert({ slug, name: "Self", parent_id: null } as never)
      .select("id")
      .single();
    expect(insErr).toBeNull();
    const { error } = await db
      .from("categories")
      .update({ parent_id: data?.id })
      .eq("id", data?.id ?? "");
    expect(error).not.toBeNull();
  });

  it("rejects a 3-node cycle A->B->C->A", async () => {
    const a = `cat-a-${uid()}`;
    const b = `cat-b-${uid()}`;
    const c = `cat-c-${uid()}`;
    createdCategorySlugs.push(a, b, c);
    const rowA = (
      await db.from("categories").insert({ slug: a, name: "A", parent_id: null } as never).select("id").single()
    ).data;
    const rowB = (
      await db.from("categories").insert({ slug: b, name: "B", parent_id: rowA?.id } as never).select("id").single()
    ).data;
    const rowC = (
      await db.from("categories").insert({ slug: c, name: "C", parent_id: rowB?.id } as never).select("id").single()
    ).data;
    // Now try to point A at C -> would form A->B->C->A.
    const { error } = await db
      .from("categories")
      .update({ parent_id: rowC?.id })
      .eq("id", rowA?.id ?? "");
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toMatch(/ancestor|cycle/i);
  });

  it("rejects a parent_id referencing a nonexistent category (FK)", async () => {
    const slug = `cat-orphan-${uid()}`;
    createdCategorySlugs.push(slug);
    const { error } = await db.from("categories").insert({
      slug,
      name: "Orphan",
      parent_id: "00000000-0000-0000-0000-0000000000ff",
    } as never);
    expect(error).not.toBeNull();
  });
});

describe("discount_codes percentage bound (AC-12 supporting / n-2)", () => {
  it("rejects a percentage discount over 100", async () => {
    const { error } = await db.from("discount_codes").insert({
      code: `PCT-${uid()}`,
      discount_type: "percentage",
      value: 5000,
    } as never);
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toMatch(/percentage_bound|check/i);
  });

  it("allows a fixed_amount discount above 100 (bound is percentage-only)", async () => {
    const code = `FIX-${uid()}`;
    const { error } = await db.from("discount_codes").insert({
      code,
      discount_type: "fixed_amount",
      value: 50_000,
    } as never);
    expect(error).toBeNull();
    await db.from("discount_codes").delete().eq("code", code);
  });
});
