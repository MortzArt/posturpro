/**
 * refund_issued template (T9 AC-10/AC-17). Built + unit-tested now; live-wired in
 * T12 (admin issues a refund). Names the refunded amount. Localized. Pure.
 */
import { wrapEmail, renderParagraph } from "@/lib/email/layout";
import { money } from "@/lib/email/render";
import {
  greetingHtml,
  headingIntroHtml,
  labelledCalloutHtml,
  viewOrderButtonHtml,
  viewOrderText,
} from "@/lib/email/templates/sections";
import type {
  EmailChrome,
  EmailTranslator,
  RefundEmailInput,
  RenderedEmail,
} from "@/lib/email/templates/types";

/** Render the refund-issued email. */
export function renderRefundIssued(
  input: RefundEmailInput,
  t: EmailTranslator,
  chrome: EmailChrome,
): RenderedEmail {
  const orderNumber = input.orderNumber;
  const amount = money(input.refundedAmountCents);
  const subject = t("refundIssued.subject", { orderNumber });
  const intro = renderParagraph(t("refundIssued.intro", { orderNumber, amount }));

  const contentHtml =
    headingIntroHtml(t("refundIssued.heading"), intro) +
    greetingHtml(t, input.customerName) +
    labelledCalloutHtml(t("refundIssued.amountLabel"), amount) +
    viewOrderButtonHtml(t, chrome.orderUrl);

  const contentText =
    `${t("refundIssued.heading")}\n\n` +
    `${t("common.greeting", { name: input.customerName })}\n` +
    `${t("refundIssued.intro", { orderNumber, amount })}\n\n` +
    `${t("refundIssued.amountLabel")}: ${amount}\n\n` +
    `${viewOrderText(t, chrome.orderUrl)}`;

  const { html, text } = wrapEmail({
    storeName: chrome.storeName,
    preheader: t("refundIssued.preheader", { orderNumber, amount }),
    contentHtml,
    contentText,
    footerNote: t("common.footer"),
  });
  return { subject, html, text };
}
