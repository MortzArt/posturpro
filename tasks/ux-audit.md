# UX Audit: T19 — Homepage rebuild + product condition grades

Stage 8 (UX). Stripe/Apple/Linear-caliber audit of the T19 surfaces: the rebuilt
13-section homepage (both locales, 320–1440px), the restyled shell (topbar /
header / footer / FAB) as it now wraps every other storefront page, the
GradeBadge + product card, the savings calculator, and the admin grade control.
Skills loaded: `impeccable` (context.mjs + SKILL.md), `emil-design-eng`,
`apple-design`, `improve-animations`/review-animations STANDARDS for the motion pass.

## Summary

- Components audited: 18 (page.tsx, hero/home-hero/hero-stats/cert-tag, brand-bar,
  values-impact, process-steps, b2b-section, social-proof, savings-calculator,
  trust-faq, cta-banner, site-topbar/header/footer, mobile-nav, grade-badge,
  product-card, admin product-form)
- Issues found: 4 real (🔴 1, 🟡 1, 🟢 2) + BUG-1 (blocking, from QA)
- Issues fixed: 4 + BUG-1 (all fixed)
- Deferred: 1 (cross-cutting shadcn base `transition-all` — pre-existing, out of T19 scope)
- Audit-agent findings triaged: 20 raised → 4 real, 16 false-positives/by-design (dismissed with reasons below)

## BUG-1 resolution (MUST-FIX from QA — RESOLVED)

**Symptom:** header overflowed ~238px of horizontal page scroll at exactly the
`md` breakpoint (768px). Root cause: the restyled header switched on its FULL
desktop chrome at `md` — 4-item nav + inline search + segmented locale toggle +
the new orange "Business quote" CTA — but that cluster only fits at `lg`.

**Fix (coordinated tablet-layout decision): keep the compact mobile pattern through
the entire tablet range; promote desktop chrome to `lg`.** The mobile-nav drawer
already carries the full nav + the orange CTA, so tablet users get every
destination via the hamburger — no capability lost, no scroll.

Changes:
- `src/components/layout/site-header.tsx:66` nav `md:flex` → `lg:flex`
- `src/components/layout/site-header.tsx:87` inline search `md:ml-6 md:flex` → `lg:ml-6 lg:flex`
- `src/components/layout/site-header.tsx:99-120` right cluster: `md:ml-2`→`lg:ml-2`, compact toggle `md:hidden`→`lg:hidden`, segmented toggle `hidden md:inline-flex`→`hidden lg:inline-flex`, CTA `hidden md:inline-flex`→`hidden lg:inline-flex`
- `src/components/catalog/search-box.tsx:105` header-variant collapse icon `md:hidden` → `lg:hidden` (site-header is its only `variant="header"` consumer; catalog toolbar uses `variant="toolbar"` and is unaffected)
- `src/components/layout/mobile-nav.tsx:44` `MD_BREAKPOINT_PX = 768` → `DESKTOP_BREAKPOINT_PX = 1024`; trigger `md:hidden` → `lg:hidden`; matchMedia auto-close now uses the `lg` boundary so header + drawer never disagree
- `e2e/responsive-motion.spec.ts:22-35` removed the `test.fixme(width === 768)` guard; the 768px no-overflow case is now a real assertion

**Verified:** the previously-skipped `no overflow at tablet 768px` now PASSES on
both chromium and mobile projects; 320 / 375 / 1280 still clean.

## Findings

### 🔴 Critical UX Issues

1. **`src/components/home/hero.tsx:56` — B2B page primary CTA rendered GREEN, not orange (AC-13 violation).**
   The shared `Hero` (sole consumer: `/empresas`, T19 in-scope for the site-wide
   CTA-orange mandate) used the default green `bg-primary` for its primary CTA
   ("Cotización" → `#cotizacion`). AC-13 requires *every* primary CTA across the
   storefront — homepage, catalog, PDP, cart/checkout, **B2B** — to use the orange
   `--cta` token. A green primary CTA on the business page breaks the site-wide
   "orange = primary action" affordance the whole rebuild establishes.
   **Fixed:** added `variant="cta"` to the Hero primary button (`hero.tsx:56`).
   The homepage `HomeHero` already used `variant="cta"` correctly, so this closes
   the last gap. (User impact: consistent, learnable primary-action color everywhere.)

### 🟡 Major UX Issues

2. **`src/components/home/cta-banner.tsx:29` — primary CTA focus ring near-invisible on the green banner.**
   The closing CTA banner is a deep-green band. Its secondary (mint) button carried
   `focus-visible:ring-primary-foreground/60` so its focus ring reads on green, but
   the primary orange button did NOT — it fell back to the default `--ring` (a green),
   which is near-invisible against the deep-green background. A keyboard user tabbing
   to the primary CTA had no visible focus indicator (WCAG 2.4.7 concern).
   **Fixed:** added `focus-visible:ring-primary-foreground/60` to the primary CTA so
   both buttons on the band share a light, visible focus ring (`cta-banner.tsx:33`).

### 🟢 Polish Items

3. **Header/drawer breakpoint cohesion (part of BUG-1 fix).** Beyond fixing the
   overflow, promoting the whole chrome switch to a single `lg` boundary — header
   controls AND the mobile-nav matchMedia auto-close — removes a latent class of
   "drawer open while desktop nav also showing" glitches in the 768–1023 band.
   **Fixed** as described in BUG-1.

4. **Search collapse-icon breakpoint documented.** The `variant="header"` collapse
   button's breakpoint is now explained inline (why `lg`, not `md`) so a future
   editor doesn't "helpfully" revert it and reintroduce BUG-1. **Fixed** (comment
   at `search-box.tsx:100-104`).

## Triage of automated audit-agent findings (16 dismissed)

The delegated read-only audit (haiku) raised 20 items; 4 were real (above). The
rest were verified against source and dismissed:

| # | Claim | Verdict |
|---|-------|---------|
| 1 | `button.tsx` uses `transition-all` | TRUE but **DEFERRED** — it's the shared shadcn base component (site-wide, pre-T19). Rule 3 (never replace shadcn) + out of T19 scope. Noted for a future perf ticket. |
| 2 | admin form hardcodes "Cancelar"/"Guardar"/"Guardando…" | Admin is es-MX-only by product decision (PRODUCT.md); admin i18n is explicitly out of scope. Not a T19 defect. |
| 3 | hero image fallback loses alt context | FALSE — the fallback glyph is intentionally `aria-hidden` (placeholder tile, AC-21 "tasteful non-photo fallback"); announcing a non-existent image would be noise. Correct by design. |
| 4 | calculator Select trigger has no accessible name | FALSE — `<label htmlFor="calc-model">` is associated to `SelectTrigger id="calc-model"`; the trigger has an accessible name. `aria-live="polite"` on results is present. |
| 5 | live region fires per keystroke | Not observable — Select commits one value per selection, not per keystroke; no throttle needed. |
| 6 | section-header link has no hover | FALSE — `hover:text-foreground` + `.link-arrow` nudge present (`section-header.tsx:32`). |
| 8 | cta-banner primary ring | REAL → **fixed** (finding 2). |
| 9 | impact-strip `<dl>` dt/dd order "wrong" | FALSE — `<dt>`=figure, `<dd>`=label is a valid, common stat pattern; ARIA does not mandate label-first. |
| 10 | calculator section has no id/anchor → `#calculadora` broken | FALSE — `page.tsx:206` `<Section id="calculadora">` applies `scroll-mt-28`. Anchor works. |
| 11 | FAQ accordion unlabeled | Accordion sits inside a `<section>` with its own heading; landmark + heading give context. Acceptable. |
| 12 | product name `line-clamp-2` truncates | By design (grid density); full name is on the PDP. Standard e-commerce pattern. |
| 7,13,14,15,16,17,18,19,20 | misc (topbar list role, process-step numerals `aria-hidden`, grade-badge max-w, dark-mode guard, key-by-value, cert-tag role) | All by-design or non-defects; storefront is light-only by identity, decorative numerals correctly `aria-hidden`, grade-badge truncation is corner-safe at 320px (opposite corner from stock badge, each `max-w-[45%]`). |

## States Audit

| Component | Loading | Empty | Error | Success | Mobile | A11y |
|-----------|---------|-------|-------|---------|--------|------|
| Homepage (server) | ✅ resolved server-side | ✅ catalog hides on no products / read fail | ✅ silent degrade | ✅ | ✅ | ✅ h1×1, 16×h2 |
| SiteHeader | n/a | n/a | n/a | n/a | ✅ (BUG-1 fixed) | ✅ focus rings, nav aria |
| SiteTopbar | n/a | n/a | ✅ WA-guarded | n/a | ✅ scroll-x 320 | ✅ focus ring on green |
| SiteFooter | n/a | ✅ WA→plain text fallback | ✅ | n/a | ✅ 1→2→5 col | ✅ 11.59:1, per-col nav aria |
| SavingsCalculator | n/a | ✅ edge-9 clamp/floor | ✅ /0 guard | ✅ instant recompute | ✅ rows stack | ✅ aria-live, labeled select |
| GradeBadge | n/a | ✅ null→nothing (no gap) | ✅ unknown→nothing | n/a | ✅ max-w-45% | ✅ colorblind-safe (letter carries meaning) |
| ProductCard (grade+stock) | ✅ next/image | ✅ | ✅ glyph fallback | n/a | ✅ opposite corners @320 | ✅ focus ring+offset |
| B2B quote form (reused T16) | ✅ pending btn | n/a | ✅ inline+banner+retry | ✅ banner+focus | ✅ | ✅ |
| Admin grade select | n/a | ✅ "none" default | ✅ inline field error | ✅ round-trips | ✅ | ✅ labeled |

## Accessibility Audit

| Check | Status | Details |
|-------|--------|---------|
| Focus rings | ✅ | Visible everywhere; **fixed** the one gap (cta-banner primary on green). Topbar/footer use light ring on green fields. |
| Aria labels | ✅ | Icon-only controls (hamburger, close, search-open, WA links) all labeled; decorative glyphs `aria-hidden`. |
| Color contrast | ✅ | CTA orange fg = dark-brown 5.30:1 (white would be 3.34:1, rejected); white-on-green 11.59:1; mint-on-green 10.45:1. All AA. |
| Keyboard nav | ✅ | Tab path topbar→header→sections→footer; drawer focus-trap + Esc + restore; FAQ native `<details>`; calculator select keyboard-operable. |
| Live regions | ✅ | Calculator results `aria-live="polite"`. |
| Heading hierarchy | ✅ | Exactly one `<h1>` (hero); sections use `<h2>`; no skipped levels. |
| Color-only signaling | ✅ | Grade badge carries the letter (A+/A/B) not just color; stock badge has text; status glyph+text. |
| Reduced motion | ✅ | `.enter-fade`/`.stagger`/`.calc-bar-fill`/`.faq-chevron` all gated to instant under `prefers-reduced-motion: reduce`. |
| Touch targets ≥44px | ✅ | Hamburger size-11, compact toggle h-11, drawer CTA size-lg, drawer toggle h-11. |

## Motion pass (review-animations STANDARDS)

All clean: enters use `ease-out`; only `transform`/`opacity` animated; CSS
transitions (interruptible), no keyframes on rapid UI; no `scale(0)` entrances;
no animation on keyboard-initiated actions; `.calc-bar-fill` 400ms is a documented
EXPLANATORY exception (the bar IS the value-prop demonstration), `transform-origin:
left center` so bars grow from the left; every motion class has a reduced-motion
guard. No changes required.

## Copy Review

No copy changes were required. All user-visible strings route through next-intl
(`home.*`, `topbar.*`, `header.*`, footer, `product.grade.*`, calculator labels)
in both es-MX and en, per the mockups (verified: full parity, no hardcoded UI
copy in the audited T19 components; brand names like "Herman Miller" are proper
nouns, correctly literal). Placeholder-figure asterisk disclaimers render subtly
(small, `text-muted-foreground/80`) under the impact strip, social proof,
calculator, and cert-tag. No media-note boxes leak into the DOM (verified in
rendered HTML). MXN prices shown in both locales via `formatMXN`.

## Per-breakpoint verdicts

| Width | Verdict |
|-------|---------|
| 320px | PASS — no horizontal scroll; topbar scrolls-x, grids stack, badges corner-safe, footer 1-col |
| 375px | PASS — mobile pattern, drawer nav, full-width CTAs |
| 768px | **PASS (BUG-1 FIXED)** — compact chrome retained through tablet; hamburger drawer carries nav+CTA; zero overflow (was 238px) |
| 1024px | PASS — desktop chrome activates (nav + inline search + segmented toggle + orange CTA) with room |
| 1440px | PASS — max-w container centered, comfortable rhythm |

Both locales (es-MX longer copy) verified: es-MX homepage renders 1×h1, 16×h2,
1×Organization + 1×WebSite JSON-LD (AC-24 preserved), no media-note leak.

## Gate results

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | **0 errors** |
| ESLint (all touched files) | **clean** |
| `vitest run` (unit) | **2182 passed / 0 failed** (133 files) |
| `next build` (e2e prod bundle, with CTA changes) | **success** |
| E2E touched set (responsive, home, empresas-quote, product-grade, theme-firewall, mobile-nav, i18n-toggle, whatsapp-and-footer) — chromium + mobile | **66 passed / 0 failed / 0 skipped** — incl. the un-fixme'd 768px BUG-1 assertion |

## UX Score: 9/10

The T19 build is genuinely high-craft: token-driven palette, colorblind-safe
grade system, CSP-safe reduced-motion-aware calculator, config-gated WhatsApp,
graceful degradation on every read path, and a motion layer that meets the
STANDARDS bar with documented exceptions. The one blocking responsive defect
(BUG-1) is resolved with a coordinated, capability-preserving tablet decision.
Held back from 10 only by the pre-existing shared-button `transition-all` (out of
T19 scope, flagged for a future perf ticket) and the fact that the CTA-color and
focus-ring gaps existed at all — both now fixed.

## Verdict: PASS
