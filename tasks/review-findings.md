# Code Review: T19 — Homepage rebuild + product condition grades

## Summary
Strong, defensively-written full-stack implementation. All 25 acceptance criteria are met (verified against actual code + the live local DB, not the dev summary). Backend migration is faithful to the 0005/0015 posture and idempotent; admin write/read round-trips the grade; all three storefront read paths project + guard it; i18n is at perfect parity (623/623 keys) with verbatim copy; SEO/JSON-LD preserved; calculator math is edge-safe. No Critical or Major correctness/security defects. The only Major is a process/rules issue: `globals.css` crossed the documented 1,000-line hard cap (1005) — not caught by tooling because ESLint does not lint CSS.

## Critical Issues (MUST FIX)
None.

## Major Issues (SHOULD FIX)

### M-1: `globals.css` exceeds the CLAUDE.md 1,000-line hard cap
- **ID**: M-1
- **Severity**: MAJOR
- **File**: `src/app/globals.css:1-1005` (was 927 pre-T19; T19 added the 3 motion classes at 954-1005)
- **Problem**: CLAUDE.md Clean Code rules state "Hard cap: no file over 1,000 lines — enforced by ESLint `max-lines` (error); split before you reach it." The file is now **1005 lines**. The ESLint `max-lines` rule (`eslint.config.mjs:26`) has no `files` restriction, but eslint-config-next never applies a config to `.css` — I verified `npx eslint src/app/globals.css` returns "File ignored because no matching configuration was supplied." So the tooling silently does NOT enforce the cap on this file, and lint passes despite the violation. The written rule is nonetheless breached.
- **Impact**: The single largest file in the repo, over the stated hard cap, growing with every feature's motion layer, with no CI guard to stop further growth. Future PRs will keep adding to it undetected.
- **Suggested Fix**: Extract the motion layer (all `@keyframes` + the `.enter-*`, `.stagger`, `.*-fill`, `.faq-chevron`, `.cta-press` classes and their reduced-motion blocks) into `src/app/motion.css` and `@import` it from `globals.css`, bringing both under 400. Log the split in `tasks/clean-code-backlog.md`. Optionally add a CSS line-count check to CI so the cap is actually enforced.
- **Status**: OPEN

## Minor Issues (NICE TO FIX)

### m-1: `.calc-bar-fill` / `.cart-progress-fill` transition is 400ms, over the 300ms UI-motion bar
- **File**: `src/app/globals.css:897, 982`
- **Problem**: `.claude/skills/review-animations/STANDARDS.md` sets "UI animations stay under 300ms," with an exception only for marketing/explanatory motion. The calculator savings bar is arguably explanatory (it demonstrates the value prop) and deliberately mirrors the already-shipped `.cart-progress-fill`, so it is defensible — but the comment at 893/978 only says "400ms ease-out" without invoking the exemption.
- **Suggestion**: Either drop to ~300ms, or amend the comment to explicitly justify it as explanatory motion so a future reviewer doesn't re-flag it. A progress-style reveal is also a candidate for `linear` per the STANDARDS easing table; `ease-out` on a one-shot mount reveal is acceptable.

### m-2: Non-null `!` used in two test files to silence `.find()`
- **File**: `src/lib/catalog/savings.test.ts:12` (`computeSavings(aeron!)`), `src/components/home/savings-calculator.test.tsx:41` (`...find(...)!`)
- **Problem**: CLAUDE.md: "the frontend never uses `any` or `!` to silence the compiler." These are in tests (lower stakes) and the arrays are statically non-empty, but the rule is worded absolutely.
- **Suggestion**: Replace with an explicit assertion (`const aeron = CALCULATOR_MODELS.find(...); expect(aeron).toBeDefined(); if (!aeron) throw ...`) or a small `assertDefined` test helper.

### m-3: `brand-bar` parses a display string on a hardcoded separator
- **File**: `src/components/home/brand-bar.tsx:14`
- **Problem**: `brands.split("·")` silently collapses to one "brand" if a translator ever changes the separator. `.filter(Boolean)` avoids empty `<li>`s but not a mistranslation.
- **Suggestion**: Add a `keys-used`-style assertion that the `brandBar` string contains `·`, or move the brand list to a config array rather than parsing a display string.

### m-4: Positional icon-to-card coupling
- **File**: `src/components/home/values-impact.tsx:35-40,72`, `src/components/home/social-proof.tsx`, `src/components/home/hero-stats.tsx:19`
- **Problem**: `CARD_ICONS[index]` and label-based keys (`stat.label`) rely on positional alignment / unique labels. If a 5th card is added to the tuple, `CARD_ICONS[4]` is `undefined` and renders nothing; if two placeholder stats ever share a label, React warns on duplicate keys (plausible during content iteration).
- **Suggestion**: Pair the icon with the card in one structure; key stats on a stable id/figure rather than the translatable label.

## Nits
- **n-1**: `page.tsx` co-locates a `Section` helper with the page shell — fine now (well under 400), extract to `src/components/home/section.tsx` if the page grows (SRP).
- **n-2**: Four separate `STAGGER_STEP_MS` constants (50/50/60/50) across section components — mild DRY smell; a shared motion-constants module with per-component overrides would centralize the "settles ≤ ~200ms" contract.
- **n-3**: Footer social/legal links are `href="#"` placeholders (`site-footer.tsx`), and `WHATSAPP_DISPLAY = "+52 55 1234 5678"` (`src/lib/config/shared.ts:85`) is a placeholder number rendered to users. Intentional per owner decision (tracked in the placeholder checklist) — must be resolved before go-live.
- **n-4**: `src/components/seo/json-ld.tsx:29-30` — the U+2028/U+2029 `.replace()` targets equal their replacements (no-ops); the `<` → escaped form is the one doing real work. Pre-existing (T14), not T19; the "XSS-safe single JSON-LD" claim still holds via the `<` escape.
- **n-5**: `.drawer-panel[data-state="closed"]` uses `pointer-events: none` without `!important` while the sibling scrim uses `!important` (`globals.css:309 vs 330`). Pre-existing (T2) asymmetry; near-zero impact (panel is translated off-screen).

## Acceptance Criteria Verification
| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| AC-1 | Enum `A+/A/B` + nullable `condition_grade`, no default | PASS | Migration 27-37; live DB: enum labels = `A+,A,B`; column `is_nullable=YES default=NONE` |
| AC-2 | `products_public` regen includes grade, omits `cost_price_cents`, keeps grant | PASS | View SQL 43-72 byte-identical to 0005 + `condition_grade`; live DB: view has `condition_grade`, no `cost_price_cents`; anon/authenticated = SELECT |
| AC-3 | 0015 grant posture, idempotent | PASS | Only `grant select on products_public` (76) + read-only revoke (79-80); applied twice cleanly on live DB |
| AC-4 | Existing rows NULL, no other data loss | PASS | `add column` no default/backfill; view additive; dev-verified 30 rows NULL |
| AC-5 | Admin select: none + A+/A/B, default none, hydrated on edit | PASS | `product-form.tsx:264-278`; hydrated `product-read.ts:92` |
| AC-6 | `parseProductInput` validates grade; `ProductParsed` gains field | PASS | `product-input.ts:95,222-223,291-300` |
| AC-7 | create/update persist grade + revalidate; round-trips | PASS | `product-write.ts:45,93` `.insert/.update(values)`; bust `CATALOG_CACHE_TAG`; read hydrates `?? ""` |
| AC-8 | Grade optional, no error when absent | PASS | `parseConditionGrade` ""→null; empty default |
| AC-9 | `conditionGrade` on card; projected in list, search, PDP | PASS | `queries-internal.ts:55,215`; `search.ts:166-189`; `product-detail.ts:66,258` |
| AC-10 | `<GradeBadge>` on card/PDP/home; null → nothing | PASS | `grade-badge.tsx:31`; card `:94-100`, PDP `:152-156` |
| AC-11 | Token-driven, distinct from stock badge, no overlap 320px | PASS | tokens only; `max-w-[45%] truncate`; opposite corners |
| AC-12 | `.theme-storefront` greens+mint, no cobalt, no hardcoded hex | PASS | green oklch tokens; no cobalt in active values; admin firewalled |
| AC-13 | `--cta` orange w/ AA fg, every CTA | PASS | #f95326/#2a1206 = 5.30:1 AA; cta variant everywhere; zero `text-white` on cta |
| AC-14 | Real logo header+footer, icon.svg favicon | PASS | SVGs exist; header `next/image` w/ alt; favicon metadata; footer white wordmark |
| AC-15 | Topbar msgs + WA link, i18n, 320px-safe | PASS | 3 i18n msgs; config-gated WA (never `wa.me//`); `overflow-x-auto` |
| AC-16 | Nav catalog/process/business/trust + orange CTA; 4+col footer | PASS | `nav-items.ts:23-28`; cta variant; 5-col footer + contact |
| AC-17 | FAB reused, config-gated, not duplicated | PASS | `WhatsAppButton` once (`layout.tsx:126`); others are text links |
| AC-18 | 13-section homepage in order + restyled cert-tag | PASS | `page.tsx` full composition + shell footer/FAB |
| AC-19 | Real featured via listProducts, badges, PDP links, degrades | PASS | `page.tsx:93`; catch→`[]`→omit; cards link `/producto/[slug]` |
| AC-20 | Every string next-intl both locales; MXN both | PASS | 623/623 parity; no hardcoded strings; `formatMXN` |
| AC-21 | No media-notes; nullable image fallbacks | PASS | no dashed boxes; `hero-image-fallback` glyph tile |
| AC-22 | Subtle asterisk disclaimers | PASS | small/muted beneath sections |
| AC-23 | Client calculator edge-safe, no reload, no inline script, 8%/0% | PASS | island; div-by-zero + floor + clamp guarded; config `as const`; no `<script>` |
| AC-24 | generateMetadata + Org/WebSite JSON-LD + alternates, once | PASS | `page.tsx:46-88`; `buildHomeJsonLd` = exactly 2 nodes, one render |
| AC-25 | lint/test/build pass; size caps; no any/!/empty-catch | PARTIAL | tsc 0, vitest 2155/2155, TS/TSX lint clean (all re-run by me). BUT globals.css 1005 > 1000 (M-1); two `!` in tests (m-2). No `any`, no empty catch |

## Edge Case Verification
| # | Edge Case | Status | Evidence |
|---|-----------|--------|----------|
| 1 | No grade → no badge/gap; admin "none" | HANDLED | conditional render; `defaultValue=""` |
| 2 | Invalid grade at read → nothing, no throw | HANDLED | `isConditionGrade` in all read paths + badge; DB enum rejects `'X'` (verified) |
| 3 | Tampered POST grade → field error, no write | HANDLED | `parseConditionGrade`→`grade-invalid`; aggregate check blocks |
| 4 | Catalog read fails → section hidden, page renders | HANDLED | `readFeaturedProducts` catch→warn→`[]`→omit |
| 5 | WA unconfigured → no `wa.me//`, links hide | HANDLED | `buildWhatsAppUrl` null → omitted; footer plain text; FAB null |
| 6 | Reduced motion → instant | HANDLED | every motion class has reduce block; `.stagger` neutralizes inline delay |
| 7 | 320px → stacks, no h-scroll | HANDLED | topbar `overflow-x-auto`; grids stack; badges `max-w-[45%]` |
| 8 | `/en` → EN copy, MXN unchanged | HANDLED | EN keys present; `formatMXN` locale-independent |
| 9 | Calc PosturPrice ≥ new price → clamp/floor | HANDLED | `Math.max(0,…)` + `Math.max(CALCULATOR_MIN_BAR_FRACTION,…)`; test passes |
| 10 | B2B double-submit → rate-limited | HANDLED | reuses T16 `checkQuoteRateLimit` unchanged |
| 11 | Honeypot → fake success, no email | HANDLED | reused T16; form only restyled |
| 12 | Grade + long name + low-stock @320px → no overlap | HANDLED | opposite corners; `max-w-[45%] truncate`; `line-clamp-2` |
| 13 | Migration re-run hosted → idempotent | HANDLED | applied twice on live DB cleanly; guarded enum + `if not exists` + drop/create |
| 14 | JSON-LD after rebuild → Org/WebSite once | HANDLED | `buildHomeJsonLd` = 2 nodes, one `<JsonLd>` |

## Quality Score: 9/10

## Recommendation: FIX-REQUIRED (Major: 1) — then APPROVE
Every acceptance criterion and edge case is met, verified against the live database and a full test/typecheck/lint re-run (not just the dev's claims). The single blocking item is M-1: `globals.css` (1005 lines) breaches the documented 1,000-line hard cap, and the breach is invisible to CI because ESLint does not lint CSS. Split the motion layer out of `globals.css` (and ideally add a CSS line-count guard). The Minor items are non-blocking cleanups. Once M-1 is resolved this is ship-ready.

### Severity Counts
- Critical: 0
- Major: 1 (M-1)
- Minor: 4 (m-1..m-4)
- Nit: 5 (n-1..n-5)
