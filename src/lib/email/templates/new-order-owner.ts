/**
 * new_order_owner template (T9 AC-10/AC-12/AC-14). Alerts the store operator the
 * moment an order is placed. SINGLE-LOCALE es-MX (the owner is the Mexican
 * merchant) — no translator; the copy is authored inline. Includes the order
 * number, customer, itemized totals, and a link to the order. Pure.
 */
import {
  wrapEmail,
  renderHeading,
  renderParagraph,
  renderButton,
} from "@/lib/email/layout";
import {
  renderItemRows,
  renderItemsText,
  renderTotalsRows,
  renderTotalsText,
} from "@/lib/email/render";
import { EMAIL_COLORS, EMAIL_TYPOGRAPHY } from "@/lib/email/brand";
import type {
  EmailChrome,
  OrderEmailInput,
  RenderedEmail,
} from "@/lib/email/templates/types";

/** es-MX totals labels (owner emails are single-locale, AC-12). */
const OWNER_LABELS = {
  subtotal: "Subtotal",
  shipping: "Envío",
  discount: "Descuento",
  total: "Total",
} as const;

/** The owner-facing itemized section (HTML). */
function ownerItemsHtml(input: OrderEmailInput): string {
  const heading =
    `<p style="margin:24px 0 8px;font-size:${EMAIL_TYPOGRAPHY.smallFontSizePx}px;` +
    `font-weight:600;color:${EMAIL_COLORS.muted};text-transform:uppercase">Artículos</p>`;
  return (
    heading +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ` +
    `style="width:100%;border-collapse:collapse">` +
    renderItemRows(input.items) +
    renderTotalsRows(input.totals, OWNER_LABELS) +
    `</table>`
  );
}

/** Render the new-order owner alert. Always es-MX. */
export function renderNewOrderOwner(
  input: OrderEmailInput,
  chrome: EmailChrome,
): RenderedEmail {
  const subject = `Nuevo pedido ${input.orderNumber} — ${input.customerName}`;

  const contentHtml =
    renderHeading("Nuevo pedido recibido") +
    renderParagraph(
      `Se registró el pedido ${input.orderNumber} de ${input.customerName}.`,
    ) +
    ownerItemsHtml(input) +
    renderButton(chrome.orderUrl, "Ver el pedido");

  const contentText =
    `Nuevo pedido recibido\n\n` +
    `Pedido: ${input.orderNumber}\n` +
    `Cliente: ${input.customerName}\n\n` +
    `Artículos:\n${renderItemsText(input.items)}\n\n` +
    `${renderTotalsText(input.totals, OWNER_LABELS)}\n\n` +
    `Ver el pedido: ${chrome.orderUrl}`;

  const { html, text } = wrapEmail({
    storeName: chrome.storeName,
    preheader: `Nuevo pedido ${input.orderNumber} de ${input.customerName}.`,
    contentHtml,
    contentText,
    footerNote: "Alerta interna de la tienda.",
  });
  return { subject, html, text };
}
