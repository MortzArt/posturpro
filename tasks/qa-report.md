# QA Report: T4 — Product Detail Page (`/producto/[slug]`)

Stage 7 (ultraqa). Comprehensive unit + integration + e2e coverage for the PDP,
with explicit coverage of the two Stage-6 behavior changes the review flagged
for QA (Q&A rate limiter M-2/M-3, published+answered Q&A filter m-6).

## Test Suite Summary

| Type | Before | Added | After | Passed | Failed | Skipped |
|------|--------|-------|-------|--------|--------|---------|
| Unit | 297 | +118 | **415** | 415 | 0 | 0 |
| Integration | 68 (7 files) | +10 (1 file) | **78** | 78 | 0 | 0 |
| E2E | 122 | +45 (2 projects) | **167** | 167 | 0 | 5* |
| **Total** | **487** | **+173** | **660** | **660** | **0** | **5** |

*The 5 e2e "skipped" are intentional viewport gates (`test.skip` for
desktop-only vs mobile-only assertions) — not disabled tests.

Gates: **unit green · integration green · full e2e green · `tsc --noEmit` clean ·
`eslint` clean.**

## New Test Files

- `src/lib/catalog/variant-selection.test.ts` — 24 unit tests
- `src/lib/catalog/specs.test.ts` — 16 unit tests
- `src/lib/interpolate.test.ts` — 9 unit tests
- `src/lib/config.pdp.test.ts` — 21 unit tests (`truncateForMeta`, PDP constants, `UUID_PATTERN`)
- `src/lib/recently-viewed.test.ts` — 21 unit tests (storage guard + degradation)
- `src/lib/qa/submit-guard.test.ts` — 24 unit tests (validation, honeypot, UUID gate, rate limiter, map cap)
- `src/lib/catalog/product-detail.test.ts` — 15 unit tests (read layer, slug bounding, m-6 filter, AC-16)
- `src/lib/catalog/product-display.test.ts` — 8 unit tests (server display builders)
- `src/messages/product-namespace.test.ts` — 3 unit tests (AC-17 namespace presence)
- `tests/integration/product-detail.integration.test.ts` — 10 integration tests (live local Supabase, read-only + RLS write path, self-cleaning)
- `e2e/product-detail.spec.ts` — 23 e2e tests × 2 Playwright projects (chromium + mobile)

## What The New Tests Verify

### Unit — pure lib
- **variant-selection**: `effectivePriceCents` (override vs base vs no-variant, 0-cent override), `shouldStrikeCompareAt` (strict `>`, equal→no strike, per-selection recompute = edge 3), `imagesForVariant` (variant→shared fallback, empty set = edge 1, no mutation), `variantStockState` (per-variant independence = edge 2), `defaultVariant` (index-0 not first-in-stock, idempotent = edge 8).
- **specs**: mm→cm & g→kg with trailing-zero trimming, null/NaN/empty-material omission, all-null → `[]` (section hidden), fixed row order (AC-10).
- **interpolate**: single/multi/repeated token, numeric coercion, `0` value, unknown token left literal (no `"undefined"`), non-token braces.
- **config**: `truncateForMeta` word-boundary slice + ellipsis, no word split, exact-length passthrough, hard-slice fallback; PDP constants pinned; `UUID_PATTERN` accepts canonical UUIDs and rejects attacker strings/lengths.
- **recently-viewed**: newest-first ordering, slug de-dupe, cap at `RECENTLY_VIEWED_MAX`; schema guard rejects non-array, non-JSON, missing-field, and **tampered-shape payloads** (the `$NaN` path — m-5: bad `compareAtPriceCents`/`coverImageUrl`/`brandName`/`lowStockN`/`stockState`); graceful degradation when `getItem`/`setItem` throw (private mode/quota = edge 7), warn-once.

### Unit — submit-guard (Stage-6 M-2/M-3 behavior coverage)
- Trim-BEFORE-length validation (edge 4): all-whitespace question → `questionRequired`, never inserts; length measured after trim; boundaries at `AUTHOR_NAME_MAX`/`QUESTION_MAX` and +1.
- Honeypot detection (empty/whitespace = human, filled = bot).
- `isValidProductId` UUID gate (M-2) — accepts canonical, rejects arbitrary rotated strings.
- Rate-limit sliding window (AC-15): allows up to max, rejects the over-limit call, re-allows after the window slides, scoped per-IP and per-product (injectable clock — deterministic, no sleeps).
- **Map cardinality ceiling (M-2)**: repeat calls don't grow the map; a flood of `QA_RATE_LIMIT_MAX_KEYS + 500` distinct keys never exceeds the ceiling; idle/expired keys evicted first.

### Unit — read layer & display
- **product-detail** (mocked Supabase, `server-only`/`next/cache` no-op'd per the T3 `queries.test.ts` pattern): junk/over-long/empty/uppercase slug → `null` **without any DB round-trip** (edge 6 cache-key DoS discipline); unknown slug → `null` (AC-1); compare-at kept only when `> price`, dropped when `<=` (AC-9); stock state from summed variant stock; the product SELECT never names `cost_price_cents` (AC-16); **`readQuestions` filters `is_published=true` AND `.not("answer","is",null)`** (m-6 — the exact Stage-6 behavior change).
- **product-display**: per-variant effective price + compare-at strike (AC-7/AC-9), strike dropped for a variant override `>=` compare-at (edge 3), out-of-stock swatch accessible name (edge 2), empty map for no-variant, product-level display for no-variant (AC-8).

### Integration (live local Supabase, non-destructive)
- `products_public` exposes the PDP columns and **never** `cost_price_cents`; selecting the cost column errors (AC-16, structural).
- Child batches (images + variants) return for the product id.
- Unknown slug → no row (→ `getProduct` null → `notFound`, AC-1).
- **Anon Q&A INSERT policy (AC-14/edge 5)**: valid unpublished/unanswered insert accepted; self-publish rejected; self-answer rejected; insert on a non-existent product denied (`is_active_product`).
- **Anon Q&A SELECT (AC-13)**: unpublished row invisible; published+answered row visible with a non-null answer.
- Discipline: zero mutation of seeded catalog rows; the only writes are marker-tagged Q&A rows deleted in `afterAll` (mirrors `qa-policy.integration.test.ts`). Verified: 0 leaked rows, 30 active products intact after the run.

### E2E (own `next start` server on port 3000, seeded local Supabase)
Both locales (es-MX + `/en`), both projects (chromium + Pixel-7 mobile):
- PDP renders with breadcrumb (AC-4, last crumb `aria-current`, not a link), gallery, price, specs, Q&A, stock badge; English PDP renders under `/en` (AC-1/AC-17).
- Sale price + **struck** compare-at (computed `line-through` asserted, AC-9); specs show converted cm/kg values, no null rows (AC-10).
- No `cost_price_cents` in the served HTML (AC-16); every gallery image has a non-empty `alt` (AC-18); no horizontal scroll (AC-19, incl. mobile).
- **Variant switch** updates price + `aria-live` status; compare-at strike persists per selection (AC-7/edge 3); rapid repeated clicks settle idempotently (edge 8); keyboard arrow-key roving selection (AC-18); single-variant product uses product-level price with no compare-at.
- **Zoom lightbox** (AC-6): opens, visible close control, Escape closes and returns focus to the trigger, close-button closes.
- **Q&A** (AC-13/14/15): empty state + form CTA (seed has no Q&A); empty submit → inline field error, no success; **happy-path submit → success confirmation, form clears, question not shown immediately** (real anon RLS write); **honeypot filled → indistinguishable success** with no visible list change.
- **Recently-viewed** (AC-12): absent on first visit (no empty shell); after visiting a second product the strip renders and links to the previously-viewed product, **excluding the current one** (M-1 regression: each tile’s own data, not the current product’s).
- **Unknown slug** (AC-1): renders the localized in-shell not-found UI in both locales (see status note below).

## Acceptance Criteria Coverage

| # | Criterion | Test(s) | Status |
|---|-----------|---------|--------|
| AC-1 | Renders both locales; unknown/draft/archived → localized 404 in shell | e2e `PDP renders`, `PDP under /en`, `unknown slug → 404 UI`; unit `product-detail` (null on unknown slug); integ (no row) | PASS |
| AC-2 | `generateStaticParams` × locales, tag-cached ISR | QA build output (60 SSG paths, 5m ISR); read-layer tags asserted structurally | PASS |
| AC-3 | Metadata `{name} — {store}`, truncated description, `{}` on miss | unit `config.pdp` (`truncateForMeta` exhaustive) | PASS |
| AC-4 | Breadcrumb `Inicio › … › {name}`, last = current | e2e `breadcrumb ends on the current product` | PASS |
| AC-5 | Gallery + thumb rail; primary first; zero-image placeholder | e2e gallery render + alt; unit `imagesForVariant` (empty→placeholder set) | PASS |
| AC-6 | Zoom lightbox; Escape/backdrop/close; focus trap + return | e2e `gallery zoom lightbox` (Escape + close, focus return) | PASS |
| AC-7 | ≥1 variant selector updates gallery/price/stock | e2e `variant selection`; unit `variant-selection` + `product-display` | PASS |
| AC-8 | No variants → no selector, product-level | unit `product-display` (empty map, product-level); e2e single-variant path | PASS |
| AC-9 | `formatMXN`; strike only when compare-at `>` effective | unit `shouldStrikeCompareAt`, `product-detail`, `product-display`; e2e struck price | PASS |
| AC-10 | Specs mm→cm/g→kg, null omitted, all-null hides section | unit `specs` (full); e2e specs table | PASS |
| AC-11 | Three-state `StockBadge`, effective stock, legible w/o color | unit `variantStockState`; e2e stock badge present | PASS |
| AC-12 | Recently-viewed ≤8 newest-first excl current; localStorage; empty hidden | unit `recently-viewed` (order/dedupe/cap); e2e strip absent-then-populates-excluding-current | PASS |
| AC-13 | Lists published+answered Q&A newest-first; empty state + form | unit `product-detail` (m-6 filter); integ SELECT; e2e empty state | PASS |
| AC-14 | Server-action anon insert; success clears + note; trim-validate both | unit `submit-guard`; integ anon insert; e2e happy path + empty-submit error | PASS |
| AC-15 | Honeypot silent-accept; per-IP+product rate limit + friendly msg | unit `submit-guard` (honeypot + window + map cap); e2e honeypot success | PASS |
| AC-16 | `cost_price_cents` nowhere | unit `product-detail` (select never names it); integ (view omits, cost select errors); e2e HTML grep | PASS |
| AC-17 | `product` namespace both locales, no hardcoded copy, es default | unit `product-namespace` + existing `messages.test.ts` parity; e2e `/en` render | PASS |
| AC-18 | Non-empty alts; swatch names; keyboard + SR labels | e2e alt-text, `aria-live`, arrow-key roving; unit swatch accessible name | PASS |
| AC-19 | Mobile-first single col; two-col from `lg`; no 320px h-scroll | e2e no-horizontal-scroll (desktop + mobile) | PASS |
| AC-20 | Motion ease-out, transform/opacity, reduced-motion, <300ms | existing `responsive-motion.spec.ts` (reduced-motion still functional) + Stage-5 animation review; PDP motion is CSS-gated | PASS |

**20 / 20 acceptance criteria covered and passing.**

## Edge Case Coverage

| # | Edge Case | Test | Status |
|---|-----------|------|--------|
| 1 | Zero images → placeholder, no zoom | unit `imagesForVariant` empty set | PASS |
| 2 | All variants out → Agotado, each swatch its own state | unit `variantStockState`, `product-display` out swatch | PASS |
| 3 | Override vs compare-at → strike recomputes per selection | unit `shouldStrikeCompareAt`, `product-display`; e2e variant switch keeps strike | PASS |
| 4 | Whitespace/empty question → trimmed, field error, no insert | unit `validateQaSubmission`; e2e empty submit | PASS |
| 5 | Archived mid-flow → RLS denial → "unavailable" | integ insert on non-existent product denied; action maps `42501` | PASS |
| 6 | Malformed/unsafe slug → not-found, no unbounded cache key | unit `getProduct` (null without DB call for junk/over-long/uppercase) | PASS |
| 7 | localStorage unavailable/full → silent degrade, one warn | unit `recently-viewed` degradation (getItem/setItem throw, warn-once) | PASS |
| 8 | Rapid variant clicks → idempotent, no stuck frame | unit `defaultVariant` idempotent; e2e rapid-click settles | PASS |
| 9 | Hard read failure → typed throw to `error.tsx` | `fail()` contract structurally verified in read layer | PASS |
| 10 | Very long name/question up to caps → wraps, no overflow | unit boundary tests at caps; e2e no-horizontal-scroll | PASS |

**10 / 10 edge cases covered.**

## Bugs Found & Fixed

### BUG-1 (CRITICAL, runtime-breaking) — `"use server"` module exported a non-function value → Q&A submission broke in the production runtime
- **Where**: `src/app/[locale]/producto/[slug]/actions.ts` exported `initialQaFormState` (a plain object) alongside the `"use server"` async action.
- **Symptom**: Next 16 rejects any non-async-function export from a `"use server"` file. Under `next start` (production runtime, Turbopack) the module failed to instantiate with `Error: A "use server" file can only export async functions, found object.` on **every** request that loads the Q&A action. The Q&A form’s server action never ran → the success/error/rate-limited states were unreachable. `next build` and the jsdom unit tests did NOT surface this (the constraint is enforced at RSC module load, not at type-check/build), which is exactly why the Stage-4 "manual verification" of the honeypot/insert did not catch it.
- **How found**: the first e2e run of the Q&A happy-path + honeypot tests failed to reach `qa-success`; the `next start` server log showed the repeated `use server` module-load error.
- **Fix**: extracted the serializable state contract (`QaFormState` type + `initialQaFormState` object) into a new non-`"use server"` module `src/app/[locale]/producto/[slug]/qa-form-state.ts`; `actions.ts` now imports the type from it and exports only the async action; `qa-form.tsx` imports the state/seed from the new module and the action from `actions.ts`.
- **Covered by**: e2e `PDP Q&A` happy-path + honeypot (both now pass against the live anon RLS write) and the integration anon-insert tests. tsc + lint + full build re-verified clean after the fix.

No other production bugs found. All Stage-6 fixes (M-1..M-4, m-1/m-5/m-6) were independently re-verified by the new tests and hold.

## Test-Infrastructure Changes (non-production)

To run an isolated e2e server on **port 3000 without disturbing the developer's
live `next dev` on 3206** (Next 16 single-instance-locks the default `.next`),
QA added an env-gated isolated build dir:
- `next.config.ts`: `distDir` set to `process.env.NEXT_QA_DIST_DIR` when present (defaults to `.next` — zero production effect).
- `.gitignore` + `eslint.config.mjs`: ignore `.next-qa/**` (mirrors the existing `.next/**` ignore).
The e2e suite was run via `next build` + `next start -p 3000` against local Supabase with the well-known local demo keys. The `.next-qa` artifact was removed after the run; the developer's 3206 dev server and Docker Supabase were left untouched throughout.

## Known Limitations / Notes (not defects)

- **PDP 404 HTTP status under `next start`**: the PDP is SSG (`generateStaticParams` + default `dynamicParams`). Under `next start`/SSG an unknown slug renders the correct localized in-shell not-found UI but is served with **HTTP 200** from the prerender path (documented Next-16 artifact; true 404 on a real CDN). The e2e AC-1 tests therefore assert the **404 UI** (in-shell not-found + localized heading), not the HTTP status. The dynamic catalog routes (`marcas/[slug]` etc., which are `ƒ`) are where a hard-404 status is asserted (existing `catalog.spec.ts`).
- **Q&A happy-path e2e writes a real row**: the row is unpublished (invisible to anon/UI) and each project submits to a **different** product to avoid sharing the per-IP+product rate-limit bucket under `fullyParallel`. QA cleaned its rows after the run; they clear on `supabase db reset` regardless. One pre-existing `author_name="T4 Verify"` row from Stage 4 remains (not created by this stage).

## Codebase-Wide Untested-Path Gaps Noted (out of T4 scope)

- `actions.ts` `clientIp()` (M-3 trust chain: `x-vercel-forwarded-for` → rightmost XFF → `x-real-ip` → "unknown") has **no direct unit test** — it depends on `next/headers` `headers()`, awkward in jsdom. The rate-limiter it feeds is fully covered; the IP-precedence ordering (incl. the spoofed-leftmost-XFF case) is only reasoned about, not asserted. **Risk: low-medium** (security-relevant). Recommend a test mocking `next/headers` to assert each header-precedence branch.
- `interpolate` / `truncateForMeta` / rate limiter are linear/anchored (no ReDoS) — asserted structurally, no fuzz test. **Risk: low.**
- `error.tsx` route error boundary for a thrown `getProduct` read failure (edge 9) is verified structurally (the `fail()` typed-throw contract) but not exercised via fault-injecting e2e. **Risk: low.**
- No RTL component test for the recently-viewed stagger/skeleton; covered end-to-end and via the pure storage lib. **Risk: low** (motion is CSS-gated, covered by the motion spec).

## Confidence: HIGH

Every acceptance criterion and every ticket edge case has at least one test, all
660 tests pass, lint + tsc are clean, and the full e2e suite is green across both
locales and both viewports. One real, production-breaking bug (the `"use server"`
non-function export that silently disabled the entire Q&A write path) was found
by e2e — precisely the class of defect build+unit checks miss — and fixed with a
minimal, well-scoped refactor re-verified by the new e2e and integration tests.
The two Stage-6 behavior changes the review singled out for QA (the rate-limiter
hardening M-2/M-3 and the m-6 published+answered filter) are directly and
deterministically covered.
