/**
 * The payment-facing read for the confirmation page (T8 AC-5, AC-16, AC-17, AC-18).
 * Server-only. Reads the order's LIVE payment state by confirmation token (truth
 * lives in the DB, set authoritatively by the webhook — never the URL, EC-6), and
 * — only for a pending OXXO/SPEI order — fetches the voucher fields live from MP.
 *
 * Voucher field paths are AMBIGUOUS (research §5): prefer `transaction_details.*`,
 * fall back to `point_of_interaction.transaction_data.*`, and treat EVERY field as
 * nullable. The UI renders each field only if present (no `undefined`, no broken
 * link, no `Invalid Date`). A live-fetch failure degrades to a null voucher — the
 * page still shows the pending card with the "check your email" fallback.
 */
import "server-only";
import type { PaymentResponse } from "mercadopago/dist/clients/payment/commonTypes";
import { createAdminClient } from "@/lib/supabase/admin";
import { UUID_PATTERN } from "@/lib/config";
import { paymentClient } from "@/lib/payments/mp-client";
import { resolvePaymentMethod, type PaymentMethodKey } from "@/lib/payments/config";
import type { OrderStatus, PaymentStatus } from "@/lib/supabase/database.types";

/** The voucher fields for an OXXO/SPEI pending payment — ALL nullable. */
export interface VoucherView {
  /** Barcode (OXXO) / CLABE (SPEI) — payment_method_reference_id. */
  reference: string | null;
  /** Printable voucher URL — external_resource_url. */
  voucherUrl: string | null;
  /** ISO expiry — top-level date_of_expiration. */
  expiresAt: string | null;
  /** Optional verification code. */
  verificationCode: string | null;
}

/** The payment view the confirmation page derives its panel state from. */
export interface OrderPaymentView {
  orderId: string;
  totalCents: number;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethodKey | null;
  /** Present only for a pending OXXO/SPEI order with a fetched voucher. */
  voucher: VoucherView | null;
}

/** Read the order's payment view by confirmation token; null when absent/invalid. */
export async function getOrderPaymentByToken(
  confirmationToken: string,
): Promise<OrderPaymentView | null> {
  if (!UUID_PATTERN.test(confirmationToken)) {
    return null;
  }
  try {
    const db = createAdminClient();
    const { data: order, error } = await db
      .from("orders")
      .select("id, total_cents, status, payment_status, payment_method, mp_payment_id")
      .eq("confirmation_token", confirmationToken)
      .maybeSingle();
    if (error) {
      console.error(`[payments] payment view read failed: ${error.message}`);
      return null;
    }
    if (!order) {
      return null;
    }

    const method = toPaymentMethodKey(order.payment_method);
    const voucher = await maybeFetchVoucher(order.payment_status, method, order.mp_payment_id);

    return {
      orderId: order.id,
      totalCents: order.total_cents,
      orderStatus: order.status,
      paymentStatus: order.payment_status,
      paymentMethod: method,
      voucher,
    };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    console.error(`[payments] payment view read threw: ${message}`);
    return null;
  }
}

/**
 * Fetch the voucher fields live from MP ONLY for a pending OXXO/SPEI order that
 * has a payment id. Any failure (MP down, no id, unknown method) → null voucher
 * (the UI degrades gracefully). Never throws.
 */
async function maybeFetchVoucher(
  paymentStatus: PaymentStatus,
  method: PaymentMethodKey | null,
  mpPaymentId: string | null,
): Promise<VoucherView | null> {
  const isPendingVoucherMethod =
    paymentStatus === "pending" && (method === "oxxo" || method === "spei");
  if (!isPendingVoucherMethod || !mpPaymentId) {
    return null;
  }
  try {
    const payment = await paymentClient().get({ id: mpPaymentId });
    return extractVoucher(payment);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    console.warn(`[payments] voucher fetch failed for ${mpPaymentId}: ${message}`);
    return null;
  }
}

/**
 * Extract voucher fields defensively from an MP payment (research §5 ambiguity):
 * prefer `transaction_details.*`, fall back to `point_of_interaction.transaction_data.*`.
 * Returns a VoucherView with each field nullable — never throws, never fabricates.
 */
export function extractVoucher(payment: PaymentResponse): VoucherView {
  const td = payment.transaction_details ?? {};
  const poi = readPointOfInteraction(payment);

  return {
    reference: firstNonEmpty(td.payment_method_reference_id, poi.reference),
    voucherUrl: firstNonEmpty(td.external_resource_url, poi.ticketUrl),
    expiresAt: firstNonEmpty(payment.date_of_expiration, null),
    verificationCode: firstNonEmpty(readVerificationCode(td), null),
  };
}

/** The point_of_interaction fallback fields (PIX/legacy shape), read defensively. */
function readPointOfInteraction(payment: PaymentResponse): {
  reference: string | null;
  ticketUrl: string | null;
} {
  const poi = payment.point_of_interaction as
    | { transaction_data?: { ticket_url?: string; barcode?: { content?: string } } }
    | undefined;
  const data = poi?.transaction_data;
  return {
    reference: firstNonEmpty(data?.barcode?.content, null),
    ticketUrl: firstNonEmpty(data?.ticket_url, null),
  };
}

/** `verification_code` isn't in the SDK's TransactionDetails type — read loosely. */
function readVerificationCode(td: Record<string, unknown>): string | null {
  const value = td["verification_code"];
  return typeof value === "string" ? value : null;
}

/** First non-empty trimmed string among the candidates, else null. */
function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return null;
}

/** Narrow a stored payment_method string to our compact key (null if unknown). */
function toPaymentMethodKey(value: string | null): PaymentMethodKey | null {
  return resolvePaymentMethod(value, value);
}
