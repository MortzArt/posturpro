import type { JsonLdObject } from "@/lib/seo/json-ld";

/**
 * Server component that renders one or more JSON-LD nodes as a
 * `<script type="application/ld+json">` (T14 AC-A12). Invisible structured data
 * for crawlers — it renders NO visible UI (a `<script>` produces no layout), so
 * it is safe to drop anywhere in the server tree.
 *
 * SAFE SERIALIZATION: `JSON.stringify` alone is NOT safe inside a `<script>` —
 * a data value containing the substring `</script>` (or `<!--`) would break out
 * of the element. We escape `<` so the payload can never terminate the script or
 * inject markup, plus the U+2028 / U+2029 line separators (invalid raw inside a
 * JS string literal). This is the standard, XSS-safe JSON-LD embed.
 */

interface JsonLdProps {
  /** A single node, or an array of nodes rendered as one script each. */
  data: JsonLdObject | JsonLdObject[];
}

/**
 * Escape a JSON string so it is safe to embed inside a `<script>` element.
 * Uses `\uXXXX` regex escapes so this source file contains no raw separator
 * characters.
 */
export function escapeForScriptSafe(json: string): string {
  return json
    .replace(/</g, "\\u003c")
    .replace(new RegExp("\\u2028", "g"), "\\u2028")
    .replace(new RegExp("\\u2029", "g"), "\\u2029");
}

export function JsonLd({ data }: JsonLdProps) {
  const nodes = Array.isArray(data) ? data : [data];
  return (
    <>
      {nodes.map((node, index) => (
        <script
          // Structured-data nodes are stable for a given page render; index is a
          // safe key (order never changes within one render).
          key={index}
          type="application/ld+json"
          // Escaped JSON — no user markup can break out of the script element.
          dangerouslySetInnerHTML={{
            __html: escapeForScriptSafe(JSON.stringify(node)),
          }}
        />
      ))}
    </>
  );
}
