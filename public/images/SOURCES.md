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
| `hero/ergonomic-chair.jpg` | Homepage hero (`HERO_IMAGE`) | `photo-1688578735352-9a6f2ac3b70a` ([TIOGOV5ZQzA-set](https://unsplash.com/@effydesk)) | EFFYDESK | <https://unsplash.com/@effydesk> | 4/3 · 1400×1050 · 154 KB |
| `editorial/workspace.jpg` | Homepage editorial band (`EDITORIAL_BAND_IMAGE`) | `photo-1688578735427-994ecdea3ea4` | EFFYDESK | <https://unsplash.com/@effydesk> | 16/9 · 1800×1013 · 295 KB |
| `catalog/workspace-banner.jpg` | Catalog index banner (`CATALOG_BANNER_IMAGE`) | `photo-1681418659069-eef28d44aeab` | EFFYDESK | <https://unsplash.com/@effydesk> | 21/9 · 1680×720 · 294 KB |

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
