# Code Review + Fix: T20 — Storefront restyle in the Factorial design language (Phase A)

## Summary

High-quality, disciplined presentation-only restyle. The admin font/theme firewall
is airtight, content/i18n/logic/SEO are byte-frozen, and token discipline holds
across all 18 component files. Two issues were found and fixed inline: a dead
`--tint-orange` token (clean-code) and a cert-tag card radius that deviated from the
binding ui-design radius map (spec fidelity). All gates green after fixes.

## Issues Found & Resolved

### Critical Issues

None.

### Major Issues

#### M-1: cert-tag "small info card" radius off-spec (rendered ~29px)

- **Severity**: MAJOR (spec fidelity — visible)
- **File**: `src/components/home/cert-tag.tsx:23`
- **Problem**: The cert-tag chip used `rounded-2xl`. With the T20 storefront
  `--radius:1rem`, the `@theme inline` radius map computes `--radius-2xl` =
  `calc(1rem * 1.8)` = **~28.8px**. The binding ui-design spec (A.5, line 145 +
  line 254) mandates **radius-12 (`rounded-md` ≈ 12.8px) for small info cards**;
  floating cards are radius-16. A ~29px chip radius reads visibly wrong against the
  Factorial grammar and violates the radius map the whole re-skin is driven from.
- **Impact**: Off-brand overly-round overlay chip on the hero image on every
  homepage load, in both locales — the exact "single homepage" the owner is being
  asked to approve.
- **Fix Applied**: Changed `rounded-2xl` → `rounded-md` (0.8 × 16 = ~12.8px ≈
  radius-12), keeping the `--shadow-factorial` layered shadow and `bg-card/95`.
  Now matches ui-design A.5 line 145/254 exactly.
- **Status**: FIXED

### Minor Issues

#### m-1: Dead `--tint-orange` token

- **File**: `src/app/globals.css:271` (removed)
- **Problem**: `--tint-orange` was defined in the `.theme-storefront` token block
  but never consumed anywhere (grep across `src` returned only its own definition
  line). Violates CLAUDE.md no-dead-code. The warm tint is expressed only inside
  the `--gradient-factorial` stops; no standalone orange canvas exists in Phase A.
- **Fix Applied**: Removed the token and its trailing comment; rewrote the tint
  comment to document that the warm counterpart lives only in the gradient stops
  (no standalone orange canvas in Phase A). `--tint-green` retained (used by
  home-hero + values-impact).
- **Status**: FIXED

#### m-2: `.gradient-band` and `.gradient-banner` are identical rule bodies

- **File**: `src/app/theme-storefront.css:71-75`
- **Suggestion**: Both selectors set `background: var(--gradient-factorial)` with
  no other difference. Could be a single grouped selector.
- **Status**: SKIPPED — both are used, semantically distinct (calculator *band* vs
  closing CTA *banner*), and keeping them separate leaves room for per-surface
  divergence in Phase B. No correctness or size impact.

#### m-3: `key={index}` on the social-proof testimonials list

- **File**: `src/components/home/social-proof.tsx:39`
- **Suggestion**: Array-index key on a mapped list.
- **Status**: SKIPPED — pre-existing (untouched by this diff), carries an existing
  code comment, and the testimonials array is a fixed tuple that never reorders or
  filters. Not a T20 regression; out of scope for a presentation ticket.

## Acceptance Criteria Verification

| #     | Criterion | Status | Evidence |
| ----- | --------- | ------ | -------- |
| AC-1  | DM Sans loaded + rendered for all home/shell text | PASS | `fonts.ts:42` `DM_Sans` weights 400/500/600/700 latin+latin-ext; `theme-storefront.css:22-24` scoped body-face override; `layout.tsx:110` injects `dmSans.variable` on storefront `<html>` only |
| AC-2  | Heading 700 / −0.04em / ~1.1 leading; body 400/1.5/0 secondary ink; small −0.02em | PASS | `home-hero.tsx:47` `tracking-[-0.04em] leading-[1.08]`; body `text-base leading-relaxed text-muted-foreground`; small utilities `tracking-[-0.02em]` (hero-stats, cert-tag, footer) |
| AC-3  | No uppercase on home/shell headings/eyebrows/labels/footer/nav | PASS | grep `uppercase` across `src/components/home` + `src/components/layout` + `page.tsx` = zero hits |
| AC-4  | Libre Caslon no longer renders on home/shell | PASS | `globals.css:257` rebinds `--font-heading-family` → DM Sans under `.theme-storefront`; no serif class in any home/shell file |
| AC-5  | /admin renders Inter, no DM Sans | PASS (code) | `admin/layout.tsx:28` `<html>` has `sans.variable` only; `<body>` has no `theme-storefront`; `--font-dm-sans` referenced only inside `.theme-storefront` rules |
| AC-6  | /admin colors/radius/layout unchanged | PASS | no diff under `src/app/admin/**`; `:root`/`.dark` blocks untouched (only `.theme-storefront` edited); admin `--radius:0.625rem` intact (`globals.css:115`) |
| AC-7  | Pure-white page; no alternating bands; ≤2 gradient moments | PASS | `page.tsx` `Section` dropped `bg` prop; only calculator `gradient-band` + CTA `gradient-banner` non-white |
| AC-8  | Brand palette + logo preserved | PASS | `.theme-storefront` `--primary`/`--cta`/hues unchanged; no logo files in diff |
| AC-9  | Orange only on primary CTAs; green carries links/checks | PASS | `cta` orange; checks/links `text-[var(--ring)]` (brand green) — b2b-section, trust-faq, section-header |
| AC-10 | Pills everywhere; primary orange +2px border; secondary ink-outline; ~.1s color hover no scale | PASS | `button.tsx` `cta rounded-full border-2`; `xl rounded-full`; `.pill-outline` 100ms color-only; base `transition-colors` |
| AC-11 | Floating cards radius-16 + triple shadow no border; small info radius-12; flat stat cards gray no shadow | PASS (after M-1) | `.factorial-card`/`.stat-card` radius 16; cert-tag now `rounded-md` (~12px); `--shadow-factorial` matches `0 -8px 16px / 0 16px 24px / 0 4px 8px` |
| AC-12 | Oversized naked stat numerals in flat gray cards | PASS | hero-stats `text-4xl/5xl 700 -0.04em`; values-impact figures in `.stat-card`; b2b `text-3xl` |
| AC-13 | FAQ bare hairline rows; native details; slug IDs + a11y preserved | PASS | `faq-accordion.tsx` `border-t` wrapper + per-row `border-b`; `<details>/<summary>` + focus ring intact; `faq-item-*` testids preserved |
| AC-14 | Factorial section rhythm via `Section` helper | PASS | `page.tsx:288-289` `py-10 sm:py-16 lg:py-28` default, `py-8 sm:py-10` band |
| AC-15 | White sticky hairline header + orange pill CTA; white hairline footer content unchanged; topbar + WhatsApp retained | PASS | site-header pill nav; site-footer `border-t bg-background text-foreground`, on-green classes removed, testids/copy frozen; topbar `bg-primary` retained |
| AC-16 | Mobile nav behavior/a11y unchanged, visual only | PASS | mobile-nav diff className-only; focus-trap/scroll-lock/ESC/auto-close-at-lg intact (full-read verified) |
| AC-17 | T19 copy/i18n/wiring/quote embed/calculator/SEO frozen | PASS | no message-file diff; product-card/grid untouched; savings-calculator diff = 2 style lines, `aria-live`/math intact; JsonLd untouched |
| AC-18 | Shared catalog product-card/grid not restyled | PASS | `git diff --stat` shows zero changes to catalog card/grid |
| AC-19 | Deep-link anchor IDs preserved w/ scroll-mt | PASS | `#catalogo`/`#calculadora` on Sections; `#impacto`/`#garantia`/`#cotizacion` on components; `scroll-mt-28` retained |
| AC-20 | AA contrast on all text/pills/tints | PASS | ink `oklch 0.28` + `muted-foreground oklch 0.44` on white ≥4.5; CTA warm-brown fg; tints background-only |
| AC-21 | reduced-motion respected; no new scroll reveals; hover ≤.15s ease-out interruptible | PASS | `.pill-outline` 100ms + reduced-motion guard; no new keyframes/scroll listeners |
| AC-22 | Usable at 320px, both locales | PASS (build/code) | responsive scale steps down; full-width stacked pills; latin-ext subset for accents |
| AC-23 | tests pass; css caps; strict TS; lint clean; file caps | PASS | 2175/2175; globals.css 320, theme-storefront.css 75; tsc exit 0; no new lint on touched files; largest touched 323 |
| AC-24 | No layout-shift from font swap | PASS | `display:"swap"` + fallback stack `DM Sans, Helvetica Neue, Helvetica, Arial, sans-serif` |
| AC-25 | build succeeds, runs locally | PASS | `npm run build` exit 0, 133/133 pages |

## Edge Case Verification

| # | Edge Case | Status | Evidence |
| - | --------- | ------ | -------- |
| 1 | Font leak into admin | HANDLED | `--font-dm-sans` on storefront `<html>` only; `.theme-storefront` on storefront `<body>` only; admin/not-found/global-error carry neither |
| 2 | Featured-products card shared with catalog | HANDLED | product-card/grid untouched; homepage styles at Section level |
| 3 | Other shared components leak to non-home | HANDLED | section-header keeps behavior; no page-level restyle of hero/featured-brands; shell/token inheritance acceptable per ticket |
| 4 | Featured-products omitted when zero products | HANDLED | `page.tsx` `products.length > 0 ?` guard intact; offline build 133/133 |
| 5 | es-MX longer strings + accents | HANDLED | latin-ext subset; responsive scale; `text-balance` headlines |
| 6 | CSS line-count cap | HANDLED | recipes split into `theme-storefront.css` (75); globals.css 320 (< 600) |
| 7 | reduced-motion + no new scroll reveals | HANDLED | `.pill-outline` reduced-motion guard; no new keyframes |
| 8 | Footer color ripples to every page | HANDLED | intended shell inheritance; white footer AA on white body (approval-gate flag) |

## Fix Summary

- Critical: 0/0
- Major: 1/1 fixed (M-1 cert-tag radius)
- Minor: 1/1 fixed (m-1 dead token), 2 skipped with justification (m-2, m-3)

## Gates (post-fix)

- `tsc --noEmit`: PASS (exit 0)
- `eslint` (touched files): PASS — 0 errors/warnings on T20 files. The repo's
  11 errors / 151 warnings are all in `.claude/skills/**` vendored tooling +
  `src/components/admin/products/dropdown.tsx`, all pre-existing and untouched by T20.
- `vitest run`: PASS — 132 files / 2175 tests (incl. css-line-count)
- `npm run build`: PASS — exit 0, 133/133 pages (offline `fetch failed` catalog
  logs = designed DB-unreachable degradation)
- CSS caps: globals.css 320, theme-storefront.css 75 (both < 600 guidance)
- File caps: largest touched mobile-nav 323 (< 400 target)

## Quality Score: 9/10

## Recommendation: APPROVE

All 25 acceptance criteria PASS and all 8 edge cases HANDLED. The firewall — the
one security-relevant surface in this ui-only ticket — is airtight and verified
three ways (theme-class scope, font-var scope, admin-html inspection). Content
freeze is diff-verified. The two issues found (an off-spec ~29px cert-tag radius
and a dead token) were fixed inline and re-verified; both were craft/hygiene, not
correctness or firewall failures. One point withheld only because the cert-tag
radius slipped past dev self-review, indicating the radius map wasn't fully
cross-checked against the binding ui-design spec.
