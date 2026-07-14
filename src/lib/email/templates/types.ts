/**
 * Shared template types (T9). Each template is a PURE function
 * `(input, deps) => RenderedEmail`. No I/O — templates are unit-testable without
 * a DB, a network, or a next-intl request context.
 */
import type { EmailLineItem, EmailTotals } from "@/lib/email/render";
import type { PaymentMethodKey } from "@/lib/payments/config";

/** The rendered email parts every template produces. */
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * A minimal translator: the subset of the next-intl `t` we use, scoped to the
 * `email` namespace. Depending on this narrow shape (not the full next-intl
 * type) keeps templates decoupled from the i18n library and trivially mockable
 * in tests. `getTranslations({ locale, namespace: "email" })` is structurally
 * assignable to it.
 */
export type EmailTranslator = (
  key: string,
  values?: Record<string, string | number>,
) => string;

/** Chrome shared by every customer template (store name, confirmation link). */
export interface EmailChrome {
  /** Live store display name or the brand fallback. */
  storeName: string;
  /** Absolute URL to the order's confirmation page. */
  orderUrl: string;
}

/** Input for the order-confirmation + payment-received + voucher templates. */
export interface OrderEmailInput {
  customerName: string;
  orderNumber: string;
  items: readonly EmailLineItem[];
  totals: EmailTotals;
}

/** Extra input the payment-received template needs. */
export interface PaymentReceivedInput extends OrderEmailInput {
  paidAmountCents: number;
}

/**
 * Voucher reference data for the email (present only when the trigger has it,
 * AC-16). Built by dispatch from the T8 `extractVoucher` (VoucherView) + the
 * resolved method + the order amount. `reference` is the OXXO barcode / SPEI
 * CLABE; `voucherUrl` is the printable voucher; `expiresLabel` is the raw expiry
 * string (empty when absent). `amountCents` is the order total in integer cents.
 */
export interface VoucherData {
  method: Extract<PaymentMethodKey, "oxxo" | "spei">;
  /** OXXO barcode reference / SPEI CLABE (payment_method_reference_id). */
  reference: string;
  /** Printable voucher URL, when MP provided one. */
  voucherUrl: string | null;
  /** Optional verification code. */
  verificationCode: string | null;
  /** Raw expiry string (ISO), or null when absent. */
  expiresLabel: string | null;
  amountCents: number;
}

/** Input for the voucher-instructions template. */
export interface VoucherEmailInput extends OrderEmailInput {
  voucher: VoucherData;
}

/** Input for the shipped template (T12 wiring). */
export interface ShippedEmailInput extends OrderEmailInput {
  trackingNumber: string | null;
  carrier: string | null;
  /** Absolute tracking URL, when the carrier provides one. */
  trackingUrl: string | null;
}

/** Input for the cancelled template (T12 wiring). */
export interface CancelledEmailInput extends OrderEmailInput {
  /** Optional human reason (admin-supplied); null hides the reason row. */
  reason: string | null;
}

/** Input for the refund-issued template (T12 wiring). */
export interface RefundEmailInput extends OrderEmailInput {
  refundedAmountCents: number;
}
