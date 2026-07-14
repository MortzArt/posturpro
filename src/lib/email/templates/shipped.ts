/**
 * shipped template (T9 AC-10/AC-17). Built + unit-tested now; live-wired in T12
 * (admin marks an order shipped). Shows tracking number + carrier + a track
 * button when a tracking URL is present. Localized. Pure.
 */
import { wrapEmail, renderParagraph, renderButton } from "@/lib/email/layout";
import {
  greetingHtml,
  headingIntroHtml,
  labelledCalloutHtml,
} from "@/lib/email/templates/sections";
import type {
  EmailChrome,
  EmailTranslator,
  RenderedEmail,
  ShippedEmailInput,
} from "@/lib/email/templates/types";

/** Render the shipped email. */
export function renderShipped(
  input: ShippedEmailInput,
  t: EmailTranslator,
  chrome: EmailChrome,
): RenderedEmail {
  const orderNumber = input.orderNumber;
  const subject = t("shipped.subject", { orderNumber });
  const intro = renderParagraph(t("shipped.intro", { orderNumber }));

  const trackingCallout = input.trackingNumber
    ? labelledCalloutHtml(t("shipped.trackingLabel"), input.trackingNumber)
    : "";
  const carrierLine = input.carrier
    ? renderParagraph(`${t("shipped.carrierLabel")}: ${input.carrier}`)
    : "";
  const trackButton = input.trackingUrl
    ? renderButton(input.trackingUrl, t("shipped.trackButton"))
    : renderButton(chrome.orderUrl, t("common.viewOrder"));

  const contentHtml =
    headingIntroHtml(t("shipped.heading"), intro) +
    greetingHtml(t, input.customerName) +
    trackingCallout +
    carrierLine +
    trackButton;

  const trackingText = input.trackingNumber
    ? `${t("shipped.trackingLabel")}: ${input.trackingNumber}\n`
    : "";
  const carrierText = input.carrier ? `${t("shipped.carrierLabel")}: ${input.carrier}\n` : "";
  const linkText = input.trackingUrl
    ? `${t("shipped.trackButton")}: ${input.trackingUrl}`
    : `${t("common.viewOrder")}: ${chrome.orderUrl}`;
  const contentText =
    `${t("shipped.heading")}\n\n` +
    `${t("common.greeting", { name: input.customerName })}\n` +
    `${t("shipped.intro", { orderNumber })}\n\n` +
    trackingText +
    carrierText +
    `\n${linkText}`;

  const { html, text } = wrapEmail({
    storeName: chrome.storeName,
    preheader: t("shipped.preheader", { orderNumber }),
    contentHtml,
    contentText,
    footerNote: t("common.footer"),
  });
  return { subject, html, text };
}
