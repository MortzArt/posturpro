/**
 * Adapt the T8 `VoucherView` (from `extractVoucher`) into the email's
 * `VoucherData` (T9 AC-16). Pure — no I/O. Returns `null` when the voucher has
 * no usable reference OR the amount is unavailable → the caller SKIPS the email
 * (no partial email, AC-16). This is the ONLY place the two shapes are bridged,
 * so the T8 extractor stays the single source of voucher-field truth (DRY).
 */
import type { VoucherView } from "@/lib/payments/order-payment-read";
import type { PaymentMethodKey } from "@/lib/payments/config";
import type { VoucherData } from "@/lib/email/templates/types";

/**
 * Build the email voucher payload from the extracted view + resolved OXXO/SPEI
 * method + the paid amount in cents. `null` when reference or amount is missing.
 */
export function toVoucherData(
  view: VoucherView,
  method: Extract<PaymentMethodKey, "oxxo" | "spei">,
  amountCents: number | null,
): VoucherData | null {
  if (view.reference === null || amountCents === null) {
    return null;
  }
  return {
    method,
    reference: view.reference,
    voucherUrl: view.voucherUrl,
    verificationCode: view.verificationCode,
    expiresLabel: view.expiresAt,
    amountCents,
  };
}
