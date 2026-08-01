/**
 * PURE print-HTML builder for the packing slip (T12 AC-22/23, edge 8). No I/O, no
 * React — a single function of the order snapshot → a self-contained, print-
 * optimized HTML document (inline `<style>` with `@media print`). No PDF
 * dependency (research-confirmed). A cancelled order renders a prominent
 * "CANCELADO" band so it is never mistaken for fulfillable. All dynamic text is
 * HTML-escaped (the slip carries customer-controlled shipping fields). It is a
 * fulfilment document — ship-to, line items, quantity/SKU only — so it renders NO
 * prices. Server-only-safe (pure), imported by the route handler.
 */
import type { AdminOrderDetail } from "@/lib/admin/orders/order-read";

/** Escape the five HTML-significant characters (defense against injected markup). */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Format an ISO date as a short es-MX date (dd/mm/yyyy). */
function formatSlipDate(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return "—";
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
}

/** Build one address line, joining the present parts with the given separator. */
function joinParts(parts: (string | null | undefined)[], separator: string): string {
  return parts.filter((part) => part && part.trim() !== "").join(separator);
}

/** Render the line-items table rows. */
function renderItemRows(items: AdminOrderDetail["items"]): string {
  if (items.length === 0) {
    return '<tr><td colspan="4" class="empty">Sin artículos.</td></tr>';
  }
  return items
    .map((item) => {
      const variant = item.variantLabel ? escapeHtml(item.variantLabel) : "—";
      return `<tr>
        <td class="qty">${item.quantity}</td>
        <td class="sku">${escapeHtml(item.productSku)}</td>
        <td>${escapeHtml(item.productName)}</td>
        <td>${variant}</td>
      </tr>`;
    })
    .join("");
}

/** The cancelled band (only when the order is cancelled). */
function renderCancelledBand(isCancelled: boolean): string {
  if (!isCancelled) return "";
  return '<div class="cancelled-band" role="alert">CANCELADO</div>';
}

/**
 * Build the full packing-slip HTML document for an order. Self-contained: inline
 * styles, a print stylesheet that hides the print button + admin chrome, and an
 * auto-invokable print button (on-screen only). Total item count is the sum of
 * line quantities.
 */
export function buildPackingSlipHtml(order: AdminOrderDetail): string {
  const isCancelled = order.orderStatus === "cancelled";
  const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0);

  const addressLine1 = escapeHtml(
    joinParts([order.addressLine1, order.addressLine2], ", "),
  );
  const addressLine2 = escapeHtml(
    joinParts([`Col. ${order.city}`, `CP ${order.postalCode}`, order.state], " · "),
  );
  const phone = order.contactPhone ? escapeHtml(order.contactPhone) : "";

  return `<!doctype html>
<html lang="es-MX">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Guía de empaque · ${escapeHtml(order.orderNumber)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #111; background: #fff; line-height: 1.4;
  }
  .slip { max-width: 720px; margin: 0 auto; }
  .head { display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid #111; padding-bottom: 8px; }
  .brand { font-size: 20px; font-weight: 700; letter-spacing: 0.02em; }
  .doc-type { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #555; }
  .meta { display: flex; justify-content: space-between; margin-top: 8px; font-size: 13px; color: #333; }
  .cancelled-band {
    margin: 14px 0; padding: 10px 14px; border: 2px solid #111;
    text-align: center; font-weight: 700; font-size: 18px; letter-spacing: 0.16em;
    background: #f2f2f2;
  }
  section { margin-top: 18px; }
  h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #555; margin: 0 0 6px; }
  .ship-to p { margin: 2px 0; font-size: 14px; }
  .ship-to .name { font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 13px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #ddd; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #555; }
  td.qty, th.qty { width: 48px; text-align: right; font-variant-numeric: tabular-nums; }
  td.sku { font-family: ui-monospace, "SFMono-Regular", Menlo, monospace; font-size: 12px; }
  td.empty { text-align: center; color: #888; }
  .total-items { margin-top: 12px; font-size: 14px; font-weight: 600; }
  .actions { margin-top: 24px; }
  button {
    font: inherit; padding: 8px 16px; border: 1px solid #111; border-radius: 6px;
    background: #111; color: #fff; cursor: pointer;
  }
  @media print {
    body { padding: 0; }
    .actions { display: none; }
    .cancelled-band { background: transparent; }
    @page { margin: 16mm; }
  }
</style>
</head>
<body>
  <div class="slip">
    <div class="head">
      <span class="brand">POSTURPRO</span>
      <span class="doc-type">Guía de empaque</span>
    </div>
    <div class="meta">
      <span>Pedido <strong>${escapeHtml(order.orderNumber)}</strong></span>
      <span>Fecha ${formatSlipDate(order.createdAt)}</span>
    </div>
    ${renderCancelledBand(isCancelled)}
    <section class="ship-to">
      <h2>Enviar a</h2>
      <p class="name">${escapeHtml(order.shippingFullName)}</p>
      <p>${addressLine1}</p>
      <p>${addressLine2}</p>
      ${phone ? `<p>${phone}</p>` : ""}
    </section>
    <section>
      <h2>Artículos</h2>
      <table>
        <thead>
          <tr>
            <th class="qty">Cant</th>
            <th>SKU</th>
            <th>Producto</th>
            <th>Variante</th>
          </tr>
        </thead>
        <tbody>
          ${renderItemRows(order.items)}
        </tbody>
      </table>
      <p class="total-items">Total de artículos: ${totalItems}</p>
    </section>
    <div class="actions">
      <button type="button" onclick="window.print()">Imprimir</button>
    </div>
  </div>
</body>
</html>`;
}
