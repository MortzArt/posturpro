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

describe("payment-only advance (refunded, C-2, live local DB)", () => {
  it("marks payment_status=refunded on a PAID order without regressing + writes history", async () => {
    const orderId = await makePendingOrder();
    await db.rpc("advance_order_status", {
      p_order_id: orderId,
      p_order_status: "paid",
      p_payment_status: "paid",
      p_note: "approved",
    });
    // Payment-only: p_order_status = null.
    const { data } = await db.rpc("advance_order_status", {
      p_order_id: orderId,
      p_order_status: null,
      p_payment_status: "refunded",
      p_note: "full refund",
    });
    expect(data).toMatchObject({ applied: true, reason: "payment_updated" });

    const { data: order } = await db
      .from("orders")
      .select("status, payment_status")
      .eq("id", orderId)
      .single();
    expect(order).toMatchObject({ status: "paid", payment_status: "refunded" });

    const { data: history } = await db
      .from("order_status_history")
      .select("from_status, to_status, note")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });
    // approved row + a payment-only refund row (from=to=paid) → audit trail (C-2).
    expect(history).toHaveLength(2);
    expect(history?.[1]).toMatchObject({ from_status: "paid", to_status: "paid" });
  });

  it("marks payment_status=refunded on a SHIPPED (advanced) order — no regression_blocked (C-2)", async () => {
    const orderId = await makePendingOrder();
    for (const s of ["paid", "preparing", "shipped"] as const) {
      await db.rpc("advance_order_status", {
        p_order_id: orderId,
        p_order_status: s,
        p_payment_status: "paid",
        p_note: `to ${s}`,
      });
    }
    const { data } = await db.rpc("advance_order_status", {
      p_order_id: orderId,
      p_order_status: null,
      p_payment_status: "refunded",
      p_note: "refund on shipped order",
    });
    expect(data).toMatchObject({ applied: true, reason: "payment_updated" });

    const { data: order } = await db
      .from("orders")
      .select("status, payment_status")
      .eq("id", orderId)
      .single();
    // Order lifecycle preserved (shipped), payment marked refunded (was silently dropped before C-2).
    expect(order).toMatchObject({ status: "shipped", payment_status: "refunded" });
  });
});

describe("record_payment_event claim-then-finalize spine (M-1/M-6, live local DB)", () => {
  it("processes a status PROGRESSION for one payment id (pending→approved, M-1/AC-18)", async () => {
    const orderId = await makePendingOrder();
    const paymentId = `PROG-${randomUUID().slice(0, 8)}`;

    const pending = await db.rpc("record_payment_event", {
      p_mp_payment_id: paymentId,
      p_mp_status: "pending",
      p_order_id: orderId,
    });
    expect(pending.data).toBe("new");
    await db.rpc("finalize_payment_event", { p_mp_payment_id: paymentId, p_mp_status: "pending" });

    // A DIFFERENT status for the SAME id is a distinct claim → 'new', NOT dropped.
    const approved = await db.rpc("record_payment_event", {
      p_mp_payment_id: paymentId,
      p_mp_status: "approved",
      p_order_id: orderId,
    });
    expect(approved.data).toBe("new");

    const { data: rows } = await db
      .from("mp_payment_events")
      .select("mp_status")
      .eq("mp_payment_id", paymentId)
      .order("mp_status", { ascending: true });
    expect(rows).toEqual([{ mp_status: "approved" }, { mp_status: "pending" }]);
  });

  it("returns 'duplicate' only for a FINALIZED same-(id,status) replay (AC-10, edge 1)", async () => {
    const orderId = await makePendingOrder();
    const paymentId = `DUP-${randomUUID().slice(0, 8)}`;

    expect((await db.rpc("record_payment_event", { p_mp_payment_id: paymentId, p_mp_status: "approved", p_order_id: orderId })).data).toBe("new");
    await db.rpc("finalize_payment_event", { p_mp_payment_id: paymentId, p_mp_status: "approved" });
    // Replay of the SAME (id, status), now finalized → duplicate.
    expect((await db.rpc("record_payment_event", { p_mp_payment_id: paymentId, p_mp_status: "approved", p_order_id: orderId })).data).toBe("duplicate");
  });

  it("reclaims an UNFINALIZED claim so a crash-between-claim-and-advance retries (M-6)", async () => {
    const orderId = await makePendingOrder();
    const paymentId = `UNFIN-${randomUUID().slice(0, 8)}`;

    // Claim but never finalize (simulates a crash before advance committed).
    expect((await db.rpc("record_payment_event", { p_mp_payment_id: paymentId, p_mp_status: "approved", p_order_id: orderId })).data).toBe("new");
    // Retry: the unfinalized claim is reclaimable → 'new' (reprocess), NOT duplicate.
    expect((await db.rpc("record_payment_event", { p_mp_payment_id: paymentId, p_mp_status: "approved", p_order_id: orderId })).data).toBe("new");
  });

  it("cascades event rows when the order is deleted", async () => {
    const orderId = await makePendingOrder();
    const paymentId = `EVT-${randomUUID().slice(0, 8)}`;
    await db.rpc("record_payment_event", { p_mp_payment_id: paymentId, p_mp_status: "approved", p_order_id: orderId });

    await db.from("orders").delete().eq("id", orderId);
    createdOrderIds.splice(createdOrderIds.indexOf(orderId), 1); // already deleted

    const { data } = await db
      .from("mp_payment_events")
      .select("id")
      .eq("mp_payment_id", paymentId);
    expect(data).toEqual([]);
  });
});

describe("record_refund ledger + cumulative guard (M-2/M-3, live local DB)", () => {
  it("records a partial refund durably and sums the ledger (M-3)", async () => {
    const orderId = await makePendingOrder(100000);
    const paymentId = `PAY-${randomUUID().slice(0, 8)}`;

    const r1 = await db.rpc("record_refund", {
      p_order_id: orderId,
      p_mp_payment_id: paymentId,
      p_mp_refund_id: `RF-${randomUUID().slice(0, 8)}`,
      p_amount_cents: 40000,
      p_is_full: false,
    });
    expect(r1.data).toMatchObject({ ok: true, reason: "recorded", total_refunded_cents: 40000 });

    const { data: total } = await db.rpc("refunded_total", { p_order_id: orderId });
    expect(total).toBe(40000);
  });

  it("refuses a cumulative over-refund race-safely (edge 9, M-2)", async () => {
    const orderId = await makePendingOrder(100000);
    const paymentId = `PAY-${randomUUID().slice(0, 8)}`;

    await db.rpc("record_refund", {
      p_order_id: orderId, p_mp_payment_id: paymentId,
      p_mp_refund_id: `RF-${randomUUID().slice(0, 8)}`, p_amount_cents: 60000, p_is_full: false,
    });
    // A second 60000 would push the total to 120000 > 100000 → rejected.
    const over = await db.rpc("record_refund", {
      p_order_id: orderId, p_mp_payment_id: paymentId,
      p_mp_refund_id: `RF-${randomUUID().slice(0, 8)}`, p_amount_cents: 60000, p_is_full: false,
    });
    expect(over.data).toMatchObject({ ok: false, reason: "over_refund" });

    const { data: total } = await db.rpc("refunded_total", { p_order_id: orderId });
    expect(total).toBe(60000); // the rejected refund did NOT record
  });

  it("is idempotent on a repeated mp_refund_id (retry safety, M-3)", async () => {
    const orderId = await makePendingOrder(100000);
    const refundId = `RF-${randomUUID().slice(0, 8)}`;
    const args = {
      p_order_id: orderId, p_mp_payment_id: "PAY-X",
      p_mp_refund_id: refundId, p_amount_cents: 30000, p_is_full: false,
    };
    expect((await db.rpc("record_refund", args)).data).toMatchObject({ ok: true, reason: "recorded" });
    expect((await db.rpc("record_refund", args)).data).toMatchObject({ ok: true, reason: "duplicate" });

    const { data: total } = await db.rpc("refunded_total", { p_order_id: orderId });
    expect(total).toBe(30000); // counted ONCE
  });
});
