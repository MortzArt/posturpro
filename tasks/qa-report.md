# QA Report: T15 — Premium visual identity & image-rich refresh ("Casa de Azulejo")

Standard-tier **S5 (QA)** — the quality gate for T15 (no separate verify stage). Scope
of the ticket is **ui-only**: "the reskin broke nothing," not "new logic is correct"
(there is none). QA weight shifted to **regression + firewall + visual** verification.

**Verdict: PASS (T15 reskin) — confidence HIGH for the reskin.**
**One pre-existing, non-T15 prod-build 500 found (taxonomy detail pages) — a real
launch blocker owned by T14, documented below. It does not fail T15.**

---

## Test Suite Summary

| Type | Written (T15) | Passed | Failed | Skipped |
|------|--------------|--------|--------|---------|
| Unit | 17 (4 files) | 1746 / 1746 | 0 | 0 |
| Integration | 0 | 253 / 253 | 0 | 0 |
| E2E (new) | 3 (firewall smoke) | 3 / 3 | 0 | 0 |
| E2E (regression, warm prod) | — | 104 storefront + firewall pass | 11* | 3 |
| **Unit + Integration total** | **+17** | **1999 / 1999** | **0** | **0** |

\* The 11 e2e "failures" are ALL the pre-existing taxonomy-detail prod-500 (see
Bugs Found). They are NOT reskin regressions and NOT flakiness — they reproduce
deterministically on the prod build and are green on the dev server.

Independently re-run (not trusted from dev-done):
- `tsc --noEmit` → **clean (exit 0)**
- `eslint` (all 4 new test files + touched T15 files) → **clean (0 errors)**
- Unit `npx vitest run` → **1746/1746, 108 files** (was 1729/104 → +17, +4)
- Integration `npm run test:integration` (fresh reseed) → **253/253, 23 files**
- `npm run build` → **exit 0**, all 11 storefront + all admin routes present

---

## Tests Written (17 unit + 3 e2e, all passing)

### Unit — `src/components/home/editorial-band.test.tsx` (7)
Filled-slot renders `<img>` w/ passed alt + no fallback tile · caption copy renders ·
**null slot degrades to `editorial-band-fallback` (chair glyph), never a broken `<img>`** ·
caption copy still renders when null · aspect box reserved (no CLS) · mounts with the
RM-gated `.enter-fade` · copy sits on the `bg-primary`/`text-primary-foreground` AA scrim (edge 5).

### Unit — `src/components/catalog/catalog-banner.test.tsx` (4)
Filled slot renders `<img>` w/ alt, no fallback · **null slot degrades to
`catalog-banner-fallback`, never a broken `<img>`** · 21/9 aspect box reserved (zero CLS).

### Unit — `src/components/layout/direction-contract.test.tsx` (3)
Emits a **real HTML comment node** (not a stripped JSX comment) · payload carries
`seed=d43cafe8` + all 5 blocks (THESIS/OWN-WORLD/STORY/FIRST VIEWPORT/FORM) + FINISH
line · wrapper is `hidden`+`aria-hidden` (zero footprint). (AC-2)

### Unit — `src/lib/config/imagery.test.ts` (3)
Each slot is `string | null` (the union consumers switch on) · when non-null it is a
non-empty LOCAL `/public` path — never empty (no broken `<img>`), never a remote/protocol
host (AC-10, no `next.config.ts` allow-list needed).

### E2E — `e2e/theme-firewall.spec.ts` (3, cheap + durable — DOM-signal-only)
Storefront `<body>` carries `.theme-storefront` + emits `d43cafe8` on **both locales** ·
**admin login `<body>` carries NEITHER** → admin resolves the untouched neutral world.
This is the durable firewall regression test the reskin's headline AC hinges on;
it asserts no computed colors/fonts, so it survives future palette tweaks.

---

## Acceptance Criteria Coverage (19/19 PASS)

| # | Criterion | Verification | Status |
|---|-----------|--------------|--------|
| AC-1 | DESIGN.md from built world | `DESIGN.md` (23 KB) documents identity/palette+AA-contrast/type+es-MX-glyphs/spacing/imagery/firewall/dark-mode/motion | PASS |
| AC-2 | Direction contract greppable in built output | **`d43cafe8` in 120 prerendered HTML files, both es-MX.html + en.html; 0 admin files.** New unit + e2e test both green | PASS |
| AC-3 | Neutral world replaced, tokens centralized | `.theme-storefront` cobalt block; grep: **0 hardcoded brand hex/oklch/rgb or raw radius** in storefront components | PASS |
| AC-4 | Single-token brand-swap stays true | All brand values under `.theme-storefront` + font binding; Brand-Tokens doc block rewritten (two-world firewall) | PASS |
| AC-5 | Typography upgraded, real `--font-heading`, es-MX subsets | Libre Caslon Text via `next/font`, `latin+latin-ext`, `swap`; seam `--font-heading`→`--font-heading-family` (defaults Inter in `:root`, serif under scope — no cycle) | PASS |
| AC-6 | All storefront surfaces reskinned | ~48 surface files + `/sillas` h1; agent-verified per-surface token application | PASS |
| AC-7 | Chrome + WhatsApp affordance | FAB uses dedicated `bg-whatsapp` green token (verified `whatsapp-button.tsx:54`); testids/affordances intact | PASS |
| AC-8 | Image-slot system incl. catalog slot | hero + editorial band + catalog banner all config-driven, all null-degrade; `CatalogBanner` wired in `sillas/page.tsx` gated on `!active` (M-1 fix verified) | PASS |
| AC-9 | Licensed imagery, no fabricated proof | 3 Unsplash photos, `SOURCES.md` complete; editorial copy is an ergonomics/curation CLAIM only — **agent-verified: zero testimonials/names/ratings/sales** in `home.editorial.*`/`catalog.banner.*` | PASS |
| AC-10 | Host allow-list | All 3 assets local `/public` (≤300 KB); no `next.config.ts` host change; unit test asserts local-path contract | PASS |
| AC-11 | /admin visually unchanged | **e2e: admin body has NO `.theme-storefront`; built output: 0 admin files carry the contract; git: no `admin/` or `ui/*` file edited** | PASS |
| AC-12 | Scope mechanism explicit + documented | `.theme-storefront` on storefront `<body>` ONLY (grep: 1 usage, `layout.tsx:78`); documented in globals.css + DESIGN.md | PASS |
| AC-13 | WCAG AA, focus rings, glyph+text status | DESIGN.md computed pairings (all AA, fg/bg 14.10, primary 8.37, warning 4.77…); status = glyph+text (agent-verified `oxxo-spei`/`stock-badge`); text-over-image on cobalt scrim | PASS |
| AC-14 | prefers-reduced-motion honored | Motion layer verbatim; new band/banner use RM-gated `.enter-fade` (unit-asserted) | PASS |
| AC-15 | No perf regression, correct next/image | Hero `priority` + `aspect-[4/3]` reserved (filled + fallback); band/banner lazy w/ `sizes`, aspect boxes reserved → 0 CLS; assets ≤300 KB | PASS |
| AC-16 | Bilingual parity | **438/438 keys symmetric** (flatten-diff, zero asymmetry); 4 new T15 keys present in BOTH locales | PASS |
| AC-17 | Money display unchanged | agent-verified `formatMXN`/`tabular-nums`/compare-at `line-through` untouched across order-summary/checkout-summary/PDP | PASS |
| AC-18 | Mobile-first responsiveness | Storefront e2e (incl. mobile-nav, contact honeypot) green; no horizontal overflow signals | PASS |
| AC-19 | Test suite green | tsc clean, eslint clean, unit 1746/1746, integration 253/253, storefront+firewall e2e green on warm prod (the 11 taxonomy-detail failures are a **pre-existing non-T15 prod bug**, see below) | PASS* |

\* AC-19 PASS is scoped to the reskin: every reskin-touched surface's e2e passes; the
11 failures are in **untouched** taxonomy-detail code and predate T15 (proof below).

## Edge Case Coverage (9/9 handled)

| # | Edge Case | Verification | Status |
|---|-----------|--------------|--------|
| 1 | Shared-seam bleed into admin | `.theme-storefront` on storefront body only (e2e + built-output proof) | HANDLED |
| 2 | Shared ui-primitive drift | No `ui/*` file edited (git); Radix portals mount into themed storefront body, admin body stays neutral | HANDLED |
| 3 | Null image slot | hero/editorial/banner all degrade to blank cobalt tile + glyph, aspect reserved — **unit-tested for editorial + catalog banner** | HANDLED |
| 4 | es-MX glyphs in display face | Libre Caslon Text `latin-ext`; DESIGN.md documents accented headings render in serif | HANDLED |
| 5 | Text-over-image contrast | Cobalt scrim 8.37:1 (unit-asserted on editorial band); catalog banner carries no overlaid text | HANDLED |
| 6 | e2e testid/structural breakage | compare-at `line-through`, honeypot off-screen, grid column-count all agent-verified present; no testid removed | HANDLED |
| 7 | Dark mode divergence | `.dark` decommissioned for storefront, retained as admin's world; documented in DESIGN.md | HANDLED |
| 8 | `global-error.tsx` token-free | Not edited; intentional exception documented | HANDLED |
| 9 | Semantic amber/emerald | **grep: 0 raw amber/emerald in storefront**; all 10 files promoted to `--warning`/`--success` (agent-verified); glyph+text + AA kept | HANDLED |

---

## Bugs Found

### BUG-1 (HIGH, PRE-EXISTING, non-T15) — taxonomy detail pages 500 in the prod build

- **Symptom**: On a fresh `npm run build && npm run start` (warm prod), every taxonomy
  **detail** page returns **HTTP 500**:
  - `/categorias/[slug]` (e.g. `/categorias/oficina`, `/categorias/gamer`)
  - `/marcas/[slug]` (e.g. `/marcas/aeroflex`)
  - `/estilos/[slug]` (e.g. `/estilos/clasica`)
  - Index pages (`/categorias`, `/marcas`, `/estilos`), `/sillas`, `/producto/[slug]`,
    homepage, cart, checkout, static pages, 404 all render **200**.
- **Root cause**: Server-Components render error, digest **`DYNAMIC_SERVER_USAGE`**.
  These three detail pages are `●` (SSG, via `generateStaticParams`) and wrap
  `PaginatedProductListing` in `<Suspense>`. `PaginatedProductListing` (`:43`) `await`s
  `searchParams` (the `?page` read) during prerender; in this Next 16 prod build that
  throws `DYNAMIC_SERVER_USAGE` and the error escapes the boundary. `/sillas` is `ƒ`
  (Dynamic) so it never prerenders and is unaffected; `/producto/[slug]` is `●` but reads
  no `searchParams`, so it is unaffected.
- **Why this is NOT a T15 regression (proof)**:
  1. **Zero T15 commits (S1–S4) touched any of the 3 taxonomy `[slug]/page.tsx` files,
     `PaginatedProductListing`, the catalog query layer, or `catalog/types`** —
     `git diff --name-only e637a61..77a7781` confirms. T15's `[locale]` route edits are
     limited to layout, page (home), sillas, contact-form, error, not-found, showroom,
     and the confirmation page.
  2. **The dev server returns 200 for all three** (`npm run dev`, verified live) — the bug
     is prod-build-only, in code the reskin never went near.
  3. The touched components on these pages (`category-tree`, `catalog-skeleton`) have
     **cosmetic-only diffs** (`rounded-lg`→`rounded-md`, `font-heading uppercase`) — a
     className change cannot produce a Server-Components render throw.
- **Why it was never caught before**: `playwright.config.ts` runs its `webServer` as
  `npm run dev` (`reuseExistingServer: !CI`), where these pages are 200. Prior stages'
  QA notes recommended "authoritative storefront e2e uses PROD build" but the harness
  was never switched — so this latent prod-build bug (from the T3 catalog architecture)
  has been dormant since catalog shipped.
- **Severity / ownership**: **HIGH and a real launch blocker** — category/brand/style
  browsing is dead on a real deploy. But it is **out of T15's scope** (ui-only reskin)
  and belongs to **T14 (SEO/perf/launch hardening, runs LAST)**, whose remit is exactly
  prod-build launch readiness over the final reskinned surfaces. **Flagged here as the
  single most important thing T14 must fix before ship.** Likely fix: mark the three
  `[slug]` pages `export const dynamic = "force-dynamic"` (or move the `searchParams`
  await outside SSG), matching `/sillas`'s dynamic posture — a one-line-per-page
  rendering-config change, no reskin involvement.

### No T15-caused bugs found
Zero defects attributable to the reskin. Token discipline, firewall, i18n symmetry,
money display, structural e2e signals, and null-degrade paths all hold.

---

## A11y / CLS / Asset spot-checks

- **Contrast (AC-13)**: no automated axe harness in the repo; verification via DESIGN.md's
  computed contrast table (S2 `contrast.mjs`: all pairings AA — fg/bg 14.10, mutedFg 6.55,
  primary 8.37, success 4.95, warning 4.77) + unit assertion that editorial copy sits on
  the `bg-primary` scrim. Status semantics are glyph+text (colorblind-safe), agent-verified.
- **CLS (AC-15)**: hero reserves `aspect-[4/3]` on BOTH filled and fallback branches;
  editorial band `aspect-[16/9]→[21/9]`, catalog banner `aspect-[21/9]` — all unit-asserted
  reserved regardless of asset. Hero is `priority`; band/banner lazy with correct `sizes`.
- **Assets (AC-9/10)**: hero 154 KB, editorial 295 KB, catalog 294 KB — **all ≤300 KB**;
  `SOURCES.md` complete (photo id + photographer + profile + Unsplash License) for all 3.

---

## Confidence: HIGH (for the T15 reskin)

Justification: the reskin's load-bearing risk — the admin firewall — is airtight and
proven three independent ways (live e2e, built-output grep, git file-audit). Token
discipline is clean (0 hardcoded brand color/raw semantic color), i18n is perfectly
symmetric (438/438), money and structural e2e signals are untouched, every null-degrade
path is unit-covered, and the full unit (1746/1746) + integration (253/253) suites are
green with tsc/eslint clean. The 4 new T15 files that shipped without tests are now
covered (17 unit) and a durable firewall e2e smoke is in place.

The one HIGH finding (taxonomy-detail prod-500) is **rigorously proven pre-existing and
outside T15's touched code** — it does not lower confidence in the reskin, but it IS a
launch blocker that T14 must own. I am **not** recommending extra full-cycle stages for
T15 itself (the ui-only blast radius is well-verified); I AM recommending T14 (a) fix
BUG-1 and (b) switch the e2e `webServer` to a prod build so this class of bug can never
hide again.

## Untested Areas

- **Text-over-real-photo contrast at runtime** (AC-13 edge 5): guaranteed by construction
  (copy always on the cobalt scrim, not on the photo), so unknown-luminance swaps stay AA
  — verified structurally, not with a live pixel sample. LOW risk.
- **Visual pixel diffing of all ~48 reskinned surfaces**: out of scope for a token/asset
  reskin with no snapshot harness; covered by AC-map + agent per-surface class audit. LOW risk.
- **Taxonomy-detail pages' post-fix behavior**: cannot be green until BUG-1 is fixed by
  T14; their content path is otherwise integration-covered. Tracked, MEDIUM (launch-gating for T14).
