/**
 * order_confirmation template (T9 AC-10/AC-11). Sent to the customer the moment
 * an order is created at checkout — before payment. Localized (es-MX / en) via
 * the injected translator. Pure: no I/O.
 */
import { wrapEmail, renderParagraph } from "@/lib/email/layout";
import {
  greetingHtml,
  headingIntroHtml,
  itemsSectionHtml,
  itemsSectionText,
  viewOrderButtonHtml,
  viewOrderText,
} from "@/lib/email/templates/sections";
import type {
  EmailChrome,
  EmailTranslator,
  OrderEmailInput,
  RenderedEmail,
} from "@/lib/email/templates/types";

/** Render the order-confirmation email. */
export function renderOrderConfirmation(
  input: OrderEmailInput,
  t: EmailTranslator,
  chrome: EmailChrome,
): RenderedEmail {
  const subject = t("orderConfirmation.subject", { orderNumber: input.orderNumber });
  const intro = renderParagraph(
    t("orderConfirmation.intro", { orderNumber: input.orderNumber }),
  );

  const contentHtml =
    headingIntroHtml(t("orderConfirmation.heading"), intro) +
    greetingHtml(t, input.customerName) +
    renderParagraph(t("orderConfirmation.nextSteps")) +
    itemsSectionHtml(t, input.items, input.totals) +
    viewOrderButtonHtml(t, chrome.orderUrl);

  const contentText =
    `${t("orderConfirmation.heading")}\n\n` +
    `${t("common.greeting", { name: input.customerName })}\n` +
    `${t("orderConfirmation.intro", { orderNumber: input.orderNumber })}\n` +
    `${t("orderConfirmation.nextSteps")}\n\n` +
    `${itemsSectionText(t, input.items, input.totals)}\n\n` +
    `${viewOrderText(t, chrome.orderUrl)}`;

  const { html, text } = wrapEmail({
    storeName: chrome.storeName,
    preheader: t("orderConfirmation.preheader", { orderNumber: input.orderNumber }),
    contentHtml,
    contentText,
    footerNote: t("common.footer"),
  });
  return { subject, html, text };
}
