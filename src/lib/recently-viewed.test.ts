/**
 * Unit tests for the guarded recently-viewed localStorage helpers (T4 AC-12,
 * edge 7, m-5).
 *
 * Covers the happy path (record → read newest-first, de-dupe, cap), the schema
 * guard against corrupt / partial / malicious payloads (the `$NaN` path m-5
 * fixed), and graceful degradation when storage throws (private mode / quota).
 * jsdom provides a real `window.localStorage`; failure modes are simulated by
 * stubbing it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readRecentlyViewed,
  recordRecentlyViewed,
  type RecentlyViewedEntry,
} from "./recently-viewed";
import { RECENTLY_VIEWED_MAX, RECENTLY_VIEWED_STORAGE_KEY } from "@/lib/config";

/** Factory: a fully-valid stored entry, overridable per test. */
function makeEntry(
  overrides: Partial<RecentlyViewedEntry> = {},
): RecentlyViewedEntry {
  return {
    id: "p-1",
    slug: "silla-ejemplo",
    name: "Silla Ejemplo",
    brandName: "ErgoVita",
    priceCents: 499_900,
    compareAtPriceCents: null,
    coverImageUrl: "https://example.test/cover.jpg",
    coverAlt: "Silla Ejemplo",
    colorCount: 2,
    stockState: "in",
    lowStockN: null,
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("readRecentlyViewed — happy path", () => {
  it("returns [] when nothing is stored", () => {
    expect(readRecentlyViewed()).toEqual([]);
  });

  it("reads back what was recorded", () => {
    recordRecentlyViewed(makeEntry({ slug: "a", id: "a" }));
    const read = readRecentlyViewed();
    expect(read).toHaveLength(1);
    expect(read[0]?.slug).toBe("a");
  });
});

describe("recordRecentlyViewed — ordering, de-dupe, cap (AC-12)", () => {
  it("prepends newest-first", () => {
    recordRecentlyViewed(makeEntry({ slug: "a", id: "a" }));
    recordRecentlyViewed(makeEntry({ slug: "b", id: "b" }));
    expect(readRecentlyViewed().map((e) => e.slug)).toEqual(["b", "a"]);
  });

  it("de-dupes by slug, moving a re-viewed product to the front", () => {
    recordRecentlyViewed(makeEntry({ slug: "a", id: "a" }));
    recordRecentlyViewed(makeEntry({ slug: "b", id: "b" }));
    recordRecentlyViewed(makeEntry({ slug: "a", id: "a" }));
    const slugs = readRecentlyViewed().map((e) => e.slug);
    expect(slugs).toEqual(["a", "b"]);
    expect(slugs.filter((s) => s === "a")).toHaveLength(1);
  });

  it("caps the stored list at RECENTLY_VIEWED_MAX (newest kept)", () => {
    for (let i = 0; i < RECENTLY_VIEWED_MAX + 5; i += 1) {
      recordRecentlyViewed(makeEntry({ slug: `s-${i}`, id: `s-${i}` }));
    }
    const read = readRecentlyViewed();
    expect(read).toHaveLength(RECENTLY_VIEWED_MAX);
    // The newest (last recorded) is first; the oldest overflow is dropped.
    expect(read[0]?.slug).toBe(`s-${RECENTLY_VIEWED_MAX + 4}`);
  });

  it("returns the updated list so the caller renders without a second read", () => {
    const next = recordRecentlyViewed(makeEntry({ slug: "a", id: "a" }));
    expect(next.map((e) => e.slug)).toEqual(["a"]);
  });
});

describe("readRecentlyViewed — schema guard (edge 7, m-5)", () => {
  function store(value: unknown): void {
    window.localStorage.setItem(
      RECENTLY_VIEWED_STORAGE_KEY,
      JSON.stringify(value),
    );
  }

  it("returns [] on non-array JSON", () => {
    store({ not: "an array" });
    expect(readRecentlyViewed()).toEqual([]);
  });

  it("returns [] on malformed (non-JSON) storage content", () => {
    window.localStorage.setItem(RECENTLY_VIEWED_STORAGE_KEY, "{not json");
    expect(readRecentlyViewed()).toEqual([]);
  });

  it("filters out entries missing required fields", () => {
    store([{ id: "x" }, makeEntry({ slug: "ok", id: "ok" })]);
    const read = readRecentlyViewed();
    expect(read).toHaveLength(1);
    expect(read[0]?.slug).toBe("ok");
  });

  it("rejects an entry whose compareAtPriceCents was tampered to a non-number (the $NaN path, m-5)", () => {
    const tampered = { ...makeEntry(), compareAtPriceCents: "999" };
    store([tampered]);
    // A tampered entry that would reach formatMXN(undefined/"999") → $NaN is dropped.
    expect(readRecentlyViewed()).toEqual([]);
  });

  it("rejects an entry missing coverImageUrl / brandName / lowStockN shape (m-5)", () => {
    const base = makeEntry();
    store([{ ...base, coverImageUrl: 42 }]);
    expect(readRecentlyViewed()).toEqual([]);
    store([{ ...base, brandName: 7 }]);
    expect(readRecentlyViewed()).toEqual([]);
    store([{ ...base, lowStockN: "3" }]);
    expect(readRecentlyViewed()).toEqual([]);
  });

  it("rejects an entry with an invalid stockState value", () => {
    store([{ ...makeEntry(), stockState: "sometimes" }]);
    expect(readRecentlyViewed()).toEqual([]);
  });

  it("accepts a valid entry with null nullable fields", () => {
    store([
      makeEntry({
        compareAtPriceCents: null,
        coverImageUrl: null,
        brandName: null,
        lowStockN: null,
      }),
    ]);
    expect(readRecentlyViewed()).toHaveLength(1);
  });

  it("accepts a valid low-stock entry carrying its own lowStockN", () => {
    store([makeEntry({ stockState: "low", lowStockN: 2 })]);
    const read = readRecentlyViewed();
    expect(read[0]?.lowStockN).toBe(2);
  });
});

describe("degradation when storage throws (edge 7)", () => {
  it("read yields [] and does not throw when getItem throws", () => {
    vi.spyOn(window.localStorage.__proto__, "getItem").mockImplementation(
      () => {
        throw new Error("SecurityError: storage disabled");
      },
    );
    expect(() => readRecentlyViewed()).not.toThrow();
    expect(readRecentlyViewed()).toEqual([]);
  });

  it("write is swallowed (no throw) when setItem throws (quota/full)", () => {
    vi.spyOn(window.localStorage.__proto__, "setItem").mockImplementation(
      () => {
        throw new Error("QuotaExceededError");
      },
    );
    // Still returns the computed list even though persistence failed.
    const result = recordRecentlyViewed(makeEntry({ slug: "a", id: "a" }));
    expect(result.map((e) => e.slug)).toEqual(["a"]);
  });

  it("warns at most once per session (no console spam, edge 7)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(window.localStorage.__proto__, "getItem").mockImplementation(
      () => {
        throw new Error("boom");
      },
    );
    readRecentlyViewed();
    readRecentlyViewed();
    readRecentlyViewed();
    // The module guards to a single warn for the whole session.
    expect(warn.mock.calls.length).toBeLessThanOrEqual(1);
  });
});
