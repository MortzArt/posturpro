/**
 * PURE plain-text body parser for static pages (T13). No I/O, no React —
 * exhaustively unit-testable. Turns the `static_pages.body` plain-text protocol
 * into a flat list of blocks the `StaticPageBody` component renders as escaped
 * React children (never `dangerouslySetInnerHTML`, AC-17).
 *
 * PROTOCOL:
 *  - A line beginning with `## ` (heading marker + space) is a section heading.
 *    Its text becomes an `<h2>` with a slugified `id` so FAQ answers are
 *    deep-linkable via `#slug` (`:target`), with no client JS.
 *  - Consecutive non-blank, non-heading lines form a paragraph; a blank line
 *    ends the current paragraph. Newlines inside a paragraph are preserved as
 *    soft breaks by the renderer.
 *
 * A single-line body → one paragraph. A 100k body → many paragraphs (edge 7);
 * this parser does no length work — the caller already capped/validated content.
 */
import { slugify } from "@/lib/admin/products/slug";

/** The heading marker that opens an `<h2>` section. */
const HEADING_MARKER = "## ";

/** A parsed body block: a headed section or a paragraph of text. */
export type BodyBlock =
  | { kind: "heading"; id: string; text: string }
  | { kind: "paragraph"; text: string };

/**
 * Parse a plain-text body into ordered blocks. Deterministic and pure. Heading
 * ids are de-duplicated (`-2`, `-3`, …) so two identically-worded questions
 * still get unique, stable anchors. An empty/whitespace-only body → `[]`.
 */
export function parseStaticBody(body: string): BodyBlock[] {
  const blocks: BodyBlock[] = [];
  const usedIds = new Set<string>();
  let paragraphLines: string[] = [];

  const flushParagraph = (): void => {
    if (paragraphLines.length > 0) {
      blocks.push({ kind: "paragraph", text: paragraphLines.join("\n") });
      paragraphLines = [];
    }
  };

  for (const rawLine of body.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (line.startsWith(HEADING_MARKER)) {
      flushParagraph();
      const text = line.slice(HEADING_MARKER.length).trim();
      blocks.push({ kind: "heading", id: uniqueHeadingId(text, usedIds), text });
    } else if (line.trim().length === 0) {
      flushParagraph();
    } else {
      paragraphLines.push(line);
    }
  }
  flushParagraph();
  return blocks;
}

/** Build a unique, stable, URL-safe anchor id for a heading text. */
function uniqueHeadingId(text: string, used: Set<string>): string {
  const base = slugify(text) || "seccion";
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}
