/**
 * Unit tests for `GET /robots.txt` (T14 AC-A10). Guards the crawl-hygiene policy
 * and specifically the M-1 regression: the cart/checkout funnel lives under
 * `src/app/[locale]/`, so BOTH the unprefixed default-locale path and the `/en`
 * path must be disallowed (robots prefix matching does not let `/checkout` cover
 * `/en/checkout`). Uses a fixed NEXT_PUBLIC_SITE_URL for a deterministic origin.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import robots from "./robots";

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

function disallowList(): string[] {
  const { rules } = robots();
  const rule = Array.isArray(rules) ? rules[0] : rules;
  const disallow = rule?.disallow ?? [];
  return Array.isArray(disallow) ? disallow : [disallow];
}

describe("robots()", () => {
  it("disallows the cart/checkout funnel for BOTH locales (M-1)", () => {
    const disallow = disallowList();
    for (const path of ["/checkout", "/carrito", "/en/checkout", "/en/carrito"]) {
      expect(disallow).toContain(path);
    }
  });

  it("disallows admin and api at the app root (no /en mirror needed)", () => {
    const disallow = disallowList();
    expect(disallow).toContain("/admin");
    expect(disallow).toContain("/api/");
    // These are NOT under [locale], so a /en variant must NOT exist.
    expect(disallow).not.toContain("/en/admin");
    expect(disallow).not.toContain("/en/api/");
  });

  it("keeps faceted catalog URLs off for both locales", () => {
    const disallow = disallowList();
    expect(disallow).toContain("/sillas?");
    expect(disallow).toContain("/en/sillas?");
  });

  it("points the Sitemap directive at the absolute /sitemap.xml", () => {
    expect(robots().sitemap).toBe(`${ORIGIN}/sitemap.xml`);
  });
});
