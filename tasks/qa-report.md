# QA Report: T16 — B2B landing page (`/empresas`, offices + quote form)

Standard pipeline, S5 (QA) — the QUALITY GATE for the standard tier (no verify stage). Scope:
commits `f713355` (dev, +174 unit + 20 e2e) + `615b424` (reviewfix). Independent re-verification,
residual-gap closure, and full-repo regression. **Verdict: PASS, confidence HIGH.**

## Test Suite Summary

| Type | Written (T16 total) | Passed | Failed | Skipped |
|------|--------|--------|--------|---------|
| Unit | 174 (dev) + 12 (QA hero) + 1 slot (QA imagery) | all | 0 | 0 |
| Integration | 0 new (no DB seam — email-relay only) | 253/253 | 0 | 0 |
| E2E | 20 (dev) + 12 (QA) = 32 | 32/32 | 0 | 0 |
| **Full unit suite** | **1931** (was 1920 → +11 net) | **1931** | **0** | 0 |

Gates (independently run, not trusted from dev-done): `tsc --noEmit` = **0**; `eslint` (all touched +
new files) = **0**; full unit suite **1931/1931 (113 files)**; integration **253/253 (23 files)**;
`e2e/empresas-quote.spec.ts` **32/32** (chromium + Pixel-7 mobile) via the Playwright-managed
webServer (correct `QUOTE_RATE_LIMIT_DISABLED=1` env).

## Tests Written (this stage)

### Unit (+13, 2 files)
- `src/components/home/hero.test.tsx` (NEW, 12) — the previously-untested Hero component, closing the
  task's "degrade path (B2B_HERO_IMAGE null → building-glyph tile) unit-covered" gap:
  - filled slot renders `next/image` with the passed alt, no fallback tile; 4/3 aspect box reserved (CLS).
  - null slot degrades to `hero-image-fallback` (never a broken `<img>`); SAME 4/3 box reserved;
    tile is `aria-hidden` (decorative, AC-11); pitch copy + CTA still render.
  - **`fallbackIcon` honored** — the B2B `Building06Icon` renders a *different* glyph than the homepage
    chair default (proves the T16 "fallback reads offices" wiring, edge 3 / AC-10), not hardcoded.
  - mount reuses the reduced-motion-gated `.enter-fade` class (AC-10).
- `src/lib/config/imagery.test.ts` (EXTENDED, +1 slot × 2 assertions) — added `B2B_HERO_IMAGE` to the
  `string | null` + local-`/public`-path (no remote host) contract table (AC-8/AC-10).

### E2E (+12, extends `e2e/empresas-quote.spec.ts`)
- **State-preservation-on-error, ALL SIX fields** (AC-6, edge 3, React-19 remount) — fills all 6 fields
  incl. `teamSize="200+"`, forces a failure re-render, asserts every value survives — *including the
  re-keyed native `<select>`* (the load-bearing case S4 verified only in code). Resilient to which
  failure banner appears (error vs rate-limited — both preserve values).
- **Char-counter regression** (×2 projects) — asserts `quote-counter` renders a numeric `N/M`, NEVER the
  raw i18n key; reacts to typed input. Guards the `t()`-vs-`t.raw()` bug fixed this stage (see Bugs).
- **Honeypot off-screen in BOTH locales** (AC-7, edge 2) — `/empresas` and `/en/empresas`: present,
  `tabindex=-1`, `autocomplete=off`, `aria-hidden` wrapper, `left < -1000px`, not in viewport.
- **Per-page metadata resolves per locale** (AC-9) — es-MX has a non-empty localized title+description;
  en resolves a *distinct* English title (not a silent es-MX fallback).

## Acceptance Criteria Coverage (14/14 PASS)

| # | Criterion | Test(s) / Evidence | Status |
|---|-----------|--------------------|--------|
| AC-1 | Renders 200 both locales in storefront shell, Casa de Azulejo | e2e both-locale 200 + `lang` attr; live curl 200/200 | PASS |
| AC-2 | Persuade structure (hero/value/process/form) + anchored CTA | e2e `b2b-pillars`/`b2b-process`/`quote-form` visible; CTA→`#cotizacion`, `#como-funciona` present | PASS |
| AC-3 | Zero fabricated proof | Grep sweep of ALL `empresas` copy (both locales) + B2B JSX: only team-size ranges + "10 dígitos"; no counts/testimonials/client-names/percentages/press | PASS |
| AC-4 | 6 fields incl. constrained native team-size `<select>` | e2e: 6 fields visible, `<select>` tag with 5 options; all labels from i18n both locales | PASS |
| AC-5 | Valid submit → `sendQuoteRelay`/`renderQuoteRelay`, replyTo=visitor, all fields | `actions.test.ts` happy-path + trimmed relay; `quote-relay.test.ts` every field HTML+text; dispatch `replyTo=fromEmail` | PASS |
| AC-6 | Full serializable state matrix, error never leaks reason | `actions.test.ts` branch matrix; e2e error+retry+preserved; 6-field-preservation e2e; reason-suppression asserted | PASS |
| AC-7 | Abuse controls in order (honeypot→validate→rate-limit) | `actions.test.ts` gate-ordering; dedicated limiter instance; server-only disable hatch; honeypot-both-locales e2e | PASS |
| AC-8 | Nav + footer links both locales, zero dead | `nav-items.test.ts` asserts `offices→/empresas`; e2e nav + `footer-link-offices` → 200 | PASS |
| AC-9 | Per-page `generateMetadata` both locales | per-locale metadata e2e (distinct en title); `page.tsx:50` locale-resolved title+description | PASS |
| AC-10 | DESIGN.md compliance; image null-degrade; admin firewall | Hero fallback unit tests (Building glyph, aspect box, `.enter-fade`); imagery slot contract; no admin/`ui/*` edit | PASS |
| AC-11 | WCAG AA; labeled fields + `aria-describedby`; native select; glyph+text status | aria wiring spot-check (5×`aria-describedby`/`aria-invalid`, focus-visible ring, glyph+text banners); native `<select>` e2e | PASS |
| AC-12 | No overflow at 375/768 | e2e no-overflow assertion both widths; `grid-cols-1 sm:grid-cols-2` 2-up-pairs-stack | PASS |
| AC-13 | Exact bilingual parity; keys-used updated | Message-parity test green (0 asymmetry); `keys-used.test.ts` registers all `empresas.*` + nav/footer | PASS |
| AC-14 | Unit + e2e; tsc/eslint/suite green | 1931/1931 unit; action/guard/limiter/template exhaustive; 32/32 e2e; tsc=0, eslint=0 | PASS |

## Edge Case Coverage (8/8 HANDLED)

| # | Edge Case | Test | Status |
|---|-----------|------|--------|
| 1 | Team-size enum tampering | `submit-guard.test.ts` + `actions.test.ts` (`teamSizeInvalid` / empty→`teamSizeRequired`) | PASS |
| 2 | Honeypot filled | `actions.test.ts` (fake success, no send, no oracle) + honeypot-off-screen e2e both locales | PASS |
| 3 | Owner email unconfigured / send fail | `actions.test.ts` `{ok:false}`→error, reason logged only; e2e default error-on-submit + preserved | PASS |
| 4 | Rate-limit flood, isolated from contact | `rate-limit.test.ts` per-IP window + **both-direction isolation** + independent key counts | PASS |
| 5 | Whitespace / oversized / control-char | `submit-guard.test.ts` trim→required, `needsTooLong` cap, `stripControlChars` (byte-mirrors contact) | PASS |
| 6 | Missing/unknown locale, empty tables | Layout `notFound()` gates `/zz/empresas` (live 404, not 500); copy-driven; `readB2BBrands`→`[]` | PASS |
| 7 | `prefers-reduced-motion` | `.enter-fade`/`.stagger` reduce blocks (globals.css); Hero test asserts the class | PASS |
| 8 | JS-disabled / slow network | real `<form action>`; server re-validates trimmed values; server-rendered pitch | PASS |

## Bugs Found & Fixed

### BUG-A (MINOR-visible, PRE-EXISTING pattern, T16 instance FIXED)
- **What**: The live character counter under the "¿Qué necesitas?" textarea rendered the **literal i18n
  key `empresas.form.charCount`** to every user, in both locales, instead of `N/M` (e.g. `0/2000`).
- **How found**: The Playwright-managed webServer log surfaced a server-side
  `FORMATTING_ERROR: The intl string context variable "count" was not provided to the string "{count}/{max}"`
  at `page.tsx:141 charCount: t("form.charCount")`. The mobile DOM snapshot confirmed the counter text
  was the raw key. `t()` ICU-formats the template with no `count`/`max` context → throws → next-intl's
  default `getMessageFallback` returns the key path → `interpolate()` (no placeholders) emits it verbatim.
- **Fix**: `charCount: t.raw("form.charCount")` (`page.tsx`) — `t.raw` returns the template untouched for
  client-side interpolation. This is the **established codebase pattern** (PDP `qa.form.counter`, cart,
  checkout confirmation all use `t.raw` for cross-boundary templates). tsc/eslint clean; FORMATTING_ERROR
  gone; counter now renders `0/2000` and reacts to input (new regression e2e ×2 guards it).
- **Pre-existing twin (documented for T14, NOT fixed here — out of my T16 scope)**: the **contact form**
  has the identical bug — `src/app/[locale]/contacto/page.tsx:59 charCount: t("charCount")` on the same
  `"{count}/{max}"` template. It shipped in T13 (QA-passed, missed) and renders `contact.charCount`
  under the contact textarea today. One-line fix (`t.raw`); T14's per-page pass should close it.

### No product bugs in the T16 quote stack itself
The security-critical path (honeypot→validate→rate-limit→relay ordering, `stripControlChars`,
server-side enum boundary, `escapeHtml` on every field, error-reason suppression, dedicated-limiter
isolation, never-throw-to-client) is correct and exhaustively tested — verified in code, not trusted.

## Cross-Surface Regression
- Full unit suite **1931/1931 (113 files)** — nav/footer/keys additions broke no existing nav or key
  tests; my hero test + page.tsx `t.raw` edit regressed nothing. (One `payment-panel` full-run flake
  observed once, passed on clean re-run + isolated 17/17 — the documented pre-existing `waitFor`
  timing flake, does NOT touch T16 files.)
- Integration **253/253** unchanged (no DB seam added).
- Homepage/static pages unaffected: hero default (no `fallbackIcon`) still renders the chair glyph
  (unit-asserted); the theme-firewall spec and all storefront e2e remain green (no `ui/*`/admin/`:root` edit).

## Confidence: HIGH

Every AC (14/14) is behavior-tested and passing; every edge (8/8) is handled and tested; the full repo
regresses clean; the one bug found was caught by watching the server log (not just green tests) and fixed
with the codebase's own idiom, plus a regression e2e. The S4 M-1 native-`<select>` affordance fix is
confirmed (no `appearance-none`; e2e proves a `<select>` with 5 options + preserved value).

## Untested Areas (with risk)
- **Live email SUCCESS render** (real `sendQuoteRelay` `{ok:true}` → success banner clears + auto-hides) —
  blocked-on-user: `.env.local` has no `EMAIL_API_KEY`/`EMAIL_FROM_ADDRESS`/`EMAIL_OWNER_ADDRESS`, and the
  success mapping is proven exhaustively at the action level (`actions.test.ts`) + `sendQuoteRelay` is the
  byte-for-byte shipped `sendContactRelay` pattern. **Risk: LOW.** Same posture T13 QA accepted; e2e
  correctly asserts the default error-on-submit (edge 3). T14 owns the live EMAIL_* wiring.
- **Prod-build render of `/empresas`** — the pre-existing T14-owned taxonomy-detail prod 500 (BUG-1 from
  T15 QA) makes a full prod-build e2e noisy; `/empresas` is copy-driven with no `searchParams`-in-SSG, so
  it is not in that bug class (dev-server 200 both locales confirmed). **Risk: LOW**, T14 repoints e2e to prod.
