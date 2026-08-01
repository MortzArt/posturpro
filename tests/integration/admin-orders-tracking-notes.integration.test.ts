/**
 * T12 order-detail persistence integration tests (AC-11/12/21) against a LIVE
 * local Supabase. Covers the DB contracts the tracking + internal-notes surfaces
 * rely on:
 *   - tracking columns (0012) are mutable on a live order (NOT frozen by the 0003
 *     immutability trigger) — the shipped email reads them (AC-11).
 *   - an empty tracking number is a legit NULL (ship-without-tracking, AC-12).
 *   - order_internal_notes: body length CHECK (1..2000) enforced, cascade-deletes
 *     with the order, and is fully RLS-denied to anon (admin-only, AC-21).
 *   - refunded_total reflects recorded partial refunds (the detail's "remaining
 *     refundable" balance line depends on it).
 *
 * Each test cleans up the order (+ cascading items/notes/history) it creates.
 */
import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { serviceClient } from "./local-supabase";

const db = serviceClient();

const createdOrderIds: string[] = [];

afterEach(async () => {
  if (createdOrderIds.length > 0) {
    await db.from("orders").delete().in("id", createdOrderIds.splice(0));
  }
});

async function makeOrder(totalCents = 10000): Promise<string> {
  const { data, error } = await db
    .from("orders")
    .insert({
      order_number: `PP-DTL-${randomUUID().slice(0, 8)}`,
      contact_email: "detail-it@example.com",
      shipping_full_name: "Detail Test",
      shipping_address_line1: "L1",
      shipping_city: "C",
      shipping_state: "Jalisco",
      shipping_postal_code: "44100",
      subtotal_cents: totalCents,
      shipping_cents: 0,
      discount_cents: 0,
      tax_base_cents: totalCents,
      tax_cents: 0,
      total_cents: totalCents,
      status: "paid",
      payment_status: "paid",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`could not create order: ${error?.message}`);
  createdOrderIds.push(data.id);
  return data.id;
}

describe("tracking columns (AC-11/12)", () => {
  it("persists tracking_number/carrier/url on a live order (columns not frozen)", async () => {
    const orderId = await makeOrder();
    const { error } = await db
      .from("orders")
      .update({ tracking_number: "1Z-INT-9", tracking_carrier: "DHL", tracking_url: "https://dhl/1Z-INT-9" })
      .eq("id", orderId);
    expect(error).toBeNull(); // the immutability trigger does NOT freeze the new tracking cols

    const { data } = await db
      .from("orders")
      .select("tracking_number, tracking_carrier, tracking_url")
      .eq("id", orderId)
      .single();
    expect(data).toMatchObject({
      tracking_number: "1Z-INT-9",
      tracking_carrier: "DHL",
      tracking_url: "https://dhl/1Z-INT-9",
    });
  });

  it("accepts a null tracking_number (ship without tracking, AC-12)", async () => {
    const orderId = await makeOrder();
    const { error } = await db
      .from("orders")
      .update({ tracking_number: null, tracking_carrier: "Estafeta", tracking_url: null })
      .eq("id", orderId);
    expect(error).toBeNull();

    const { data } = await db.from("orders").select("tracking_number, tracking_carrier").eq("id", orderId).single();
    expect(data).toMatchObject({ tracking_number: null, tracking_carrier: "Estafeta" });
  });
});

describe("order_internal_notes (AC-21)", () => {
  it("inserts a note and reads it back newest-first", async () => {
    const orderId = await makeOrder();
    await db.from("order_internal_notes").insert({ order_id: orderId, body: "primera nota" });
    await db.from("order_internal_notes").insert({ order_id: orderId, body: "segunda nota" });

    const { data } = await db
      .from("order_internal_notes")
      .select("body")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false });
    expect(data?.map((r) => r.body)).toEqual(["segunda nota", "primera nota"]);
  });

  it("rejects an empty / whitespace-only note (CHECK length 1..2000)", async () => {
    const orderId = await makeOrder();
    const { error: emptyErr } = await db.from("order_internal_notes").insert({ order_id: orderId, body: "" });
    expect(emptyErr).not.toBeNull();
    const { error: wsErr } = await db.from("order_internal_notes").insert({ order_id: orderId, body: "   " });
    expect(wsErr).not.toBeNull();
  });

  it("rejects an over-long note (> 2000 chars)", async () => {
    const orderId = await makeOrder();
    const { error } = await db
      .from("order_internal_notes")
      .insert({ order_id: orderId, body: "x".repeat(2001) });
    expect(error).not.toBeNull();
  });

  it("cascade-deletes notes when the order is deleted", async () => {
    const orderId = await makeOrder();
    await db.from("order_internal_notes").insert({ order_id: orderId, body: "to be cascaded" });

    await db.from("orders").delete().eq("id", orderId);
    createdOrderIds.splice(createdOrderIds.indexOf(orderId), 1); // already deleted

    const { data } = await db.from("order_internal_notes").select("id").eq("order_id", orderId);
    expect(data).toEqual([]);
  });

  it("is fully RLS-denied to the anon role (admin-only note store)", async () => {
    const orderId = await makeOrder();
    await db.from("order_internal_notes").insert({ order_id: orderId, body: "secret admin note" });

    const { anonClient } = await import("./local-supabase");
    const anon = anonClient();
    const { data, error } = await anon.from("order_internal_notes").select("body").eq("order_id", orderId);
    // The table has NO anon grant at all (service_role-only, mirrors orders/
    // payments posture), so anon is denied at the privilege layer with 42501
    // BEFORE RLS is even consulted — an even stronger deny than empty-RLS. Either
    // way, the security property holds: the note body NEVER reaches anon.
    expect(data ?? []).toEqual([]);
    expect(error?.code === "42501" || error === null).toBe(true);
    expect(JSON.stringify(data ?? [])).not.toContain("secret admin note");
  });

  it("denies an anon INSERT into the note store (no privilege escalation)", async () => {
    const orderId = await makeOrder();
    const { anonClient } = await import("./local-supabase");
    const anon = anonClient();
    const { error } = await anon.from("order_internal_notes").insert({ order_id: orderId, body: "anon injected" });
    expect(error).not.toBeNull(); // denied — anon cannot write admin notes

    // Confirm via the service client that no anon row landed.
    const { data } = await db.from("order_internal_notes").select("body").eq("order_id", orderId);
    expect(data ?? []).toEqual([]);
  });
});

describe("refunded_total reflects the ledger (detail balance line)", () => {
  it("sums recorded partial refunds for the remaining-refundable balance", async () => {
    const orderId = await makeOrder(100000);
    const paymentId = `PAY-DTL-${randomUUID().slice(0, 8)}`;
    await db.rpc("record_refund", {
      p_order_id: orderId,
      p_mp_payment_id: paymentId,
      p_mp_refund_id: `RF-${randomUUID().slice(0, 8)}`,
      p_amount_cents: 25000,
      p_is_full: false,
    });

    const { data: total } = await db.rpc("refunded_total", { p_order_id: orderId });
    expect(total).toBe(25000);
  });
});
