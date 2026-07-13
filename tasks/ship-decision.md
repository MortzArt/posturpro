# Ship Decision: T4 — Product Detail Page (`/producto/[slug]`)

## Verdict: SHIP

## Confidence: HIGH

## Quality Score: 9/10

Stage 11 (Hacker) was intentionally skipped per the sanctioned `medium`-complexity
routing (not a gap). All other gates were re-run fresh at Stage 12 — no reported
number was trusted; every count below was reproduced independently against a fresh
production build served on port 3000 wired to the seeded local Docker Supabase.

## Test Results

| Suite | Total | Passed | Failed | Skipped |
|-------|-------|--------|--------|---------|
| Unit (Vitest) | 415 | 415 | 0 | 0 |
| Integration (Vitest, live local Supabase, non-destructive) | 78 | 78 | 0 | 0 |
| E2E (Playwright, chromium + Pixel-7, prod build) | 172 | 167 | 0 | 5* |
| **Total** | **665** | **660** | **0** | **5** |

*The 5 e2e "skipped" are intentional viewport gates (`test.skip` desktop-only vs
mobile-only assertions), exactly matching the QA report. Integration was run
directly against the already-seeded DB (I did NOT run the destructive `db reset`
in `scripts/run-integration.sh`).

Static gates re-run fresh:
- `npm run lint` — clean (0 errors, 0 warnings).
- `npx tsc --noEmit` — clean (exit 0).
- `next build` (isolated `NEXT_QA_DIST_DIR=.next-verify`, local Supabase) — succeeds.
  PDP route `/[locale]/producto/[slug]` is `●` **SSG** with **60 prerendered paths**
  (30 active slugs × 2 locales), Revalidate 5m — matches the expected build shape
  exactly. Confirmed 30 active products in the local DB → 60 paths.

## Acceptance Criteria Final Check

All 20 ACs verified against the LIVE app (prod build on port 3000), not against reports.

| # | Criterion | Code | Test / Live Evidence | Verdict |
|---|-----------|------|----------------------|---------|
| AC-1 | Renders both locales; unknown/draft/archived → localized 404 in shell | `page.tsx` `notFound()` on null | Live: `/producto/silla-ejecutiva-milano` 200; `/es-MX/...` 307→unprefixed; `/en/...` 200; unknown slug renders in-shell 404 UI (es "Página"/"404", en "PAGE") with header+footer; path-traversal slug → 404. e2e both locales | ✅ |
| AC-2 | `generateStaticParams` × locales, tag-cached ISR | `page.tsx` `generateStaticParams` | Build: 60 SSG paths, 5m revalidate; tags `catalog`+`product:<slug>` | ✅ |
| AC-3 | Metadata `{name} — {store}`, truncated desc, `{}` on miss | `truncateForMeta`, `MAX_META_DESCRIPTION=160` | unit `config.pdp` exhaustive; m-1 FIXED | ✅ |
| AC-4 | Breadcrumb `Inicio › … › {name}`, last = current | `Breadcrumbs` reuse | Live: `Inicio` link + `aria-current="page"` on "Silla Ejecutiva Milano" (not a link) | ✅ |
| AC-5 | Gallery + thumb rail; primary first; zero-image placeholder | `product-gallery.tsx` | Live: gallery present, non-empty alts; thumb rail conditional (2+ images); no seed product has 2+ shared images so single-image render is correct | ✅ |
| AC-6 | Zoom lightbox; Escape/backdrop/close; focus trap + return | raw Radix Dialog | Live: zoom trigger present; e2e opens/traps focus/Escape-returns/close-control | ✅ |
| AC-7 | ≥1 variant selector updates gallery/price/stock | `product-purchase-panel.tsx` island | Live: Milano 2 swatches, Torino 3; variant display map serialized; e2e variant switch updates price + aria-live | ✅ |
| AC-8 | No variants → no selector, product-level | `hasVariants` gate | unit `product-display` (empty map, product-level). Seed has no 0-variant product; unit-covered | ✅ |
| AC-9 | `formatMXN`; strike only when compare-at `>` effective | `shouldStrikeCompareAt` strict `>` | Live es: `$8,999.00` + struck `$10,798.80` + sr-only "Precio anterior:"; en: `line-through` + "Was:"; per-variant recompute | ✅ |
| AC-10 | Specs mm→cm/g→kg, null omitted, all-null hides | `buildSpecRows` | Live: `product-specs` with 8 rows, 4×cm + 1×kg converted, no null rows | ✅ |
| AC-11 | Three-state `StockBadge`, effective stock, legible w/o color | reused badge | Live: `stock-badge data-state="in"` icon+text | ✅ |
| AC-12 | Recently-viewed ≤8 newest-first excl current; localStorage; empty hidden | `recently-viewed.tsx` | Live: absent from first-visit SSR (0); e2e populates on 2nd product excluding current; M-1 per-tile stock label FIXED (verified in code) | ✅ |
| AC-13 | Lists published+answered Q&A newest-first; empty state + form | `readQuestions` `.not(answer,is,null)` | Live: Torino has an UNPUBLISHED "Ana QA" row → shows empty state, 0 rendered items, "Ana QA" absent from HTML; integ SELECT | ✅ |
| AC-14 | Server-action anon insert; success clears+note; trim-validate both | `actions.ts` + `submit-guard.ts` | DB (source of truth): anon-role legit 3-col insert `INSERT 0 1` then invisible to anon SELECT; e2e happy-path + empty-submit error | ✅ |
| AC-15 | Honeypot silent-accept; per-IP+product rate limit + friendly msg | `submit-guard.ts` | e2e honeypot → success, no write; unit rate-limit window + map cap; M-2/M-3 FIXED | ✅ |
| AC-16 | `cost_price_cents` nowhere in payload/HTML/RSC | reads `products_public` view | Live: Milano real cost `494945` appears **0×** in HTML AND RSC; view select of `cost_price_cents` → `column does not exist` | ✅ |
| AC-17 | `product` namespace both locales, no hardcoded copy, es default | both message files | Live: en renders "Specifications"/"Questions"/"Ask a question"/"Recently viewed"; parity unit tests | ✅ |
| AC-18 | Non-empty alts; swatch names; keyboard + SR labels | roving radiogroup, aria-live | Live: `role="radiogroup"`, swatch aria-labels ("Negro"/"Café"), aria-live status region, 0 empty alts, zoom trigger names the image | ✅ |
| AC-19 | Mobile-first single col; two-col from `lg`; no 320px h-scroll | `lg:grid-cols-2` | e2e no horizontal scroll @ 320/375/768/1280 (desktop + mobile projects) | ✅ |
| AC-20 | Motion ease-out, transform/opacity, reduced-motion, <300ms | `globals.css` M1–M9 | Stage-5 animation review APPROVED; e2e reduced-motion still functional | ✅ |

**20 / 20 acceptance criteria PASS. 10 / 10 edge cases handled** (per QA + review,
spot-checked live: edge 3 strike recompute, edge 5 archived→RLS-deny, edge 6
unsafe-slug→404, edge 8 rapid-click idempotent — all confirmed).

## Report Summary

| Report | Score | Key Finding |
|--------|-------|-------------|
| Code Review | 8/10 → RESOLVED | 4 major (frozen stock label, unbounded rate-limit map, spoofable XFF, dead helper) all FIXED in Stage 6; 18→20 AC pass |
| QA | HIGH | 415 unit / 78 integ / 167 e2e all green; found + fixed CRITICAL BUG-1 (`"use server"` non-function export that silently disabled Q&A) |
| UX | 9/10 | Complete state coverage; fixed invisible out-of-stock swatch slash + SR-hidden gallery image name |
| Security | SECURE-WITH-NOTES | 0 critical/high/medium; 9 live adversarial attacks blocked; anon+RLS write boundary; only 2 accepted LOW residuals |
| Architecture | 8.5/10 | Faithful T3 pattern reuse; no data-model risk; clean T5/T6/T11 seams; all debt future-task-mapped |
| Hacker | SKIPPED | Sanctioned skip per `medium` complexity — not a gap |

Cross-checks re-verified live/in-code this stage: M-1 (per-entry `resolveStockLabel`,
frozen map gone), M-2 (`isValidProductId` UUID gate + `QA_RATE_LIMIT_MAX_KEYS` cap),
M-3 (Vercel-edge IP trust model), M-4 (`defaultVariant` used in panel), BUG-1
(`actions.ts` exports only the async action; state contract in `qa-form-state.ts`),
UX swatch-slash + zoom-trigger-alt fixes — all confirmed present and behaving.

## Remaining Concerns

- **In-memory rate limiter is best-effort off a trusted edge** (SEC-L-1): LOW,
  ticket-sanctioned. Backstopped by honeypot + hard `QA_RATE_LIMIT_MAX_KEYS` cap +
  RLS-forced-unpublished. Recommendation: durable limiter (Upstash/Redis) when the
  store scales — already backlogged.
- **2 moderate transitive npm advisories** (`next`→`postcss`, SEC-L-2): LOW, no
  runtime exposure (build-time only). Do NOT `npm audit fix --force` (downgrades
  Next). Bump with a future Next release.
- **404 HTTP status is 200 under local `next start`**: accepted Next 16 SSG +
  `notFound()` + `dynamicParams=true` prerender-cache artifact; the localized 404
  UI is correct and the status is preserved on a real CDN. Not a defect.
- **Latent scaling ceilings** (unbounded `generateStaticParams`, unpaginated Q&A
  list): none bite in T4's lifetime; owner tasks T5/T11. Not blocking.

All of the above are explicitly on the accepted-items list and do NOT count
against SHIP.

## What Was Built

A production-ready product detail page at `/producto/[slug]` (SSG/ISR, both
locales) with an interactive image gallery + accessible zoom lightbox, a
single-island color-variant selector that live-syncs price/stock/gallery, a
null-omitting specs section (mm→cm / g→kg), a localStorage recently-viewed strip,
and the storefront's first public write path — an anon-RLS Q&A submission form with
trim-first validation, honeypot, and a bounded in-memory rate limiter. Cost data is
structurally unreachable (reads the `products_public` view), copy is fully
bilingual, and the page is mobile-first responsive with reduced-motion-gated motion.

## Summary

T4 clears every SHIP gate: 660 tests green with zero failures, all 20 acceptance
criteria verified against the live app, no critical/high security vulnerabilities,
the first public write path correctly bounded at the RLS boundary, complete UX
states, verified responsive down to 320px, and no build-ahead into T5/T6/T11/Phase 2.
**SHIP.**
