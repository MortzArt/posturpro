import { describe, expect, it } from "vitest";
import { MAX_PAGE } from "@/lib/config";
import {
  PAGINATION_ELLIPSIS,
  canonicalPageKey,
  displayRangeFor,
  lastPageFor,
  paginationWindow,
  parsePageParam,
  rangeFor,
} from "./pagination";

describe("lastPageFor", () => {
  it("computes ceil(total / pageSize)", () => {
    expect(lastPageFor(30, 12)).toBe(3);
    expect(lastPageFor(24, 12)).toBe(2);
    expect(lastPageFor(25, 12)).toBe(3);
  });

  it("returns at least 1 page even for 0 total", () => {
    expect(lastPageFor(0, 12)).toBe(1);
  });

  it("defends against invalid inputs", () => {
    expect(lastPageFor(Number.NaN, 12)).toBe(1);
    expect(lastPageFor(30, 0)).toBeGreaterThanOrEqual(1);
    expect(lastPageFor(-5, 12)).toBe(1);
  });
});

describe("parsePageParam (clamp / malformed — edge case 7)", () => {
  const last = 10;

  it("defaults to 1 when the param is absent", () => {
    expect(parsePageParam(undefined, last)).toBe(1);
    expect(parsePageParam("", last)).toBe(1);
  });

  it("parses a valid in-range page", () => {
    expect(parsePageParam("3", last)).toBe(3);
  });

  it("clamps out-of-range high to lastPage (?page=999)", () => {
    expect(parsePageParam("999", last)).toBe(10);
  });

  it("clamps 0 / negative to 1 (?page=0, ?page=-1)", () => {
    expect(parsePageParam("0", last)).toBe(1);
    expect(parsePageParam("-1", last)).toBe(1);
  });

  it("treats non-numeric and float as 1 (?page=abc, ?page=1.5)", () => {
    expect(parsePageParam("abc", last)).toBe(1);
    expect(parsePageParam("1.5", last)).toBe(1);
    expect(parsePageParam("1e3", last)).toBe(1);
  });

  it("uses the first entry when the param repeats (array)", () => {
    expect(parsePageParam(["2", "5"], last)).toBe(2);
  });

  it("never exceeds a lastPage of 1", () => {
    expect(parsePageParam("5", 1)).toBe(1);
  });
});

describe("canonicalPageKey (bounded cache-key cardinality — DoS guard)", () => {
  it("maps absent / empty / whitespace to 1", () => {
    expect(canonicalPageKey(undefined)).toBe(1);
    expect(canonicalPageKey("")).toBe(1);
    expect(canonicalPageKey("   ")).toBe(1);
  });

  it("passes through a normal in-bounds page", () => {
    expect(canonicalPageKey("2")).toBe(2);
    expect(canonicalPageKey("42")).toBe(42);
  });

  it("collapses malformed / float / scientific / negative / zero to 1", () => {
    for (const junk of ["abc", "1.5", "1e9", "-1", "0", "0x10", " 3 x", "٣"]) {
      expect(canonicalPageKey(junk)).toBe(1);
    }
  });

  it("normalizes leading zeros so 00001 and 1 share a key", () => {
    expect(canonicalPageKey("00001")).toBe(1);
    expect(canonicalPageKey("007")).toBe(7);
  });

  it("caps any huge value at MAX_PAGE so the key space stays bounded", () => {
    expect(canonicalPageKey(String(MAX_PAGE))).toBe(MAX_PAGE);
    expect(canonicalPageKey(String(MAX_PAGE + 1))).toBe(MAX_PAGE);
    expect(canonicalPageKey("999999999")).toBe(MAX_PAGE);
    // Beyond Number.MAX_SAFE_INTEGER — must not overflow into a fresh key.
    expect(canonicalPageKey("999999999999999999999999")).toBe(MAX_PAGE);
  });

  it("uses the first entry for a repeated (array) param", () => {
    expect(canonicalPageKey(["2", "5"])).toBe(2);
    expect(canonicalPageKey(["junk", "2"])).toBe(1);
  });

  it("yields at most MAX_PAGE+1 distinct keys across arbitrary junk input", () => {
    const keys = new Set<number>();
    const junkInputs = [
      "abc",
      "1e9",
      "-3",
      "0",
      "1.5",
      "999999999",
      "  17  ",
      "%00",
      "null",
      String(MAX_PAGE + 500),
    ];
    for (const input of junkInputs) keys.add(canonicalPageKey(input));
    // Every junk value collapsed onto either 1, MAX_PAGE, or a real small page.
    for (const key of keys) {
      expect(key).toBeGreaterThanOrEqual(1);
      expect(key).toBeLessThanOrEqual(MAX_PAGE);
    }
    expect(keys.size).toBeLessThanOrEqual(3);
  });
});

describe("rangeFor", () => {
  it("computes the zero-based inclusive range for a page", () => {
    expect(rangeFor(1, 12)).toEqual({ from: 0, to: 11 });
    expect(rangeFor(2, 12)).toEqual({ from: 12, to: 23 });
    expect(rangeFor(3, 12)).toEqual({ from: 24, to: 35 });
  });
});

describe("displayRangeFor (M-5 — 'Mostrando X–Y de Z')", () => {
  it("computes the range from page SIZE, not the current row count", () => {
    // 28 total, page size 25 → page 1 = 1–25, page 2 = 26–28 (NOT 4–6).
    expect(displayRangeFor(1, 25, 28)).toEqual({ start: 1, end: 25 });
    expect(displayRangeFor(2, 25, 28)).toEqual({ start: 26, end: 28 });
  });
  it("clamps the end to the total on the last page", () => {
    expect(displayRangeFor(3, 12, 30)).toEqual({ start: 25, end: 30 });
  });
  it("returns a full page range when the total is an exact multiple", () => {
    expect(displayRangeFor(2, 25, 50)).toEqual({ start: 26, end: 50 });
  });
  it("returns {0,0} for an empty result set", () => {
    expect(displayRangeFor(1, 25, 0)).toEqual({ start: 0, end: 0 });
  });
  it("is resilient to a junk page size", () => {
    expect(displayRangeFor(1, 0, 5)).toEqual({ start: 1, end: 1 });
  });
});

describe("paginationWindow", () => {
  it("shows all pages when lastPage <= 7 (no ellipsis)", () => {
    expect(paginationWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(paginationWindow(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("windows around the current page with ellipses", () => {
    expect(paginationWindow(5, 10)).toEqual([
      1,
      PAGINATION_ELLIPSIS,
      4,
      5,
      6,
      PAGINATION_ELLIPSIS,
      10,
    ]);
  });

  it("shows a leading window with a single trailing ellipsis on page 1", () => {
    expect(paginationWindow(1, 10)).toEqual([1, 2, PAGINATION_ELLIPSIS, 10]);
  });

  it("shows a trailing window with a single leading ellipsis on the last page", () => {
    expect(paginationWindow(10, 10)).toEqual([1, PAGINATION_ELLIPSIS, 9, 10]);
  });

  it("never emits a number outside [1, lastPage] or a duplicate", () => {
    const items = paginationWindow(2, 10).filter(
      (item): item is number => item !== PAGINATION_ELLIPSIS,
    );
    for (const page of items) {
      expect(page).toBeGreaterThanOrEqual(1);
      expect(page).toBeLessThanOrEqual(10);
    }
    expect(new Set(items).size).toBe(items.length);
  });

  it("clamps an out-of-range current page defensively", () => {
    expect(paginationWindow(99, 5)).toEqual([1, 2, 3, 4, 5]);
  });
});
