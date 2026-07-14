/**
 * T9 email-plumbing integration against a LIVE local Supabase (AC-1..AC-5, edges
 * 1/3/4/7), through the service-role client (what dispatch uses). Verifies the
 * 0010 migration end-to-end: transition_kind derivation + persistence, orders.locale
 * persistence + immutability, the email_sends ledger + claim_email_send exactly-once
 * guarantee, and RLS (anon fully denied). No provider send here — the ledger is the
 * subject under test; dispatch's send path is unit-tested with a mocked provider.
 *
 * Every test deletes the order it creates (history + email_sends cascade), leaving
 * the seed untouched.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { anonClient, serviceClient } from "./local-supabase";
import type { OrderStatus, PaymentStatus } from "@/lib/supabase/database.types";

const db = serviceClient();
const createdOrderIds: string[] = [];

/** Insert a bare pending order directly (locale controllable). */
async function makeOrder(locale = "es-MX", totalCents = 10000): Promise<string> {
  const { data, error } = await db
    .from("orders")
    .insert({
      order_number: `PP-EM-${randomUUID().slice(0, 8)}`,
      contact_email: "email-it@example.com",
      shipping_full_name: "Email IT",
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
      locale,
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
  expect(db).toBeTruthy();
});

afterEach(async () => {
  if (createdOrderIds.length > 0) {
    await db.from("orders").delete().in("id", createdOrderIds.splice(0));
  }
});

describe("orders.locale persistence + immutability (AC-4, edge 3/7)", () => {
  it("persists 'en' and keeps it stable across a full transition sequence", async () => {
    const orderId = await makeOrder("en");

    // Advance pending → paid → refunded (payment-only). locale must never change.
    await db.rpc("advance_order_status", {
      p_order_id: orderId, p_order_status: "paid", p_payment_status: "paid",
      p_payment_method: "card", p_mp_payment_id: "MP-EM-1", p_note: "approved",
    });
    await db.rpc("advance_order_status", {
      p_order_id: orderId, p_order_status: null, p_payment_status: "refunded",
      p_mp_payment_id: "MP-EM-1", p_note: "refund",
    });

    const { data } = await db.from("orders").select("locale").eq("id", orderId).single();
    expect(data?.locale).toBe("en");
  });

  it("rejects a locale outside the shipped set (CHECK constraint)", async () => {
    const { error } = await db
      .from("orders")
      .insert({
        order_number: `PP-EM-${randomUUID().slice(0, 8)}`,
        contact_email: "x@example.com",
        shipping_full_name: "X",
        shipping_address_line1: "L1",
        shipping_city: "C",
        shipping_state: "Jalisco",
        shipping_postal_code: "44100",
        subtotal_cents: 100,
        tax_base_cents: 100,
        total_cents: 100,
        status: "pending_payment",
        payment_status: "pending",
        locale: "fr-FR",
      });
    expect(error).not.toBeNull();
  });
});

describe("transition_kind derivation + persistence (TD-2, AC-2/AC-3)", () => {
  it("derives 'paid' on an approved advance + writes it to history", async () => {
    const orderId = await makeOrder();
    const { data } = await db.rpc("advance_order_status", {
      p_order_id: orderId, p_order_status: "paid", p_payment_status: "paid",
      p_payment_method: "card", p_mp_payment_id: "MP-EM-2", p_note: "approved",
    });
    expect(data).toMatchObject({ transition_kind: "paid" });

    const { data: history } = await db
      .from("order_status_history")
      .select("transition_kind, to_status")
      .eq("order_id", orderId)
      .order("created_at");
    // Initial create row = 'noop', then the 'paid' advance.
    const kinds = (history ?? []).map((row) => row.transition_kind);
    expect(kinds).toContain("paid");
  });

  it("derives 'refunded' on a payment-only refund (from==to), unambiguous (TD-2)", async () => {
    const orderId = await makeOrder();
    await db.rpc("advance_order_status", {
      p_order_id: orderId, p_order_status: "paid", p_payment_status: "paid",
      p_mp_payment_id: "MP-EM-3", p_note: "approved",
    });
    const { data } = await db.rpc("advance_order_status", {
      p_order_id: orderId, p_order_status: null, p_payment_status: "refunded",
      p_mp_payment_id: "MP-EM-3", p_note: "refund",
    });
    expect(data).toMatchObject({ transition_kind: "refunded" });
  });

  it("reports 'noop' for a truly-identical re-notification (no email re-trigger)", async () => {
    const orderId = await makeOrder();
    await db.rpc("advance_order_status", {
      p_order_id: orderId, p_order_status: "paid", p_payment_status: "paid",
      p_mp_payment_id: "MP-EM-4", p_note: "approved",
    });
    // Repeat the exact same paid transition — no material change.
    const { data } = await db.rpc("advance_order_status", {
      p_order_id: orderId, p_order_status: "paid", p_payment_status: "paid",
      p_mp_payment_id: "MP-EM-4", p_note: "approved (again)",
    });
    expect(data).toMatchObject({ reason: "noop_same_status", transition_kind: "noop" });
  });
});

describe("transition_kind matrix — every legal transition (TD-2, AC-2)", () => {
  /** Advance a fresh order through a status and return the RPC's transition_kind. */
  async function kindFor(args: {
    orderStatus: OrderStatus | null;
    paymentStatus: PaymentStatus;
    seedTo?: { orderStatus: OrderStatus; paymentStatus: PaymentStatus };
  }): Promise<string> {
    const orderId = await makeOrder();
    if (args.seedTo) {
      // Move the order to an intermediate lifecycle state first (rank must not
      // regress). Payment id differs so it's a real change.
      await db.rpc("advance_order_status", {
        p_order_id: orderId, p_order_status: args.seedTo.orderStatus,
        p_payment_status: args.seedTo.paymentStatus, p_mp_payment_id: "MP-SEED", p_note: "seed",
      });
    }
    const { data } = await db.rpc("advance_order_status", {
      p_order_id: orderId, p_order_status: args.orderStatus,
      p_payment_status: args.paymentStatus, p_mp_payment_id: "MP-TK", p_note: "matrix",
    });
    return (data as { transition_kind: string }).transition_kind;
  }

  it("pending_payment → paid yields 'paid'", async () => {
    expect(await kindFor({ orderStatus: "paid", paymentStatus: "paid" })).toBe("paid");
  });

  it("pending_payment same-status WITH a payment change to 'pending' derives 'payment_pending'", async () => {
    // The seed order is (pending_payment, pending). Advancing to the SAME status
    // with the SAME payment_status is a no-material-change → 'noop' (a redelivery
    // must not re-trigger — see the noop test). To exercise the 'payment_pending'
    // derivation we must actually CHANGE the payment_status: failed → pending.
    const orderId = await makeOrder();
    await db.rpc("advance_order_status", {
      p_order_id: orderId, p_order_status: "pending_payment", p_payment_status: "failed",
      p_mp_payment_id: "MP-PP", p_note: "failed first",
    });
    const { data } = await db.rpc("advance_order_status", {
      p_order_id: orderId, p_order_status: "pending_payment", p_payment_status: "pending",
      p_mp_payment_id: "MP-PP", p_note: "back to pending",
    });
    expect((data as { transition_kind: string }).transition_kind).toBe("payment_pending");
  });

  it("pending_payment with a payment change to 'failed' derives 'payment_failed'", async () => {
    // Seed is (pending_payment, pending); a real change to 'failed' derives the kind.
    expect(await kindFor({ orderStatus: "pending_payment", paymentStatus: "failed" })).toBe("payment_failed");
  });

  it("paid → preparing yields 'preparing'", async () => {
    expect(await kindFor({
      orderStatus: "preparing", paymentStatus: "paid",
      seedTo: { orderStatus: "paid", paymentStatus: "paid" },
    })).toBe("preparing");
  });

  it("preparing → shipped yields 'shipped'", async () => {
    expect(await kindFor({
      orderStatus: "shipped", paymentStatus: "paid",
      seedTo: { orderStatus: "preparing", paymentStatus: "paid" },
    })).toBe("shipped");
  });

  it("shipped → delivered yields 'delivered'", async () => {
    const orderId = await makeOrder();
    for (const st of ["paid", "preparing", "shipped"] as const) {
      await db.rpc("advance_order_status", {
        p_order_id: orderId, p_order_status: st, p_payment_status: "paid",
        p_mp_payment_id: "MP-D", p_note: st,
      });
    }
    const { data } = await db.rpc("advance_order_status", {
      p_order_id: orderId, p_order_status: "delivered", p_payment_status: "paid",
      p_mp_payment_id: "MP-D", p_note: "delivered",
    });
    expect((data as { transition_kind: string }).transition_kind).toBe("delivered");
  });

  it("pending_payment → cancelled yields 'cancelled'", async () => {
    expect(await kindFor({ orderStatus: "cancelled", paymentStatus: "pending" })).toBe("cancelled");
  });

  it("payment-only authorized (order_status null) yields 'payment_authorized'", async () => {
    expect(await kindFor({ orderStatus: null, paymentStatus: "authorized" })).toBe("payment_authorized");
  });

  it("payment-only refunded (from==to row) yields 'refunded' — unambiguous (TD-2)", async () => {
    const orderId = await makeOrder();
    await db.rpc("advance_order_status", {
      p_order_id: orderId, p_order_status: "paid", p_payment_status: "paid",
      p_mp_payment_id: "MP-R", p_note: "paid",
    });
    const { data } = await db.rpc("advance_order_status", {
      p_order_id: orderId, p_order_status: null, p_payment_status: "refunded",
      p_mp_payment_id: "MP-R", p_note: "refund",
    });
    expect((data as { transition_kind: string }).transition_kind).toBe("refunded");
  });

  it("REGRESSION contract unchanged from T8: a backward move is regression_blocked + kind 'noop'", async () => {
    const orderId = await makeOrder();
    await db.rpc("advance_order_status", {
      p_order_id: orderId, p_order_status: "shipped", p_payment_status: "paid",
      p_mp_payment_id: "MP-REG", p_note: "shipped",
    });
    // Attempt to move BACK to paid (rank 1 < shipped rank 3) → blocked.
    const { data } = await db.rpc("advance_order_status", {
      p_order_id: orderId, p_order_status: "paid", p_payment_status: "paid",
      p_mp_payment_id: "MP-REG", p_note: "regress",
    });
    expect(data).toMatchObject({ applied: false, reason: "regression_blocked", transition_kind: "noop" });
  });

  it("order_not_found contract unchanged: kind 'noop' for a nonexistent order", async () => {
    const { data } = await db.rpc("advance_order_status", {
      p_order_id: randomUUID(), p_order_status: "paid", p_payment_status: "paid",
      p_mp_payment_id: "MP-NF", p_note: "ghost",
    });
    expect(data).toMatchObject({ applied: false, reason: "order_not_found", transition_kind: "noop" });
  });
});

describe("email_sends ledger + claim_email_send (AC-5, edge 1/4)", () => {
  it("claims 'new' once then 'duplicate' for the same triple (exactly-once, edge 1)", async () => {
    const orderId = await makeOrder();
    const first = await db.rpc("claim_email_send", {
      p_order_id: orderId, p_email_kind: "payment_received", p_dedupe_key: "MP-EM-5",
    });
    const second = await db.rpc("claim_email_send", {
      p_order_id: orderId, p_email_kind: "payment_received", p_dedupe_key: "MP-EM-5",
    });
    expect(first.data).toBe("new");
    expect(second.data).toBe("duplicate");
  });

  it("treats distinct email_kinds as distinct claims (voucher then payment, edge 4)", async () => {
    const orderId = await makeOrder();
    const voucher = await db.rpc("claim_email_send", {
      p_order_id: orderId, p_email_kind: "voucher_instructions", p_dedupe_key: "MP-EM-6",
    });
    const payment = await db.rpc("claim_email_send", {
      p_order_id: orderId, p_email_kind: "payment_received", p_dedupe_key: "MP-EM-6",
    });
    expect(voucher.data).toBe("new");
    expect(payment.data).toBe("new");
  });

  it("one-per-order kinds dedupe on the empty key", async () => {
    const orderId = await makeOrder();
    const first = await db.rpc("claim_email_send", {
      p_order_id: orderId, p_email_kind: "order_confirmation", p_dedupe_key: "",
    });
    const second = await db.rpc("claim_email_send", {
      p_order_id: orderId, p_email_kind: "order_confirmation", p_dedupe_key: "",
    });
    expect(first.data).toBe("new");
    expect(second.data).toBe("duplicate");
  });

  it("finalize stamps sent_at on the claimed row", async () => {
    const orderId = await makeOrder();
    await db.rpc("claim_email_send", {
      p_order_id: orderId, p_email_kind: "order_confirmation", p_dedupe_key: "",
    });
    await db.rpc("finalize_email_send", {
      p_order_id: orderId, p_email_kind: "order_confirmation", p_dedupe_key: "",
    });
    const { data } = await db
      .from("email_sends")
      .select("sent_at")
      .eq("order_id", orderId)
      .eq("email_kind", "order_confirmation")
      .single();
    expect(data?.sent_at).not.toBeNull();
  });

  it("CONCURRENT claims for the same triple resolve to exactly one 'new' (race-safe, edge 1, QA S5 focus #6)", async () => {
    const orderId = await makeOrder();
    // Fire N concurrent claims for the SAME (order, kind, dedupe_key). The unique
    // constraint + insert-on-conflict-do-nothing must yield exactly ONE 'new'.
    const CONCURRENCY = 8;
    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, () =>
        db.rpc("claim_email_send", {
          p_order_id: orderId, p_email_kind: "payment_received", p_dedupe_key: "MP-RACE",
        }),
      ),
    );
    const outcomes = results.map((r) => r.data);
    expect(outcomes.filter((o) => o === "new")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "duplicate")).toHaveLength(CONCURRENCY - 1);
    // And exactly one ledger row physically exists.
    const { data: rows } = await db
      .from("email_sends")
      .select("id")
      .eq("order_id", orderId)
      .eq("email_kind", "payment_received")
      .eq("dedupe_key", "MP-RACE");
    expect(rows ?? []).toHaveLength(1);
  });

  it("denies anon all access to email_sends (RLS)", async () => {
    const orderId = await makeOrder();
    await db.rpc("claim_email_send", {
      p_order_id: orderId, p_email_kind: "order_confirmation", p_dedupe_key: "",
    });
    const anon = anonClient();
    const { data } = await anon.from("email_sends").select("id").eq("order_id", orderId);
    // RLS deny → no rows visible to anon (empty, never the row).
    expect(data ?? []).toEqual([]);
  });
});
