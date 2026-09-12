/**
 * Editorial / lifestyle image slots (T15, AC-8/9 — Casa de Azulejo).
 *
 * Each slot is `string | null`. A non-null value is a `/public` path (or an
 * allow-listed remote URL) rendered via `next/image` inside a cobalt cartouche
 * frame; `null` degrades to a token-styled **blank-tile placeholder** in the
 * same reserved aspect box — never a broken `<img>`, never CLS (edge 3).
 *
 * Assets are licensed Unsplash stock (bright cool-neutral daylight, per
 * `DESIGN.md` art direction); provenance in `public/images/SOURCES.md`. Swap to
 * a different asset by editing the path, or set back to `null` for the blank
 * tile — no layout rework either way (asset-swap seam, AC-9). NEVER point a slot
 * at imagery that implies fabricated proof (AC-9, PRODUCT.md hard rule).
 *
 * The homepage hero (`HERO_IMAGE`) and showroom map (`SHOWROOM_MAP_IMAGE`) slots
 * live in `./static-pages` (their original home); these are the NEW T15 slots.
 */

/** Homepage ergonomics editorial band (16/9 mobile → 21/9 lg). */
export const EDITORIAL_BAND_IMAGE: string | null =
  "/images/editorial/workspace.jpg";

/**
 * Catalog index banner — the owner's "Eleva tu mobiliario. No tus costos."
 * poster (three chairs + slogan on a flat mint ground; supplied 2026-09-12).
 * The frame keeps its 42/9 shape; the ~3:1 artwork is CONTAINED (never
 * cropped — the slogan is baked in) and the frame is painted with the poster's
 * own ground colour (`CATALOG_BANNER_BACKDROP`) so the letterbox is invisible
 * and it reads as one wide banner. `null` → blank tile.
 */
export const CATALOG_BANNER_IMAGE: string | null =
  "/images/catalog/eleva-banner.jpg";

/** The poster's flat ground colour, sampled from its edges (all four corners). */
export const CATALOG_BANNER_BACKDROP = "#e8f5eb" as const;

/**
 * B2B `/empresas` hero image (frame is 4/3, matches `HeroMedia`; the source is a
 * portrait original that `object-cover` fills). Owner-supplied photo (2026-09-12):
 * a row of grey leather executive chairs with chrome frames at a white meeting table — the audience's scene, inside the cobalt cartouche frame. `null` degrades to the `HeroMedia` blank tile with a
 * BUILDING glyph (so the fallback reads "offices", not "single product"). Never
 * proof imagery (T16 AC-3, PRODUCT.md hard rule).
 */
export const B2B_HERO_IMAGE: string | null = "/images/b2b/meeting-room-chairs-portrait.jpg";

/**
 * B2B `/empresas` QUOTE-FORM companion image (owner request 2026-09-12): a
 * owner-supplied open-plan office with rows of task chairs, shown in a floating card to the LEFT of the form on
 * `lg+` (4/5 portrait, sticky) and below it on small screens (4/3). `null`
 * collapses the section back to the single-column form — no layout rework.
 */
export const B2B_QUOTE_IMAGE: string | null = "/images/b2b/quote-open-plan-office.jpg";

/**
 * Homepage savings-calculator companion image (owner request 2026-09-12): two
 * task chairs in a dark studio, filling the LEFT column of the calculator card
 * on `lg+` (the compare panel + result tile stack on the right). Square source,
 * cover-cropped. `null` collapses the card back to compare | result.
 */
export const CALCULATOR_IMAGE: string | null =
  "/images/home/savings-chairs.jpg";

/**
 * Closing CTA banner illustration (owner request 2026-09-12): three task chairs
 * on a TRANSPARENT ground (PNG), sitting on the banner's gradient to the LEFT of
 * the heading + CTAs on `lg+`, above them on small screens. `null` → the
 * centred text-only banner.
 */
export const CTA_BANNER_IMAGE: string | null = "/images/home/cta-chairs.png";
