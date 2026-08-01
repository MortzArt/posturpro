/**
 * `packing-slip` unit tests (T12 AC-22/23, edge 8). The builder is PURE (no I/O),
 * so these are fast jsdom-free assertions on the emitted HTML string. The security
 * headline is HTML-escaping of customer-controlled fields (name, address, phone,
 * SKU, variant) — a packing slip carries shipping data an attacker can influence
 * at checkout, and it is rendered as raw HTML in a new tab, so an unescaped
 * `<script>`/`<img onerror>` would execute in the admin's browser (stored XSS).
 */
import { describe, expect, it } from "vitest";
import { buildPackingSlipHtml } from "./packing-slip";
import type { AdminOrderDetail } from "./order-read";

/** A minimal-but-complete order-detail fixture; overrides tailor each case. */
function orderFixture(overrides: Partial<AdminOrderDetail> = {}): AdminOrderDetail {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    orderNumber: "PP-000123",
    contactEmail: "cliente@example.com",
    contactPhone: "5544332211",
    shippingFullName: "María Pérez",
    addressLine1: "Calle Falsa 123",
    addressLine2: "Depto 4",
    city: "CDMX",
    state: "Ciudad de México",
    postalCode: "06700",
    country: "MX",
    deliveryNotes: null,
    rfc: null,
    subtotalCents: 100000,
    shippingCents: 0,
    discountCents: 0,
    totalCents: 100000,
    orderStatus: "paid",
    paymentStatus: "paid",
    paymentMethod: "card",
    mpPaymentId: "MP-1",
    trackingNumber: null,
    trackingCarrier: null,
    trackingUrl: null,
    createdAt: "2026-08-01T12:00:00.000Z",
    refundedCents: 0,
    items: [
      {
        id: "item-1",
        productName: "Corrector Postural",
        productSku: "POS-001",
        variantLabel: "Negro / M",
        quantity: 2,
        unitPriceCents: 50000,
        lineTotalCents: 100000,
      },
    ],
    history: null,
    notes: null,
    ...overrides,
  };
}

describe("buildPackingSlipHtml — structure", () => {
  it("renders a self-contained HTML document with the order number + ship-to", () => {
    const html = buildPackingSlipHtml(orderFixture());
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("PP-000123");
    expect(html).toContain("María Pérez");
    expect(html).toContain("Calle Falsa 123");
    // Print stylesheet is inlined (no external dependency).
    expect(html).toContain("@media print");
    // Auto-print affordance present.
    expect(html).toContain("window.print()");
  });

  it("renders each line item with quantity, SKU, name, and variant", () => {
    const html = buildPackingSlipHtml(orderFixture());
    expect(html).toContain("POS-001");
    expect(html).toContain("Corrector Postural");
    expect(html).toContain("Negro / M");
  });

  it("shows the correct total item count (sum of line quantities)", () => {
    const html = buildPackingSlipHtml(
      orderFixture({
        items: [
          { id: "a", productName: "A", productSku: "SKU-A", variantLabel: null, quantity: 2, unitPriceCents: 1, lineTotalCents: 2 },
          { id: "b", productName: "B", productSku: "SKU-B", variantLabel: null, quantity: 3, unitPriceCents: 1, lineTotalCents: 3 },
        ],
      }),
    );
    expect(html).toContain("Total de artículos: 5");
  });

  it("renders an em-dash for a null variant label (never 'null')", () => {
    const html = buildPackingSlipHtml(
      orderFixture({
        items: [{ id: "a", productName: "A", productSku: "SKU-A", variantLabel: null, quantity: 1, unitPriceCents: 1, lineTotalCents: 1 }],
      }),
    );
    expect(html).not.toContain(">null<");
  });

  it("renders an empty-items fallback row for an order with no items", () => {
    const html = buildPackingSlipHtml(orderFixture({ items: [] }));
    expect(html).toContain("Sin artículos.");
    expect(html).toContain("Total de artículos: 0");
  });

  it("carries NO prices — it is a fulfilment document, not a receipt (AC-23)", () => {
    // The fixture total is $1,000.00 / 100000¢; neither the peso amount nor the
    // cents value should leak into the slip.
    const html = buildPackingSlipHtml(orderFixture());
    expect(html).not.toContain("1,000");
    expect(html).not.toContain("100000");
    expect(html).not.toContain("$");
  });
});

describe("buildPackingSlipHtml — cancelled band (edge 8)", () => {
  it("renders a prominent CANCELADO band for a cancelled order", () => {
    const html = buildPackingSlipHtml(orderFixture({ orderStatus: "cancelled" }));
    expect(html).toContain("CANCELADO");
    expect(html).toContain('class="cancelled-band"');
    expect(html).toContain('role="alert"');
  });

  it("renders NO cancelled band for a non-cancelled order", () => {
    for (const status of ["pending_payment", "paid", "preparing", "shipped", "delivered"] as const) {
      const html = buildPackingSlipHtml(orderFixture({ orderStatus: status }));
      expect(html).not.toContain("CANCELADO");
    }
  });
});

describe("buildPackingSlipHtml — HTML escaping of hostile order data (security)", () => {
  it("escapes a <script> injected via the shipping name (no live markup)", () => {
    const html = buildPackingSlipHtml(
      orderFixture({ shippingFullName: `<script>alert('xss')</script>` }),
    );
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes an <img onerror> injected via an address line", () => {
    const html = buildPackingSlipHtml(
      orderFixture({ addressLine1: `<img src=x onerror=alert(1)>` }),
    );
    expect(html).not.toContain("<img src=x onerror");
    expect(html).toContain("&lt;img");
  });

  it("escapes hostile markup in the product SKU and variant label", () => {
    const html = buildPackingSlipHtml(
      orderFixture({
        items: [
          {
            id: "a",
            productName: `<b>bold</b>`,
            productSku: `"><script>1</script>`,
            variantLabel: `</td><script>2</script>`,
            quantity: 1,
            unitPriceCents: 1,
            lineTotalCents: 1,
          },
        ],
      }),
    );
    expect(html).not.toContain("<script>1</script>");
    expect(html).not.toContain("<script>2</script>");
    expect(html).not.toContain("<b>bold</b>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes the quote + apostrophe entities (attribute-breakout defense)", () => {
    const html = buildPackingSlipHtml(
      orderFixture({ shippingFullName: `A"'B` }),
    );
    expect(html).toContain("&quot;");
    expect(html).toContain("&#39;");
  });

  it("escapes the order number itself (defense in depth)", () => {
    const html = buildPackingSlipHtml(orderFixture({ orderNumber: `PP-<script>` }));
    expect(html).not.toContain("PP-<script>");
    expect(html).toContain("PP-&lt;script&gt;");
  });
});

describe("buildPackingSlipHtml — resilience", () => {
  it("renders an em-dash date for an unparseable createdAt (never crashes)", () => {
    const html = buildPackingSlipHtml(orderFixture({ createdAt: "not-a-date" }));
    expect(html).toContain("Fecha —");
  });

  it("omits the phone line when contactPhone is null", () => {
    const html = buildPackingSlipHtml(orderFixture({ contactPhone: null }));
    // The known fixture phone must not appear; document still builds.
    expect(html).not.toContain("5544332211");
    expect(html).toContain("<!doctype html>");
  });
});
