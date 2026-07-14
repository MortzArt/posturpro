/**
 * Pure render helpers for the email templates (T9). No I/O, no DB — every
 * function is a pure transform, unit-testable in isolation. Money is formatted
 * exclusively through `src/lib/money.ts` (never re-implemented). All dynamic
 * values that reach HTML pass through `escapeHtml` first (email-injection /
 * broken-markup defense — customer names + addresses are user-supplied).
 */
import { formatMXN } from "@/lib/money";
import { EMAIL_COLORS, EMAIL_TYPOGRAPHY } from "@/lib/email/brand";

/** One purchased line, as the templates consume it (integer cents). */
export interface EmailLineItem {
  productName: string;
  variantLabel: string | null;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

/** A subtotal/shipping/discount/total summary in integer cents. */
export interface EmailTotals {
  subtotalCents: number;
  shippingCents: number;
  discountCents: number;
  totalCents: number;
}

/**
 * Escape the five HTML-significant characters so a customer-supplied value (name,
 * address, product name) can never break the markup or inject an element. Ordered
 * so `&` is replaced first (never double-escapes).
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Format integer cents as an MXN string via the single money boundary. */
export function money(cents: number): string {
  return formatMXN(cents);
}

/** Inline-style helper: join a style map into a `key:value;` string. */
function inlineStyle(styles: Record<string, string>): string {
  return Object.entries(styles)
    .map(([key, value]) => `${key}:${value}`)
    .join(";");
}

/** A single item's display label ("Product — Variant" or just "Product"). */
function itemLabel(item: EmailLineItem): string {
  if (item.variantLabel && item.variantLabel.trim().length > 0) {
    return `${item.productName} — ${item.variantLabel}`;
  }
  return item.productName;
}

/**
 * Build the itemized purchase table as inline-styled HTML rows. Each row: a
 * left-aligned name + `xN` quantity, a right-aligned line total. Table-based,
 * inline styles only — no flexbox/grid (stripped by Outlook/Gmail).
 */
export function renderItemRows(items: readonly EmailLineItem[]): string {
  const cellBase = inlineStyle({
    padding: "8px 0",
    "border-bottom": `1px solid ${EMAIL_COLORS.border}`,
    "font-size": `${EMAIL_TYPOGRAPHY.smallFontSizePx}px`,
    color: EMAIL_COLORS.text,
    "vertical-align": "top",
  });
  const amountCell = inlineStyle({
    padding: "8px 0",
    "border-bottom": `1px solid ${EMAIL_COLORS.border}`,
    "font-size": `${EMAIL_TYPOGRAPHY.smallFontSizePx}px`,
    color: EMAIL_COLORS.text,
    "text-align": "right",
    "white-space": "nowrap",
    "vertical-align": "top",
  });
  return items
    .map((item) => {
      const label = escapeHtml(itemLabel(item));
      return (
        `<tr>` +
        `<td style="${cellBase}">${label} <span style="color:${EMAIL_COLORS.muted}">× ${item.quantity}</span></td>` +
        `<td style="${amountCell}">${money(item.lineTotalCents)}</td>` +
        `</tr>`
      );
    })
    .join("");
}

/**
 * Build the totals block (subtotal, shipping, discount if any, grand total) as
 * inline-styled table rows. `labels` localizes each row label.
 */
export function renderTotalsRows(
  totals: EmailTotals,
  labels: { subtotal: string; shipping: string; discount: string; total: string },
): string {
  const label = inlineStyle({
    padding: "4px 0",
    "font-size": `${EMAIL_TYPOGRAPHY.smallFontSizePx}px`,
    color: EMAIL_COLORS.muted,
  });
  const amount = inlineStyle({
    padding: "4px 0",
    "font-size": `${EMAIL_TYPOGRAPHY.smallFontSizePx}px`,
    color: EMAIL_COLORS.text,
    "text-align": "right",
    "white-space": "nowrap",
  });
  const totalLabel = inlineStyle({
    padding: "10px 0 0",
    "font-size": `${EMAIL_TYPOGRAPHY.baseFontSizePx}px`,
    "font-weight": "700",
    color: EMAIL_COLORS.text,
    "border-top": `2px solid ${EMAIL_COLORS.border}`,
  });
  const totalAmount = inlineStyle({
    padding: "10px 0 0",
    "font-size": `${EMAIL_TYPOGRAPHY.baseFontSizePx}px`,
    "font-weight": "700",
    color: EMAIL_COLORS.text,
    "text-align": "right",
    "white-space": "nowrap",
    "border-top": `2px solid ${EMAIL_COLORS.border}`,
  });

  const rows: string[] = [
    `<tr><td style="${label}">${escapeHtml(labels.subtotal)}</td><td style="${amount}">${money(totals.subtotalCents)}</td></tr>`,
    `<tr><td style="${label}">${escapeHtml(labels.shipping)}</td><td style="${amount}">${money(totals.shippingCents)}</td></tr>`,
  ];
  if (totals.discountCents > 0) {
    rows.push(
      `<tr><td style="${label}">${escapeHtml(labels.discount)}</td><td style="${amount}">−${money(totals.discountCents)}</td></tr>`,
    );
  }
  rows.push(
    `<tr><td style="${totalLabel}">${escapeHtml(labels.total)}</td><td style="${totalAmount}">${money(totals.totalCents)}</td></tr>`,
  );
  return rows.join("");
}

/**
 * Derive the plain-text item list for the text alternative part (one line per
 * item). No HTML — this is the `text/plain` body.
 */
export function renderItemsText(items: readonly EmailLineItem[]): string {
  return items
    .map((item) => `- ${itemLabel(item)} × ${item.quantity}  ${money(item.lineTotalCents)}`)
    .join("\n");
}

/** Derive the plain-text totals block for the text alternative part. */
export function renderTotalsText(
  totals: EmailTotals,
  labels: { subtotal: string; shipping: string; discount: string; total: string },
): string {
  const lines = [
    `${labels.subtotal}: ${money(totals.subtotalCents)}`,
    `${labels.shipping}: ${money(totals.shippingCents)}`,
  ];
  if (totals.discountCents > 0) {
    lines.push(`${labels.discount}: -${money(totals.discountCents)}`);
  }
  lines.push(`${labels.total}: ${money(totals.totalCents)}`);
  return lines.join("\n");
}
