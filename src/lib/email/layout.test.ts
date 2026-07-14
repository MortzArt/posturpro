import { describe, expect, it } from "vitest";
import { renderButton } from "./layout";

describe("renderButton", () => {
  it("renders an anchor with the href and escaped label", () => {
    const html = renderButton("https://tienda.mx/confirmacion/abc", "Ver el pedido");
    expect(html).toContain('href="https://tienda.mx/confirmacion/abc"');
    expect(html).toContain("Ver el pedido");
  });

  it("leaves a normal URL unchanged (escaping is a no-op for safe URLs)", () => {
    const url = "https://track.test/TRK-1?a=1&b=2";
    const html = renderButton(url, "Track");
    // The ampersand in a URL is HTML-significant; it is attribute-escaped.
    expect(html).toContain("https://track.test/TRK-1?a=1&amp;b=2");
  });

  it("attribute-escapes a provider href so a double-quote cannot break out", () => {
    // A malformed provider (MP voucher / carrier tracking) URL must not be able
    // to close the href attribute and inject markup into the email.
    const evil = `https://x/"><img src=y onerror=alert(1)>`;
    const html = renderButton(evil, "Ver");
    // The raw attribute-breakout sequence must not appear verbatim.
    expect(html).not.toContain(`"><img`);
    // The double-quote is escaped inside the attribute value.
    expect(html).toContain("&quot;&gt;&lt;img");
  });
});
