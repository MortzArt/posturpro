/**
 * Unit tests for the dynamic root sitemap (T14 AC-A9). Guards the M-2 regression:
 * `/contacto` is surfaced BOTH hard-coded in STATIC_HREFS and via the published-
 * static-pages read, so the emitted sitemap must NOT contain a duplicate `<loc>`.
 *
 * The catalog data-layer modules are mocked so the render is hermetic and the
 * overlap (published `contacto`) is reproduced deterministically. `getPathname`
 * is mocked with the real `as-needed` prefix rule (see metadata.test.ts).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/navigation", () => ({
  getPathname: ({ href, locale }: { href: string; locale: string }) =>
    locale === "es-MX" ? href : `/en${href === "/" ? "" : href}`,
}));

vi.mock("@/lib/catalog/queries", () => ({
  listBrands: vi.fn(async () => [{ slug: "herman-miller" }]),
  listStyles: vi.fn(async () => [{ slug: "ergonomica" }]),
  listCategories: vi.fn(async () => [
    { slug: "sillas-oficina", children: [{ slug: "ejecutivas", children: [] }] },
  ]),
}));

vi.mock("@/lib/catalog/product-detail", () => ({
  listActiveProductSlugs: vi.fn(async () => ["silla-alpha"]),
}));

// The seed publishes all 9 static pages INCLUDING `contacto`, which overlaps the
// hard-coded STATIC_HREFS entry — this is exactly the M-2 duplicate source.
vi.mock("@/lib/content/static-pages", () => ({
  listPublishedStaticPageSlugs: vi.fn(async () => [
    "sobre-nosotros",
    "contacto",
    "showroom",
  ]),
}));

import sitemap from "./sitemap";

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

describe("sitemap()", () => {
  it("emits NO duplicate <loc> URLs even when contacto overlaps (M-2)", async () => {
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("still includes /contacto exactly once per locale", async () => {
    const entries = await sitemap();
    const contactoUrls = entries
      .map((entry) => entry.url)
      .filter((url) => url.endsWith("/contacto"));
    // One es-MX (unprefixed) + one en (/en/contacto).
    expect(contactoUrls).toEqual([`${ORIGIN}/contacto`, `${ORIGIN}/en/contacto`]);
  });

  it("keeps /showroom (a real dynamic route) in the output", async () => {
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);
    expect(urls).toContain(`${ORIGIN}/showroom`);
  });
});
