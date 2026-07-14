/**
 * Email dispatch orchestration (T9). The ONLY module that does I/O for email:
 * claim (exactly-once) → render (pure template) → send (provider) → finalize.
 * Every send is FAILURE-ISOLATED (AC-13): a provider error, missing config, or
 * template throw is caught + logged with context (kind + order id + reason) and
 * NEVER propagates into the checkout action's return or the webhook's HTTP
 * status. Server-only.
 *
 * Live-wired in T9: sendOrderConfirmation, sendNewOrderOwnerAlert,
 * sendPaymentReceived, sendVoucherInstructions.
 * Callable seams (NOT wired here): sendShipped, sendCancelled, sendRefundIssued
 * (T12 admin), sendContactRelay (T13 contact page).
 */
import "server-only";
import { getTranslations } from "next-intl/server";
import { getEmailEnv } from "@/lib/env";
import { getStoreSettingsStatic } from "@/lib/store-settings";
import { OWNER_EMAIL_LOCALE, EMAIL_SEND_TIMEOUT_MS } from "@/lib/config";
import { sendEmail, type SendEmailInput } from "@/lib/email/provider";
import { claimEmailSend, finalizeEmailSend } from "@/lib/email/ledger";
import { buildOrderUrl } from "@/lib/email/order-url";
import { EMAIL_STORE_NAME_FALLBACK } from "@/lib/email/brand";
import { EMAIL_KINDS, ONE_PER_ORDER_DEDUPE_KEY, type EmailKind } from "@/lib/email/email-kinds";
import { getOrderForEmail, type OrderEmailData } from "@/lib/checkout/order-read";
import { renderOrderConfirmation } from "@/lib/email/templates/order-confirmation";
import { renderPaymentReceived } from "@/lib/email/templates/payment-received";
import { renderVoucherInstructions } from "@/lib/email/templates/voucher-instructions";
import { renderShipped } from "@/lib/email/templates/shipped";
import { renderCancelled } from "@/lib/email/templates/cancelled";
import { renderRefundIssued } from "@/lib/email/templates/refund-issued";
import { renderNewOrderOwner } from "@/lib/email/templates/new-order-owner";
import { renderContactRelay, type ContactRelayInput } from "@/lib/email/templates/contact-relay";
import type {
  CancelledEmailInput,
  EmailChrome,
  EmailTranslator,
  RefundEmailInput,
  RenderedEmail,
  ShippedEmailInput,
  VoucherData,
} from "@/lib/email/templates/types";

/** The dispatch outcome (typed; never thrown). */
export type DispatchResult =
  | { ok: true; sent: boolean }
  | { ok: false; reason: string };

/** A rendered email plus its recipient + optional reply-to, ready to send. */
interface Deliverable extends RenderedEmail {
  to: string;
  replyTo?: string;
}

/**
 * The core send path: claim (exactly-once) → send → finalize, fully isolated.
 * `render` is called ONLY when the claim is 'new'; a duplicate short-circuits
 * before any provider call. Any throw is caught and returned as `{ ok: false }`.
 */
async function dispatchEmail(
  orderId: string,
  kind: EmailKind,
  dedupeKey: string,
  render: () => Deliverable,
): Promise<DispatchResult> {
  try {
    const claim = await claimEmailSend(orderId, kind, dedupeKey);
    if (claim === "duplicate") {
      return { ok: true, sent: false };
    }
    if (claim === "error") {
      return { ok: false, reason: "claim failed" };
    }
    const deliverable = render();
    const result = await sendWithTimeout(deliverable);
    if (!result.ok) {
      console.error(`[email] send failed: kind=${kind} order=${orderId} reason=${result.reason}`);
      return { ok: false, reason: result.reason };
    }
    await finalizeEmailSend(orderId, kind, dedupeKey);
    return { ok: true, sent: true };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    console.error(`[email] dispatch threw: kind=${kind} order=${orderId} reason=${message}`);
    return { ok: false, reason: message };
  }
}

/** Race the provider send against the bounded timeout (AC — never blocks). */
async function sendWithTimeout(
  input: SendEmailInput,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ ok: false; reason: string }>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, reason: "send timeout" }), EMAIL_SEND_TIMEOUT_MS);
  });
  try {
    const outcome = await Promise.race([sendEmail(input), timeout]);
    return outcome.ok ? { ok: true } : { ok: false, reason: outcome.reason };
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/** Resolve the store display name (live setting or brand fallback). */
async function resolveStoreName(): Promise<string> {
  const settings = await getStoreSettingsStatic();
  const name = settings?.store_name?.trim();
  return name && name.length > 0 ? name : EMAIL_STORE_NAME_FALLBACK;
}

/** Build the chrome (store name + absolute order URL) for a customer email. */
async function chromeFor(order: OrderEmailData): Promise<EmailChrome> {
  return {
    storeName: await resolveStoreName(),
    orderUrl: buildOrderUrl(order.confirmationToken, order.locale),
  };
}

/** A next-intl translator scoped to the `email` namespace for a locale. */
async function emailTranslator(locale: string): Promise<EmailTranslator> {
  return getTranslations({ locale, namespace: "email" });
}

/** The shared order-email input built from the DB read. */
function orderInput(order: OrderEmailData): {
  customerName: string;
  orderNumber: string;
  items: OrderEmailData["items"];
  totals: { subtotalCents: number; shippingCents: number; discountCents: number; totalCents: number };
} {
  return {
    customerName: order.customerName,
    orderNumber: order.orderNumber,
    items: order.items,
    totals: {
      subtotalCents: order.subtotalCents,
      shippingCents: order.shippingCents,
      discountCents: order.discountCents,
      totalCents: order.totalCents,
    },
  };
}

/* ========================================================================= *
 * LIVE-WIRED SENDS (T9)
 * ========================================================================= */

/** Send the order-confirmation email to the customer (in the order's locale). */
export async function sendOrderConfirmation(orderId: string): Promise<DispatchResult> {
  const order = await getOrderForEmail(orderId);
  if (!order) {
    console.error(`[email] order confirmation skipped: order ${orderId} unreadable`);
    return { ok: false, reason: "order unreadable" };
  }
  const [t, chrome] = await Promise.all([emailTranslator(order.locale), chromeFor(order)]);
  return dispatchEmail(orderId, EMAIL_KINDS.ORDER_CONFIRMATION, ONE_PER_ORDER_DEDUPE_KEY, () => {
    const rendered = renderOrderConfirmation(orderInput(order), t, chrome);
    return { ...rendered, to: order.contactEmail };
  });
}

/** Send the new-order alert to the store owner (always es-MX, AC-12). */
export async function sendNewOrderOwnerAlert(orderId: string): Promise<DispatchResult> {
  const order = await getOrderForEmail(orderId);
  if (!order) {
    console.error(`[email] owner alert skipped: order ${orderId} unreadable`);
    return { ok: false, reason: "order unreadable" };
  }
  const ownerAddress = ownerAddressOrNull();
  if (!ownerAddress) {
    return { ok: false, reason: "owner address unavailable" };
  }
  // Owner chrome links to the confirmation page; use es-MX (prefix-free) URL.
  const chrome: EmailChrome = {
    storeName: await resolveStoreName(),
    orderUrl: buildOrderUrl(order.confirmationToken, OWNER_EMAIL_LOCALE),
  };
  return dispatchEmail(orderId, EMAIL_KINDS.NEW_ORDER_OWNER, ONE_PER_ORDER_DEDUPE_KEY, () => {
    const rendered = renderNewOrderOwner(orderInput(order), chrome);
    return { ...rendered, to: ownerAddress };
  });
}

/** Send the payment-received email (dedupe on mp_payment_id, AC-15). */
export async function sendPaymentReceived(
  orderId: string,
  mpPaymentId: string,
  paidAmountCents: number,
): Promise<DispatchResult> {
  const order = await getOrderForEmail(orderId);
  if (!order) {
    console.error(`[email] payment received skipped: order ${orderId} unreadable`);
    return { ok: false, reason: "order unreadable" };
  }
  const [t, chrome] = await Promise.all([emailTranslator(order.locale), chromeFor(order)]);
  return dispatchEmail(orderId, EMAIL_KINDS.PAYMENT_RECEIVED, mpPaymentId, () => {
    const rendered = renderPaymentReceived({ ...orderInput(order), paidAmountCents }, t, chrome);
    return { ...rendered, to: order.contactEmail };
  });
}

/**
 * Send the OXXO/SPEI voucher-instructions email (dedupe on mp_payment_id, AC-16).
 * `voucher` is supplied by the caller ONLY when reference data is present at the
 * trigger; a missing voucher is handled upstream (no partial email) — this
 * function assumes valid voucher data.
 */
export async function sendVoucherInstructions(
  orderId: string,
  mpPaymentId: string,
  voucher: VoucherData,
): Promise<DispatchResult> {
  const order = await getOrderForEmail(orderId);
  if (!order) {
    console.error(`[email] voucher skipped: order ${orderId} unreadable`);
    return { ok: false, reason: "order unreadable" };
  }
  const [t, chrome] = await Promise.all([emailTranslator(order.locale), chromeFor(order)]);
  return dispatchEmail(orderId, EMAIL_KINDS.VOUCHER_INSTRUCTIONS, mpPaymentId, () => {
    const rendered = renderVoucherInstructions({ ...orderInput(order), voucher }, t, chrome);
    return { ...rendered, to: order.contactEmail };
  });
}

/* ========================================================================= *
 * CALLABLE SEAMS (built + unit-tested; NOT live-wired in T9)
 * ========================================================================= */

/** Send the shipped email. // T12 wiring seam — called from the admin ship action. */
export async function sendShipped(
  orderId: string,
  tracking: { trackingNumber: string | null; carrier: string | null; trackingUrl: string | null },
): Promise<DispatchResult> {
  const order = await getOrderForEmail(orderId);
  if (!order) {
    return { ok: false, reason: "order unreadable" };
  }
  const [t, chrome] = await Promise.all([emailTranslator(order.locale), chromeFor(order)]);
  return dispatchEmail(orderId, EMAIL_KINDS.SHIPPED, ONE_PER_ORDER_DEDUPE_KEY, () => {
    const input: ShippedEmailInput = { ...orderInput(order), ...tracking };
    const rendered = renderShipped(input, t, chrome);
    return { ...rendered, to: order.contactEmail };
  });
}

/** Send the cancelled email. // T12 wiring seam — called from the admin cancel action. */
export async function sendCancelled(
  orderId: string,
  reason: string | null,
): Promise<DispatchResult> {
  const order = await getOrderForEmail(orderId);
  if (!order) {
    return { ok: false, reason: "order unreadable" };
  }
  const [t, chrome] = await Promise.all([emailTranslator(order.locale), chromeFor(order)]);
  return dispatchEmail(orderId, EMAIL_KINDS.CANCELLED, ONE_PER_ORDER_DEDUPE_KEY, () => {
    const input: CancelledEmailInput = { ...orderInput(order), reason };
    const rendered = renderCancelled(input, t, chrome);
    return { ...rendered, to: order.contactEmail };
  });
}

/** Send the refund-issued email. // T12 wiring seam — called from the admin refund action. */
export async function sendRefundIssued(
  orderId: string,
  mpRefundId: string,
  refundedAmountCents: number,
): Promise<DispatchResult> {
  const order = await getOrderForEmail(orderId);
  if (!order) {
    return { ok: false, reason: "order unreadable" };
  }
  const [t, chrome] = await Promise.all([emailTranslator(order.locale), chromeFor(order)]);
  // Dedupe on the MP refund id: a partial refund can fire more than once per order.
  return dispatchEmail(orderId, EMAIL_KINDS.REFUND_ISSUED, mpRefundId, () => {
    const input: RefundEmailInput = { ...orderInput(order), refundedAmountCents };
    const rendered = renderRefundIssued(input, t, chrome);
    return { ...rendered, to: order.contactEmail };
  });
}

/**
 * Relay a contact-form message to the store owner. // T13 wiring seam — called
 * from the Contact page action. Not order-scoped, so it does NOT use the
 * email_sends ledger (no order id); the caller is responsible for its own rate
 * limiting (T13). The customer's email becomes the reply-to.
 */
export async function sendContactRelay(input: ContactRelayInput): Promise<DispatchResult> {
  const ownerAddress = ownerAddressOrNull();
  if (!ownerAddress) {
    return { ok: false, reason: "owner address unavailable" };
  }
  try {
    const chrome: EmailChrome = { storeName: await resolveStoreName(), orderUrl: "" };
    const rendered = renderContactRelay(input, chrome);
    const result = await sendWithTimeout({
      to: ownerAddress,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      replyTo: input.fromEmail,
    });
    if (!result.ok) {
      console.error(`[email] contact relay send failed: reason=${result.reason}`);
      return { ok: false, reason: result.reason };
    }
    return { ok: true, sent: true };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    console.error(`[email] contact relay threw: reason=${message}`);
    return { ok: false, reason: message };
  }
}

/** The store owner's address, or null when email is unconfigured (swallowed). */
function ownerAddressOrNull(): string | null {
  try {
    return getEmailEnv().ownerAddress;
  } catch {
    return null;
  }
}
