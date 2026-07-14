/**
 * Cart i18n namespace parity + shape tests (T6 AC-11).
 *
 * The global `messages.test.ts` / `keys-used.test.ts` enforce full-dictionary
 * parity; this focuses the guarantee on the `cart` namespace specifically:
 * ES/EN key parity, no empty strings, ICU-plural well-formedness on `badgeLabel`
 * (the one plural), and that the interpolation templates carry the exact tokens
 * the components fill (`{amount}`, `{count}`, `{name}`) — a missing token would
 * render a literal `{amount}` to the user.
 */
import { describe, expect, it } from "vitest";
import IntlMessageFormat from "intl-messageformat";
import esMX from "@/messages/es-MX.json";
import en from "@/messages/en.json";

type Json = Record<string, unknown>;

/** Flatten a nested message object to dot-path → string leaves. */
function flatten(obj: Json, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      out[path] = value;
    } else if (value && typeof value === "object") {
      Object.assign(out, flatten(value as Json, path));
    }
  }
  return out;
}

const esCart = flatten((esMX as Json).cart as Json);
const enCart = flatten((en as Json).cart as Json);

describe("cart namespace — ES/EN parity (AC-11)", () => {
  it("has the identical set of keys in both locales", () => {
    expect(Object.keys(esCart).sort()).toEqual(Object.keys(enCart).sort());
  });

  it("has no empty string in either locale (no blank label)", () => {
    for (const [key, value] of Object.entries(esCart)) {
      expect(value.trim(), `es-MX cart.${key}`).not.toBe("");
    }
    for (const [key, value] of Object.entries(enCart)) {
      expect(value.trim(), `en cart.${key}`).not.toBe("");
    }
  });

  it("declares every key the components consume", () => {
    const required = [
      "title",
      "titleCount",
      "metadata.title",
      "empty.title",
      "empty.subtitle",
      "empty.cta",
      "item.remove",
      "item.removeItem",
      "item.increase",
      "item.decrease",
      "item.quantityLabel",
      "item.unitEach",
      "item.lineTotalLabel",
      "item.colorLabel",
      "item.imagePlaceholder",
      "summary.heading",
      "summary.subtotal",
      "summary.shipping",
      "summary.shippingFree",
      "summary.shippingUnavailable",
      "summary.total",
      "freeShipping.remaining",
      "freeShipping.achieved",
      "checkout",
      "addToCart",
      "added",
      "outOfStock",
      "headerLink",
      "badgeLabel",
      "announce.added",
      "announce.quantity",
      "announce.removed",
    ];
    for (const key of required) {
      expect(esCart, `es-MX missing cart.${key}`).toHaveProperty([key]);
      expect(enCart, `en missing cart.${key}`).toHaveProperty([key]);
    }
  });
});

describe("cart namespace — interpolation tokens present (AC-11, AC-12)", () => {
  it("freeShipping.remaining carries the {amount} token in both locales", () => {
    expect(esCart["freeShipping.remaining"]).toContain("{amount}");
    expect(enCart["freeShipping.remaining"]).toContain("{amount}");
  });

  it("titleCount carries {count} in both locales", () => {
    expect(esCart.titleCount).toContain("{count}");
    expect(enCart.titleCount).toContain("{count}");
  });

  it("item.colorLabel and item.removeItem carry {name} in both locales", () => {
    expect(esCart["item.colorLabel"]).toContain("{name}");
    expect(enCart["item.colorLabel"]).toContain("{name}");
    expect(esCart["item.removeItem"]).toContain("{name}");
    expect(enCart["item.removeItem"]).toContain("{name}");
  });

  it("announce.quantity carries {count} in both locales", () => {
    expect(esCart["announce.quantity"]).toContain("{count}");
    expect(enCart["announce.quantity"]).toContain("{count}");
  });
});

describe("cart namespace — badgeLabel ICU plural (AC-11, AC-16)", () => {
  it("uses ICU plural syntax (not a simple {count} token) in both locales", () => {
    expect(esCart.badgeLabel).toMatch(/\{count,\s*plural,/);
    expect(enCart.badgeLabel).toMatch(/\{count,\s*plural,/);
  });

  it("formats correctly for singular (one) and plural (other) — es-MX", () => {
    const fmt = new IntlMessageFormat(esCart.badgeLabel, "es-MX");
    expect(String(fmt.format({ count: 1 }))).toBe("Carrito, 1 artículo");
    expect(String(fmt.format({ count: 3 }))).toBe("Carrito, 3 artículos");
    expect(String(fmt.format({ count: 0 }))).toBe("Carrito, 0 artículos");
  });

  it("formats correctly for singular and plural — en", () => {
    const fmt = new IntlMessageFormat(enCart.badgeLabel, "en");
    expect(String(fmt.format({ count: 1 }))).toBe("Cart, 1 item");
    expect(String(fmt.format({ count: 5 }))).toBe("Cart, 5 items");
  });

  it("badgeLabel is the ONLY plural in the namespace (all others are simple)", () => {
    for (const [key, value] of Object.entries(esCart)) {
      if (key === "badgeLabel") continue;
      expect(value, `es-MX cart.${key} unexpectedly uses plural syntax`).not.toMatch(
        /,\s*plural,/,
      );
    }
  });
});
