/**
 * Unit tests for the static-page config module (T13 AC-1, AC-10, edge 10).
 * Pure — no I/O. Covers the single-sourced slug set, the path/type-guard
 * helpers, and the RESERVED_SLUGS collision invariant the module enforces at
 * load time (an actual colliding config throws at import).
 */
import { describe, expect, it } from "vitest";
import {
  STATIC_PAGE_SLUGS,
  ALL_STATIC_PAGE_SLUGS,
  RESERVED_SLUGS,
  CONTACT_SLUG,
  SHOWROOM_SLUG,
  staticPagePath,
  isStaticPageSlug,
  HOME_FEATURED_PRODUCTS,
  HOME_FEATURED_BRANDS,
} from "./static-pages";

describe("the single-sourced slug set (AC-1)", () => {
  it("has 7 generic slugs and 9 total (generic + contacto + showroom)", () => {
    expect(STATIC_PAGE_SLUGS).toHaveLength(7);
    expect(ALL_STATIC_PAGE_SLUGS).toHaveLength(9);
  });

  it("appends exactly the two bespoke slugs to the generic set", () => {
    expect(ALL_STATIC_PAGE_SLUGS).toEqual([
      ...STATIC_PAGE_SLUGS,
      CONTACT_SLUG,
      SHOWROOM_SLUG,
    ]);
  });

  it("has no duplicate slug across the full set", () => {
    expect(new Set(ALL_STATIC_PAGE_SLUGS).size).toBe(ALL_STATIC_PAGE_SLUGS.length);
  });

  it("adopts the split shipping/returns slugs (not the combined T2 slug)", () => {
    expect(STATIC_PAGE_SLUGS).toContain("envios");
    expect(STATIC_PAGE_SLUGS).toContain("devoluciones");
    expect(STATIC_PAGE_SLUGS as readonly string[]).not.toContain(
      "envios-y-devoluciones",
    );
  });
});

describe("RESERVED_SLUGS collision guard (edge 10)", () => {
  it("keeps every generic slug disjoint from the reserved route segments", () => {
    // This is the exact invariant the module asserts at load time; if a future
    // edit collides a generic slug the import itself throws — so a green import
    // (this test file loaded at all) already proves it, and we re-assert here.
    for (const slug of STATIC_PAGE_SLUGS) {
      expect(RESERVED_SLUGS.has(slug)).toBe(false);
    }
  });

  it("reserves the storefront segments so [pageSlug] can never shadow them", () => {
    for (const seg of ["sillas", "marcas", "categorias", "estilos", "carrito", "checkout", "producto"]) {
      expect(RESERVED_SLUGS.has(seg)).toBe(true);
    }
  });

  it("reserves the two bespoke static pages (they own explicit route folders)", () => {
    expect(RESERVED_SLUGS.has(CONTACT_SLUG)).toBe(true);
    expect(RESERVED_SLUGS.has(SHOWROOM_SLUG)).toBe(true);
  });

  it("would detect a collision — the load-time invariant's own logic", () => {
    // Characterize the guard's rule directly (a colliding config throws at
    // import; we can't re-import with a mutated const, so we exercise the rule).
    const collide = (slugs: readonly string[]): boolean =>
      slugs.some((s) => RESERVED_SLUGS.has(s));
    expect(collide(STATIC_PAGE_SLUGS)).toBe(false);
    // A hypothetical config that put "marcas" in the generic set WOULD collide.
    expect(collide([...STATIC_PAGE_SLUGS, "marcas"])).toBe(true);
  });
});

describe("staticPagePath", () => {
  it("builds a root-relative path (the locale prefix is added by <Link>)", () => {
    expect(staticPagePath("sobre-nosotros")).toBe("/sobre-nosotros");
    expect(staticPagePath("contacto")).toBe("/contacto");
  });
});

describe("isStaticPageSlug (route type guard)", () => {
  it("is true for a generic slug", () => {
    expect(isStaticPageSlug("garantia")).toBe(true);
  });

  it("is false for the bespoke slugs (they are excluded from the generic route)", () => {
    expect(isStaticPageSlug(CONTACT_SLUG)).toBe(false);
    expect(isStaticPageSlug(SHOWROOM_SLUG)).toBe(false);
  });

  it("is false for an unknown / reserved slug (edge 10 → notFound)", () => {
    expect(isStaticPageSlug("sillas")).toBe(false);
    expect(isStaticPageSlug("does-not-exist")).toBe(false);
    expect(isStaticPageSlug("envios-y-devoluciones")).toBe(false);
  });
});

describe("homepage tunables (AC-7)", () => {
  it("uses ragged-row-free counts at every grid breakpoint", () => {
    // 8 divides by 2 and 4 (product grid); 6 divides by 1, 2, 3 (brand grid).
    expect(HOME_FEATURED_PRODUCTS % 4).toBe(0);
    expect(HOME_FEATURED_BRANDS % 3).toBe(0);
    expect(HOME_FEATURED_BRANDS % 2).toBe(0);
  });
});
