/**
 * Domain enum aliases (Postgres enum types + the derived transition kind).
 * Split out of the hand-maintained `database.types.ts` barrel (A1). These names
 * are re-exported unchanged from the barrel, so no importer changes.
 */

export type ProductStatus = "draft" | "active" | "archived";
export type OrderStatus =
  | "pending_payment"
  | "paid"
  | "preparing"
  | "shipped"
  | "delivered"
  | "cancelled";
export type PaymentStatus =
  | "pending"
  | "authorized"
  | "paid"
  | "failed"
  | "refunded";
export type DiscountType = "percentage" | "fixed_amount";

/**
 * Structured order-transition kind (T9 TD-2, 0010_email_transitions.sql). Derived
 * INSIDE `advance_order_status` from (from_status, to_status, payment_status,
 * payment-only mode) and returned in the RPC jsonb + written to every
 * `order_status_history` row. Email triggers branch on THIS fixed set — never on
 * the free-text `note`. `noop` = an idempotent re-notification with no material
 * change (no email fires).
 */
export type TransitionKind =
  | "paid"
  | "payment_pending"
  | "payment_failed"
  | "payment_authorized"
  | "refunded"
  | "shipped"
  | "cancelled"
  | "delivered"
  | "preparing"
  | "noop";
