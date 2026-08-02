/**
 * Static-page slug set + reserved-slug guard + showroom/hero config (T13).
 *
 * SINGLE SOURCE OF TRUTH for the 9 data-backed static pages. The seed, the
 * generic `[pageSlug]` route (`generateStaticParams`), the footer, and the
 * showroom/homepage all reference these constants so a slug is edited in ONE
 * place and can never drift into a dead link (AC-1, AC-10, edge 10).
 *
 * SLUG DECISION (committed in ui-design.md): the T2 combined
 * `envios-y-devoluciones` is SPLIT into two distinct pages, `envios` +
 * `devoluciones`, because AC-1 enumerates Shipping and Returns as two separate
 * `static_pages` rows.
 *
 * ROUTE SHAPE: the 7 text-only pages are served by the generic `[pageSlug]`
 * dynamic segment; Contact (`contacto`) and Showroom (`showroom`) have their
 * OWN folders (App Router resolves static segments before the dynamic one), so
 * they are RESERVED — excluded from `STATIC_PAGE_SLUGS` /
 * `generateStaticParams` — and must never be pre-rendered by the generic route.
 */

/** The 7 slugs served by the generic `[pageSlug]` route (title + prose body). */
export const STATIC_PAGE_SLUGS = [
  "sobre-nosotros",
  "envios",
  "devoluciones",
  "garantia",
  "preguntas-frecuentes",
  "aviso-de-privacidad",
  "terminos",
] as const;

/** A slug served by the generic static-page route. */
export type StaticPageSlug = (typeof STATIC_PAGE_SLUGS)[number];

/** The bespoke pages that own their own route folder (not `[pageSlug]`). */
export const CONTACT_SLUG = "contacto" as const;
export const SHOWROOM_SLUG = "showroom" as const;

/**
 * Slugs the generic `[pageSlug]` route MUST NOT resolve, because a real,
 * higher-precedence route already owns the path. `generateStaticParams` is
 * restricted to `STATIC_PAGE_SLUGS` (which is asserted disjoint from this set),
 * so an unknown/reserved slug `notFound()`s instead of pre-rendering (edge 10).
 * Includes every existing storefront segment plus the two bespoke static pages.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "sillas",
  "marcas",
  "categorias",
  "estilos",
  "carrito",
  "checkout",
  "producto",
  CONTACT_SLUG,
  SHOWROOM_SLUG,
]);

/**
 * The full set of 9 static-page slugs (7 generic + contacto + showroom). Used
 * by the seed to know exactly which rows to write and by tests to assert the
 * count. Order mirrors the ui-design slug table.
 */
export const ALL_STATIC_PAGE_SLUGS = [
  ...STATIC_PAGE_SLUGS,
  CONTACT_SLUG,
  SHOWROOM_SLUG,
] as const;

/**
 * Load-time invariant: no generic slug may collide with a reserved segment.
 * A collision would let `[pageSlug]` try to shadow a real route (or duplicate a
 * bespoke page), so we fail fast at import rather than ship a broken route tree
 * (edge 10). Runs once per process; O(n) over a 7-element set.
 */
for (const slug of STATIC_PAGE_SLUGS) {
  if (RESERVED_SLUGS.has(slug)) {
    throw new Error(
      `[static-pages] Generic slug "${slug}" collides with a reserved route ` +
        "segment. Remove it from STATIC_PAGE_SLUGS or RESERVED_SLUGS.",
    );
  }
}

/** Build the canonical path for a static page slug (locale prefix added by `Link`). */
export function staticPagePath(slug: string): string {
  return `/${slug}`;
}

/** Whether `slug` is one of the 7 generic static pages (type guard for the route). */
export function isStaticPageSlug(slug: string): slug is StaticPageSlug {
  return (STATIC_PAGE_SLUGS as readonly string[]).includes(slug);
}

/* ------------------------------------------------------------------------- *
 * Homepage tunables (AC-7). Named constants — no magic numbers in JSX.
 * ------------------------------------------------------------------------- */

/**
 * Max featured chairs on the homepage. 8 = two full rows at `lg:grid-cols-4`
 * and divides by 2/4, so the last row is never ragged at any breakpoint.
 */
export const HOME_FEATURED_PRODUCTS = 8;

/**
 * Max featured brands on the homepage. 6 divides by 1/2/3, so the last row is
 * never ragged at `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`.
 */
export const HOME_FEATURED_BRANDS = 6;

/**
 * Hero media asset (a shipped placeholder under `/public`), or `null` to render
 * the token-tinted glyph panel instead of a broken `<img>`. No real photography
 * exists yet, so this is `null` in Phase 1; set it to a public path when a hero
 * image lands and the Hero renders it via `next/image`.
 */
export const HERO_IMAGE: string | null = null;

/* ------------------------------------------------------------------------- *
 * Showroom config (Option A): address/hours copy lives in the `showroom` page
 * BODY (StaticPageBody); the map link/image live here in config with a graceful
 * fallback. A static image or maps deep-link only — no map SDK (CSP posture,
 * AC-18). `null` on either means the map slot degrades (glyph panel / omitted
 * link) while the address+hours text ALWAYS renders.
 * ------------------------------------------------------------------------- */

/**
 * A maps deep-link (Google/Apple Maps) for the showroom, or `null` to omit the
 * "Ver en mapas" affordance. No real address is configured in Phase 1, so this
 * is `null`; set it to a `https://maps.google.com/?q=...` (or `geo:`) URL when
 * the real location lands. Must be an absolute `https:`/`geo:` URL.
 */
export const SHOWROOM_MAP_URL: string | null = null;

/**
 * A static map IMAGE URL for the showroom (a plain `<img>`, no SDK), or `null`
 * to render the token-tinted pin-glyph panel instead of a broken image. `null`
 * in Phase 1.
 */
export const SHOWROOM_MAP_IMAGE: string | null = null;
