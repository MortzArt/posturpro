/**
 * Unit tests for the pure cart-line math helpers (T6 AC-2, AC-6, AC-7, AC-12,
 * AC-13, edge 3, 9).
 *
 * These are the single source of truth for identity/dedupe, quantity clamping,
 * and integer-cents line/subtotal math — the provider reducer and the cart page
 * both call them. No I/O, no React: pure in/out. Every branch of every helper is
 * covered, with an emphasis on the tamper/clamp paths that keep `formatMXN` from
 * ever seeing a non-integer or a `$NaN`.
 */
import { describe, expect, it } from "vitest";
import {
  addLine,
  cartLineKey,
  isDroppableQuantity,
  lineKey,
  lineTotalCents,
  removeLine,
  sanitizeQuantity,
  setLineQuantity,
  subtotalCents,
  totalItemCount,
  type CartLine,
  type CartLineInput,
} from "./cart-line";
import { MAX_CART_ITEM_QUANTITY } from "@/lib/config";

/** Factory: a fully-valid cart line, overridable per test. */
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
    quantity: 1,
    ...overrides,
  };
}

/** Factory: the input shape `addLine` accepts (a line without quantity). */
function makeInput(overrides: Partial<CartLineInput> = {}): CartLineInput {
  const line = makeLine(overrides as Partial<CartLine>);
  const input: CartLineInput = {
    productId: line.productId,
    slug: line.slug,
    name: line.name,
    variantId: line.variantId,
    variantLabel: line.variantLabel,
    unitPriceCents: line.unitPriceCents,
    coverImageUrl: line.coverImageUrl,
    sku: line.sku,
  };
  return input;
}

describe("cartLineKey / lineKey — identity (AC-2)", () => {
  it("keys a variant line as productId::variantId", () => {
    expect(cartLineKey("p-1", "v-negro")).toBe("p-1::v-negro");
  });

  it("keys a variant-less line by productId alone (no collision with a variant)", () => {
    expect(cartLineKey("p-1", null)).toBe("p-1");
    // A no-variant product and a variant of the same product never collide.
    expect(cartLineKey("p-1", null)).not.toBe(cartLineKey("p-1", "v-negro"));
  });

  it("lineKey delegates to cartLineKey for an existing line", () => {
    expect(lineKey(makeLine({ productId: "p-2", variantId: "v-cafe" }))).toBe(
      "p-2::v-cafe",
    );
    expect(lineKey(makeLine({ variantId: null }))).toBe("p-1");
  });

  it("two different variants of the same product produce distinct keys", () => {
    expect(cartLineKey("p-1", "v-a")).not.toBe(cartLineKey("p-1", "v-b"));
  });
});

describe("sanitizeQuantity — clamp to [1, MAX] (AC-13, edge 3)", () => {
  it("passes through a valid in-range integer", () => {
    expect(sanitizeQuantity(3)).toBe(3);
  });

  it("clamps 0 and negatives up to 1", () => {
    expect(sanitizeQuantity(0)).toBe(1);
    expect(sanitizeQuantity(-5)).toBe(1);
  });

  it("clamps above the cap down to MAX", () => {
    expect(sanitizeQuantity(MAX_CART_ITEM_QUANTITY + 1)).toBe(
      MAX_CART_ITEM_QUANTITY,
    );
    expect(sanitizeQuantity(10_000)).toBe(MAX_CART_ITEM_QUANTITY);
  });

  it("floors a non-integer to a safe integer", () => {
    expect(sanitizeQuantity(2.9)).toBe(2);
    expect(sanitizeQuantity(1.1)).toBe(1);
  });

  it("maps NaN / Infinity (non-finite) and non-number junk to 1", () => {
    expect(sanitizeQuantity(NaN)).toBe(1);
    // Infinity is non-finite → treated as junk → clamps to the minimum, 1.
    expect(sanitizeQuantity(Infinity)).toBe(1);
    expect(sanitizeQuantity(-Infinity)).toBe(1);
    expect(sanitizeQuantity("5")).toBe(1);
    expect(sanitizeQuantity(null)).toBe(1);
    expect(sanitizeQuantity(undefined)).toBe(1);
    expect(sanitizeQuantity({})).toBe(1);
  });

  it("never returns a value outside [1, MAX] for any numeric input (fuzz)", () => {
    for (const value of [
      -1e9, -1, 0, 0.4, 1, 50, 98, 99, 100, 1e6, NaN, Infinity,
    ]) {
      const out = sanitizeQuantity(value);
      expect(out).toBeGreaterThanOrEqual(1);
      expect(out).toBeLessThanOrEqual(MAX_CART_ITEM_QUANTITY);
      expect(Number.isInteger(out)).toBe(true);
    }
  });
});

describe("isDroppableQuantity — drop junk lines on read (edge 3)", () => {
  it("does not drop a valid positive quantity", () => {
    expect(isDroppableQuantity(1)).toBe(false);
    expect(isDroppableQuantity(99)).toBe(false);
  });

  it("does not drop a valid-but-over-cap quantity (that clamps instead)", () => {
    expect(isDroppableQuantity(MAX_CART_ITEM_QUANTITY + 500)).toBe(false);
  });

  it("drops 0, negative, non-integer-below-1, NaN, and non-numbers", () => {
    expect(isDroppableQuantity(0)).toBe(true);
    expect(isDroppableQuantity(-3)).toBe(true);
    expect(isDroppableQuantity(0.5)).toBe(true);
    expect(isDroppableQuantity(NaN)).toBe(true);
    expect(isDroppableQuantity("2")).toBe(true);
    expect(isDroppableQuantity(null)).toBe(true);
  });

  it("treats Infinity as droppable (non-finite)", () => {
    expect(isDroppableQuantity(Infinity)).toBe(true);
    expect(isDroppableQuantity(-Infinity)).toBe(true);
  });
});

describe("lineTotalCents / subtotalCents / totalItemCount (AC-12)", () => {
  it("computes a line total as integer cents", () => {
    expect(lineTotalCents(makeLine({ unitPriceCents: 499_900, quantity: 3 }))).toBe(
      1_499_700,
    );
  });

  it("subtotal is the sum of every line total", () => {
    const lines = [
      makeLine({ unitPriceCents: 100_000, quantity: 2 }), // 200_000
      makeLine({ productId: "p-2", unitPriceCents: 50_000, quantity: 1 }), // 50_000
    ];
    expect(subtotalCents(lines)).toBe(250_000);
  });

  it("subtotal of an empty cart is 0 (never NaN)", () => {
    expect(subtotalCents([])).toBe(0);
    expect(Number.isInteger(subtotalCents([]))).toBe(true);
  });

  it("totalItemCount sums quantities (badge count, AC-4)", () => {
    const lines = [
      makeLine({ quantity: 2 }),
      makeLine({ productId: "p-2", quantity: 5 }),
    ];
    expect(totalItemCount(lines)).toBe(7);
    expect(totalItemCount([])).toBe(0);
  });

  it("all math stays integer for integer inputs (no float drift)", () => {
    const lines = [
      makeLine({ unitPriceCents: 899_900, quantity: 7 }),
      makeLine({ productId: "p-2", unitPriceCents: 12_345, quantity: 3 }),
    ];
    expect(Number.isInteger(subtotalCents(lines))).toBe(true);
    expect(Number.isInteger(lineTotalCents(lines[0]!))).toBe(true);
  });
});

describe("addLine — dedupe + increment + clamp (AC-2, edge 9)", () => {
  it("appends a new line at quantity 1", () => {
    const next = addLine([], makeInput());
    expect(next).toHaveLength(1);
    expect(next[0]?.quantity).toBe(1);
  });

  it("increments an existing line instead of duplicating (same product+variant)", () => {
    let lines: CartLine[] = addLine([], makeInput());
    lines = addLine(lines, makeInput());
    lines = addLine(lines, makeInput());
    expect(lines).toHaveLength(1);
    expect(lines[0]?.quantity).toBe(3);
  });

  it("keeps two different variants of the same product as two lines", () => {
    let lines = addLine([], makeInput({ variantId: "v-negro" }));
    lines = addLine(lines, makeInput({ variantId: "v-cafe" }));
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.variantId)).toEqual(["v-negro", "v-cafe"]);
  });

  it("a no-variant product is distinct from a variant of the same product", () => {
    let lines = addLine([], makeInput({ variantId: null, variantLabel: null }));
    lines = addLine(lines, makeInput({ variantId: "v-negro" }));
    expect(lines).toHaveLength(2);
  });

  it("caps the incremented quantity at MAX (never exceeds the cap, edge 9)", () => {
    let lines = [makeLine({ quantity: MAX_CART_ITEM_QUANTITY })];
    lines = addLine(lines, makeInput());
    expect(lines[0]?.quantity).toBe(MAX_CART_ITEM_QUANTITY);
  });

  it("does not mutate the input array (returns a new array)", () => {
    const original = [makeLine()];
    const snapshot = [...original];
    addLine(original, makeInput({ productId: "p-2" }));
    expect(original).toEqual(snapshot);
  });

  it("coalesces N sequential functional adds to a total of N (rapid-click model)", () => {
    let lines: CartLine[] = [];
    for (let i = 0; i < 10; i += 1) {
      lines = addLine(lines, makeInput());
    }
    expect(lines).toHaveLength(1);
    expect(lines[0]?.quantity).toBe(10);
  });
});

describe("setLineQuantity — clamp on set (AC-6, AC-13)", () => {
  it("sets a valid quantity on the matching line only", () => {
    const lines = [
      makeLine({ variantId: "v-a", quantity: 1 }),
      makeLine({ variantId: "v-b", quantity: 1 }),
    ];
    const next = setLineQuantity(lines, cartLineKey("p-1", "v-a"), 4);
    expect(next[0]?.quantity).toBe(4);
    expect(next[1]?.quantity).toBe(1);
  });

  it("clamps a below-1 set up to 1 (removal is a separate action, AC-7)", () => {
    const lines = [makeLine({ quantity: 2 })];
    expect(setLineQuantity(lines, lineKey(lines[0]!), 0)[0]?.quantity).toBe(1);
    expect(setLineQuantity(lines, lineKey(lines[0]!), -10)[0]?.quantity).toBe(1);
  });

  it("clamps an above-cap set down to MAX", () => {
    const lines = [makeLine({ quantity: 2 })];
    expect(
      setLineQuantity(lines, lineKey(lines[0]!), 10_000)[0]?.quantity,
    ).toBe(MAX_CART_ITEM_QUANTITY);
  });

  it("is a no-op for an unknown key", () => {
    const lines = [makeLine({ quantity: 2 })];
    const next = setLineQuantity(lines, "nope::nope", 5);
    expect(next[0]?.quantity).toBe(2);
  });

  it("returns a new array (immutability)", () => {
    const lines = [makeLine()];
    const snapshot = [...lines];
    setLineQuantity(lines, lineKey(lines[0]!), 3);
    expect(lines).toEqual(snapshot);
  });
});

describe("removeLine — remove by key (AC-7, edge 10)", () => {
  it("removes only the matching line", () => {
    const lines = [
      makeLine({ variantId: "v-a" }),
      makeLine({ variantId: "v-b" }),
    ];
    const next = removeLine(lines, cartLineKey("p-1", "v-a"));
    expect(next).toHaveLength(1);
    expect(next[0]?.variantId).toBe("v-b");
  });

  it("removing the last line yields an empty cart (edge 10)", () => {
    const lines = [makeLine()];
    expect(removeLine(lines, lineKey(lines[0]!))).toEqual([]);
  });

  it("is a no-op for an unknown key", () => {
    const lines = [makeLine()];
    expect(removeLine(lines, "nope")).toHaveLength(1);
  });
});
