/**
 * Unit tests for the shared SEO metadata helper (T14 AC-A11). Asserts the
 * self-referential canonical, the es-MX-unprefixed / en-prefixed hreflang map,
 * the `x-default` → es-MX rule, and the Open Graph shape. Uses a fixed
 * NEXT_PUBLIC_SITE_URL so URLs are deterministic.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// next-intl's `getPathname` pulls in client navigation bindings that don't
// resolve under vitest's node resolver. Mock it with the `as-needed` prefix
// rule (es-MX default → unprefixed, en → `/en`) so the helper's URL composition
// is tested hermetically. The real behavior is verified end-to-end by the
// build+curl gate (hreflang in the rendered <head>).
vi.mock("@/i18n/navigation", () => ({
  getPathname: ({ href, locale }: { href: string; locale: string }) =>
    locale === "es-MX" ? href : `/en${href === "/" ? "" : href}`,
}));

import { buildAlternates, buildOpenGraph, localeUrl } from "./metadata";

const ORIGIN = "https://posturpro.mx";
let previousSiteUrl: string | undefined;

beforeAll(() => {
  previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = ORIGIN;
});

afterAll(() => {
  if (previousSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl;
});

describe("localeUrl", () => {
  it("keeps es-MX unprefixed and prefixes en with /en", () => {
    expect(localeUrl("/sillas", "es-MX")).toBe(`${ORIGIN}/sillas`);
    expect(localeUrl("/sillas", "en")).toBe(`${ORIGIN}/en/sillas`);
  });

  it("keeps the home href as the bare origin path", () => {
    expect(localeUrl("/", "es-MX")).toBe(`${ORIGIN}/`);
    expect(localeUrl("/", "en")).toBe(`${ORIGIN}/en`);
  });
});

describe("buildAlternates", () => {
  it("emits a self-referential canonical for the active locale", () => {
    expect(buildAlternates("/sillas", "es-MX").canonical).toBe(`${ORIGIN}/sillas`);
    expect(buildAlternates("/sillas", "en").canonical).toBe(`${ORIGIN}/en/sillas`);
  });

  it("emits hreflang for es-MX, en, and x-default (→ es-MX URL)", () => {
    const { languages } = buildAlternates("/sillas", "en");
    expect(languages).toEqual({
      "es-MX": `${ORIGIN}/sillas`,
      en: `${ORIGIN}/en/sillas`,
      "x-default": `${ORIGIN}/sillas`,
    });
  });
});

describe("buildOpenGraph", () => {
  it("builds a self-referential OG block with alternate locales", () => {
    const og = buildOpenGraph({
      title: "Sillas",
      description: "Catálogo",
      href: "/sillas",
      locale: "es-MX",
      type: "website",
    });
    expect(og.url).toBe(`${ORIGIN}/sillas`);
    expect(og.locale).toBe("es_MX");
    expect(og.alternateLocale).toEqual(["en"]);
    // `type` is on the discriminated OG union; assert via a record view.
    expect((og as Record<string, unknown>).type).toBe("website");
  });

  it("includes images only when provided", () => {
    const withImg = buildOpenGraph({
      title: "P",
      href: "/",
      locale: "en",
      images: ["https://x.test/og.jpg"],
    });
    expect(withImg.images).toEqual(["https://x.test/og.jpg"]);
    const noImg = buildOpenGraph({ title: "P", href: "/", locale: "en" });
    expect(noImg.images).toBeUndefined();
  });
});
