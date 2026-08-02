/**
 * Unit tests for the pure quote_relay template (T16 AC-5). Single-locale es-MX
 * (a relay TO the owner). Asserts every submitted field is rendered, the needs
 * body is quoted verbatim + escaped, the subject is a single clean line built
 * from the company, and hostile input is HTML-escaped (injection defense).
 */
import { describe, expect, it } from "vitest";
import { renderQuoteRelay, type QuoteRelayInput } from "./quote-relay";
import type { EmailChrome } from "./types";

const CHROME: EmailChrome = { storeName: "PosturPro", orderUrl: "" };

const BASE: QuoteRelayInput = {
  company: "Acme SA",
  fromName: "Ana López",
  fromEmail: "ana@acme.com",
  phone: "5512345678",
  teamSize: "11-50",
  needs: "Necesitamos 20 sillas ergonómicas para diseñadores.",
};

/** Shared invariants: non-empty parts, table shell, no <style>, clean text. */
function assertWellFormed(rendered: { subject: string; html: string; text: string }): void {
  expect(rendered.subject.length).toBeGreaterThan(0);
  expect(rendered.html.length).toBeGreaterThan(0);
  expect(rendered.text.length).toBeGreaterThan(0);
  expect(rendered.html).toContain("<table");
  expect(rendered.html).not.toContain("<style");
  expect(rendered.html).toContain("max-width:600px");
  // Subject is a single clean line.
  expect(rendered.subject).not.toContain("\n");
}

describe("quote_relay (single-locale es-MX, AC-5)", () => {
  it("builds a subject from the company name", () => {
    const rendered = renderQuoteRelay(BASE, CHROME);
    assertWellFormed(rendered);
    expect(rendered.subject).toBe("Solicitud de cotización de Acme SA");
  });

  it("renders EVERY submitted field in the HTML body", () => {
    const rendered = renderQuoteRelay(BASE, CHROME);
    expect(rendered.html).toContain("Acme SA");
    expect(rendered.html).toContain("Ana López");
    expect(rendered.html).toContain("ana@acme.com");
    expect(rendered.html).toContain("5512345678");
    // Team size is rendered as its human es-MX label, not the raw enum key.
    expect(rendered.html).toContain("11–50 personas");
    expect(rendered.html).toContain("Necesitamos 20 sillas ergonómicas");
  });

  it("renders every field in the plain-text part too", () => {
    const rendered = renderQuoteRelay(BASE, CHROME);
    expect(rendered.text).toContain("Empresa: Acme SA");
    expect(rendered.text).toContain("Contacto: Ana López (ana@acme.com)");
    expect(rendered.text).toContain("Teléfono: 5512345678");
    expect(rendered.text).toContain("Tamaño del equipo: 11–50 personas");
    expect(rendered.text).toContain("Necesitamos 20 sillas ergonómicas");
    // No HTML element tags leak into the text part.
    expect(rendered.text).not.toMatch(/<\/?(p|table|td|tr|div|span|a|h1|img|br)\b/i);
  });

  it("shows a fallback when the optional phone is blank", () => {
    const rendered = renderQuoteRelay({ ...BASE, phone: "" }, CHROME);
    expect(rendered.html).toContain("No proporcionado");
    expect(rendered.text).toContain("Teléfono: No proporcionado");
  });

  it("falls back to the raw value for an unknown team-size (defensive)", () => {
    const rendered = renderQuoteRelay({ ...BASE, teamSize: "weird" }, CHROME);
    expect(rendered.html).toContain("weird");
  });

  it("HTML-escapes the needs body (verbatim, injection-safe)", () => {
    const rendered = renderQuoteRelay(
      { ...BASE, needs: "<b>Hola</b>\nsegunda línea" },
      CHROME,
    );
    // Escaped in HTML (no raw injected element)...
    expect(rendered.html).not.toContain("<b>Hola</b>");
    expect(rendered.html).toContain("&lt;b&gt;Hola&lt;/b&gt;");
    // ...newline preserved as <br/> in HTML, preserved literally in text.
    expect(rendered.html).toContain("<br/>");
    expect(rendered.text).toContain("segunda línea");
  });

  it("escapes hostile company/name so they cannot inject markup", () => {
    const rendered = renderQuoteRelay(
      { ...BASE, company: "<script>x</script>", fromName: "<i>Ana</i>" },
      CHROME,
    );
    expect(rendered.html).not.toContain("<script>x</script>");
    expect(rendered.html).not.toContain("<i>Ana</i>");
    expect(rendered.html).toContain("&lt;script&gt;");
  });
});
