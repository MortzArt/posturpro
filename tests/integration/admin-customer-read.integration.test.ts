/**
 * `getAdminCustomer` END-TO-END integration (T18 QA Stage 5) against a LIVE local
 * Supabase. The sibling `admin-customer-detail.integration.test.ts` exercises the
 * 0014 RPC and the pure `dedupeAddresses` in isolation; THIS file exercises the
 * ACTUAL read the page calls — `getAdminCustomer(id)` through `createAdminClient`
 * (server-role) — so the ASSEMBLED view model is verified, not just its parts.
 *
 * Closes the QA coverage gaps the S5 brief called out:
 *   - AC-9 count-equals-list through the real read, across a SINGLE-order, a
 *     MULTI-order, and a ZERO-order customer (all three must reconcile with
 *     `admin_customer_order_counts`, the Customers-list source).
 *   - `ordersTruncated` at the CUSTOMER_ORDER_HISTORY_LIMIT boundary: truncation
 *     is SHOWN (a flag the page turns into "Mostrando los N más recientes de M"),
 *     never silent — and the aggregate totals still reflect ALL orders, not the
 *     bounded slice (edge 3).
 *   - AC-10 guard: a non-UUID id returns `null` (→ notFound) with NO DB call; a
 *     well-formed-but-missing UUID returns `null` (→ notFound), never a throw.
 *   - AC-8: assembled `totals.totalCents` is an exact integer.
 *   - edge 5: the zero-order shape assembled (count 0, $0 total, null dates,
 *     empty orders, no addresses, historyFailed false).
 *   - edge 4 / AC-6: distinct-address de-dup surfaced on the assembled model.
 *   - the identity fields (fullName, raw email incl. the sentinel, phone) pass
 *     through untouched for the page's `isMailableAddress` render.
 *
 * Requires the local env vars `getServerEnv()` reads — set inline below to the
 * WELL-KNOWN public local Supabase keys (not secrets; localhost only), matching
 * scripts/run-integration.sh, so the file also passes under a bare `vitest`.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

// getAdminCustomer → createAdminClient → getServerEnv() needs these. The
// run-integration.sh runner exports them; set them here too so this file is
// self-sufficient against a running local stack. Public local demo keys only.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??=
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
process.env.SUPABASE_SECRET_KEY ??=
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

import { serviceClient } from "./local-supabase";
import { NO_EMAIL_PLACEHOLDER } from "@/lib/email/recipient";
import { getAdminCustomer } from "@/lib/admin/orders/customer-read";
import { CUSTOMER_ORDER_HISTORY_LIMIT } from "@/lib/config";

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
  fullName?: string;
  phone?: string | null;
}
async function makeCustomer(seed: CustomerSeed = {}): Promise<string> {
  const { data, error } = await db
    .from("customers")
    .insert({
      email: seed.email ?? `read-${randomUUID()}@example.com`,
      full_name: seed.fullName ?? "Read Test",
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
}
async function makeOrderFor(customerId: string, seed: OrderSeed = {}): Promise<string> {
  const total = seed.totalCents ?? 1000;
  const { data, error } = await db
    .from("orders")
    .insert({
      order_number: `PP-READ-${randomUUID().slice(0, 8)}`,
      customer_id: customerId,
      contact_email: "read@example.com",
      shipping_full_name: "Read",
      shipping_address_line1: "L1",
      shipping_address_line2: null,
      shipping_city: seed.city ?? "Guadalajara",
      shipping_state: "Jalisco",
      shipping_postal_code: "44100",
      subtotal_cents: total,
      shipping_cents: 0,
      discount_cents: 0,
      tax_base_cents: total,
      tax_cents: 0,
      total_cents: total,
      status: "pending_payment",
      payment_status: "pending",
      ...(seed.createdAt ? { created_at: seed.createdAt } : {}),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`could not create order: ${error?.message}`);
  createdOrderIds.push(data.id);
  return data.id;
}

/** The Customers-list count source (0013), for the AC-9 reconciliation. */
async function listCount(customerId: string): Promise<number> {
  const { data, error } = await db.rpc("admin_customer_order_counts", {
    p_customer_ids: [customerId],
  });
  if (error) throw new Error(`count RPC failed: ${error.message}`);
  const rows = (data ?? []) as { customer_id: string; order_count: number }[];
  const found = rows.find((r) => r.customer_id === customerId);
  return found ? Number(found.order_count) : 0;
}

beforeAll(() => {
  // Fail loudly if a future edit shrinks the limit below what these tests assume.
  expect(CUSTOMER_ORDER_HISTORY_LIMIT).toBeGreaterThanOrEqual(2);
});

describe("getAdminCustomer — AC-9 count-equals-list across cardinalities", () => {
  it("reconciles a SINGLE-order customer (detail count === list count === 1)", async () => {
    const id = await makeCustomer();
    await makeOrderFor(id, { totalCents: 189000 });

    const detail = await getAdminCustomer(id);
    expect(detail).not.toBeNull();
    expect(detail!.totals.orderCount).toBe(1);
    expect(detail!.totals.orderCount).toBe(await listCount(id));
    expect(detail!.orders).toHaveLength(1);
    expect(detail!.totals.totalCents).toBe(189000);
    expect(detail!.ordersTruncated).toBe(false);
    expect(detail!.historyFailed).toBe(false);
  });

  it("reconciles a MULTI-order customer (detail count === list count === 3)", async () => {
    const id = await makeCustomer();
    await makeOrderFor(id, { totalCents: 189000, createdAt: "2026-01-10T00:00:00Z" });
    await makeOrderFor(id, { totalCents: 120000, createdAt: "2026-04-01T00:00:00Z" });
    await makeOrderFor(id, { totalCents: 120000, createdAt: "2026-07-15T00:00:00Z" });

    const detail = await getAdminCustomer(id);
    expect(detail!.totals.orderCount).toBe(3);
    expect(detail!.totals.orderCount).toBe(await listCount(id));
    // AC-8: assembled total is an exact integer (189000+120000+120000).
    expect(detail!.totals.totalCents).toBe(429000);
    expect(Number.isInteger(detail!.totals.totalCents)).toBe(true);
    // Newest-first ordering preserved through the read.
    expect(detail!.orders[0].totalCents).toBe(120000);
    expect(detail!.orders.map((o) => o.createdAt)).toEqual(
      [...detail!.orders.map((o) => o.createdAt)].sort((a, b) => (a < b ? 1 : -1)),
    );
    // First/last dates over ALL orders.
    expect(Date.parse(detail!.totals.firstOrderAt as string)).toBeLessThan(
      Date.parse(detail!.totals.lastOrderAt as string),
    );
  });

  it("reconciles a ZERO-order customer (detail count === list count === 0, edge 5)", async () => {
    const id = await makeCustomer();

    const detail = await getAdminCustomer(id);
    expect(detail).not.toBeNull();
    expect(detail!.totals.orderCount).toBe(0);
    expect(detail!.totals.orderCount).toBe(await listCount(id));
    expect(detail!.totals.totalCents).toBe(0);
    expect(detail!.totals.firstOrderAt).toBeNull();
    expect(detail!.totals.lastOrderAt).toBeNull();
    expect(detail!.orders).toEqual([]);
    expect(detail!.addresses).toEqual([]);
    expect(detail!.ordersTruncated).toBe(false);
    expect(detail!.historyFailed).toBe(false);
  });
});

describe("getAdminCustomer — history bound is SHOWN, not silent (edge 3)", () => {
  it("caps orders at CUSTOMER_ORDER_HISTORY_LIMIT, flags truncation, and keeps totals over ALL orders", async () => {
    const id = await makeCustomer();
    const overBy = 2;
    const total = CUSTOMER_ORDER_HISTORY_LIMIT + overBy;
    // Seed limit+overBy orders with monotonically increasing timestamps so the
    // newest-first slice is deterministic. Sequential inserts (shared local DB).
    for (let i = 0; i < total; i++) {
      const day = String((i % 27) + 1).padStart(2, "0");
      const hour = String(i % 24).padStart(2, "0");
      await makeOrderFor(id, {
        totalCents: 1000,
        createdAt: `2026-01-${day}T${hour}:00:00Z`,
      });
    }

    const detail = await getAdminCustomer(id);
    expect(detail).not.toBeNull();
    // The fetched slice is bounded…
    expect(detail!.orders).toHaveLength(CUSTOMER_ORDER_HISTORY_LIMIT);
    // …but the aggregate count reflects ALL orders (edge 3 — totals never tally
    // the fetched page)…
    expect(detail!.totals.orderCount).toBe(total);
    expect(detail!.totals.totalCents).toBe(total * 1000);
    // …and truncation is SHOWN via a flag the page turns into a footer, never
    // silently dropped.
    expect(detail!.ordersTruncated).toBe(true);
    // AC-9 still holds at the boundary: the list count also sees all orders.
    expect(detail!.totals.orderCount).toBe(await listCount(id));
  }, 40_000);

  it("does NOT flag truncation when the order count equals the limit exactly", async () => {
    // Boundary: orderCount === limit → ordersTruncated must be false (no ghost
    // footer). Seed exactly the limit.
    const id = await makeCustomer();
    for (let i = 0; i < CUSTOMER_ORDER_HISTORY_LIMIT; i++) {
      const day = String((i % 27) + 1).padStart(2, "0");
      const hour = String(i % 24).padStart(2, "0");
      await makeOrderFor(id, { totalCents: 500, createdAt: `2026-02-${day}T${hour}:00:00Z` });
    }

    const detail = await getAdminCustomer(id);
    expect(detail!.orders).toHaveLength(CUSTOMER_ORDER_HISTORY_LIMIT);
    expect(detail!.totals.orderCount).toBe(CUSTOMER_ORDER_HISTORY_LIMIT);
    expect(detail!.ordersTruncated).toBe(false);
  }, 40_000);
});

describe("getAdminCustomer — invalid / missing id guard (AC-10)", () => {
  it("returns null for a non-UUID id (→ notFound), with no DB dependency", async () => {
    expect(await getAdminCustomer("not-a-uuid")).toBeNull();
    expect(await getAdminCustomer("<script>alert(1)</script>")).toBeNull();
    expect(await getAdminCustomer("")).toBeNull();
    expect(await getAdminCustomer("1 OR 1=1")).toBeNull();
  });

  it("returns null for a well-formed UUID matching no customer (→ notFound), never throws", async () => {
    const orphan = randomUUID();
    expect(await getAdminCustomer(orphan)).toBeNull();
  });
});

describe("getAdminCustomer — identity + address assembly (AC-3, AC-6, edge 2/4)", () => {
  it("passes the raw sentinel email + phone through untouched for the page to render", async () => {
    const id = await makeCustomer({
      email: NO_EMAIL_PLACEHOLDER,
      fullName: "Manual Buyer",
      phone: "55 9999 0000",
    });
    await makeOrderFor(id);

    const detail = await getAdminCustomer(id);
    // The read never rewrites the email — the PAGE decides via isMailableAddress.
    expect(detail!.email).toBe(NO_EMAIL_PLACEHOLDER);
    expect(detail!.fullName).toBe("Manual Buyer");
    expect(detail!.phone).toBe("55 9999 0000");
  });

  it("surfaces DISTINCT shipping addresses de-duped, most-recent-first (AC-6, edge 4)", async () => {
    const id = await makeCustomer();
    await makeOrderFor(id, { city: "Guadalajara", createdAt: "2026-03-01T00:00:00Z" }); // oldest, addr A
    await makeOrderFor(id, { city: "Monterrey", createdAt: "2026-03-02T00:00:00Z" }); // addr B
    await makeOrderFor(id, { city: "Guadalajara", createdAt: "2026-03-03T00:00:00Z" }); // newest, addr A again

    const detail = await getAdminCustomer(id);
    // Two distinct cities → two address entries, newest-first (Guadalajara wins
    // the ordering because its most-recent order is the newest overall).
    expect(detail!.addresses).toHaveLength(2);
    expect(detail!.addresses[0].city).toBe("Guadalajara");
    expect(detail!.addresses[1].city).toBe("Monterrey");
  });
});
