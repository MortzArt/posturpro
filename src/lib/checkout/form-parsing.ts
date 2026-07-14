/**
 * Pure form-parsing / mapping / transformation helpers for the checkout server
 * action (extracted from `checkout/actions.ts`, A4). Every function here is PURE:
 * no I/O, no `headers()`/`cookies()`, no Supabase/Mercado Pago calls, no email
 * triggers. Orchestration (`placeOrder`, `runCheckout`) and all impure helpers
 * stay in the action module — this file only reads/reshapes the submitted
 * `FormData`, revalidation issues, discount outcomes, and thrown-error messages
 * into the serializable UI shapes the action returns.
 */
import { applyDiscount } from "@/lib/checkout/discount";
import { type RawAddressInput } from "@/lib/checkout/address";
import {
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
} from "@/app/[locale]/checkout/checkout-form-state";

/** Prefix the RPC raises for an out-of-stock line (edge 2). */
export const OUT_OF_STOCK_PREFIX = "OUT_OF_STOCK:";
/** The RPC raise when a discount code hit its redemption cap during commit. */
export const DISCOUNT_EXHAUSTED = "DISCOUNT_EXHAUSTED";

/** Read the form values into the preserved-values shape (untrimmed). */
export function readFormValues(formData: FormData): CheckoutFormValues {
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
export function toAddressInput(values: CheckoutFormValues): RawAddressInput {
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
export function parseSubmittedLines(raw: string): SubmittedLine[] {
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
export function toLineErrorMaps(issues: readonly LineIssue[]): {
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
export function detectPriceDrift(
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
export function toDiscountResult(
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

/** Parse the per-line snapshot price map (`cartLineKey` → cents). */
export function parseSnapshotPrices(raw: string): Map<string, number> {
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

/** A validated, non-empty client idempotency key (UUID), or a generated one. */
export function readIdempotencyKey(formData: FormData): string {
  const key = String(formData.get("idempotencyKey") ?? "").trim();
  if (UUID_PATTERN.test(key)) {
    return key;
  }
  // Fallback: the client always sends one, but never trust it blindly. A fresh
  // key means this submit is treated as new (the button-disable is the client
  // backstop; the DB unique index is the server backstop for the real key).
  return crypto.randomUUID();
}

/** Map a thrown error to a friendly state (never echoes raw PG, AC-8/edge 8). */
export function mapThrownError(
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
export function parseOutOfStockLine(message: string): Record<string, "out-of-stock"> {
  const start = message.indexOf(OUT_OF_STOCK_PREFIX);
  const body = message.slice(start + OUT_OF_STOCK_PREFIX.length);
  const [productId, variantToken] = body.split(":");
  if (!productId || !UUID_PATTERN.test(productId)) {
    return {};
  }
  const variantId = variantToken && variantToken !== "-" ? variantToken : null;
  return { [cartLineKey(productId, variantId)]: "out-of-stock" };
}
