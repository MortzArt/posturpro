/**
 * Pure mapping from a Mercado Pago payment `status` to our
 * `{ orderStatus, paymentStatus }` transition, plus the out-of-order precedence
 * guard (T8 AC-14, edge 2). No I/O, no DB — heavily unit-tested in isolation.
 *
 * The webhook fetches the AUTHORITATIVE payment via the MP API (the notification
 * body carries no status), maps it here, then calls the `advance_order_status`
 * RPC. The RPC ALSO enforces a regression guard at the DB level (belt-and-
 * suspenders); this module is where the app-level decision is made and tested.
 *
 * Mapping (AC-14 / research §"Payment Lifecycle"):
 *   approved                 → payment 'paid'      , order 'paid'
 *   pending, in_process      → payment 'pending'   , order 'pending_payment' (unchanged)
 *   authorized               → payment 'authorized', order 'pending_payment' (capture is later)
 *   rejected, cancelled      → payment 'failed'    , order 'pending_payment' (allow retry, AC-16)
 *   refunded                 → payment 'refunded'  , order UNCHANGED (payment-only, C-2)
 *   charged_back, in_mediation → FLAGGED, no state change (never silently marks paid)
 *   unknown                  → FLAGGED, no state change
 *
 * PAYMENT-ONLY (C-2): `refunded` must NOT assert an order status. MP fires it for
 * both full and partial refunds and on orders at ANY lifecycle stage (paid,
 * shipped, ...). Asserting `orderStatus: 'paid'` either regresses a shipped order
 * (regression_blocked → the refund silently drops) or writes no history on a
 * plain paid order. So `refunded` maps `orderStatus: null` — the RPC's
 * payment-only mode sets `payment_status='refunded'` and writes a history row
 * without touching order_status.
 */
import type { OrderStatus, PaymentStatus } from "@/lib/supabase/database.types";

/** The set of MP payment statuses we recognize (classic /v1/payments). */
export const MP_PAYMENT_STATUSES = [
  "approved",
  "pending",
  "in_process",
  "authorized",
  "rejected",
  "cancelled",
  "refunded",
  "charged_back",
  "in_mediation",
] as const;

export type MpPaymentStatus = (typeof MP_PAYMENT_STATUSES)[number];

/**
 * The outcome of mapping an MP status. `kind`:
 *  - `advance`  : apply `orderStatus`/`paymentStatus` via the RPC.
 *  - `flag`     : a status that must NEVER auto-advance (chargeback/mediation/
 *                 unknown). The webhook logs it, records the event, and leaves
 *                 the order state as-is for human review — it does not 500.
 */
export type StatusMapping =
  | {
      kind: "advance";
      /**
       * Target order status, or `null` for a PAYMENT-ONLY change (C-2): set the
       * payment fields + write a history row without touching order_status. Used
       * by `refunded`, which must not assert an order lifecycle state.
       */
      orderStatus: OrderStatus | null;
      paymentStatus: PaymentStatus;
      /** Human-readable note written to order_status_history. */
      note: string;
    }
  | {
      kind: "flag";
      /** Why this status was flagged rather than advanced (for logs). */
      reason: string;
    };

/**
 * Map an MP payment status (case-insensitive, defensively trimmed) to a
 * transition decision. Unknown/empty → `flag` (never a guess). `statusDetail`
 * is folded into the note for observability (e.g. `expired`, `cc_rejected_*`).
 */
export function mapMpStatus(
  status: string | null | undefined,
  statusDetail?: string | null,
): StatusMapping {
  const normalized = (status ?? "").trim().toLowerCase();
  const detail = statusDetail ? ` (${statusDetail})` : "";

  switch (normalized) {
    case "approved":
      return {
        kind: "advance",
        orderStatus: "paid",
        paymentStatus: "paid",
        note: `MP payment approved${detail}`,
      };
    case "pending":
    case "in_process":
      return {
        kind: "advance",
        orderStatus: "pending_payment",
        paymentStatus: "pending",
        note: `MP payment pending${detail}`,
      };
    case "authorized":
      return {
        kind: "advance",
        orderStatus: "pending_payment",
        paymentStatus: "authorized",
        note: `MP payment authorized${detail}`,
      };
    case "rejected":
    case "cancelled":
      return {
        kind: "advance",
        orderStatus: "pending_payment",
        paymentStatus: "failed",
        note: `MP payment ${normalized}${detail}`,
      };
    case "refunded":
      return {
        kind: "advance",
        // PAYMENT-ONLY (C-2): never assert an order status. The RPC sets
        // payment_status='refunded' and writes an audit history row while leaving
        // order_status wherever it is (paid, shipped, ...). Order lifecycle after
        // a refund is the refund/admin flow's concern (AC-19), not this webhook.
        orderStatus: null,
        paymentStatus: "refunded",
        note: `MP payment refunded${detail}`,
      };
    case "charged_back":
    case "in_mediation":
      return {
        kind: "flag",
        reason: `MP status '${normalized}'${detail} requires human review; not auto-advancing`,
      };
    default:
      return {
        kind: "flag",
        reason: `Unknown MP status '${normalized || "(empty)"}'${detail}; no state change`,
      };
  }
}

/** Whether a string is a recognized MP payment status (type guard). */
export function isKnownMpStatus(value: string): value is MpPaymentStatus {
  return (MP_PAYMENT_STATUSES as readonly string[]).includes(value);
}
