/**
 * Unit tests for the guarded cart localStorage helpers (T6 AC-3, AC-14, edge
 * 1–3). Mirrors `recently-viewed.test.ts`.
 *
 * The stored payload is treated as ATTACKER-CONTROLLED. These tests hammer the
 * shape guard and quantity handling with hostile input — wrong types, negative /
 * NaN / over-cap quantities, absurd prices above the cents ceiling, huge arrays,
 * non-JSON garbage, unknown/foreign keys — and assert the invariant: a bad line
 * is DROPPED (or the whole read falls back to `[]`), the read NEVER throws, and a
 * failure warns at most once per session. `formatMXN(undefined)` → `$NaN` must be
 * impossible downstream: any line that could produce it is rejected here.
 *
 * jsdom provides a real `window.localStorage`; failure modes stub it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readCart, writeCart } from "./cart-storage";
import { type CartLine } from "./cart-line";
import {
  CART_STORAGE_KEY,
  MAX_CART_ITEM_QUANTITY,
  PRICE_BOUND_MAX_CENTS,
} from "@/lib/config";

/** Factory: a fully-valid stored cart line, overridable per test. */
function makeLine(overrides: Partial<CartLine> = {}): CartLine {
  return {
    productId: "p-1",
    slug: "silla-ejemplo",
    name: "Silla Ejemplo",
    variantId: "v-negro",
    variantLabel: "Negro",
    unitPriceCents: 499_900,
    coverImageUrl: "https://example.test/cover.jpg",
    sku: "SKU-1",
    quantity: 2,
    ...overrides,
  };
}

function store(value: unknown): void {
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(value));
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("readCart — happy path (AC-3)", () => {
  it("returns [] when nothing is stored", () => {
    expect(readCart()).toEqual([]);
  });

  it("reads back valid stored lines with quantities intact", () => {
    store([makeLine({ quantity: 3 })]);
    const read = readCart();
    expect(read).toHaveLength(1);
    expect(read[0]?.quantity).toBe(3);
    expect(read[0]?.productId).toBe("p-1");
  });

  it("accepts a valid variant-less line (null variant fields)", () => {
    store([makeLine({ variantId: null, variantLabel: null, sku: null, coverImageUrl: null })]);
    expect(readCart()).toHaveLength(1);
  });

  it("preserves multiple distinct lines and their order", () => {
    store([
      makeLine({ variantId: "v-a" }),
      makeLine({ variantId: "v-b" }),
    ]);
    expect(readCart().map((l) => l.variantId)).toEqual(["v-a", "v-b"]);
  });
});

describe("readCart — corrupt / foreign payload → empty (AC-14, edge 1)", () => {
  it("returns [] on non-JSON garbage", () => {
    window.localStorage.setItem(CART_STORAGE_KEY, "{not json");
    expect(readCart()).toEqual([]);
  });

  it("returns [] when the stored value is an object, not an array", () => {
    store({ not: "an array" });
    expect(readCart()).toEqual([]);
  });

  it("returns [] when the stored value is a bare string / number / bool", () => {
    store("hello");
    expect(readCart()).toEqual([]);
    store(42);
    expect(readCart()).toEqual([]);
    store(true);
    expect(readCart()).toEqual([]);
  });

  it("returns [] when the stored value is null", () => {
    store(null);
    expect(readCart()).toEqual([]);
  });

  it("ignores an unrelated/foreign storage key (only reads its own key)", () => {
    window.localStorage.setItem("some-other-app:cart", JSON.stringify([makeLine()]));
    expect(readCart()).toEqual([]);
  });
});

describe("readCart — shape guard drops bad lines (edge 3, no $NaN)", () => {
  it("drops a line missing required string fields", () => {
    store([{ productId: "x" }, makeLine({ variantId: "ok" })]);
    const read = readCart();
    expect(read).toHaveLength(1);
    expect(read[0]?.variantId).toBe("ok");
  });

  it("drops a line whose unitPriceCents is missing (would render $NaN)", () => {
    const bad = { ...makeLine() } as Record<string, unknown>;
    delete bad.unitPriceCents;
    store([bad]);
    expect(readCart()).toEqual([]);
  });

  it("drops a line whose unitPriceCents is a string, NaN, float, or negative", () => {
    store([{ ...makeLine(), unitPriceCents: "499900" }]);
    expect(readCart()).toEqual([]);
    store([{ ...makeLine(), unitPriceCents: Number.NaN }]);
    expect(readCart()).toEqual([]);
    store([{ ...makeLine(), unitPriceCents: 499.9 }]);
    expect(readCart()).toEqual([]);
    store([{ ...makeLine(), unitPriceCents: -100 }]);
    expect(readCart()).toEqual([]);
  });

  it("drops a line whose unitPriceCents exceeds the sane cents ceiling (M-1 fix)", () => {
    store([{ ...makeLine(), unitPriceCents: PRICE_BOUND_MAX_CENTS + 1 }]);
    expect(readCart()).toEqual([]);
    // Exactly at the ceiling is accepted.
    store([{ ...makeLine(), unitPriceCents: PRICE_BOUND_MAX_CENTS }]);
    expect(readCart()).toHaveLength(1);
  });

  it("drops a line whose variantId / variantLabel / sku / coverImageUrl are wrong-typed", () => {
    store([{ ...makeLine(), variantId: 7 }]);
    expect(readCart()).toEqual([]);
    store([{ ...makeLine(), variantLabel: 7 }]);
    expect(readCart()).toEqual([]);
    store([{ ...makeLine(), sku: 7 }]);
    expect(readCart()).toEqual([]);
    store([{ ...makeLine(), coverImageUrl: 7 }]);
    expect(readCart()).toEqual([]);
  });

  it("drops a null element or a nested array element", () => {
    store([null, makeLine({ variantId: "keep" })]);
    expect(readCart().map((l) => l.variantId)).toEqual(["keep"]);
    store([[makeLine()], makeLine({ variantId: "keep2" })]);
    expect(readCart().map((l) => l.variantId)).toEqual(["keep2"]);
  });

  it("keeps the good lines and drops only the bad ones in a mixed array", () => {
    store([
      makeLine({ variantId: "good-1" }),
      { ...makeLine(), unitPriceCents: "nope" },
      makeLine({ variantId: "good-2" }),
    ]);
    expect(readCart().map((l) => l.variantId)).toEqual(["good-1", "good-2"]);
  });
});

describe("readCart — quantity clamp / drop (edge 3, AC-13)", () => {
  it("clamps an over-cap stored quantity down to MAX", () => {
    store([makeLine({ quantity: 10_000 })]);
    expect(readCart()[0]?.quantity).toBe(MAX_CART_ITEM_QUANTITY);
  });

  it("drops a line with a 0 / negative / NaN quantity rather than rendering 0 × price", () => {
    store([makeLine({ quantity: 0 })]);
    expect(readCart()).toEqual([]);
    store([makeLine({ quantity: -3 })]);
    expect(readCart()).toEqual([]);
    store([makeLine({ quantity: Number.NaN })]);
    expect(readCart()).toEqual([]);
  });

  it("drops a line whose quantity is a non-number type (fails the type guard)", () => {
    store([{ ...makeLine(), quantity: "5" }]);
    expect(readCart()).toEqual([]);
  });

  it("floors a fractional-but-≥1 quantity to a safe integer", () => {
    store([makeLine({ quantity: 3.9 })]);
    expect(readCart()[0]?.quantity).toBe(3);
  });
});

describe("readCart — scale / DoS resistance", () => {
  it("survives a huge array without throwing and clamps every surviving line", () => {
    const huge = Array.from({ length: 5_000 }, (_v, i) =>
      makeLine({ variantId: `v-${i}`, quantity: 10_000 }),
    );
    store(huge);
    const read = readCart();
    expect(read).toHaveLength(5_000);
    expect(read.every((l) => l.quantity === MAX_CART_ITEM_QUANTITY)).toBe(true);
  });
});

describe("writeCart / readCart — round trip (AC-3)", () => {
  it("persists then reads back an equivalent cart", () => {
    const lines = [makeLine({ variantId: "v-a", quantity: 1 }), makeLine({ variantId: "v-b", quantity: 4 })];
    writeCart(lines);
    expect(readCart()).toEqual(lines);
  });

  it("overwrites the prior payload (last write wins)", () => {
    writeCart([makeLine({ variantId: "old" })]);
    writeCart([makeLine({ variantId: "new" })]);
    expect(readCart().map((l) => l.variantId)).toEqual(["new"]);
  });
});

describe("degradation when storage throws (AC-14, edge 1, 2)", () => {
  it("read yields [] and does not throw when getItem throws (private mode)", () => {
    vi.spyOn(window.localStorage.__proto__, "getItem").mockImplementation(() => {
      throw new Error("SecurityError: storage disabled");
    });
    expect(() => readCart()).not.toThrow();
    expect(readCart()).toEqual([]);
  });

  it("write is swallowed (no throw) when setItem throws (quota/full)", () => {
    vi.spyOn(window.localStorage.__proto__, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => writeCart([makeLine()])).not.toThrow();
  });

  it("warns at most once per session on repeated read failures (no console spam)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(window.localStorage.__proto__, "getItem").mockImplementation(() => {
      throw new Error("boom");
    });
    readCart();
    readCart();
    readCart();
    expect(warn.mock.calls.length).toBeLessThanOrEqual(1);
  });
});
