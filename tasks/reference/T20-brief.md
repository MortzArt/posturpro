# T20 Brief — Storefront restyle in the Factorial design language (Phase A: homepage only)

Owner request recorded 2026-08-27 (verbatim intent):
- Change the LAYOUT and STYLE of the website — storefront only, **NOT the admin panel**.
- Reference: **https://factorialhr.com/factorial-it** — investigate it and copy its style.
- KEEP: current brand colors (deep green #094220, brand green #0f7f3c, CTA orange #f95326
  with its dark AA foreground) and the current logo (`public/brand/logo.svg`, `icon.svg`).
- REPLACE the muted-green/mint (#e7f7ed) surface tinting with **pure white** backgrounds.
- **Phase A (this task): homepage only** — owner reviews and approves before anything else.
- **Phase B (separate, only after explicit owner approval): roll the approved style across
  the whole storefront** (catalog, PDP, cart, checkout, /empresas, static pages, 404).

## Constraints
- Content does not change: the T19 homepage sections, copy (both locales), data wiring
  (real products, grade badges, T16 quote form embed, calculator) all stay. This is a
  layout/style pass, not a content pass.
- Admin firewall holds: `/admin` keeps its neutral theme untouched.
- Style source: `tasks/reference/factorial-style-analysis.md` (produced by live
  investigation of the reference page) — typography scale, spacing rhythm, nav pattern,
  card/button/radius/shadow grammar, section layouts, footer pattern.
- Brand palette mapping: wherever Factorial uses its coral/red accents → our CTA orange;
  its dark ink → our deep green where it's identity, neutral ink where it's text;
  its tinted surfaces → pure white with borders/shadows per the Factorial grammar.
- Keep all shipped quality bars: AA contrast, reduced-motion, 320px+, i18n both locales,
  T13/T14 SEO/JSON-LD, CSS file-size caps (css-line-count.test.ts), strict TS.
- Fonts: Factorial uses proprietary fonts — do NOT copy fonts verbatim; choose the closest
  match already available via next/font/google, or keep current fonts if the design stage
  judges them closer. No layout-shift regressions from font swaps.
- The T19 grade badges, placeholder figures + disclaimers, and client questionnaire
  workflow all survive the restyle.

## Approval gate
Phase A ends with the homepage restyled and running locally for owner review.
Do NOT touch other storefront pages beyond what the shared shell (header/footer/topbar)
unavoidably changes — the shell IS in scope since the homepage renders inside it, and
other pages inheriting the new shell is acceptable/expected, but page-level restyles of
non-home pages are Phase B.
