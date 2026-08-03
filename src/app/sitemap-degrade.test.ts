/**
 * Regression test for the sitemap DB-outage degrade path (T14 AC-A14, edge 3,
 * Error-States table: "`/sitemap.xml` requested, DB read fails → valid but
 * reduced sitemap (static routes only); never 500").
 *
 * The existing `sitemap.test.ts` proves de-dupe with the catalog reads SUCCEEDING.
 * This file proves the OTHER half of AC-A14: when EVERY catalog read rejects (a
 * DB outage at build/request time), `sitemap()` must NOT throw — `safeRead`
 * degrades each source to `[]` and the sitemap still emits the STATIC_HREFS
 * (`/`, `/sillas`, `/empresas`, `/contacto`) for both locales. A single reduced
 * sitemap is far better than a 500 that breaks the Vercel build / crawl.
 *
 * Every catalog module is mocked to REJECT; a fixed NEXT_PUBLIC_SITE_URL makes
 * the absolute origin deterministic; `getPathname` uses the real `as-needed`
 * prefix rule (guarded by metadata.test.ts against the real routing config).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/navigation", () => ({
  getPathname: ({ href, locale }: { href: string; locale: string }) =>
    locale === "es-MX" ? href : `/en${href === "/" ? "" : href}`,
}));

const DB_DOWN = new Error("connect ECONNREFUSED 127.0.0.1:54322");

vi.mock("@/lib/catalog/queries", () => ({
  listBrands: vi.fn(async () => {
    throw DB_DOWN;
  }),
  listStyles: vi.fn(async () => {
    throw DB_DOWN;
  }),
  listCategories: vi.fn(async () => {
    throw DB_DOWN;
  }),
}));

vi.mock("@/lib/catalog/product-detail", () => ({
  listActiveProductSlugs: vi.fn(async () => {
    throw DB_DOWN;
  }),
}));

vi.mock("@/lib/content/static-pages", () => ({
  listPublishedStaticPageSlugs: vi.fn(async () => {
    throw DB_DOWN;
  }),
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

describe("sitemap() with the catalog DB unreachable (AC-A14)", () => {
  it("does NOT throw when every catalog read rejects", async () => {
    // Suppress the expected per-source degrade warnings.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(sitemap()).resolves.toBeDefined();
    // safeRead logs one warning per failed source (5 sources).
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("degrades to STATIC_HREFS only (both locales), no catalog URLs", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const entries = await sitemap();
    warn.mockRestore();

    const urls = entries.map((entry) => entry.url).sort();
    // 4 static hrefs × 2 locales = 8 entries, no product/brand/category/style.
    expect(urls).toEqual(
      [
        `${ORIGIN}/`,
        `${ORIGIN}/sillas`,
        `${ORIGIN}/empresas`,
        `${ORIGIN}/contacto`,
        `${ORIGIN}/en`,
        `${ORIGIN}/en/sillas`,
        `${ORIGIN}/en/empresas`,
        `${ORIGIN}/en/contacto`,
      ].sort(),
    );
    expect(urls.some((u) => u.includes("/producto/"))).toBe(false);
    expect(urls.some((u) => u.includes("/categorias/"))).toBe(false);
  });

  it("still carries hreflang alternates on the reduced entries", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const entries = await sitemap();
    warn.mockRestore();

    const home = entries.find((entry) => entry.url === `${ORIGIN}/`);
    expect(home?.alternates?.languages).toEqual({
      "es-MX": `${ORIGIN}/`,
      en: `${ORIGIN}/en`,
      "x-default": `${ORIGIN}/`,
    });
  });
});
