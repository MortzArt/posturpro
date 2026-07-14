/**
 * payment_received template (T9 AC-10/AC-11/AC-15). Sent when the webhook
 * advances an order to a PAID transition. Names the paid amount. Localized.
 */
import { wrapEmail, renderParagraph } from "@/lib/email/layout";
import { money } from "@/lib/email/render";
import {
  greetingHtml,
  headingIntroHtml,
  itemsSectionHtml,
  itemsSectionText,
  labelledCalloutHtml,
  viewOrderButtonHtml,
  viewOrderText,
} from "@/lib/email/templates/sections";
import type {
  EmailChrome,
  EmailTranslator,
  PaymentReceivedInput,
  RenderedEmail,
} from "@/lib/email/templates/types";

/** Render the payment-received email. */
export function renderPaymentReceived(
  input: PaymentReceivedInput,
  t: EmailTranslator,
  chrome: EmailChrome,
): RenderedEmail {
  const amount = money(input.paidAmountCents);
  const subject = t("paymentReceived.subject", { orderNumber: input.orderNumber });
  const intro = renderParagraph(
    t("paymentReceived.intro", { orderNumber: input.orderNumber, amount }),
  );

  const contentHtml =
    headingIntroHtml(t("paymentReceived.heading"), intro) +
    greetingHtml(t, input.customerName) +
    labelledCalloutHtml(t("paymentReceived.amountLabel"), amount) +
    itemsSectionHtml(t, input.items, input.totals) +
    viewOrderButtonHtml(t, chrome.orderUrl);

  const contentText =
    `${t("paymentReceived.heading")}\n\n` +
    `${t("common.greeting", { name: input.customerName })}\n` +
    `${t("paymentReceived.intro", { orderNumber: input.orderNumber, amount })}\n\n` +
    `${t("paymentReceived.amountLabel")}: ${amount}\n\n` +
    `${itemsSectionText(t, input.items, input.totals)}\n\n` +
    `${viewOrderText(t, chrome.orderUrl)}`;

  const { html, text } = wrapEmail({
    storeName: chrome.storeName,
    preheader: t("paymentReceived.preheader", { orderNumber: input.orderNumber }),
    contentHtml,
    contentText,
    footerNote: t("common.footer"),
  });
  return { subject, html, text };
}
