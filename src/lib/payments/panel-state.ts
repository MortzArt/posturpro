/**
 * Pure derivation of the confirmation page's payment-panel state (T8 UI spec
 * "Payment State Model"). Truth is the DB payment state; the `returnHint` (from
 * the back_url `?mp_status`) is a DISPLAY HINT ONLY — it can pick the `processing`
 * copy while the webhook catches up, but NEVER flips the panel to paid/failed on
 * its own (EC-6). No React, no I/O — unit-tested in isolation.
 */
import type { PaymentMethodKey } from "@/lib/payments/config";
import type { VoucherView } from "@/lib/payments/order-payment-read";
import type { OrderStatus, PaymentStatus } from "@/lib/supabase/database.types";

/** The back_url status hint (display only). */
export type ReturnHint = "success" | "pending" | "failure" | null;

/** The discriminated state the <PaymentPanel> switches on. */
export type PaymentPanelState =
  | { kind: "unpaid" }
  | { kind: "pending-voucher"; method: "oxxo" | "spei"; voucher: VoucherView | null }
  | { kind: "failed" }
  | { kind: "paid"; method: PaymentMethodKey | null; refunded: boolean }
  | { kind: "processing" };

/** Inputs to the derivation — the live DB payment fields + the display hint. */
export interface PanelStateInput {
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethodKey | null;
  voucher: VoucherView | null;
  returnHint: ReturnHint;
}

/**
 * Derive the panel state from live DB fields (+ the display hint). The truth
 * table (UI spec):
 *   paid/refunded                         → paid (refunded flag if refunded)
 *   payment failed                        → failed (retry)
 *   pending + oxxo/spei                   → pending-voucher
 *   pending + returnHint 'success'        → processing (webhook not landed yet)
 *   authorized (card in review)           → processing
 *   pending, no method, no success hint   → unpaid (first attempt)
 */
export function derivePanelState(input: PanelStateInput): PaymentPanelState {
  // Refunded / paid: money received (refunded is still a paid-hero variant).
  if (input.paymentStatus === "refunded") {
    return { kind: "paid", method: input.paymentMethod, refunded: true };
  }
  if (input.paymentStatus === "paid" || input.orderStatus === "paid") {
    return { kind: "paid", method: input.paymentMethod, refunded: false };
  }

  // Failed: allow a retry for the same order.
  if (input.paymentStatus === "failed") {
    return { kind: "failed" };
  }

  // Card authorized-but-not-captured is rare; show "confirming".
  if (input.paymentStatus === "authorized") {
    return { kind: "processing" };
  }

  // Pending OXXO/SPEI → voucher instructions.
  if (input.paymentStatus === "pending" && (input.paymentMethod === "oxxo" || input.paymentMethod === "spei")) {
    return { kind: "pending-voucher", method: input.paymentMethod, voucher: input.voucher };
  }

  // Browser returned from MP with a success hint but the webhook hasn't advanced
  // the order yet → "we're confirming your payment" (never trust the hint alone).
  if (input.paymentStatus === "pending" && input.returnHint === "success") {
    return { kind: "processing" };
  }

  // First attempt: order created, no payment yet.
  return { kind: "unpaid" };
}

/** Normalize a raw `?mp_status` query value to a ReturnHint (else null). */
export function toReturnHint(value: string | null | undefined): ReturnHint {
  if (value === "success" || value === "pending" || value === "failure") {
    return value;
  }
  return null;
}
