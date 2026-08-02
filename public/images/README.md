# `public/images/` — storefront lifestyle/editorial assets (T15)

Home for config-driven marketing imagery (hero, editorial band, catalog banner,
showroom map). **Not** product imagery — product covers/galleries come from the
DB via `next/image` (picsum/Supabase, allow-listed in `next.config.ts`).

## How the slots work

Each slot is a `string | null` constant in **`src/lib/config/imagery.ts`**:

- **Set** to a `/public` path (e.g. `/images/hero/ergonomic-chair.jpg`) → the
  consumer renders it via `next/image` inside a cobalt cartouche frame.
- **`null`** → the consumer degrades to a token-styled **blank cobalt tile**
  (a `bg-muted` panel with a centered line-glyph) in the same reserved aspect
  box. Never a broken `<img>`, never layout shift (zero CLS either way).

```
public/images/
  hero/       # homepage hero (4/3)          → HERO_IMAGE
  editorial/  # homepage ergonomics band (16/9) → EDITORIAL_BAND_IMAGE
  catalog/    # catalog index banner (21/9)   → CATALOG_BANNER_IMAGE
  showroom/   # showroom map / storefront photo (16/9) → SHOWROOM_MAP_IMAGE
```

## Adding or swapping an asset

1. Drop the optimized file (≤300 KB, correct aspect ratio, bright cool-neutral
   daylight per `DESIGN.md`) into the matching folder.
2. Point the constant in `src/lib/config/imagery.ts` at its `/public` path.
3. Record its source + license in `SOURCES.md`.

No `next.config.ts` change is needed for local `/public` assets. **Never** add
imagery a visitor could mistake for real proof (testimonials, review counts,
crowds implying sales volume) — hard rule (AC-9, `PRODUCT.md`).
