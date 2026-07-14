/**
 * cancelled template (T9 AC-10/AC-17). Built + unit-tested now; live-wired in
 * T12 (admin cancels an order). Optionally shows a reason. Localized. Pure.
 */
import { wrapEmail, renderParagraph } from "@/lib/email/layout";
import {
  greetingHtml,
  headingIntroHtml,
  viewOrderButtonHtml,
  viewOrderText,
} from "@/lib/email/templates/sections";
import type {
  CancelledEmailInput,
  EmailChrome,
  EmailTranslator,
  RenderedEmail,
} from "@/lib/email/templates/types";

/** Render the cancelled email. */
export function renderCancelled(
  input: CancelledEmailInput,
  t: EmailTranslator,
  chrome: EmailChrome,
): RenderedEmail {
  const orderNumber = input.orderNumber;
  const subject = t("cancelled.subject", { orderNumber });
  const intro = renderParagraph(t("cancelled.intro", { orderNumber }));
  const reasonLine = input.reason
    ? renderParagraph(`${t("cancelled.reasonLabel")}: ${input.reason}`)
    : "";

  const contentHtml =
    headingIntroHtml(t("cancelled.heading"), intro) +
    greetingHtml(t, input.customerName) +
    reasonLine +
    viewOrderButtonHtml(t, chrome.orderUrl);

  const reasonText = input.reason ? `${t("cancelled.reasonLabel")}: ${input.reason}\n\n` : "";
  const contentText =
    `${t("cancelled.heading")}\n\n` +
    `${t("common.greeting", { name: input.customerName })}\n` +
    `${t("cancelled.intro", { orderNumber })}\n\n` +
    reasonText +
    `${viewOrderText(t, chrome.orderUrl)}`;

  const { html, text } = wrapEmail({
    storeName: chrome.storeName,
    preheader: t("cancelled.preheader", { orderNumber }),
    contentHtml,
    contentText,
    footerNote: t("common.footer"),
  });
  return { subject, html, text };
}
