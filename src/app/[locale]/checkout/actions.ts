"use server";

/**
 * Checkout server action (T7 AC-6–AC-14, all edges). The revenue write path.
 *
 * Pipeline (mirrors the Q&A action shape, extended for commerce):
 *   1. parse form + serialized cart lines (the snapshot is display-only).
 *   2. validateAddress (pure) — bad → { status: "invalid", fieldErrors }.
 *   3. cart empty → { status: "error" } (client redirects to empty-state; a
 *      zero-line order is never created, edge 3).
 *   4. revalidateLines (live DB re-read by id) — price/stock mismatch →
 *      { status: "price-changed" | "out-of-stock", lineErrors } (edges 1, 2, 4).
 *   5. getStoreSettingsStatic → computeShipping; unavailable →
 *      { status: "shipping-unavailable" } (never writes shipping=0, edge 5).
 *   6. fetchDiscountCode + applyDiscount (pure) → clamped discount (edge 6);
 *      a bad code degrades to full price, never blocks (AC-7).
 *   7. assembleOrder (pure) → totals satisfying every DB identity CHECK (edge 8).
 *   8. admin.rpc('create_order', payload) — ONE transaction: guarded stock
 *      decrement + inserts + sales_count bump + discount redemption + idempotency
 *      (AC-9, AC-10, AC-11, AC-14). OUT_OF_STOCK from the RPC → out-of-stock.
 *   9. success → { status: "success", orderNumber }.
 *
 * Raw PG errors are NEVER echoed — mapped to friendly enums, logged with context.
 * All commerce writes go through the admin client (RLS denies anon, AC-12).
 */
import { getStoreSettingsStatic } from "@/lib/store-settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeShipping } from "@/lib/cart/shipping";
import { validateAddress, type RawAddressInput } from "@/lib/checkout/address";
import { applyDiscount, normalizeDiscountCode } from "@/lib/checkout/discount";
import { assembleOrder, type OrderLine } from "@/lib/checkout/order";
import {
  fetchDiscountCode,
  revalidateLines,
  type LineIssue,
  type SubmittedLine,
  type ValidatedLine,
} from "@/lib/checkout/checkout-read";
import { cartLineKey, sanitizeQuantity } from "@/lib/cart/cart-line";
import { UUID_PATTERN } from "@/lib/config";
import type {
  CheckoutFormState,
  CheckoutFormValues,
  CheckoutLineIssue,
  DiscountResult,
} from "./checkout-form-state";
import type { CreateOrderPayload } from "@/lib/supabase/database.types";

/** Prefix the RPC raises for an out-of-stock line (edge 2). */
const OUT_OF_STOCK_PREFIX = "OUT_OF_STOCK:";
/** The RPC raise when a discount code hit its redemption cap during commit. */
const DISCOUNT_EXHAUSTED = "DISCOUNT_EXHAUSTED";

/** Read the form values into the preserved-values shape (untrimmed). */
function readFormValues(formData: FormData): CheckoutFormValues {
  const get = (name: string): string => String(formData.get(name) ?? "");
  return {
    email: get("email"),
    contact_phone: get("contact_phone"),
    shipping_full_name: get("shipping_full_name"),
    address_line1: get("address_line1"),
    address_line2: get("address_line2"),
    city: get("city"),
    postal_code: get("postal_code"),
    state: get("state"),
    delivery_notes: get("delivery_notes"),
    rfc: get("rfc"),
    discountCode: get("discountCode"),
  };
}

/** Map preserved values to the raw address-validation input. */
function toAddressInput(values: CheckoutFormValues): RawAddressInput {
  return {
    email: values.email,
    contact_phone: values.contact_phone,
    shipping_full_name: values.shipping_full_name,
    address_line1: values.address_line1,
    address_line2: values.address_line2,
    city: values.city,
    postal_code: values.postal_code,
    state: values.state,
    delivery_notes: values.delivery_notes,
    rfc: values.rfc,
  };
}

/** Parse the serialized `lines` hidden field into submitted lines (edge 4). */
function parseSubmittedLines(raw: string): SubmittedLine[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  const lines: SubmittedLine[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const productId = typeof record.productId === "string" ? record.productId : "";
    const variantId = typeof record.variantId === "string" ? record.variantId : null;
    const quantity =
      typeof record.quantity === "number" ? sanitizeQuantity(record.quantity) : 1;
    if (!UUID_PATTERN.test(productId)) {
      // A non-UUID product id can only be tampering — drop it; if that empties
      // the cart the empty-cart guard aborts (edge 3, 4).
      continue;
    }
    lines.push({ productId, variantId, quantity });
  }
  return lines;
}

/** Build the per-line error + live-price maps from revalidation issues. */
function toLineErrorMaps(issues: readonly LineIssue[]): {
  lineErrors: Record<string, CheckoutLineIssue>;
  liveUnitPrices: Record<string, number>;
} {
  const lineErrors: Record<string, CheckoutLineIssue> = {};
  const liveUnitPrices: Record<string, number> = {};
  for (const issue of issues) {
    const key = cartLineKey(issue.productId, issue.variantId);
    lineErrors[key] = issue.kind;
    if (issue.liveUnitPriceCents !== undefined) {
      liveUnitPrices[key] = issue.liveUnitPriceCents;
    }
  }
  return { lineErrors, liveUnitPrices };
}

/**
 * Detect price drift: a validated line whose LIVE price differs from the
 * snapshot the client submitted (edge 1). We compare against the submitted
 * per-line snapshot price map. Returns the keys that drifted.
 */
function detectPriceDrift(
  validated: readonly ValidatedLine[],
  snapshotPrices: ReadonlyMap<string, number>,
): { lineErrors: Record<string, "price-changed">; liveUnitPrices: Record<string, number> } {
  const lineErrors: Record<string, "price-changed"> = {};
  const liveUnitPrices: Record<string, number> = {};
  for (const line of validated) {
    const key = cartLineKey(line.productId, line.variantId);
    const snapshot = snapshotPrices.get(key);
    if (snapshot !== undefined && snapshot !== line.unitPriceCents) {
      lineErrors[key] = "price-changed";
      liveUnitPrices[key] = line.unitPriceCents;
    }
  }
  return { lineErrors, liveUnitPrices };
}

/** Convert a discount outcome to the serializable UI result. */
function toDiscountResult(
  outcome: ReturnType<typeof applyDiscount>,
  degraded: boolean,
): DiscountResult {
  if (degraded) {
    return { kind: "degraded" };
  }
  switch (outcome.kind) {
    case "none":
      return { kind: "none" };
    case "applied":
      return { kind: "applied", code: outcome.code, discountCents: outcome.discountCents };
    case "invalid":
      return { kind: "invalid", reason: outcome.reason };
  }
}

/**
 * Place the order. `prevState`/`formData` follow the `useActionState` contract.
 * `formData` carries the address/contact fields, the `discountCode`, a serialized
 * `lines` snapshot, per-line `snapshotPrices`, and a client `idempotencyKey`.
 */
export async function placeOrder(
  prevState: CheckoutFormState,
  formData: FormData,
): Promise<CheckoutFormState> {
  const submissionId = prevState.submissionId + 1;
  const values = readFormValues(formData);

  // 2. Address/contact validation (pure, server is the boundary).
  const address = validateAddress(toAddressInput(values));
  if (!address.ok) {
    return { status: "invalid", fieldErrors: address.fieldErrors, values, submissionId };
  }

  // 3. Parse the cart snapshot; empty → abort (edge 3). Never a zero-line order.
  const submitted = parseSubmittedLines(String(formData.get("lines") ?? ""));
  if (submitted.length === 0) {
    return { status: "error", values, submissionId };
  }
  const snapshotPrices = parseSnapshotPrices(String(formData.get("snapshotPrices") ?? ""));

  try {
    return await runCheckout(formData, values, address.values, submitted, snapshotPrices, submissionId);
  } catch (caught) {
    return mapThrownError(caught, values, submissionId);
  }
}

/** Parse the per-line snapshot price map (`cartLineKey` → cents). */
function parseSnapshotPrices(raw: string): Map<string, number> {
  const map = new Map<string, number>();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return map;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return map;
  }
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isInteger(value)) {
      map.set(key, value);
    }
  }
  return map;
}

/** The core (address-validated, non-empty) checkout pipeline (steps 4–9). */
async function runCheckout(
  formData: FormData,
  values: CheckoutFormValues,
  addressValues: ReturnType<typeof validateAddress>["values"],
  submitted: SubmittedLine[],
  snapshotPrices: Map<string, number>,
  submissionId: number,
): Promise<CheckoutFormState> {
  // 4. Live re-read + stock/price re-validation (edges 1, 2, 4).
  const revalidation = await revalidateLines(submitted);
  if (!revalidation.ok) {
    const { lineErrors, liveUnitPrices } = toLineErrorMaps(revalidation.issues);
    // Any unavailable/out-of-stock line → out-of-stock banner (nothing written).
    return { status: "out-of-stock", lineErrors, liveUnitPrices, values, submissionId };
  }

  // Price drift: live price differs from the submitted snapshot (edge 1).
  const drift = detectPriceDrift(revalidation.lines, snapshotPrices);
  if (Object.keys(drift.lineErrors).length > 0) {
    return {
      status: "price-changed",
      lineErrors: drift.lineErrors,
      liveUnitPrices: drift.liveUnitPrices,
      values,
      submissionId,
    };
  }

  // 5. Shipping from live settings; unavailable → block (edge 5).
  const settings = await getStoreSettingsStatic();
  const subtotalCents = revalidation.lines.reduce(
    (sum, line) => sum + line.unitPriceCents * line.quantity,
    0,
  );
  const shipping = computeShipping(subtotalCents, {
    flatRateCents: settings?.shipping_flat_rate_cents ?? null,
    freeThresholdCents: settings?.free_shipping_threshold_cents ?? null,
  });
  if (shipping.kind === "unavailable") {
    return { status: "shipping-unavailable", values, submissionId };
  }

  // 6. Discount (never blocks; degrades to full price, AC-7, edge 6).
  const normalizedCode = normalizeDiscountCode(values.discountCode);
  const { discountResult, discountCents } = await resolveDiscount(normalizedCode, subtotalCents);

  // 7. Assemble totals satisfying every DB identity CHECK (edge 8).
  const orderLines: OrderLine[] = revalidation.lines.map((line) => ({
    productId: line.productId,
    variantId: line.variantId,
    productName: line.productName,
    productSku: line.productSku,
    variantLabel: line.variantLabel,
    unitPriceCents: line.unitPriceCents,
    quantity: line.quantity,
  }));
  const totals = assembleOrder(orderLines, shipping, discountCents);

  // 8. Atomic reserve-and-create (AC-9, AC-11, AC-14).
  const idempotencyKey = readIdempotencyKey(formData);
  const appliedCode = discountResult.kind === "applied" ? discountResult.code : null;
  const orderNumber = await createOrderViaRpc(totals, addressValues, idempotencyKey, appliedCode);

  // 9. Success (carry the discount result so the UI can reflect what applied).
  return { status: "success", orderNumber, discount: discountResult, submissionId };
}

/** Resolve the discount to a UI result + clamped cents (never throws). */
async function resolveDiscount(
  normalizedCode: string,
  subtotalCents: number,
): Promise<{ discountResult: DiscountResult; discountCents: number }> {
  if (normalizedCode.length === 0) {
    return { discountResult: { kind: "none" }, discountCents: 0 };
  }
  const lookup = await fetchDiscountCode(normalizedCode);
  if (lookup.status === "error") {
    return { discountResult: { kind: "degraded" }, discountCents: 0 };
  }
  const outcome = applyDiscount(lookup.row, subtotalCents);
  const discountResult = toDiscountResult(outcome, false);
  const discountCents = outcome.kind === "applied" ? outcome.discountCents : 0;
  return { discountResult, discountCents };
}

/** A validated, non-empty client idempotency key (UUID), or a generated one. */
function readIdempotencyKey(formData: FormData): string {
  const key = String(formData.get("idempotencyKey") ?? "").trim();
  if (UUID_PATTERN.test(key)) {
    return key;
  }
  // Fallback: the client always sends one, but never trust it blindly. A fresh
  // key means this submit is treated as new (the button-disable is the client
  // backstop; the DB unique index is the server backstop for the real key).
  return crypto.randomUUID();
}

/** Call the atomic RPC and return the order number (throws on failure). */
async function createOrderViaRpc(
  totals: ReturnType<typeof assembleOrder>,
  address: ReturnType<typeof validateAddress>["values"],
  idempotencyKey: string,
  discountCode: string | null,
): Promise<string> {
  const payload: CreateOrderPayload = {
    idempotency_key: idempotencyKey,
    contact_email: address.email,
    contact_phone: address.contact_phone || null,
    shipping_full_name: address.shipping_full_name,
    shipping_address_line1: address.address_line1,
    shipping_address_line2: address.address_line2 || null,
    shipping_city: address.city,
    shipping_state: address.state,
    shipping_postal_code: address.postal_code,
    delivery_notes: address.delivery_notes || null,
    rfc: address.rfc || null,
    subtotal_cents: totals.subtotalCents,
    shipping_cents: totals.shippingCents,
    discount_cents: totals.discountCents,
    tax_base_cents: totals.taxBaseCents,
    tax_cents: totals.taxCents,
    total_cents: totals.totalCents,
    discount_code: discountCode,
    items: totals.lines.map((line) => ({
      product_id: line.productId,
      variant_id: line.variantId,
      product_name: line.productName,
      product_sku: line.productSku,
      variant_label: line.variantLabel,
      unit_price_cents: line.unitPriceCents,
      quantity: line.quantity,
      line_total_cents: line.lineTotalCents,
    })),
  };

  const db = createAdminClient();
  const { data, error } = await db.rpc("create_order", { payload });
  if (error) {
    // Re-throw so the outer catch maps it (keeps the raw message out of the UI).
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("create_order returned no data");
  }
  return data.order_number;
}

/** Map a thrown error to a friendly state (never echoes raw PG, AC-8/edge 8). */
function mapThrownError(
  caught: unknown,
  values: CheckoutFormValues,
  submissionId: number,
): CheckoutFormState {
  const message = caught instanceof Error ? caught.message : String(caught);

  // The RPC lost the last-unit race for a line (edge 2). Surface out-of-stock.
  if (message.includes(OUT_OF_STOCK_PREFIX)) {
    const lineErrors = parseOutOfStockLine(message);
    console.warn(`[checkout] out of stock at reservation: ${message}`);
    return { status: "out-of-stock", lineErrors, values, submissionId };
  }

  // The discount code hit its cap concurrently — degrade gracefully (AC-7): the
  // user can retry without the code. Treated as a generic retryable error.
  if (message.includes(DISCOUNT_EXHAUSTED)) {
    console.warn("[checkout] discount exhausted at reservation.");
    return { status: "error", discount: { kind: "invalid", reason: "exhausted" }, values, submissionId };
  }

  console.error(`[checkout] order creation failed: ${message}`);
  return { status: "error", values, submissionId };
}

/** Parse `OUT_OF_STOCK:<productId>:<variantId|->` into a lineErrors map. */
function parseOutOfStockLine(message: string): Record<string, "out-of-stock"> {
  const start = message.indexOf(OUT_OF_STOCK_PREFIX);
  const body = message.slice(start + OUT_OF_STOCK_PREFIX.length);
  const [productId, variantToken] = body.split(":");
  if (!productId || !UUID_PATTERN.test(productId)) {
    return {};
  }
  const variantId = variantToken && variantToken !== "-" ? variantToken : null;
  return { [cartLineKey(productId, variantId)]: "out-of-stock" };
}
