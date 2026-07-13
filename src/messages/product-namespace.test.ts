/**
 * PDP `product` i18n namespace presence (T4 AC-17).
 *
 * Full cross-locale key PARITY is already enforced by `messages.test.ts`; this
 * file asserts the distinct AC-17 claims: a `product` namespace EXISTS in both
 * locales with the sub-namespaces the PDP consumes, and es-MX is the default
 * locale that carries them.
 */
import { describe, expect, it } from "vitest";
import esMX from "./es-MX.json";
import en from "./en.json";

const REQUIRED_SUBKEYS = [
  "metadata",
  "breadcrumb",
  "gallery",
  "variant",
  "price",
  "specs",
  "recentlyViewed",
  "qa",
] as const;

describe("product i18n namespace (AC-17)", () => {
  it("es-MX (default locale) declares a product namespace", () => {
    expect(esMX).toHaveProperty("product");
    expect(typeof (esMX as Record<string, unknown>).product).toBe("object");
  });

  it("en declares a product namespace", () => {
    expect(en).toHaveProperty("product");
  });

  it("both locales expose every PDP sub-namespace", () => {
    for (const key of REQUIRED_SUBKEYS) {
      expect(
        (esMX as { product: Record<string, unknown> }).product,
      ).toHaveProperty(key);
      expect(
        (en as { product: Record<string, unknown> }).product,
      ).toHaveProperty(key);
    }
  });
});
