/**
 * Unit tests for the JSON-LD script-embed escaping (T14 AC-A12, security). The
 * escape is the load-bearing XSS defense: a JSON-LD value containing
 * `</script>` MUST NOT be able to terminate the script element.
 */
import { describe, expect, it } from "vitest";
import { escapeForScriptSafe } from "./json-ld";

describe("escapeForScriptSafe", () => {
  it("escapes every `<` so a `</script>` payload cannot break out", () => {
    const malicious = JSON.stringify({
      name: "Silla </script><script>alert(1)</script>",
    });
    const escaped = escapeForScriptSafe(malicious);
    expect(escaped).not.toContain("</script>");
    expect(escaped).not.toContain("<");
    expect(escaped).toContain("\\u003c");
  });

  it("escapes the U+2028 / U+2029 line separators", () => {
    const LS = String.fromCharCode(0x2028);
    const PS = String.fromCharCode(0x2029);
    const withSeparators = `{"a":"x${LS}y${PS}z"}`;
    const escaped = escapeForScriptSafe(withSeparators);
    expect(escaped).not.toContain(LS);
    expect(escaped).not.toContain(PS);
    expect(escaped).toContain("\\u2028");
    expect(escaped).toContain("\\u2029");
  });

  it("leaves ordinary JSON round-trippable after decoding the escapes", () => {
    const original = JSON.stringify({ "@type": "Product", name: "Silla" });
    // The escaped form is valid inside a script; unescaping `<` yields the
    // original JSON, so the structured data is preserved.
    const escaped = escapeForScriptSafe(original);
    const restored = escaped.replace(/\\u003c/g, "<");
    expect(JSON.parse(restored)).toEqual({ "@type": "Product", name: "Silla" });
  });
});
