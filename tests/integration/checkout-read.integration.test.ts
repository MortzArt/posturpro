/**
 * Server trust-boundary integration tests (T7 AC-8, AC-13, edges 1/4; M-6 IDOR)
 * against a LIVE local Supabase. These exercise the actual server modules the
 * checkout action uses — `revalidateLines`, `fetchDiscountCode`, `getOrderByToken`
 * — so the "snapshot is never authoritative" boundary and the confirmation-token
 * IDOR fix are verified against real rows, not mocks.
 *
 * `server-only` (which throws outside an RSC) is stubbed so these guarded modules
 * import in the node test env; the admin client reads the well-known local
 * service key from the integration runner's env (run-integration.sh).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

// The admin modules import "server-only", which throws outside a Server
// Component. Stub it to a no-op so the real modules load in the node test env.
vi.mock("server-only", () => ({}));

import { serviceClient } from "./local-supabase";
import { revalidateLines, fetchDiscountCode } from "@/lib/checkout/checkout-read";
import { getOrderByToken } from "@/lib/checkout/order-read";
import type { CreateOrderPayload, CreateOrderResult } from "@/lib/supabase/database.types";

const db = serviceClient();

interface Variant {
  id: string;
  productId: string;
  productSku: string;
  productName: string;
  colorName: string;
  unitPriceCents: number;
  stock: number;
}

let inStock: Variant;
let zeroStock: Variant;

beforeAll(async () => {
  const { data: rich, error } = await db
    .from("product_variants")
    .select("id, product_id, sku, color_name, price_override_cents, stock, products!inner(name, price_cents, status, sku)")
    .gte("stock", 3)
    .eq("products.status", "active")
    .limit(1)
    .single();
  if (error || !rich) throw new Error(`no in-stock variant: ${error?.message}`);
  const p = rich.products as unknown as { name: string; price_cents: number; sku: string };
  inStock = {
    id: rich.id,
    productId: rich.product_id,
    productSku: rich.sku ?? p.sku,
    productName: p.name,
    colorName: rich.color_name,
    unitPriceCents: rich.price_override_cents ?? p.price_cents,
    stock: rich.stock,
  };

  const { data: zero, error: zErr } = await db
    .from("product_variants")
    .select("id, product_id, sku, color_name, price_override_cents, stock, products!inner(name, price_cents, sku)")
    .eq("stock", 0)
    .limit(1)
    .single();
  if (zErr || !zero) throw new Error(`no zero-stock variant: ${zErr?.message}`);
  const zp = zero.products as unknown as { name: string; price_cents: number; sku: string };
  zeroStock = {
    id: zero.id,
    productId: zero.product_id,
    productSku: zero.sku ?? zp.sku,
    productName: zp.name,
    colorName: zero.color_name,
    unitPriceCents: zero.price_override_cents ?? zp.price_cents,
    stock: 0,
  };
});

describe("revalidateLines — live re-read by id (AC-8, edge 4)", () => {
  it("validates an in-stock variant line and returns the LIVE price + label", async () => {
    const result = await revalidateLines([{ productId: inStock.productId, variantId: inStock.id, quantity: 1 }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].unitPriceCents).toBe(inStock.unitPriceCents); // from the DB, not the caller
    expect(result.lines[0].variantLabel).toBe(inStock.colorName);
    expect(result.lines[0].productName).toBe(inStock.productName);
  });

  it("flags an out-of-stock variant line (zero-stock seed variant)", async () => {
    const result = await revalidateLines([{ productId: zeroStock.productId, variantId: zeroStock.id, quantity: 1 }]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0].kind).toBe("out-of-stock");
    expect(result.issues[0].variantId).toBe(zeroStock.id);
  });

  it("flags a line whose requested quantity exceeds live stock", async () => {
    const result = await revalidateLines([
      { productId: inStock.productId, variantId: inStock.id, quantity: inStock.stock + 100 },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0].kind).toBe("out-of-stock");
  });

  it("marks a tampered (non-UUID) product id as unavailable — never trusts the snapshot", async () => {
    const result = await revalidateLines([{ productId: "not-a-uuid", variantId: null, quantity: 1 }]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0].kind).toBe("unavailable");
  });

  it("marks a well-formed but non-existent product id as unavailable", async () => {
    const result = await revalidateLines([{ productId: randomUUID(), variantId: null, quantity: 1 }]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0].kind).toBe("unavailable");
  });

  it("rejects a variant that does not belong to the claimed product (tamper guard)", async () => {
    const result = await revalidateLines([
      { productId: randomUUID(), variantId: inStock.id, quantity: 1 },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // The (random) product id does not exist → the whole line is unavailable.
    expect(result.issues[0].kind).toBe("unavailable");
  });
});

describe("fetchDiscountCode — case-insensitive live lookup (AC-6, AC-7)", () => {
  it("finds an active code regardless of the input casing", async () => {
    const upper = await fetchDiscountCode("AHORRA10");
    const lower = await fetchDiscountCode("ahorra10");
    expect(upper.status).toBe("ok");
    expect(lower.status).toBe("ok");
    if (upper.status === "ok") expect(upper.row?.code).toBe("AHORRA10");
    if (lower.status === "ok") expect(lower.row?.code).toBe("AHORRA10");
  });

  it("returns a null row for an unknown code (degrades to full price, never throws)", async () => {
    const result = await fetchDiscountCode("NOPE-" + randomUUID().slice(0, 8));
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.row).toBeNull();
  });

  it("returns a null row for an empty code", async () => {
    const result = await fetchDiscountCode("");
    expect(result).toEqual({ status: "ok", row: null });
  });

  // Regression (hacker Stage 11): the lookup used `.ilike`, so LIKE wildcards in
  // user input matched codes the user never knew — `AHORRA_0` (the `_` matches any
  // single char) resolved to `AHORRA10`, and `%` matched every row. The exact
  // `.eq` on the upper-cased code has no metacharacters.
  it("does NOT treat an underscore as a LIKE wildcard (no wildcard injection)", async () => {
    // `AHORRA_0` would match `AHORRA10` under LIKE; it must now be an unknown code.
    const result = await fetchDiscountCode("AHORRA_0");
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.row).toBeNull();
  });

  it("does NOT treat a percent sign as a LIKE wildcard (no match-all)", async () => {
    // `%` would match every row under LIKE (and error on maybeSingle); it must now
    // be a plain unknown code that resolves to null (order proceeds at full price).
    const result = await fetchDiscountCode("%");
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.row).toBeNull();
  });
});

// ---- getOrderByToken: the M-6 IDOR fix, verified against a real order. ----
describe("getOrderByToken — confirmation-token boundary (AC-13, M-6 IDOR)", () => {
  let created: CreateOrderResult;
  let stockBefore: number;
  let salesBefore: number;

  beforeAll(async () => {
    stockBefore = (await db.from("product_variants").select("stock").eq("id", inStock.id).single()).data?.stock ?? 0;
    salesBefore = (await db.from("products").select("sales_count").eq("id", inStock.productId).single()).data?.sales_count ?? 0;
    const line = inStock.unitPriceCents;
    const payload: CreateOrderPayload = {
      idempotency_key: randomUUID(),
      locale: "es-MX",
      contact_email: `qa-idor-${randomUUID()}@example.com`,
      contact_phone: null,
      shipping_full_name: "QA IDOR",
      shipping_address_line1: "Calle Secreta 1",
      shipping_address_line2: null,
      shipping_city: "CDMX",
      shipping_state: "Ciudad de México",
      shipping_postal_code: "06700",
      delivery_notes: null,
      rfc: null,
      subtotal_cents: line,
      shipping_cents: 0,
      discount_cents: 0,
      tax_base_cents: 0,
      tax_cents: 0,
      total_cents: line,
      discount_code: null,
      items: [
        {
          product_id: inStock.productId,
          variant_id: inStock.id,
          product_name: inStock.productName,
          product_sku: inStock.productSku,
          variant_label: inStock.colorName,
          unit_price_cents: inStock.unitPriceCents,
          quantity: 1,
          line_total_cents: line,
        },
      ],
    };
    const { data, error } = await db.rpc("create_order", { payload });
    if (error || !data) throw new Error(`order setup failed: ${error?.message}`);
    created = data as CreateOrderResult;
  });

  afterAll(async () => {
    await db.from("orders").delete().eq("id", created.order_id);
    await db.from("customers").delete().ilike("email", "qa-idor-%");
    // Restore the counters the setup order perturbed.
    await db.from("product_variants").update({ stock: stockBefore }).eq("id", inStock.id);
    await db.from("products").update({ sales_count: salesBefore }).eq("id", inStock.productId);
  });

  it("reads the full order view by its confirmation token", async () => {
    const view = await getOrderByToken(created.confirmation_token);
    expect(view).not.toBeNull();
    expect(view?.orderNumber).toBe(created.order_number);
    expect(view?.shippingFullName).toBe("QA IDOR");
    expect(view?.items).toHaveLength(1);
  });

  it("returns null for a malformed (non-UUID) token WITHOUT a DB hit", async () => {
    expect(await getOrderByToken("not-a-token")).toBeNull();
    expect(await getOrderByToken(created.order_number)).toBeNull(); // PP-000123 is not a token
  });

  it("returns null for a well-formed but unknown token (no enumeration)", async () => {
    expect(await getOrderByToken(randomUUID())).toBeNull();
  });
});
