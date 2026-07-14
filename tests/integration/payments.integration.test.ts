/**
 * advance_order_status RPC + mp_payment_events integration (T8 AC-10, AC-13,
 * AC-15, edges 1/2) against a LIVE local Supabase, through the service-role
 * client (exactly what the webhook + refund fn use). Verifies:
 *   - advance: mutable columns updated + an order_status_history row written (AC-13).
 *   - idempotency: a repeat transition to the SAME status is a no-op with NO
 *     duplicate history row (AC-15).
 *   - regression guard: a paid order is never moved back to pending_payment (edge 2).
 *   - order_not_found: a random id returns a typed no-op, never an error.
 *   - mp_payment_events unique(mp_payment_id) rejects a duplicate (AC-10, edge 1).
 *
 * Every test deletes the order it creates (history + events cascade), leaving the
 * seed untouched.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { serviceClient } from "./local-supabase";

const db = serviceClient();

const createdOrderIds: string[] = [];

/** Insert a bare pending order directly (no stock movement needed for these tests). */
async function makePendingOrder(totalCents = 10000): Promise<string> {
  const { data, error } = await db
    .from("orders")
    .insert({
      order_number: `PP-IT-${randomUUID().slice(0, 8)}`,
      contact_email: "it@example.com",
      shipping_full_name: "Integration Test",
      shipping_address_line1: "Line 1",
      shipping_city: "City",
      shipping_state: "Jalisco",
      shipping_postal_code: "44100",
      subtotal_cents: totalCents,
      shipping_cents: 0,
      discount_cents: 0,
      tax_base_cents: totalCents,
      tax_cents: 0,
      total_cents: totalCents,
      status: "pending_payment",
      payment_status: "pending",
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`could not create test order: ${error?.message}`);
  }
  createdOrderIds.push(data.id);
  return data.id;
}

beforeAll(() => {
  // sanity: the service client is against local (assertLocalOnly runs in serviceClient()).
  expect(db).toBeTruthy();
});

afterEach(async () => {
  if (createdOrderIds.length > 0) {
    await db.from("orders").delete().in("id", createdOrderIds.splice(0));
  }
});

describe("advance_order_status RPC (live local DB)", () => {
  it("advances pending → paid, updates mutable cols + writes history (AC-13)", async () => {
    const orderId = await makePendingOrder();
    const { data, error } = await db.rpc("advance_order_status", {
      p_order_id: orderId,
      p_order_status: "paid",
      p_payment_status: "paid",
      p_payment_method: "card",
      p_mp_payment_id: "MP-INT-1",
      p_note: "approved (integration)",
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({ applied: true, reason: "advanced", to_status: "paid" });

    const { data: order } = await db
      .from("orders")
      .select("status, payment_status, payment_method, mp_payment_id")
      .eq("id", orderId)
      .single();
    expect(order).toMatchObject({
      status: "paid",
      payment_status: "paid",
      payment_method: "card",
      mp_payment_id: "MP-INT-1",
    });

    const { data: history } = await db
      .from("order_status_history")
      .select("from_status, to_status")
      .eq("order_id", orderId);
    expect(history).toEqual([{ from_status: "pending_payment", to_status: "paid" }]);
  });

  it("is idempotent: a second advance to the SAME status is a no-op, no dup history (AC-15)", async () => {
    const orderId = await makePendingOrder();
    await db.rpc("advance_order_status", {
      p_order_id: orderId,
      p_order_status: "paid",
      p_payment_status: "paid",
      p_mp_payment_id: "MP-INT-2",
      p_note: "first",
    });
    const { data: second } = await db.rpc("advance_order_status", {
      p_order_id: orderId,
      p_order_status: "paid",
      p_payment_status: "paid",
      p_mp_payment_id: "MP-INT-2",
      p_note: "second (duplicate webhook)",
    });
    expect(second).toMatchObject({ applied: false, reason: "noop_same_status" });

    const { data: history } = await db
      .from("order_status_history")
      .select("id")
      .eq("order_id", orderId);
    expect(history).toHaveLength(1); // NO duplicate history row
  });

  it("refuses to regress a paid order back to pending_payment (out-of-order webhook, edge 2)", async () => {
    const orderId = await makePendingOrder();
    await db.rpc("advance_order_status", {
      p_order_id: orderId,
      p_order_status: "paid",
      p_payment_status: "paid",
      p_note: "approved",
    });
    const { data: stale } = await db.rpc("advance_order_status", {
      p_order_id: orderId,
      p_order_status: "pending_payment",
      p_payment_status: "failed",
      p_note: "stale pending arrives after approved",
    });
    expect(stale).toMatchObject({ applied: false, reason: "regression_blocked" });

    const { data: order } = await db
      .from("orders")
      .select("status, payment_status")
      .eq("id", orderId)
      .single();
    expect(order).toMatchObject({ status: "paid" }); // never regressed
  });

  it("returns order_not_found (typed, no error) for a random order id", async () => {
    const { data, error } = await db.rpc("advance_order_status", {
      p_order_id: randomUUID(),
      p_order_status: "paid",
      p_payment_status: "paid",
      p_note: "ghost",
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({ applied: false, reason: "order_not_found" });
  });

  it("advances pending → pending refining payment fields but writes no history (lateral)", async () => {
    const orderId = await makePendingOrder();
    const { data } = await db.rpc("advance_order_status", {
      p_order_id: orderId,
      p_order_status: "pending_payment",
      p_payment_status: "pending",
      p_payment_method: "oxxo",
      p_mp_payment_id: "MP-OXXO-1",
      p_note: "oxxo voucher issued",
    });
    expect(data).toMatchObject({ applied: false, reason: "noop_same_status" });
    // payment fields still refined on the lateral no-op.
    const { data: order } = await db
      .from("orders")
      .select("payment_method, mp_payment_id")
      .eq("id", orderId)
      .single();
    expect(order).toMatchObject({ payment_method: "oxxo", mp_payment_id: "MP-OXXO-1" });
  });
});

describe("mp_payment_events idempotency spine (live local DB)", () => {
  it("rejects a duplicate mp_payment_id via the unique constraint (AC-10, edge 1)", async () => {
    const orderId = await makePendingOrder();
    const paymentId = `EVT-${randomUUID().slice(0, 8)}`;

    const first = await db.from("mp_payment_events").insert({
      mp_payment_id: paymentId,
      order_id: orderId,
      mp_status: "approved",
    });
    expect(first.error).toBeNull();

    const dup = await db.from("mp_payment_events").insert({
      mp_payment_id: paymentId,
      order_id: orderId,
      mp_status: "approved",
    });
    expect(dup.error).not.toBeNull();
    expect(dup.error?.code).toBe("23505"); // unique_violation
  });

  it("cascades event rows when the order is deleted", async () => {
    const orderId = await makePendingOrder();
    const paymentId = `EVT-${randomUUID().slice(0, 8)}`;
    await db.from("mp_payment_events").insert({ mp_payment_id: paymentId, order_id: orderId });

    await db.from("orders").delete().eq("id", orderId);
    createdOrderIds.splice(createdOrderIds.indexOf(orderId), 1); // already deleted

    const { data } = await db
      .from("mp_payment_events")
      .select("id")
      .eq("mp_payment_id", paymentId);
    expect(data).toEqual([]);
  });
});
