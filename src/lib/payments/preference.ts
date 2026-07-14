/**
 * Create a Mercado Pago Checkout Pro Preference for a pending order (T8 AC-4,
 * AC-6, edge 11). Server-only (transitively imports the `server-only` MP client).
 *
 * Flow:
 *   1. Read the order + its items by confirmation token (admin client; the token
 *      is the same unguessable id the confirmation page uses — never order_number).
 *   2. Guard: only a `pending_payment` order with a nonzero total is payable.
 *   3. Build the preference body: line items (cents → exact MP decimal),
 *      external_reference = confirmation_token, notification_url = webhook,
 *      locale-correct back_urls, date_of_expiration for OXXO/SPEI. No method is
 *      excluded — MP surfaces card / OXXO / SPEI / wallet per the account (AC-6).
 *   4. `Preference.create` (bounded timeout).
 *   5. Persist `mp_preference_id` + `mp_external_reference` on the order (a
 *      scoped, non-status column update — NOT a status transition, so it does not
 *      go through `advance_order_status`; the immutability trigger leaves these
 *      columns mutable). Return `{ init_point, preferenceId }`.
 *
 * Returns a typed result — NEVER throws to the caller and never echoes a raw MP
 * error (mapped to `unavailable` / `error`; logged with context).
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { UUID_PATTERN } from "@/lib/config";
import { MissingEnvVarError } from "@/lib/env";
import { preferenceClient } from "@/lib/payments/mp-client";
import { centsToMpAmount } from "@/lib/payments/money-boundary";
import { buildBackUrls, webhookUrl } from "@/lib/payments/urls";
import {
  MP_BINARY_MODE,
  MP_CURRENCY_ID,
  MP_STATEMENT_DESCRIPTOR,
  MP_VOUCHER_EXPIRY_HOURS,
  ONE_HOUR_MS,
} from "@/lib/payments/config";

/** The outcome of creating (or re-creating) a preference for an order. */
export type PreferenceResult =
  | { status: "created"; initPoint: string; preferenceId: string }
  | { status: "not-payable" } // order is not a payable pending order (or absent)
  | { status: "unavailable" } // MP env missing / MP 5xx / timeout (edge 11)
  | { status: "error" }; // any other failure

/** The order fields the preference builder needs. */
interface PayableOrder {
  id: string;
  confirmationToken: string;
  totalCents: number;
  items: Array<{
    productId: string;
    productName: string;
    variantLabel: string | null;
    unitPriceCents: number;
    quantity: number;
  }>;
}

/**
 * Create a Checkout Pro preference for the pending order addressed by `token`,
 * in `locale`, on `origin` (the request's absolute origin). Idempotent-safe to
 * call again for a retry (AC-16): it re-creates a fresh preference for the SAME
 * order — it never re-creates the order or re-decrements stock.
 */
export async function createPreferenceForOrder(
  token: string,
  locale: string,
  origin: string,
): Promise<PreferenceResult> {
  if (!UUID_PATTERN.test(token)) {
    return { status: "not-payable" };
  }
  const order = await readPayableOrder(token);
  if (!order) {
    return { status: "not-payable" };
  }

  try {
    const body = buildPreferenceBody(order, locale, origin);
    const client = preferenceClient();
    const created = await client.create({ body });
    const initPoint = created.init_point ?? null;
    const preferenceId = created.id ?? null;
    if (!initPoint || !preferenceId) {
      console.error("[payments] preference created without init_point/id");
      return { status: "error" };
    }
    await persistPreference(order.id, preferenceId, order.confirmationToken);
    return { status: "created", initPoint, preferenceId };
  } catch (caught) {
    if (caught instanceof MissingEnvVarError) {
      console.error(`[payments] MP not configured: ${caught.variableName}`);
      return { status: "unavailable" };
    }
    // MP SDK errors / network / timeout — treat as a temporary outage (edge 11).
    const message = caught instanceof Error ? caught.message : "unknown";
    console.error(`[payments] preference creation failed: ${message}`);
    return { status: "unavailable" };
  }
}

/** Read the order + items, returning `null` unless it is a payable pending order. */
async function readPayableOrder(token: string): Promise<PayableOrder | null> {
  try {
    const db = createAdminClient();
    const { data: order, error } = await db
      .from("orders")
      .select("id, confirmation_token, total_cents, status, payment_status")
      .eq("confirmation_token", token)
      .maybeSingle();
    if (error) {
      console.error(`[payments] order read failed: ${error.message}`);
      return null;
    }
    // Only a pending order with a positive total is payable. A `paid` order is
    // not re-payable; a zero total is never sent to MP.
    if (!order || order.status !== "pending_payment" || order.total_cents <= 0) {
      return null;
    }

    const { data: itemRows, error: itemsError } = await db
      .from("order_items")
      .select("product_id, product_name, variant_label, unit_price_cents, quantity")
      .eq("order_id", order.id)
      .order("created_at", { ascending: true });
    if (itemsError || !itemRows || itemRows.length === 0) {
      console.error(
        `[payments] order items read failed for ${order.id}: ${itemsError?.message ?? "no items"}`,
      );
      return null;
    }

    return {
      id: order.id,
      confirmationToken: order.confirmation_token,
      totalCents: order.total_cents,
      items: itemRows.map((row) => ({
        productId: row.product_id ?? order.id,
        productName: row.product_name,
        variantLabel: row.variant_label,
        unitPriceCents: row.unit_price_cents,
        quantity: row.quantity,
      })),
    };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    console.error(`[payments] payable-order read threw: ${message}`);
    return null;
  }
}

/** Build the MP preference request body from the order (pure). */
function buildPreferenceBody(
  order: PayableOrder,
  locale: string,
  origin: string,
) {
  const expiration = new Date(
    Date.now() + MP_VOUCHER_EXPIRY_HOURS * ONE_HOUR_MS,
  ).toISOString();

  return {
    items: order.items.map((item, index) => ({
      id: `${order.id}-${index}`,
      title: item.variantLabel
        ? `${item.productName} · ${item.variantLabel}`
        : item.productName,
      quantity: item.quantity,
      unit_price: centsToMpAmount(item.unitPriceCents),
      currency_id: MP_CURRENCY_ID,
    })),
    external_reference: order.confirmationToken,
    notification_url: webhookUrl(origin),
    back_urls: buildBackUrls(origin, locale, order.confirmationToken),
    auto_return: "approved",
    binary_mode: MP_BINARY_MODE,
    statement_descriptor: MP_STATEMENT_DESCRIPTOR,
    date_of_expiration: expiration,
  };
}

/**
 * Persist the preference id + external reference on the order. A scoped update of
 * two MUTABLE, non-status columns (not a lifecycle transition) — the immutability
 * trigger permits it. A failure here is logged but does NOT fail the pay flow:
 * the shopper can still be redirected (the webhook matches by external_reference
 * = confirmation_token even if this write lost the race).
 */
async function persistPreference(
  orderId: string,
  preferenceId: string,
  confirmationToken: string,
): Promise<void> {
  try {
    const db = createAdminClient();
    const { error } = await db
      .from("orders")
      .update({
        mp_preference_id: preferenceId,
        mp_external_reference: confirmationToken,
      })
      .eq("id", orderId);
    if (error) {
      console.error(`[payments] persist preference failed for ${orderId}: ${error.message}`);
    }
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    console.error(`[payments] persist preference threw for ${orderId}: ${message}`);
  }
}
