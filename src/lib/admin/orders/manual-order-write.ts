/**
 * Write orchestration for a manual (phone / offline) order (T17). Server-only.
 *
 * The single I/O path behind the `createManualOrder` admin action. It reuses the
 * checkout trust boundary VERBATIM — a client-supplied price is never trusted:
 *
 *   1. `revalidateLines(...)`  — re-read products/variants BY ID, recompute live
 *      unit prices + stock (AC-7). Any out-of-stock / price-changed / unavailable
 *      line aborts BEFORE creation with a per-line issue (edges 1-pre, 5).
 *   2. `assembleOrder(...)`    — snapshot totals so every DB identity CHECK holds
 *      (AC-8). Shipping is the admin-confirmed charge (a `flat` ShippingResult).
 *   3. `create_order` RPC       — the atomic, idempotency-keyed creation path used
 *      by checkout (AC-9): guarded stock decrement, order-number sequence, one
 *      transaction. A repeat idempotency key returns the original (edge 3).
 *   4. Source-mark              — `create_order` does NOT accept `payment_method`,
 *      so stamp `'manual'` post-create (AC-14): the paid path carries it on the
 *      `advance_order_status` call; the pending path stamps it via a direct UPDATE.
 *   5. Paid choice (optional)   — `advance_order_status` payment-only mode marks
 *      the order paid + writes a `transition_kind='paid'` audit row (AC-15). NO
 *      payment-received email (AC-16). A failure here does NOT roll back the order.
 *   6. Confirmation (optional)  — `sendOrderConfirmation` only when opted-in AND a
 *      real email is present (AC-12); recipient-safe (AC-13). Failure ≠ rollback.
 *
 * Never throws to the caller; returns a typed result the action maps to UI state.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidateLines, type LineIssue, type SubmittedLine } from "@/lib/checkout/checkout-read";
import { assembleOrder, type OrderLine } from "@/lib/checkout/order";
import { advanceOrderStatus } from "@/lib/payments/advance-order";
import { sendOrderConfirmation } from "@/lib/email/dispatch";
import { isMailableAddress, NO_EMAIL_PLACEHOLDER } from "@/lib/email/recipient";
import type { CreateOrderPayload } from "@/lib/supabase/database.types";
import { MANUAL_ORDER_PAYMENT_METHOD } from "@/lib/admin/orders/order-constants";
import type { ManualOrderInput, ManualOrderLineInput } from "@/lib/admin/orders/manual-order-input";

/** A per-line issue mapped back to its client `lineKey` for UI attachment. */
export interface ManualOrderLineIssue {
  lineKey: string;
  kind: LineIssue["kind"];
  liveUnitPriceCents?: number;
}

/** The typed outcome of a manual-order write (the action maps this to UI state). */
export type ManualOrderWriteResult =
  | {
      ok: true;
      orderId: string;
      orderNumber: string;
      reused: boolean;
      markedPaid: boolean;
      /** true if the paid-choice step failed AFTER creation (order still valid). */
      paidStepFailed: boolean;
      /** null = not attempted; true/false = confirmation send outcome. */
      emailSent: boolean | null;
    }
  | { ok: false; kind: "line-issues"; lineIssues: ManualOrderLineIssue[] }
  | { ok: false; kind: "error"; reason: "create-failed" | "revalidate-failed" };

/** The idempotency key is minted once per form load and threaded through. */
export interface CreateManualOrderArgs {
  input: ManualOrderInput;
  idempotencyKey: string;
}

/**
 * Create a manual order end-to-end. Pure inputs already validated by
 * `parseManualOrderInput`; this module owns only the I/O + trust re-check.
 */
export async function createManualOrder(
  args: CreateManualOrderArgs,
): Promise<ManualOrderWriteResult> {
  const { input, idempotencyKey } = args;

  const revalidation = await revalidateLines(toSubmittedLines(input.lines));
  if (!revalidation.ok) {
    return { ok: false, kind: "line-issues", lineIssues: mapIssues(input.lines, revalidation.issues) };
  }

  const totals = assembleOrder(
    revalidation.lines.map(toOrderLine),
    { kind: "flat", cents: input.shippingCents },
    0,
  );

  const created = await createOrderViaRpc(input, totals, idempotencyKey);
  if (!created.ok) {
    return { ok: false, kind: "error", reason: "create-failed" };
  }

  const wantsPaid = input.paymentChoice === "paid";
  const markResult = await markSourceAndPayment(created.orderId, wantsPaid);
  const emailSent = await maybeSendConfirmation(created.orderId, input);

  return {
    ok: true,
    orderId: created.orderId,
    orderNumber: created.orderNumber,
    reused: created.reused,
    markedPaid: wantsPaid && markResult.paidApplied,
    paidStepFailed: wantsPaid && !markResult.paidApplied,
    emailSent,
  };
}

/** Map validated input lines to the `revalidateLines` submitted shape. */
function toSubmittedLines(lines: readonly ManualOrderLineInput[]): SubmittedLine[] {
  return lines.map((line) => ({
    productId: line.productId,
    variantId: line.variantId,
    quantity: line.quantity,
  }));
}

/** Map a live-revalidated line to the `assembleOrder` line shape. */
function toOrderLine(line: {
  productId: string;
  variantId: string | null;
  productName: string;
  productSku: string;
  variantLabel: string | null;
  unitPriceCents: number;
  quantity: number;
}): OrderLine {
  return {
    productId: line.productId,
    variantId: line.variantId,
    productName: line.productName,
    productSku: line.productSku,
    variantLabel: line.variantLabel,
    unitPriceCents: line.unitPriceCents,
    quantity: line.quantity,
  };
}

/** Re-attach each revalidation issue to its client `lineKey` for the UI. */
function mapIssues(
  lines: readonly ManualOrderLineInput[],
  issues: readonly LineIssue[],
): ManualOrderLineIssue[] {
  return issues.map((issue) => {
    const match = lines.find(
      (line) => line.productId === issue.productId && line.variantId === issue.variantId,
    );
    return {
      lineKey: match?.lineKey ?? issue.productId,
      kind: issue.kind,
      liveUnitPriceCents: issue.liveUnitPriceCents,
    };
  });
}

interface CreatedOrder {
  ok: true;
  orderId: string;
  orderNumber: string;
  reused: boolean;
}

/** Build the `create_order` payload and invoke the atomic RPC (service-role). */
async function createOrderViaRpc(
  input: ManualOrderInput,
  totals: ReturnType<typeof assembleOrder>,
  idempotencyKey: string,
): Promise<CreatedOrder | { ok: false }> {
  const payload: CreateOrderPayload = {
    idempotency_key: idempotencyKey,
    locale: "es-MX",
    // Blank email → the non-delivering sentinel satisfies the NOT NULL columns;
    // the recipient guard (AC-13) ensures it is never mailed.
    contact_email: input.contactEmail ?? NO_EMAIL_PLACEHOLDER,
    contact_phone: input.contactPhone,
    shipping_full_name: input.shippingFullName,
    shipping_address_line1: input.addressLine1,
    shipping_address_line2: input.addressLine2,
    shipping_city: input.city,
    shipping_state: input.state,
    shipping_postal_code: input.postalCode,
    delivery_notes: input.deliveryNotes,
    rfc: input.rfc,
    subtotal_cents: totals.subtotalCents,
    shipping_cents: totals.shippingCents,
    discount_cents: totals.discountCents,
    tax_base_cents: totals.taxBaseCents,
    tax_cents: totals.taxCents,
    total_cents: totals.totalCents,
    discount_code: null,
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

  try {
    const db = createAdminClient();
    const { data, error } = await db.rpc("create_order", { payload });
    if (error || !data) {
      console.error(`[manual-order] create_order failed: ${error?.message ?? "no data"}`);
      return { ok: false };
    }
    return { ok: true, orderId: data.order_id, orderNumber: data.order_number, reused: data.reused };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    console.error(`[manual-order] create_order threw: ${message}`);
    return { ok: false };
  }
}

/**
 * Stamp the manual source marker and, if requested, mark the order paid offline.
 * - paid choice → `advance_order_status` payment-only mode carries BOTH the paid
 *   status and `payment_method='manual'`, and writes a `transition_kind='paid'`
 *   audit row (AC-15). No payment-received email (AC-16).
 * - pending choice → a direct UPDATE stamps `payment_method='manual'` only.
 * A failure here NEVER rolls back the created order (research anti-pattern).
 */
async function markSourceAndPayment(
  orderId: string,
  wantsPaid: boolean,
): Promise<{ paidApplied: boolean }> {
  if (wantsPaid) {
    const outcome = await advanceOrderStatus({
      p_order_id: orderId,
      p_order_status: null,
      p_payment_status: "paid",
      p_payment_method: MANUAL_ORDER_PAYMENT_METHOD,
      p_mp_payment_id: null,
      p_note: null,
    });
    if (!outcome.ok || !outcome.result.applied) {
      console.error(
        `[manual-order] paid step failed for ${orderId}: ${outcome.ok ? outcome.result.reason : outcome.error}`,
      );
      // Still stamp the source marker so the order badges as manual.
      await stampManualSource(orderId);
      return { paidApplied: false };
    }
    return { paidApplied: true };
  }
  await stampManualSource(orderId);
  return { paidApplied: false };
}

/** Direct UPDATE stamping `payment_method='manual'` (source marker, AC-14). */
async function stampManualSource(orderId: string): Promise<void> {
  try {
    const db = createAdminClient();
    const { error } = await db
      .from("orders")
      .update({ payment_method: MANUAL_ORDER_PAYMENT_METHOD })
      .eq("id", orderId);
    if (error) {
      console.error(`[manual-order] source stamp failed for ${orderId}: ${error.message}`);
    }
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    console.error(`[manual-order] source stamp threw for ${orderId}: ${message}`);
  }
}

/**
 * Fire the confirmation email only when opted-in AND a real email was captured
 * (AC-12). Returns null when not attempted, else the send outcome. Recipient-safe
 * and failure-isolated — a send failure never rolls back the order.
 */
async function maybeSendConfirmation(
  orderId: string,
  input: ManualOrderInput,
): Promise<boolean | null> {
  if (!input.sendConfirmation || !isMailableAddress(input.contactEmail)) {
    return null;
  }
  const result = await sendOrderConfirmation(orderId);
  return result.ok ? result.sent : false;
}
