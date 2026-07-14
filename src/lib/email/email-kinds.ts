/**
 * The canonical set of transactional email kinds (T9 AC-10). Named constants —
 * no magic strings anywhere in dispatch, templates, or the `email_sends` ledger
 * key. The value is what is written to `email_sends.email_kind`; changing a value
 * would orphan existing ledger rows, so treat these as stable identifiers.
 */

/** All eight email kinds T9 defines. */
export const EMAIL_KINDS = {
  ORDER_CONFIRMATION: "order_confirmation",
  PAYMENT_RECEIVED: "payment_received",
  VOUCHER_INSTRUCTIONS: "voucher_instructions",
  SHIPPED: "shipped",
  CANCELLED: "cancelled",
  REFUND_ISSUED: "refund_issued",
  CONTACT_RELAY: "contact_relay",
  NEW_ORDER_OWNER: "new_order_owner",
} as const;

/** One of the eight email-kind identifiers. */
export type EmailKind = (typeof EMAIL_KINDS)[keyof typeof EMAIL_KINDS];

/**
 * Dedupe key for one-per-order emails (order_confirmation, new_order_owner). The
 * empty string is the ledger's "no external key" sentinel — the
 * (order_id, email_kind) pair alone is the uniqueness guarantee. Payment-linked
 * emails (payment_received, voucher_instructions) use the mp_payment_id instead.
 */
export const ONE_PER_ORDER_DEDUPE_KEY = "" as const;
