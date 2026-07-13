/**
 * Unit tests for `makeHrefForPage` (T5 AC-15 — filters preserved across
 * crawlable pagination + page-1 self-canonicalization).
 *
 * Pure href construction: given a base path and an optional pre-serialized
 * filter query, it must (a) keep page 1 on the bare/clean filtered URL with NO
 * `?page=1`, and (b) append `&page=N` for pages 2+ so every page link carries
 * the active filters. This is the additive T5 change to the T3 helper.
 */
import { describe, expect, it } from "vitest";
import { makeHrefForPage } from "./page-helpers";

describe("makeHrefForPage — unfiltered (T3 behavior preserved)", () => {
  const href = makeHrefForPage("/sillas");

  it("page 1 is the bare base path (no ?page=1)", () => {
    expect(href(1)).toBe("/sillas");
  });

  it("page ≤ 0 collapses to the bare base path (defensive)", () => {
    expect(href(0)).toBe("/sillas");
    expect(href(-3)).toBe("/sillas");
  });

  it("pages 2+ append ?page=N", () => {
    expect(href(2)).toBe("/sillas?page=2");
    expect(href(3)).toBe("/sillas?page=3");
  });
});

describe("makeHrefForPage — with an active filter query (AC-15)", () => {
  const query = "q=malla&marca=brand-ergovita&orden=precio-asc";
  const href = makeHrefForPage("/sillas", query);

  it("page 1 carries the filters but NOT page=1 (self-canonical filtered URL)", () => {
    expect(href(1)).toBe(`/sillas?${query}`);
  });

  it("pages 2+ carry the filters AND append &page=N", () => {
    expect(href(2)).toBe(`/sillas?${query}&page=2`);
    expect(href(5)).toBe(`/sillas?${query}&page=5`);
  });

  it("never emits ?page=1 on any page link", () => {
    const links = [href(1), href(2), href(3)];
    expect(links.some((l) => /[?&]page=1(?:&|$)/.test(l))).toBe(false);
  });
});

describe("makeHrefForPage — empty query string is treated as unfiltered", () => {
  it("an empty query behaves identically to no query", () => {
    const href = makeHrefForPage("/sillas", "");
    expect(href(1)).toBe("/sillas");
    expect(href(2)).toBe("/sillas?page=2");
  });
});

describe("makeHrefForPage — works for taxonomy base paths too", () => {
  it("preserves the base path segment (brand/category listings)", () => {
    const href = makeHrefForPage("/marcas/ergovita");
    expect(href(1)).toBe("/marcas/ergovita");
    expect(href(2)).toBe("/marcas/ergovita?page=2");
  });
});
