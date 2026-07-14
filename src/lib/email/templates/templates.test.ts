import { describe, expect, it } from "vitest";
import { testTranslator } from "./test-translator";
import { renderOrderConfirmation } from "./order-confirmation";
import { renderPaymentReceived } from "./payment-received";
import { renderVoucherInstructions } from "./voucher-instructions";
import { renderShipped } from "./shipped";
import { renderCancelled } from "./cancelled";
import { renderRefundIssued } from "./refund-issued";
import { renderNewOrderOwner } from "./new-order-owner";
import { renderContactRelay } from "./contact-relay";
import type {
  EmailChrome,
  OrderEmailInput,
  VoucherData,
} from "./types";

const CHROME: EmailChrome = { storeName: "PosturPro", orderUrl: "https://shop.test/checkout/confirmacion/tok" };

const BASE: OrderEmailInput = {
  customerName: "María <López>",
  orderNumber: "PP-000123",
  items: [
    { productName: "Silla Pro", variantLabel: "Negro", quantity: 1, unitPriceCents: 49999, lineTotalCents: 49999 },
  ],
  totals: { subtotalCents: 49999, shippingCents: 0, discountCents: 0, totalCents: 49999 },
};

const LOCALES = ["es-MX", "en"] as const;

/** Shared invariants every customer email must satisfy in every locale. */
function assertWellFormed(rendered: { subject: string; html: string; text: string }): void {
  expect(rendered.subject.length).toBeGreaterThan(0);
  expect(rendered.html.length).toBeGreaterThan(0);
  expect(rendered.text.length).toBeGreaterThan(0);
  // Table layout + inline styles only — no <style> block, no external CSS.
  expect(rendered.html).toContain("<table");
  expect(rendered.html).not.toContain("<style");
  expect(rendered.html).not.toContain("stylesheet");
  // 600px max-width shell present.
  expect(rendered.html).toContain("max-width:600px");
  // Customer name is escaped in HTML (never raw angle brackets from input).
  expect(rendered.html).not.toContain("María <López>");
  expect(rendered.html).toContain("María &lt;López&gt;");
  // Plain-text part carries no HTML element tags (a literal "<" from a name is
  // fine — the text part is not HTML — but no `<p>/<table>/<div>` etc.).
  expect(rendered.text).not.toMatch(/<\/?(p|table|td|tr|div|span|a|h1|img|br)\b/i);
}

describe("order_confirmation (both locales)", () => {
  it.each(LOCALES)("renders localized + well-formed in %s", (locale) => {
    const rendered = renderOrderConfirmation(BASE, testTranslator(locale), CHROME);
    assertWellFormed(rendered);
    expect(rendered.subject).toContain("PP-000123");
    expect(rendered.html).toContain(CHROME.orderUrl);
  });

  it("differs between locales (real localization)", () => {
    const es = renderOrderConfirmation(BASE, testTranslator("es-MX"), CHROME);
    const en = renderOrderConfirmation(BASE, testTranslator("en"), CHROME);
    expect(es.subject).not.toBe(en.subject);
    expect(es.html).toContain("Gracias por tu pedido");
    expect(en.html).toContain("Thanks for your order");
  });
});

describe("payment_received (both locales)", () => {
  it.each(LOCALES)("names the paid amount in %s", (locale) => {
    const rendered = renderPaymentReceived({ ...BASE, paidAmountCents: 49999 }, testTranslator(locale), CHROME);
    assertWellFormed(rendered);
    expect(rendered.html).toContain("499.99");
    expect(rendered.text).toContain("499.99");
  });
});

describe("voucher_instructions (both locales, OXXO + SPEI)", () => {
  const oxxo: VoucherData = { method: "oxxo", reference: "1234 5678 9012", voucherUrl: null, verificationCode: null, expiresLabel: "2026-07-20", amountCents: 49999 };
  const spei: VoucherData = { method: "spei", reference: "012180001234567895", voucherUrl: "https://mp.test/v.pdf", verificationCode: null, expiresLabel: null, amountCents: 49999 };

  it.each(LOCALES)("renders OXXO reference + expiry in %s", (locale) => {
    const rendered = renderVoucherInstructions({ ...BASE, voucher: oxxo }, testTranslator(locale), CHROME);
    assertWellFormed(rendered);
    expect(rendered.html).toContain("1234 5678 9012");
    expect(rendered.html).toContain("2026-07-20");
    // No voucher URL → button falls back to the order link.
    expect(rendered.html).toContain(CHROME.orderUrl);
  });

  it.each(LOCALES)("renders SPEI CLABE + voucher button in %s", (locale) => {
    const rendered = renderVoucherInstructions({ ...BASE, voucher: spei }, testTranslator(locale), CHROME);
    assertWellFormed(rendered);
    expect(rendered.html).toContain("012180001234567895");
    expect(rendered.text).toContain("012180001234567895");
    // Voucher URL present → primary button links to it.
    expect(rendered.html).toContain("https://mp.test/v.pdf");
  });
});

describe("shipped (both locales)", () => {
  it.each(LOCALES)("shows tracking + carrier when present in %s", (locale) => {
    const rendered = renderShipped(
      { ...BASE, trackingNumber: "TRK-1", carrier: "DHL", trackingUrl: "https://track.test/TRK-1" },
      testTranslator(locale),
      CHROME,
    );
    assertWellFormed(rendered);
    expect(rendered.html).toContain("TRK-1");
    expect(rendered.html).toContain("DHL");
    expect(rendered.html).toContain("https://track.test/TRK-1");
  });

  it("falls back to the order link when no tracking URL", () => {
    const rendered = renderShipped(
      { ...BASE, trackingNumber: null, carrier: null, trackingUrl: null },
      testTranslator("en"),
      CHROME,
    );
    expect(rendered.html).toContain(CHROME.orderUrl);
  });
});

describe("cancelled (both locales)", () => {
  it.each(LOCALES)("shows the reason only when present in %s", (locale) => {
    const withReason = renderCancelled({ ...BASE, reason: "Sin stock" }, testTranslator(locale), CHROME);
    assertWellFormed(withReason);
    expect(withReason.html).toContain("Sin stock");
    const noReason = renderCancelled({ ...BASE, reason: null }, testTranslator(locale), CHROME);
    expect(noReason.html).not.toContain("Sin stock");
  });
});

describe("refund_issued (both locales)", () => {
  it.each(LOCALES)("names the refunded amount in %s", (locale) => {
    const rendered = renderRefundIssued({ ...BASE, refundedAmountCents: 20000 }, testTranslator(locale), CHROME);
    assertWellFormed(rendered);
    expect(rendered.html).toContain("200.00");
  });
});

describe("new_order_owner (single-locale es-MX, AC-12)", () => {
  it("renders es-MX chrome regardless of order locale", () => {
    const rendered = renderNewOrderOwner(BASE, CHROME);
    expect(rendered.subject).toContain("Nuevo pedido");
    expect(rendered.subject).toContain("PP-000123");
    expect(rendered.html).toContain("<table");
    expect(rendered.html).not.toContain("<style");
    // Escaped customer name in HTML.
    expect(rendered.html).not.toContain("María <López>");
    expect(rendered.html).toContain("María &lt;López&gt;");
    expect(rendered.text).not.toMatch(/<\/?(p|table|td|tr|div|span|a|h1|img|br)\b/i);
  });
});

/**
 * HTML-metacharacter escaping across EVERY live template's user/provider-supplied
 * fields (QA S5 focus #5). `assertWellFormed` already covers `customerName` in all
 * customer templates + the owner alert; these fill the remaining live inputs that
 * reach HTML: variant label (item), cancel reason (admin), voucher reference (MP).
 * A raw metachar must never survive into the markup.
 */
describe("user/provider input escaping across live templates (injection defense)", () => {
  const XSS = `<script>alert(1)</script>`;
  const ESCAPED = `&lt;script&gt;alert(1)&lt;/script&gt;`;

  it("escapes a hostile VARIANT LABEL in order_confirmation (both parts)", () => {
    const input: OrderEmailInput = {
      ...BASE,
      items: [{ productName: "Silla", variantLabel: XSS, quantity: 1, unitPriceCents: 100, lineTotalCents: 100 }],
    };
    const rendered = renderOrderConfirmation(input, testTranslator("es-MX"), CHROME);
    expect(rendered.html).not.toContain(XSS);
    expect(rendered.html).toContain(ESCAPED);
    // Plain-text part is not HTML, so the raw string may appear there literally,
    // but must NOT contain a rendered HTML element tag.
    expect(rendered.text).not.toMatch(/<\/?(p|table|td|tr|div|span|a|h1|img|br)\b/i);
  });

  it("escapes a hostile CANCEL REASON in the cancelled template", () => {
    const rendered = renderCancelled({ ...BASE, reason: XSS }, testTranslator("en"), CHROME);
    expect(rendered.html).not.toContain(XSS);
    expect(rendered.html).toContain(ESCAPED);
  });

  it("escapes a hostile VOUCHER REFERENCE in voucher_instructions", () => {
    const voucher: VoucherData = {
      method: "spei",
      reference: XSS,
      voucherUrl: null,
      verificationCode: XSS,
      expiresLabel: null,
      amountCents: 100,
    };
    const rendered = renderVoucherInstructions({ ...BASE, voucher }, testTranslator("es-MX"), CHROME);
    expect(rendered.html).not.toContain(XSS);
    expect(rendered.html).toContain(ESCAPED);
  });
});

describe("contact_relay (single-locale es-MX, AC-12/AC-17)", () => {
  it("quotes the customer message verbatim + escaped in the body", () => {
    const rendered = renderContactRelay(
      { fromName: "Juan", fromEmail: "juan@test.com", subject: "Duda", message: "<b>Hola</b>\nsegunda línea" },
      CHROME,
    );
    expect(rendered.subject).toContain("Juan");
    expect(rendered.subject).toContain("Duda");
    expect(rendered.html).toContain("juan@test.com");
    // Message is escaped (no raw injected element) but preserved in plain text.
    expect(rendered.html).not.toContain("<b>Hola</b>");
    expect(rendered.html).toContain("&lt;b&gt;Hola&lt;/b&gt;");
    expect(rendered.text).toContain("<b>Hola</b>");
  });
});
