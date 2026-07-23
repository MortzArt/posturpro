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
import { getLocale } from "next-intl/server";
import { bustCatalogTags } from "@/lib/admin/products/cache-tags";
import {
  DISCOUNT_CHECK_MAX_PER_WINDOW,
  DISCOUNT_CHECK_RATE_LIMIT_MAX_KEYS,
  DISCOUNT_CHECK_WINDOW_MS,
  DISCOUNT_CODE_MAX_LENGTH,
  INT4_MAX,
} from "@/lib/config";
import { createSlidingWindowLimiter } from "@/lib/rate-limit/sliding-window";
import { getStoreSettingsStatic } from "@/lib/store-settings";
import {
  sendOrderConfirmation,
  sendNewOrderOwnerAlert,
} from "@/lib/email/dispatch";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIp } from "@/lib/request/client-ip";
import { checkCheckoutRateLimit } from "@/lib/checkout/rate-limit";
import { computeShipping } from "@/lib/cart/shipping";
import { validateAddress } from "@/lib/checkout/address";
import { applyDiscount, normalizeDiscountCode } from "@/lib/checkout/discount";
import { assembleOrder, type OrderLine } from "@/lib/checkout/order";
import {
  fetchDiscountCode,
  revalidateLines,
  type SubmittedLine,
} from "@/lib/checkout/checkout-read";
import {
  detectPriceDrift,
  mapThrownError,
  parseSnapshotPrices,
  parseSubmittedLines,
  readFormValues,
  readIdempotencyKey,
  toAddressInput,
  toDiscountResult,
  toLineErrorMaps,
} from "@/lib/checkout/form-parsing";
import type {
  CheckoutFormState,
  CheckoutFormValues,
  DiscountResult,
} from "./checkout-form-state";
import type { CreateOrderPayload } from "@/lib/supabase/database.types";

const discountCheckLimiter = createSlidingWindowLimiter({
  windowMs: DISCOUNT_CHECK_WINDOW_MS,
  maxPerWindow: DISCOUNT_CHECK_MAX_PER_WINDOW,
  maxKeys: DISCOUNT_CHECK_RATE_LIMIT_MAX_KEYS,
});

/** Clamp an untrusted client subtotal to a sane non-negative integer (cents). */
function sanitizePreviewSubtotal(value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(0, Math.trunc(value)), INT4_MAX);
}

/**
 * Pre-check a discount code BEFORE submit (the field's "Apply" button), so the
 * shopper learns whether a code works without placing the order. Read-only and
 * DISPLAY-ONLY: the result mirrors what `placeOrder` would decide for the same
 * code+subtotal, but the submit path re-validates from scratch and stays the
 * single authority — a stale/forged preview can never change what is charged.
 *
 * The payload is attacker-controlled: the code is normalized + length-capped,
 * the subtotal (only used for min-subtotal/percentage math on the preview) is
 * clamped, and calls are per-IP rate-limited (this is otherwise a free oracle
 * for enumerating the code space). NEVER throws: any failure — including a
 * tripped limit — degrades to `{ kind: "degraded" }`, the existing "couldn't
 * verify the code, you can continue without it" UI state (AC-7).
 */
export async function checkDiscountCode(
  rawCode: string,
  rawSubtotalCents: number,
): Promise<DiscountResult> {
  try {
    const code = normalizeDiscountCode(String(rawCode)).slice(0, DISCOUNT_CODE_MAX_LENGTH);
    if (code.length === 0) {
      return { kind: "none" };
    }
    const ip = await clientIp();
    if (!discountCheckLimiter.check(ip)) {
      return { kind: "degraded" };
    }
    const lookup = await fetchDiscountCode(code);
    if (lookup.status === "error") {
      return { kind: "degraded" };
    }
    const subtotalCents = sanitizePreviewSubtotal(rawSubtotalCents);
    return toDiscountResult(applyDiscount(lookup.row, subtotalCents), false);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    console.error(`[checkout] discount pre-check failed: ${message}`);
    return { kind: "degraded" };
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

  // 4b. Abuse control: throttle order-placement per IP. Runs only AFTER the
  //     request proved well-formed + its lines are live-valid (so a bad/tampered
  //     request never consumes a slot) and BEFORE any write. Unauthenticated
  //     `placeOrder` spam would otherwise mint unbounded orders, deplete stock
  //     (griefing), and burn discount redemptions. Best-effort in-memory; the DB
  //     atomicity + stock floor remain the hard backstops.
  const ip = await clientIp();
  if (!checkCheckoutRateLimit(ip)) {
    return { status: "rate-limited", values, submissionId };
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

  // 8. Atomic reserve-and-create (AC-9, AC-11, AC-14). The active request locale
  //    (T9) is persisted onto the order so the server-to-server webhook can
  //    localize later emails from `orders.locale` (it has no request context).
  const idempotencyKey = readIdempotencyKey(formData);
  const appliedCode = discountResult.kind === "applied" ? discountResult.code : null;
  const locale = await getLocale();
  const created = await createOrderViaRpc(totals, addressValues, idempotencyKey, appliedCode, locale);

  // 9. Trigger transactional emails (T9 AC-14). BOTH are failure-isolated and
  //    non-blocking: a send error is caught + logged inside dispatch and NEVER
  //    changes this `success` return (AC-13). A fresh order (not an idempotent
  //    reuse) triggers the sends; a reused order already sent them (the
  //    email_sends ledger also guards, but skipping avoids the wasted work).
  if (!created.reused) {
    // The RPC just decremented stock and bumped sales_count — bust the
    // storefront catalog cache (listings, facets, and every PDP carry the
    // broad `catalog` tag) so a sold-out variant shows "Agotado" immediately
    // instead of after the revalidate window lapses. Runs only for a
    // genuinely new order (post rate-limit, so it cannot be spammed into a
    // cache-bust DoS); an idempotent replay changed no stock.
    bustCatalogTags();
    await triggerOrderEmails(created.orderId);
  }

  // Success — carry the unguessable confirmation token (the redirect target,
  // T7 M-6) + the discount result so the UI can reflect what applied.
  return {
    status: "success",
    confirmationToken: created.confirmationToken,
    discount: discountResult,
    submissionId,
  };
}

/**
 * Fire the order-confirmation (customer) + new-order (owner) emails, isolated so
 * a send failure NEVER breaks checkout (AC-13/AC-14). Each send already catches
 * internally; this wrapper is a final belt-and-suspenders catch so a truly
 * unexpected throw (e.g. a rejected promise) can't bubble into the success path.
 */
async function triggerOrderEmails(orderId: string): Promise<void> {
  try {
    await Promise.allSettled([
      sendOrderConfirmation(orderId),
      sendNewOrderOwnerAlert(orderId),
    ]);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    console.error(`[checkout] order email trigger threw (ignored): ${message}`);
  }
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

/** The subset of the create_order result the action + email triggers need. */
interface CreatedOrder {
  orderId: string;
  confirmationToken: string;
  reused: boolean;
}

/** Call the atomic RPC and return the created order (throws on failure). */
async function createOrderViaRpc(
  totals: ReturnType<typeof assembleOrder>,
  address: ReturnType<typeof validateAddress>["values"],
  idempotencyKey: string,
  discountCode: string | null,
  locale: string,
): Promise<CreatedOrder> {
  const payload: CreateOrderPayload = {
    idempotency_key: idempotencyKey,
    locale,
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
  return {
    orderId: data.order_id,
    confirmationToken: data.confirmation_token,
    reused: data.reused,
  };
}
