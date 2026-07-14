import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  money,
  renderItemRows,
  renderItemsText,
  renderTotalsRows,
  renderTotalsText,
  type EmailLineItem,
  type EmailTotals,
} from "./render";

const LABELS = { subtotal: "Subtotal", shipping: "Shipping", discount: "Discount", total: "Total" };

const ITEMS: EmailLineItem[] = [
  { productName: "Silla Pro", variantLabel: "Negro", quantity: 2, unitPriceCents: 49999, lineTotalCents: 99998 },
  { productName: "Cojín", variantLabel: null, quantity: 1, unitPriceCents: 15000, lineTotalCents: 15000 },
];

const TOTALS: EmailTotals = { subtotalCents: 114998, shippingCents: 0, discountCents: 5000, totalCents: 109998 };

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;",
    );
  });

  it("escapes ampersand first (no double-escape)", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });
});

describe("money", () => {
  it("formats integer cents through the MXN boundary", () => {
    expect(money(49999)).toContain("499.99");
  });
});

describe("renderItemRows", () => {
  it("renders one row per item with escaped labels + line totals", () => {
    const html = renderItemRows(ITEMS);
    expect(html).toContain("Silla Pro — Negro");
    expect(html).toContain("× 2");
    expect(html).toContain(money(99998));
    expect(html).toContain("Cojín");
    // No variant suffix when variantLabel is null.
    expect(html).not.toContain("Cojín —");
  });

  it("escapes a malicious product name (no injection)", () => {
    const rows = renderItemRows([
      { productName: "<script>x</script>", variantLabel: null, quantity: 1, unitPriceCents: 100, lineTotalCents: 100 },
    ]);
    expect(rows).not.toContain("<script>");
    expect(rows).toContain("&lt;script&gt;");
  });
});

describe("renderTotalsRows", () => {
  it("includes the discount row only when discount > 0", () => {
    const withDiscount = renderTotalsRows(TOTALS, LABELS);
    expect(withDiscount).toContain("Discount");
    const noDiscount = renderTotalsRows({ ...TOTALS, discountCents: 0 }, LABELS);
    expect(noDiscount).not.toContain("Discount");
  });

  it("always renders the grand total", () => {
    expect(renderTotalsRows(TOTALS, LABELS)).toContain(money(109998));
  });
});

describe("plain-text derivations", () => {
  it("renders one text line per item", () => {
    const text = renderItemsText(ITEMS);
    expect(text.split("\n")).toHaveLength(2);
    expect(text).toContain("Silla Pro — Negro × 2");
  });

  it("omits the discount line when zero", () => {
    expect(renderTotalsText({ ...TOTALS, discountCents: 0 }, LABELS)).not.toContain("Discount");
    expect(renderTotalsText(TOTALS, LABELS)).toContain("Discount");
  });
});
