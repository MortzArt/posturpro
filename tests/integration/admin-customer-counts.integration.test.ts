/**
 * admin_customer_order_counts RPC integration tests (T12 M-3 / AC-24) against a
 * LIVE local Supabase, through the service-role client. This grouped-count RPC
 * (0013) replaced an in-memory tally that silently truncated at PostgREST's
 * 1000-row cap. Its semantics MUST be exact — the customer list shows these
 * counts. Verifies:
 *   - grouped counts: ONE row per input id, count = that customer's order rows.
 *   - a null-`customer_id` order is EXCLUDED (guest orders with no customer link
 *     never inflate any count and never appear as a row).
 *   - an input id with NO orders is OMITTED from the result (the app maps a
 *     missing id → 0, so omission is correct, not a bug).
 *   - only the requested ids are returned (no leakage of other customers' counts).
 *   - least privilege: anon cannot call the RPC.
 *
 * Every test deletes the customers + orders it creates (orders cascade-safe:
 * customer delete sets order.customer_id null, so orders are deleted explicitly).
 */
import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { serviceClient } from "./local-supabase";

const db = serviceClient();

const createdCustomerIds: string[] = [];
const createdOrderIds: string[] = [];

afterEach(async () => {
  if (createdOrderIds.length > 0) {
    await db.from("orders").delete().in("id", createdOrderIds.splice(0));
  }
  if (createdCustomerIds.length > 0) {
    await db.from("customers").delete().in("id", createdCustomerIds.splice(0));
  }
});

async function makeCustomer(): Promise<string> {
  const { data, error } = await db
    .from("customers")
    .insert({ email: `count-${randomUUID()}@example.com`, full_name: "Count Test" })
    .select("id")
    .single();
  if (error || !data) throw new Error(`could not create customer: ${error?.message}`);
  createdCustomerIds.push(data.id);
  return data.id;
}

async function makeOrderFor(customerId: string | null): Promise<string> {
  const { data, error } = await db
    .from("orders")
    .insert({
      order_number: `PP-CNT-${randomUUID().slice(0, 8)}`,
      customer_id: customerId,
      contact_email: "count@example.com",
      shipping_full_name: "Count",
      shipping_address_line1: "L1",
      shipping_city: "C",
      shipping_state: "Jalisco",
      shipping_postal_code: "44100",
      subtotal_cents: 1000,
      shipping_cents: 0,
      discount_cents: 0,
      tax_base_cents: 1000,
      tax_cents: 0,
      total_cents: 1000,
      status: "pending_payment",
      payment_status: "pending",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`could not create order: ${error?.message}`);
  createdOrderIds.push(data.id);
  return data.id;
}

interface CountRow {
  customer_id: string;
  order_count: number;
}
async function callCounts(ids: string[]) {
  const { data, error } = await db.rpc("admin_customer_order_counts", { p_customer_ids: ids });
  return { data: (data ?? []) as CountRow[], error };
}
function countFor(rows: CountRow[], id: string): number | undefined {
  const row = rows.find((r) => r.customer_id === id);
  return row ? Number(row.order_count) : undefined;
}

describe("admin_customer_order_counts — grouped counts", () => {
  it("returns ONE row per id with that customer's order count", async () => {
    const a = await makeCustomer();
    const b = await makeCustomer();
    await makeOrderFor(a);
    await makeOrderFor(a);
    await makeOrderFor(b);

    const { data, error } = await callCounts([a, b]);
    expect(error).toBeNull();
    expect(countFor(data, a)).toBe(2);
    expect(countFor(data, b)).toBe(1);
    // Exactly two rows for two customers with orders.
    expect(data).toHaveLength(2);
  });
});

describe("admin_customer_order_counts — null-customer exclusion", () => {
  it("does NOT count a guest order whose customer_id is null", async () => {
    const a = await makeCustomer();
    await makeOrderFor(a); // linked
    await makeOrderFor(null); // guest, no customer link

    const { data } = await callCounts([a]);
    // The guest order never inflates any count nor appears as a row.
    expect(countFor(data, a)).toBe(1);
    expect(data).toHaveLength(1);
    // No row has a null customer_id.
    expect(data.every((r) => r.customer_id !== null)).toBe(true);
  });
});

describe("admin_customer_order_counts — missing id omission (app maps → 0)", () => {
  it("OMITS an input id that has no orders (not a zero row)", async () => {
    const withOrders = await makeCustomer();
    const withoutOrders = await makeCustomer();
    await makeOrderFor(withOrders);

    const { data } = await callCounts([withOrders, withoutOrders]);
    expect(countFor(data, withOrders)).toBe(1);
    // The no-order id is absent — the reader's `.get(id) ?? 0` maps it to 0.
    expect(countFor(data, withoutOrders)).toBeUndefined();
  });

  it("returns an empty result for ids that all lack orders", async () => {
    const c = await makeCustomer();
    const { data } = await callCounts([c]);
    expect(data).toEqual([]);
  });
});

describe("admin_customer_order_counts — scoping + privilege", () => {
  it("returns ONLY the requested ids (no other customers' counts leak in)", async () => {
    const requested = await makeCustomer();
    const other = await makeCustomer();
    await makeOrderFor(requested);
    await makeOrderFor(other); // NOT in the request

    const { data } = await callCounts([requested]);
    expect(data.every((r) => r.customer_id === requested)).toBe(true);
    expect(countFor(data, other)).toBeUndefined();
  });

  it("is denied to the anon role (least privilege)", async () => {
    const { anonClient } = await import("./local-supabase");
    const anon = anonClient();
    const { error } = await anon.rpc("admin_customer_order_counts", { p_customer_ids: [randomUUID()] });
    expect(error).not.toBeNull();
  });
});
