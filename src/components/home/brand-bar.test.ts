/**
 * BrandBar i18n invariant guard (T19 m-3).
 *
 * `BrandBar` renders `home.brandBar.brands` by splitting it on `BRAND_SEPARATOR`.
 * If a translator ever changes the separator in a locale file, the split would
 * silently collapse the whole string into ONE "brand" (a broken trust strip that
 * no type check or render error would flag). This test pins the invariant: both
 * locales must join the brands with the exported separator and yield the same
 * number of brands. Uses the component's own `BRAND_SEPARATOR` so the two can
 * never drift.
 */
import { describe, expect, it } from "vitest";
import esMX from "@/messages/es-MX.json";
import en from "@/messages/en.json";
import { BRAND_SEPARATOR } from "@/components/home/brand-bar";

const LOCALES = { "es-MX": esMX, en } as const;

function brandCount(brands: string): number {
  return brands
    .split(BRAND_SEPARATOR)
    .map((name) => name.trim())
    .filter(Boolean).length;
}

describe("BrandBar brands string (m-3)", () => {
  it("every locale uses the shared separator and yields >1 brand", () => {
    for (const [locale, messages] of Object.entries(LOCALES)) {
      const brands = messages.home.brandBar.brands;
      expect(
        brands.includes(BRAND_SEPARATOR),
        `${locale}: home.brandBar.brands must join brands with "${BRAND_SEPARATOR}"`,
      ).toBe(true);
      expect(
        brandCount(brands),
        `${locale}: expected more than one brand after splitting on the separator`,
      ).toBeGreaterThan(1);
    }
  });

  it("all locales expose the same number of brands", () => {
    const counts = Object.values(LOCALES).map((m) =>
      brandCount(m.home.brandBar.brands),
    );
    expect(new Set(counts).size).toBe(1);
  });
});
