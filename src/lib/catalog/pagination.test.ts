import { describe, expect, it } from "vitest";
import {
  PAGINATION_ELLIPSIS,
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

describe("rangeFor", () => {
  it("computes the zero-based inclusive range for a page", () => {
    expect(rangeFor(1, 12)).toEqual({ from: 0, to: 11 });
    expect(rangeFor(2, 12)).toEqual({ from: 12, to: 23 });
    expect(rangeFor(3, 12)).toEqual({ from: 24, to: 35 });
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
