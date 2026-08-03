/**
 * admin_customer_aggregates RPC + customer-detail invariants (T18) against a LIVE
 * local Supabase, through the service-role client. The detail page's lifetime
 * totals come from this RPC (0014), and its order count MUST equal what the
 * Customers list shows for the same id (the count-equals-list invariant, AC-9).
 * Verifies:
 *   - the aggregate: order_count / summed total_cents / first (min) & last (max)
 *     created_at, computed over ALL the customer's orders (not a bounded slice).
 *   - INTEGER-cents summation: the total is exact, no float peso math (AC-8).
 *   - the count-equals-list invariant: admin_customer_aggregates.order_count ==
 *     admin_customer_order_counts (the list's source) for the same id (AC-9).
 *   - null-`customer_id` exclusion: an orphaned order never inflates the totals.
 *   - the zero-order shape: count 0, total 0, first/last NULL (edge 5) — no throw.
 *   - the email-less sentinel customer is aggregated by id, never merged with
 *     another sentinel customer sharing the placeholder email (edge 2).
 *   - distinct shipping-address de-dup keys on the full tuple (AC-6, edge 4).
 *   - least privilege: anon cannot call the aggregate RPC.
 *
 * Every test deletes the customers + orders it creates (orders first: a customer
 * delete sets order.customer_id null, so orders are removed explicitly).
 */
import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { serviceClient } from "./local-supabase";
import { NO_EMAIL_PLACEHOLDER } from "@/lib/email/recipient";
import { dedupeAddresses } from "@/lib/admin/orders/customer-read";

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

interface CustomerSeed {
  email?: string;
  phone?: string | null;
}
async function makeCustomer(seed: CustomerSeed = {}): Promise<string> {
  const { data, error } = await db
    .from("customers")
    .insert({
      email: seed.email ?? `detail-${randomUUID()}@example.com`,
      full_name: "Detail Test",
      phone: seed.phone ?? null,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`could not create customer: ${error?.message}`);
  createdCustomerIds.push(data.id);
  return data.id;
}

interface OrderSeed {
  totalCents?: number;
  createdAt?: string;
  city?: string;
  line2?: string | null;
  status?: "pending_payment" | "paid" | "cancelled";
  paymentStatus?: "pending" | "paid" | "failed";
}
async function makeOrderFor(customerId: string | null, seed: OrderSeed = {}): Promise<string> {
  const total = seed.totalCents ?? 1000;
  const { data, error } = await db
    .from("orders")
    .insert({
      order_number: `PP-DET-${randomUUID().slice(0, 8)}`,
      customer_id: customerId,
      contact_email: "detail@example.com",
      shipping_full_name: "Detail",
      shipping_address_line1: "L1",
      shipping_address_line2: seed.line2 === undefined ? null : seed.line2,
      shipping_city: seed.city ?? "Guadalajara",
      shipping_state: "Jalisco",
      shipping_postal_code: "44100",
      subtotal_cents: total,
      shipping_cents: 0,
      discount_cents: 0,
      tax_base_cents: total,
      tax_cents: 0,
      total_cents: total,
      status: seed.status ?? "pending_payment",
      payment_status: seed.paymentStatus ?? "pending",
      ...(seed.createdAt ? { created_at: seed.createdAt } : {}),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`could not create order: ${error?.message}`);
  createdOrderIds.push(data.id);
  return data.id;
}

interface AggregateRow {
  order_count: number;
  total_cents: number;
  first_order_at: string | null;
  last_order_at: string | null;
}
async function callAggregate(customerId: string) {
  const { data, error } = await db.rpc("admin_customer_aggregates", { p_customer_id: customerId });
  return { row: ((data ?? []) as AggregateRow[])[0], error };
}

async function callListCount(customerId: string): Promise<number> {
  const { data, error } = await db.rpc("admin_customer_order_counts", {
    p_customer_ids: [customerId],
  });
  if (error) throw new Error(`count RPC failed: ${error.message}`);
  const rows = (data ?? []) as { customer_id: string; order_count: number }[];
  const found = rows.find((r) => r.customer_id === customerId);
  return found ? Number(found.order_count) : 0;
}

describe("admin_customer_aggregates — lifetime totals", () => {
  it("returns count, integer-cents sum, and first/last dates over ALL orders", async () => {
    const customer = await makeCustomer();
    await makeOrderFor(customer, { totalCents: 189000, createdAt: "2026-01-10T00:00:00Z" });
    await makeOrderFor(customer, { totalCents: 120000, createdAt: "2026-04-01T00:00:00Z" });
    await makeOrderFor(customer, { totalCents: 120000, createdAt: "2026-07-15T00:00:00Z" });

    const { row, error } = await callAggregate(customer);
    expect(error).toBeNull();
    expect(row.order_count).toBe(3);
    // Exact integer-cents sum: 189000 + 120000 + 120000 = 429000 (AC-8).
    expect(row.total_cents).toBe(429000);
    expect(Number.isInteger(row.total_cents)).toBe(true);
    expect(row.first_order_at).not.toBeNull();
    expect(row.last_order_at).not.toBeNull();
    expect(Date.parse(row.first_order_at as string)).toBeLessThan(
      Date.parse(row.last_order_at as string),
    );
  });

  it("sums the order VALUE regardless of payment status (0-paid customer, edge 1)", async () => {
    const customer = await makeCustomer();
    await makeOrderFor(customer, { totalCents: 50000, status: "pending_payment", paymentStatus: "pending" });
    await makeOrderFor(customer, { totalCents: 30000, status: "cancelled", paymentStatus: "failed" });

    const { row } = await callAggregate(customer);
    // No order is `paid`, yet the total is the full order value (never paid-only),
    // so the headline reconciles with the visible history + the list count.
    expect(row.order_count).toBe(2);
    expect(row.total_cents).toBe(80000);
  });
});

describe("admin_customer_aggregates — count-equals-list invariant (AC-9)", () => {
  it("aggregate order_count EQUALS the Customers-list count for the same id", async () => {
    const customer = await makeCustomer();
    await makeOrderFor(customer);
    await makeOrderFor(customer);
    await makeOrderFor(customer);

    const { row } = await callAggregate(customer);
    const listCount = await callListCount(customer);
    expect(row.order_count).toBe(listCount);
    expect(row.order_count).toBe(3);
  });
});

describe("admin_customer_aggregates — null-customer exclusion", () => {
  it("does NOT count an orphaned (customer_id null) order in any customer's totals", async () => {
    const customer = await makeCustomer();
    await makeOrderFor(customer, { totalCents: 1000 });
    await makeOrderFor(null, { totalCents: 999999 }); // orphaned — must not inflate

    const { row } = await callAggregate(customer);
    expect(row.order_count).toBe(1);
    expect(row.total_cents).toBe(1000);
  });
});

describe("admin_customer_aggregates — zero-order shape (edge 5)", () => {
  it("returns count 0, total 0, and NULL first/last for a customer with no orders", async () => {
    const customer = await makeCustomer();
    const { row, error } = await callAggregate(customer);
    expect(error).toBeNull();
    // The single-row aggregate always returns one row, even for zero orders.
    expect(row.order_count).toBe(0);
    expect(row.total_cents).toBe(0);
    expect(row.first_order_at).toBeNull();
    expect(row.last_order_at).toBeNull();
    // Matches the list, which shows 0 for a customer omitted from the count RPC.
    expect(await callListCount(customer)).toBe(0);
  });
});

describe("admin_customer_aggregates — sentinel customers keyed by id (edge 2)", () => {
  it("aggregates each email-less sentinel customer by its OWN id, never merged", async () => {
    // Two DISTINCT customers.id rows sharing the no-email placeholder + differing
    // phones — the keying is strictly by id, so each shows only its own order.
    const a = await makeCustomer({ email: NO_EMAIL_PLACEHOLDER, phone: "55 1111 1111" });
    const b = await makeCustomer({ email: NO_EMAIL_PLACEHOLDER, phone: "55 2222 2222" });
    await makeOrderFor(a);
    await makeOrderFor(b);
    await makeOrderFor(b);

    const rowA = (await callAggregate(a)).row;
    const rowB = (await callAggregate(b)).row;
    expect(rowA.order_count).toBe(1);
    expect(rowB.order_count).toBe(2);
    // Never merged by shared email: A's total is its single order only.
    expect(rowA.total_cents).toBe(1000);
  });
});

describe("admin_customer_aggregates — least privilege", () => {
  it("is denied to the anon role", async () => {
    const { anonClient } = await import("./local-supabase");
    const anon = anonClient();
    const { error } = await anon.rpc("admin_customer_aggregates", { p_customer_id: randomUUID() });
    expect(error).not.toBeNull();
  });
});

describe("dedupeAddresses — distinct shipping-address set (AC-6, edge 4)", () => {
  it("collapses identical addresses and keeps distinct ones (most-recent-first)", () => {
    // Mirrors the shape the read fetches (newest-first order rows).
    const rows = [
      addressTuple({ shipping_city: "Guadalajara" }), // newest, addr A
      addressTuple({ shipping_city: "Monterrey" }), // addr B
      addressTuple({ shipping_city: "Guadalajara" }), // oldest, addr A again
    ];
    const result = dedupeAddresses(rows);
    expect(result).toHaveLength(2);
    expect(result[0].city).toBe("Guadalajara");
    expect(result[1].city).toBe("Monterrey");
  });

  it("returns a single entry when every order used the same address", () => {
    const rows = [addressTuple(), addressTuple(), addressTuple()];
    expect(dedupeAddresses(rows)).toHaveLength(1);
  });
});

function addressTuple(overrides: Record<string, string | null> = {}) {
  return {
    shipping_full_name: "Detail",
    shipping_address_line1: "L1",
    shipping_address_line2: null,
    shipping_city: "Guadalajara",
    shipping_state: "Jalisco",
    shipping_postal_code: "44100",
    shipping_country: "MX",
    ...overrides,
  };
}
