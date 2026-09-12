# Image sources — license traceability (T15, Casa de Azulejo)

All lifestyle/editorial imagery below is **licensed stock from [Unsplash](https://unsplash.com)**.
The Unsplash License grants free use for commercial and non-commercial purposes
with **no attribution required** (attribution recorded here voluntarily, for
provenance). See <https://unsplash.com/license>.

Art direction (per `DESIGN.md` → Imagery art direction): bright, even **daylight**;
cool-neutral white balance so photos sit harmoniously beside the cobalt chrome;
one decisive chair or furnished workspace; no faces, no text, no thumbs-up clichés,
**no fabricated proof**. The cobalt frame is chrome around the photo, never a tint on it.

| File | Slot | Unsplash photo | Photographer | Profile | Aspect / size |
| --- | --- | --- | --- | --- | --- |
| `hero/green-chair-window-left.jpg` | Homepage hero media card (`HERO_IMAGE`) | — owner-supplied photo (green high-back executive chair by a factory window), not stock | PosturPro (owner) | — | ~1.1/1 · 1115×1000 · 252 KB (2026-09-12, mirrored v2) |
| `editorial/workspace.jpg` | Homepage editorial band (`EDITORIAL_BAND_IMAGE`) | `photo-1688578735427-994ecdea3ea4` | EFFYDESK | <https://unsplash.com/@effydesk> | 16/9 · 1800×1013 · 295 KB |
| `catalog/eleva-banner.jpg` | Catalog index banner (`CATALOG_BANNER_IMAGE`) | — owner-supplied marketing artwork (PosturPro poster: three chairs + slogan), not stock | PosturPro (owner) | — | ~3/1 · 1514×500 · 64 KB (owner export, 2026-09-12 v2) |
| `b2b/meeting-room-chairs-4x3.webp` | B2B `/empresas` hero (`B2B_HERO_IMAGE`) | — owner-supplied photo (grey leather executive chairs, chrome frames, white meeting table; owner-cropped 4/3 export), not stock | PosturPro (owner) | — | 4/3 · 800×600 · WebP (2026-09-13) |
| `b2b/quote-open-plan-office.jpg` | B2B `/empresas` quote-form companion (`B2B_QUOTE_IMAGE`) | — owner-supplied photo (open-plan office: rows of black mesh task chairs, teal acoustic baffles with linear lights, exposed concrete ceiling), not stock | PosturPro (owner) | — | ~4/5 · 790×1000 · 276 KB (2026-09-12) |
| `home/savings-chairs.jpg` | Homepage savings calculator, left column (`CALCULATOR_IMAGE`) | — owner-supplied render (two mesh task chairs, teal seats, dark studio), not stock | PosturPro (owner) | — | 1/1 · 800×800 · 76 KB (2026-09-12) |
| `home/cta-chairs.png` | Homepage closing CTA banner, left column (`CTA_BANNER_IMAGE`) | — owner-supplied render (three task chairs, transparent PNG), not stock | PosturPro (owner) | — | ~1.08/1 · 541×500 · 164 KB (2026-09-12) |

## Notes

- Downloaded via the `images.unsplash.com` CDN with `auto=format` + `fit=crop` at
  the resolutions above; each optimized to **≤300 KB** at the correct aspect ratio.
- **Local `/public` assets** — no external image host is used at runtime, so
  `next.config.ts` `images.remotePatterns` needs **no** new entry (AC-10).
- Every consuming slot still **degrades gracefully to the blank-tile placeholder**
  if its asset is removed (set the matching config constant back to `null`) —
  see `src/lib/config/imagery.ts`. Removing a file here does not break the build.
- To refresh art direction, replace the file in place (keep the path) or point the
  config constant at a new `/public` path. No layout rework required.
