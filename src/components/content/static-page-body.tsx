import { Fragment } from "react";
import { parseStaticBody, type BodyBlock } from "@/lib/content/parse-body";

/**
 * StaticPageBody (T13) — renders a `static_pages.body` (plain text, ≤100k) as
 * ESCAPED, structured paragraphs and headed sections inside `max-w-prose`.
 * NEVER `dangerouslySetInnerHTML`: every text node is a React child, so it is
 * auto-escaped — an XSS-safe renderer for future editable content (AC-17).
 *
 * `## ` lines become `<h2 id="slugified">` so FAQ answers are deep-linkable via
 * `#slug` (native `:target`, no client JS). Newlines inside a paragraph render
 * as soft `<br />` breaks (e.g. a multi-line address in the showroom body).
 *
 * NO mount animation — reading content should not stage in; the entrance would
 * delay comprehension (deliberate restraint per ui-design.md).
 */

interface StaticPageBodyProps {
  /** Plain-text body; parsed into headings + paragraphs, escaped on render. */
  body: string;
}

export function StaticPageBody({ body }: StaticPageBodyProps) {
  const blocks = parseStaticBody(body);

  return (
    <div className="max-w-prose space-y-4" data-testid="static-page-body">
      {blocks.map((block, index) => (
        <BodyBlockView key={blockKey(block, index)} block={block} />
      ))}
    </div>
  );
}

/** Stable key: heading ids are unique; paragraphs fall back to their index. */
function blockKey(block: BodyBlock, index: number): string {
  return block.kind === "heading" ? `h-${block.id}` : `p-${index}`;
}

/** Render one parsed block (heading or paragraph) with escaped text children. */
function BodyBlockView({ block }: { block: BodyBlock }) {
  if (block.kind === "heading") {
    return (
      <h2
        id={block.id}
        // `scroll-mt-24` frames a `:target` deep-linked heading below the sticky
        // header; the `:target` accent bar is applied in globals.css (color only).
        className="static-heading mt-8 scroll-mt-24 break-words font-heading text-lg font-semibold uppercase tracking-wide text-foreground first:mt-0 sm:text-xl"
      >
        {block.text}
      </h2>
    );
  }
  return (
    <p className="break-words text-sm leading-relaxed text-foreground sm:text-base">
      <SoftBreaks text={block.text} />
    </p>
  );
}

/** Render text preserving intra-paragraph newlines as `<br />` soft breaks. */
function SoftBreaks({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, index) => (
        <Fragment key={index}>
          {index > 0 ? <br /> : null}
          {line}
        </Fragment>
      ))}
    </>
  );
}
