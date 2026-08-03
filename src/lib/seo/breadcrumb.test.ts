/**
 * Unit tests for the breadcrumb → BreadcrumbList JSON-LD bridge (T14 AC-A12).
 *
 * `crumbsToBreadcrumbLd` is the load-bearing link between the VISIBLE breadcrumb
 * trail (the same `Crumb[]` the taxonomy/PDP pages feed to `<Breadcrumbs>`) and
 * the structured-data node crawlers read. It must:
 *  - resolve each crumb's locale-agnostic href to an ABSOLUTE, locale-correct URL
 *    (es-MX unprefixed default, en under `/en`),
 *  - preserve crumb ORDER as 1-based `position`,
 *  - omit `item` on the final (current) crumb, which has no href.
 *
 * `getPathname` is mocked with the real `as-needed` prefix rule (mirrors
 * metadata.test.ts) so URL composition is hermetic; a fixed NEXT_PUBLIC_SITE_URL
 * makes the absolute origin deterministic. The mock's assumption is guarded by
 * metadata.test.ts's `hreflang mock guard` against the real routing config.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/navigation", () => ({
  getPathname: ({ href, locale }: { href: string; locale: string }) =>
    locale === "es-MX" ? href : `/en${href === "/" ? "" : href}`,
}));

import { crumbsToBreadcrumbLd, type CrumbInput } from "./breadcrumb";

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

// The exact shape a taxonomy page produces (see categorias/[slug]/page.tsx
// `buildCategoryCrumbs`): Home → Categorías → (ancestors…) → current (no href).
const realTrail: CrumbInput[] = [
  { label: "Inicio", href: "/" },
  { label: "Categorías", href: "/categorias" },
  { label: "Oficina", href: "/categorias/oficina" },
  { label: "Sillas Ejecutivas" }, // current page — no href
];

describe("crumbsToBreadcrumbLd", () => {
  it("produces a valid BreadcrumbList with 1-based positions in trail order", () => {
    const node = crumbsToBreadcrumbLd(realTrail, "es-MX");
    expect(node["@context"]).toBe("https://schema.org");
    expect(node["@type"]).toBe("BreadcrumbList");
    const items = node.itemListElement as Array<Record<string, unknown>>;
    expect(items).toHaveLength(4);
    expect(items.map((i) => i.position)).toEqual([1, 2, 3, 4]);
    expect(items.map((i) => i.name)).toEqual([
      "Inicio",
      "Categorías",
      "Oficina",
      "Sillas Ejecutivas",
    ]);
  });

  it("resolves crumb hrefs to absolute es-MX (unprefixed) URLs", () => {
    const items = crumbsToBreadcrumbLd(realTrail, "es-MX")
      .itemListElement as Array<Record<string, unknown>>;
    expect(items[0].item).toBe(`${ORIGIN}/`);
    expect(items[1].item).toBe(`${ORIGIN}/categorias`);
    expect(items[2].item).toBe(`${ORIGIN}/categorias/oficina`);
  });

  it("resolves crumb hrefs to absolute /en URLs for the en locale", () => {
    const items = crumbsToBreadcrumbLd(realTrail, "en")
      .itemListElement as Array<Record<string, unknown>>;
    expect(items[0].item).toBe(`${ORIGIN}/en`);
    expect(items[1].item).toBe(`${ORIGIN}/en/categorias`);
    expect(items[2].item).toBe(`${ORIGIN}/en/categorias/oficina`);
  });

  it("omits `item` on the current (last, href-less) crumb", () => {
    const items = crumbsToBreadcrumbLd(realTrail, "es-MX")
      .itemListElement as Array<Record<string, unknown>>;
    expect(items[3].name).toBe("Sillas Ejecutivas");
    expect(items[3].item).toBeUndefined();
    // `item` must be present on every non-current crumb (no orphan positions).
    for (const nonCurrent of items.slice(0, 3)) {
      expect(nonCurrent.item).toBeDefined();
    }
  });

  it("handles a single current-only crumb (no URLs at all)", () => {
    const items = crumbsToBreadcrumbLd([{ label: "Solo" }], "es-MX")
      .itemListElement as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ position: 1, name: "Solo" });
    expect(items[0].item).toBeUndefined();
  });
});
