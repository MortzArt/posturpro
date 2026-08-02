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

/** Catalog index banner art (21/9) — optional art slot on the `/sillas` index. */
export const CATALOG_BANNER_IMAGE: string | null =
  "/images/catalog/workspace-banner.jpg";

/**
 * B2B `/empresas` hero image (4/3, matches `HeroMedia`). A bright cool-neutral
 * office workspace furnished with task chairs — the audience's scene, inside the
 * cobalt cartouche frame. `null` degrades to the `HeroMedia` blank tile with a
 * BUILDING glyph (so the fallback reads "offices", not "single product"). Never
 * proof imagery (T16 AC-3, PRODUCT.md hard rule).
 */
export const B2B_HERO_IMAGE: string | null =
  "/images/b2b/office-workspace.jpg";
