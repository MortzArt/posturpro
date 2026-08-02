/**
 * Unit tests for the pure static-page body parser (T13). Covers the plain-text
 * protocol: `## ` headings with slugified/de-duped ids, paragraph grouping,
 * blank-line separation, soft-break preservation, and hostile/edge inputs.
 */
import { describe, expect, it } from "vitest";
import { parseStaticBody } from "./parse-body";

describe("parseStaticBody", () => {
  it("returns an empty list for an empty or whitespace-only body", () => {
    expect(parseStaticBody("")).toEqual([]);
    expect(parseStaticBody("   \n\n  \n")).toEqual([]);
  });

  it("treats a single line as one paragraph", () => {
    expect(parseStaticBody("Just a sentence.")).toEqual([
      { kind: "paragraph", text: "Just a sentence." },
    ]);
  });

  it("parses `## ` lines as headings with slugified deep-link ids", () => {
    const blocks = parseStaticBody("## ¿Cuánto tarda el envío?\nRespuesta.");
    expect(blocks[0]).toEqual({
      kind: "heading",
      id: "cuanto-tarda-el-envio",
      text: "¿Cuánto tarda el envío?",
    });
    expect(blocks[1]).toEqual({ kind: "paragraph", text: "Respuesta." });
  });

  it("separates paragraphs on blank lines", () => {
    const blocks = parseStaticBody("Uno.\n\nDos.");
    expect(blocks).toEqual([
      { kind: "paragraph", text: "Uno." },
      { kind: "paragraph", text: "Dos." },
    ]);
  });

  it("groups consecutive non-blank lines into one paragraph (soft breaks)", () => {
    const blocks = parseStaticBody("Línea 1\nLínea 2");
    expect(blocks).toEqual([{ kind: "paragraph", text: "Línea 1\nLínea 2" }]);
  });

  it("de-duplicates ids for identically-worded headings", () => {
    const blocks = parseStaticBody("## Contacto\ntext\n## Contacto\nmore");
    const ids = blocks.filter((b) => b.kind === "heading").map((b) => b.id);
    expect(ids).toEqual(["contacto", "contacto-2"]);
  });

  it("falls back to a base id when a heading slugifies to empty", () => {
    const blocks = parseStaticBody("## !!!\ntext");
    expect(blocks[0]).toMatchObject({ kind: "heading", id: "seccion" });
  });

  it("does not treat a `#` without the marker space as a heading", () => {
    const blocks = parseStaticBody("#nothashheading");
    expect(blocks).toEqual([{ kind: "paragraph", text: "#nothashheading" }]);
  });

  it("preserves hostile text verbatim (escaping is the renderer's job)", () => {
    const hostile = "<script>alert(1)</script> javascript:void(0)";
    const blocks = parseStaticBody(hostile);
    expect(blocks).toEqual([{ kind: "paragraph", text: hostile }]);
  });

  it("strips a trailing carriage return from CRLF bodies", () => {
    const blocks = parseStaticBody("## Title\r\nBody\r");
    expect(blocks[0]).toMatchObject({ kind: "heading", text: "Title" });
    expect(blocks[1]).toEqual({ kind: "paragraph", text: "Body" });
  });
});
