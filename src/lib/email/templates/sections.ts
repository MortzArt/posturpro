/**
 * Shared, localized content SECTIONS composed by the customer templates (T9).
 * Keeps each template short (SRP, ≤30-line functions) and DRY — the items table,
 * totals block, and "view order" button are authored once here.
 */
import {
  renderButton,
  renderCallout,
  renderHeading,
  renderParagraph,
} from "@/lib/email/layout";
import {
  renderItemRows,
  renderItemsText,
  renderTotalsRows,
  renderTotalsText,
  type EmailLineItem,
  type EmailTotals,
} from "@/lib/email/render";
import { escapeHtml } from "@/lib/email/render";
import { EMAIL_COLORS, EMAIL_TYPOGRAPHY } from "@/lib/email/brand";
import type { EmailTranslator } from "@/lib/email/templates/types";

/** The localized totals labels the render helpers need. */
function totalsLabels(t: EmailTranslator): {
  subtotal: string;
  shipping: string;
  discount: string;
  total: string;
} {
  return {
    subtotal: t("common.subtotal"),
    shipping: t("common.shipping"),
    discount: t("common.discount"),
    total: t("common.total"),
  };
}

/** The itemized purchase table + totals as HTML (a full section). */
export function itemsSectionHtml(
  t: EmailTranslator,
  items: readonly EmailLineItem[],
  totals: EmailTotals,
): string {
  const heading =
    `<p style="margin:24px 0 8px;font-size:${EMAIL_TYPOGRAPHY.smallFontSizePx}px;` +
    `font-weight:600;color:${EMAIL_COLORS.muted};text-transform:uppercase;` +
    `letter-spacing:0.04em">${t("common.itemsHeading")}</p>`;
  const table =
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ` +
    `style="width:100%;border-collapse:collapse">` +
    renderItemRows(items) +
    renderTotalsRows(totals, totalsLabels(t)) +
    `</table>`;
  return heading + table;
}

/** The itemized purchase table + totals as plain text (a full section). */
export function itemsSectionText(
  t: EmailTranslator,
  items: readonly EmailLineItem[],
  totals: EmailTotals,
): string {
  return (
    `${t("common.itemsHeading")}:\n` +
    `${renderItemsText(items)}\n\n` +
    `${renderTotalsText(totals, totalsLabels(t))}`
  );
}

/** The "view my order" primary button (HTML) linking to the confirmation page. */
export function viewOrderButtonHtml(t: EmailTranslator, orderUrl: string): string {
  return renderButton(orderUrl, t("common.viewOrder"));
}

/** The confirmation link as plain text. */
export function viewOrderText(t: EmailTranslator, orderUrl: string): string {
  return `${t("common.viewOrder")}: ${orderUrl}`;
}

/** A localized greeting line (HTML). */
export function greetingHtml(t: EmailTranslator, name: string): string {
  return renderParagraph(t("common.greeting", { name }));
}

/** A localized heading + intro paragraph (HTML). */
export function headingIntroHtml(headingText: string, introHtml: string): string {
  return renderHeading(headingText) + introHtml;
}

/** A labelled callout row (e.g. "Amount paid: $499.00"), HTML. */
export function labelledCalloutHtml(label: string, value: string): string {
  const labelStyle =
    `font-size:${EMAIL_TYPOGRAPHY.smallFontSizePx}px;color:${EMAIL_COLORS.muted};` +
    `margin:0 0 4px`;
  const valueStyle =
    `font-size:${EMAIL_TYPOGRAPHY.headingFontSizePx}px;font-weight:700;` +
    `color:${EMAIL_COLORS.text};margin:0`;
  return renderCallout(
    `<p style="${labelStyle}">${escapeHtml(label)}</p>` +
      `<p style="${valueStyle}">${escapeHtml(value)}</p>`,
  );
}
