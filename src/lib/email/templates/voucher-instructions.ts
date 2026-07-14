/**
 * voucher_instructions template (T9 AC-10/AC-11/AC-16). Sent when an OXXO/SPEI
 * order is first known as pending AND voucher reference data is present. Branches
 * on the voucher method for OXXO (barcode reference) vs SPEI (CLABE + reference).
 * Localized. Pure.
 */
import {
  wrapEmail,
  renderParagraph,
  renderCallout,
  renderButton,
} from "@/lib/email/layout";
import { money, escapeHtml } from "@/lib/email/render";
import { EMAIL_COLORS, EMAIL_TYPOGRAPHY } from "@/lib/email/brand";
import { headingIntroHtml, greetingHtml } from "@/lib/email/templates/sections";
import type {
  EmailChrome,
  EmailTranslator,
  RenderedEmail,
  VoucherEmailInput,
} from "@/lib/email/templates/types";

/** A labelled reference row inside the voucher callout (HTML). */
function referenceRow(label: string, value: string): string {
  const labelStyle =
    `font-size:${EMAIL_TYPOGRAPHY.smallFontSizePx}px;color:${EMAIL_COLORS.muted};margin:0`;
  const valueStyle =
    `font-size:${EMAIL_TYPOGRAPHY.baseFontSizePx}px;font-weight:700;` +
    `color:${EMAIL_COLORS.text};margin:0 0 12px;letter-spacing:0.02em;` +
    `font-family:'Courier New',monospace`;
  return (
    `<p style="${labelStyle}">${escapeHtml(label)}</p>` +
    `<p style="${valueStyle}">${escapeHtml(value)}</p>`
  );
}

/** The reference row label: CLABE for SPEI, generic reference for OXXO. */
function referenceLabel(t: EmailTranslator, isSpei: boolean): string {
  return isSpei ? t("voucherInstructions.clabeLabel") : t("voucherInstructions.referenceLabel");
}

/** Build the voucher callout rows (reference/CLABE, amount, expiry). */
function voucherCalloutHtml(t: EmailTranslator, input: VoucherEmailInput): string {
  const { voucher } = input;
  const isSpei = voucher.method === "spei";
  let rows = referenceRow(referenceLabel(t, isSpei), voucher.reference);
  rows += referenceRow(t("voucherInstructions.amountLabel"), money(voucher.amountCents));
  if (voucher.expiresLabel) {
    rows += referenceRow(t("voucherInstructions.expiresLabel"), voucher.expiresLabel);
  }
  return renderCallout(rows);
}

/** Build the plain-text voucher block. */
function voucherText(t: EmailTranslator, input: VoucherEmailInput): string {
  const { voucher } = input;
  const isSpei = voucher.method === "spei";
  const lines = [`${referenceLabel(t, isSpei)}: ${voucher.reference}`];
  lines.push(`${t("voucherInstructions.amountLabel")}: ${money(voucher.amountCents)}`);
  if (voucher.expiresLabel) {
    lines.push(`${t("voucherInstructions.expiresLabel")}: ${voucher.expiresLabel}`);
  }
  if (voucher.voucherUrl) {
    lines.push(`${t("voucherInstructions.viewVoucher")}: ${voucher.voucherUrl}`);
  }
  return lines.join("\n");
}

/** Render the voucher-instructions email. */
export function renderVoucherInstructions(
  input: VoucherEmailInput,
  t: EmailTranslator,
  chrome: EmailChrome,
): RenderedEmail {
  const isOxxo = input.voucher.method === "oxxo";
  const orderNumber = input.orderNumber;
  const subject = isOxxo
    ? t("voucherInstructions.subjectOxxo", { orderNumber })
    : t("voucherInstructions.subjectSpei", { orderNumber });
  const heading = isOxxo
    ? t("voucherInstructions.headingOxxo")
    : t("voucherInstructions.headingSpei");
  const intro = isOxxo
    ? t("voucherInstructions.introOxxo", { orderNumber })
    : t("voucherInstructions.introSpei", { orderNumber });

  // Prefer the printable voucher URL as the primary button when MP provided one;
  // otherwise link back to the order (both are absolute URLs).
  const buttonUrl = input.voucher.voucherUrl ?? chrome.orderUrl;
  const buttonLabel = input.voucher.voucherUrl
    ? t("voucherInstructions.viewVoucher")
    : t("common.viewOrder");
  const contentHtml =
    headingIntroHtml(heading, renderParagraph(intro)) +
    greetingHtml(t, input.customerName) +
    voucherCalloutHtml(t, input) +
    renderParagraph(t("voucherInstructions.afterPayment")) +
    renderButton(buttonUrl, buttonLabel);

  const contentText =
    `${heading}\n\n` +
    `${t("common.greeting", { name: input.customerName })}\n` +
    `${intro}\n\n` +
    `${voucherText(t, input)}\n\n` +
    `${t("voucherInstructions.afterPayment")}\n\n` +
    `${t("common.viewOrder")}: ${chrome.orderUrl}`;

  const { html, text } = wrapEmail({
    storeName: chrome.storeName,
    preheader: t("voucherInstructions.preheader", { orderNumber }),
    contentHtml,
    contentText,
    footerNote: t("common.footer"),
  });
  return { subject, html, text };
}
