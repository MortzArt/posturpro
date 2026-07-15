/**
 * Store-settings write-path integration tests (T10 AC-9, AC-10, AC-13, edges 5/8)
 * against a LIVE local Supabase. These exercise the ACTUAL DB contract the admin
 * settings write depends on: the `store_settings` singleton, its CHECK
 * constraints, the `updated_at` trigger, and the RLS grant boundary (no client
 * role may write; only the RLS-bypass service role can).
 *
 * We drive the DB through the SAME `service_role` client that `createAdminClient`
 * uses in production (the well-known local key, RLS-bypassing) — so the UPDATE /
 * INSERT paths in `updateStoreSettings` are verified against real constraints,
 * not mocks. The suite RESTORES the seeded row in `afterAll` so it leaves the DB
 * pristine for the next suite (the runner also reseeds, but be a good citizen).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { anonClient, serviceClient } from "./local-supabase";
import { CURRENCY } from "@/lib/config";

const db = serviceClient();

interface Snapshot {
  id: string;
  store_name: string;
  contact_email: string;
  shipping_flat_rate_cents: number;
  free_shipping_threshold_cents: number;
  currency: string;
  updated_at: string;
}

let seeded: Snapshot;

const SELECT =
  "id, store_name, contact_email, shipping_flat_rate_cents, free_shipping_threshold_cents, currency, updated_at";

async function readRow(): Promise<Snapshot> {
  const { data, error } = await db.from("store_settings").select(SELECT).single();
  if (error || !data) throw new Error(`store_settings read failed: ${error?.message}`);
  return data as Snapshot;
}

beforeAll(async () => {
  seeded = await readRow();
});

afterAll(async () => {
  // Restore the exact seeded values so the row is pristine for the next suite.
  await db
    .from("store_settings")
    .update({
      store_name: seeded.store_name,
      contact_email: seeded.contact_email,
      shipping_flat_rate_cents: seeded.shipping_flat_rate_cents,
      free_shipping_threshold_cents: seeded.free_shipping_threshold_cents,
    })
    .eq("id", seeded.id);
});

describe("store_settings singleton + seeded shape (AC-8)", () => {
  it("is a single seeded row with MXN currency", async () => {
    const { data, error } = await db.from("store_settings").select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(seeded.currency).toBe(CURRENCY);
  });
});

describe("update path writes and touches updated_at (AC-9, edge 5)", () => {
  it("UPDATE by id changes the four editable columns and bumps updated_at", async () => {
    const before = await readRow();
    const next = {
      store_name: "QA Write-Path Store",
      contact_email: "qa-write@example.com",
      shipping_flat_rate_cents: 12_345,
      free_shipping_threshold_cents: 678_900,
    };

    const { error } = await db
      .from("store_settings")
      .update(next)
      .eq("id", before.id);
    expect(error).toBeNull();

    const after = await readRow();
    expect(after.store_name).toBe(next.store_name);
    expect(after.contact_email).toBe(next.contact_email);
    expect(after.shipping_flat_rate_cents).toBe(12_345);
    expect(after.free_shipping_threshold_cents).toBe(678_900);
    // The `store_settings_set_updated_at` trigger moves updated_at forward.
    expect(new Date(after.updated_at).getTime()).toBeGreaterThanOrEqual(
      new Date(before.updated_at).getTime(),
    );
    // Currency is NOT touched by an admin edit (Phase 1: not user-editable).
    expect(after.currency).toBe(before.currency);
  });

  it("accepts money edge values 0 (flat) and 0 (threshold) — CHECK is >= 0 (edge 6)", async () => {
    const before = await readRow();
    const { error } = await db
      .from("store_settings")
      .update({ shipping_flat_rate_cents: 0, free_shipping_threshold_cents: 0 })
      .eq("id", before.id);
    expect(error).toBeNull();
    const after = await readRow();
    expect(after.shipping_flat_rate_cents).toBe(0);
    expect(after.free_shipping_threshold_cents).toBe(0);
  });
});

describe("DB CHECK constraints reject invalid writes (AC-10 defense-in-depth)", () => {
  it("rejects a blank store name (store_settings_name_nonblank)", async () => {
    const before = await readRow();
    const { error } = await db
      .from("store_settings")
      .update({ store_name: "   " })
      .eq("id", before.id);
    // A blank/whitespace-only name violates the 1..200-char non-blank CHECK.
    expect(error).not.toBeNull();
    const after = await readRow();
    expect(after.store_name).toBe(before.store_name);
  });

  it("rejects a name longer than 200 chars", async () => {
    const before = await readRow();
    const { error } = await db
      .from("store_settings")
      .update({ store_name: "x".repeat(201) })
      .eq("id", before.id);
    expect(error).not.toBeNull();
    const after = await readRow();
    expect(after.store_name).toBe(before.store_name);
  });

  it("rejects a negative flat rate (cents >= 0 CHECK)", async () => {
    const before = await readRow();
    const { error } = await db
      .from("store_settings")
      .update({ shipping_flat_rate_cents: -1 })
      .eq("id", before.id);
    expect(error).not.toBeNull();
    const after = await readRow();
    expect(after.shipping_flat_rate_cents).toBe(before.shipping_flat_rate_cents);
  });

  it("rejects a negative free-shipping threshold (cents >= 0 CHECK)", async () => {
    const before = await readRow();
    const { error } = await db
      .from("store_settings")
      .update({ free_shipping_threshold_cents: -50 })
      .eq("id", before.id);
    expect(error).not.toBeNull();
    const after = await readRow();
    expect(after.free_shipping_threshold_cents).toBe(
      before.free_shipping_threshold_cents,
    );
  });
});

describe("RLS grant boundary — no client role may write (AC-5/AC-13 model)", () => {
  it("the anon (publishable-key) client CANNOT update the singleton", async () => {
    const anon = anonClient();
    const before = await readRow();
    const { error } = await anon
      .from("store_settings")
      .update({ store_name: "hacked-by-anon" })
      .eq("id", before.id);
    // No `update` grant to anon/authenticated (migration 0005): the write is
    // silently blocked by RLS (0 rows affected) or explicitly errored — either
    // way the row is UNCHANGED. Only the RLS-bypass service role may write.
    const after = await readRow();
    expect(after.store_name).toBe(before.store_name);
    expect(after.store_name).not.toBe("hacked-by-anon");
    // If RLS returns an error rather than 0-rows, that is also acceptable.
    if (error) {
      expect(error).toBeTruthy();
    }
  });
});
