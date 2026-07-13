# Architecture Review: T4 — Product Detail Page (PDP)

**Reviewer:** ultraarch (Stage 10) · **Scope:** commits 9da6e40, 6f35543, 5ab9fdc, 2e2053f
**Mode:** read-only on source (recommendations only) · **Parallel with:** Stage 9 (Security)

## Summary

T4 is a disciplined, pattern-faithful extension of the T3 read architecture: it genuinely
mirrors `queries.ts` (view-only reads, batched `.eq()` children, `unstable_cache` +
per-entity tags, the `fail()` contract), keeps a clean lib/component boundary with a single
selection island, and pushes all i18n resolution to the server so the client does zero
translation. The data model is untouched (correct — every table pre-exists), the cache tag
scheme is consistent with T3, and the known limitations (in-memory limiter, Q&A composite
index) are honestly documented and already backlogged rather than hidden. The forward seams
for T6 (variant id available), T11 (Q&A publish/answer filter + `product:<slug>` tag), and
T5 (no coupling introduced) are clean. It will make sense in 6 months to a new developer.

## Pattern Compliance

| Pattern | Status | Notes |
|---------|--------|-------|
| Separation of concerns | ✅ | `product-detail.ts` reads/stitches; `variant-selection.ts`/`specs.ts`/`submit-guard.ts` compute (pure, I/O-free); `product-display.ts` resolves display strings server-side; components render. Business/selection logic is not buried in components. |
| Boundary validation | ✅ | Q&A input trimmed + length-checked server-side against the DB CHECKs (`validateQaSubmission`), honeypot, UUID-validated `productId`, RLS `WITH CHECK` as the floor. Slug bounded pre-cache (`isCacheableSlug`). No `zod` — hand-rolled per ticket, justified. |
| Typed contracts | ✅ | View models in `product-detail.types.ts`; components consume only these, never raw Supabase rows. Public signatures fully typed; no `any`. One tolerated `as unknown as ProductDetailRow` cast at the PostgREST boundary (same idiom as T3). |
| Service/read layer | ✅ | `getProduct`/`listActiveProductSlugs` live in the read layer; the page only renders. Mirrors `getBrand` + `stitchCards`. `fail()` contract identical to `queries.ts`. |
| Type safety | ✅ | `tsc --noEmit` clean per dev-done; no non-null `!` to silence the compiler in the reviewed files. |
| Single-island discipline | ✅ | `ProductPurchasePanel` is the ONE selection island / single source of truth for `selectedVariantId`; gallery + price + stock + selector all update from it. Recently-viewed and Q&A form are separate, independently-justified islands. |
| Cache-key discipline (T3 precedent) | ✅ | Slug bounded (`SLUG_PATTERN` + `MAX_SLUG_LENGTH=128`) before it keys `unstable_cache`; Q&A text flows only into an insert, never a cache key; `productId` UUID-validated before it keys the rate-limiter (M-2). |
| shadcn patterns | N/A | PDP reuses existing `StockBadge`/`Breadcrumbs` + raw Radix Dialog for zoom (per research); no new shadcn primitives introduced. Out of arch scope; covered in Stages 5/8. |

**Verdict on coherence:** `product-detail.ts` is a faithful sibling of `queries.ts`, not a
divergent re-implementation. It correctly re-derives the T3 lesson that child tables
(`product_images`/`product_variants`/`product_questions`) cannot embed through the
`products_public` view and must be batched by `product_id` and stitched. The `fail()`,
`firstOrSelf`, and tag conventions are copied verbatim — the intended pattern compliance, but
also the source of the DRY debt noted below (n-4).

## Data Model Review

**No migration — correct.** Every table pre-exists from T1; T4 is purely additive read +
one RLS-bounded write. The right call and the lowest-risk data posture.

- **Q&A read shape vs. RLS:** `readQuestions` filters `is_published = true AND answer IS NOT
  NULL ORDER BY created_at DESC`. The anon SELECT policy is `is_published = true` only, so
  the `answer IS NOT NULL` refinement (m-6 fix) is an app-layer tightening for AC-13, not a
  security boundary. **Forward-compatible with T11:** when the admin publishes an answered
  question it appears; a published-but-unanswered row (only reachable via a future admin
  mis-step) is correctly excluded rather than rendered as a bare question.
- **Indexes:** `product_questions` has single-column indexes on `(product_id)` and
  `(is_published)` but **no composite `(product_id, is_published, created_at DESC)`**. At
  seed scale Postgres uses `product_id_idx` then sorts in memory — fine. This is the SKIPPED
  m-4 finding; it bites at T11 volume (a product accumulating hundreds of questions), never
  in T4. Backlogged below, mapped to T11.
- **FKs / ON DELETE:** `product_questions.product_id → products ON DELETE CASCADE`;
  `product_images`/`product_variants` are indexed on their FK columns (`variant_id`,
  `product_id`) — verified. Variant/image reads are index-covered.
- **Group FK / client-scoping:** N/A — PosturPro is single-tenant (one store).
- **Unused authoritative column:** `product_variants` has a **UNIQUE `sku`** column that
  `ProductVariantView` deliberately omits (not needed for display). Correct minimal
  projection AND the exact seam T6 needs — see Forward-Compatibility.

## API Review

No REST endpoints — the single write is a Next.js **server action** (`submitQuestion`), the
right primitive for a form post.

- **Result contract:** `QaFormState` is a discriminated union
  (`success | invalid | rate-limited | unavailable | error`) with `fieldErrors`/`values`/
  `submissionId` — a clean, serializable, consistent shape for `useActionState`. Error
  mapping never echoes `error.message` to the DOM (RLS `42501` → "unavailable"; else
  retryable "error"). Matches the `fail()` philosophy.
- **Idempotency:** the action is intentionally not idempotent (each submit inserts one Q&A
  row) — correct for a question post; `submissionId` drives client focus/reset, not server
  dedup. No concern here — but see the T8 precedent note.
- **Cache invalidation:** `updateTag(product:<slug>)` on success is the correct
  read-your-own-writes purge for a server action, consistent with the T3 tag scheme.
- **IP trust model:** `clientIp()` prefers `x-vercel-forwarded-for` → rightmost XFF hop →
  `x-real-ip` → shared `"unknown"` bucket (M-3). Well-documented residual risk; acceptable
  for a best-effort limiter behind the Vercel edge.

## Data-Flow & Caching Assessment

- **Invalidation story (T10/T11):** The tag scheme is **sufficient and consistent** — the
  PDP read is tagged `catalog` + `product:<slug>`, exactly parallel to T3's
  `brand:`/`category:`/`style:` scheme. **Gap for T11 (not a T4 defect):** today the ONLY
  code that busts `product:<slug>` is the Q&A action. When T11 admin edits a product's name,
  price, images, or variants it MUST `revalidateTag(product:<slug>)` AND the catalog listing
  tags (`catalog`, plus the relevant `brand:`/`category:`/`style:`), or PDPs serve up to
  `CATALOG_REVALIDATE_SECONDS` (5 min) stale. T4 leaves the correct seam
  (`productCacheTag(slug)` is exported and reusable); T11 must wire it.
- **generateStaticParams growth:** 60 paths today (30 slugs × 2 locales) —
  `listActiveProductSlugs()` × `routing.locales`, linear and unbounded. At 1,000 products
  that is 2,000 prerendered pages at build; at 10,000 it is 20,000 and build time/memory
  become material. `dynamicParams = true` is (correctly) left on, so products beyond the
  prerendered set still ISR on first hit — meaning the build set can be safely *capped* later
  (prerender top-N best-sellers, let the long tail render on demand) without breaking
  correctness. A known scaling lever, not a T4 problem. Backlogged.
- **RSC stream / island payload:** `ProductPurchasePanel` receives the FULL `variants[]` and
  `allImages[]` arrays plus a `variantDisplay` map serialized into the client island. For a
  chair (a handful of colors, ~4–8 images each) this is a few KB — fine. It grows linearly
  with variants × images; a pathological product (40 variants × 10 images = 400 image rows +
  40 display bundles) would bloat the RSC payload and hydration. No such product exists in
  the furniture domain, so this is a theoretical ceiling — worth a note so T11's
  variant/image management doesn't let an admin create a 100-image product without anyone
  realizing it all ships to the client. Backlogged LOW.

## Scalability Assessment

| Concern | Severity | When it bites | Recommendation |
|---------|----------|---------------|----------------|
| In-memory Q&A rate limiter (per-instance, resets on deploy/scale-out) | Med | Multi-instance/serverless deploy — each instance has its own Map, so effective limit = N×config | Acceptable now (ticket-sanctioned; honeypot + M-2 map cap are backstops). Make durable (Upstash/Redis or a Postgres `rate_limits` table) if the limiter is ever reused beyond best-effort Q&A. See T8. |
| Q&A read: no composite index; in-memory sort | Med | T11-era volume: a product with hundreds of published Q&A → sort-in-memory per revalidate (ISR caps cost to per-revalidate, not per-request) | Add `(product_id, is_published, created_at DESC)` in the T11 migration. |
| No pagination / display cap on PDP Q&A list | Med | T11 answering makes long published lists real → whole set serializes + renders unbounded | Add `QA_DISPLAY_LIMIT` + "show more" in T11. ~0 published Q&A today, so no live impact. |
| `generateStaticParams` linear growth | Low | ~1,000+ products → long builds | Cap prerender to top-N; rely on `dynamicParams=true` ISR for the tail. |
| Island payload = all variants+images | Low | A T11-created product with dozens of variants/images | Note in T11 variant/image UX; lazy-load non-selected-variant image metadata past a threshold. |
| `listActiveProductSlugs` unbounded SELECT | Low | Reads every active slug, no limit; fine to thousands, tag-cached | Leave as-is; revisit with the `generateStaticParams` cap. |

No unbounded fetches in the hot path, no per-request expensive operations (ISR absorbs the
read cost), no WebSocket/connection concerns. Read profile (1 detail + 3 batched children,
all cached) matches the T3 stitch cost.

## Forward-Compatibility with the Roadmap

- **T6 (Cart) — CLEAN SEAM. ✅** The cart needs a variant id per cart line and authoritative
  per-variant stock at add-to-cart time. T4 gives T6 exactly this: selection state lives in
  one island with `selectedVariantId` always resolvable, `ProductVariantView` carries `id` +
  `stock`, and `product_variants` has a UNIQUE `sku` T6 can project for a stable line
  identifier. **The add-to-cart button is (correctly) NOT rendered** — no dead affordance to
  unwind. **Reinforces the existing T3 backlog item:** T6 must read *authoritative* stock via
  the deferred `effective_stock` view / reservation RPC, NOT `stock.ts`/`variantStockState`
  (display-only, ISR-stale). Already backlogged from T3; T4 changes nothing and tempts no
  shortcut.
- **T5 (Search/Filters) — NO COUPLING. ✅** T4 adds a per-slug detail read; it does not touch
  the listing/filter path and introduces no client-side variant-stitch T5 would have to
  unwind. The existing T3 backlog (DB-side filtered query path, filter/sort indexes,
  cache-key cardinality strategy) stands unchanged. T4 does not constrain T5.
- **T8 (Payment) — PRECEDENT RISK, NOT A DEFECT. ⚠️** The in-memory `Map` limiter is fine for
  best-effort Q&A spam control, but it sets a pattern that would be **wrong** for T8's
  webhook idempotency, which requires a DURABLE store (a processed-events table with a unique
  constraint on `mp_payment_id`) so duplicate deliveries are safe across instances/restarts.
  The webhook-idempotency-ledger item is already backlogged from T3; the concrete
  recommendation: **do not generalize `submit-guard.ts`'s in-memory Map into the payment
  path.** The doc comments in `submit-guard.ts`/`config.ts` already say "durable is a
  documented follow-up" — correct signal.
- **T11 (Admin Q&A answering) — COMPATIBLE. ✅** The data model + `is_published`/`answer`
  filter is exactly what T11 needs: admin sets `answer` + `is_published=true` + `answered_at`
  (all blocked from anon by RLS), and the PDP filter (`is_published AND answer IS NOT NULL`)
  surfaces it. `product:<slug>` is the invalidation seam T11 reuses. Two T11 obligations
  (backlogged): (a) `revalidateTag(product:<slug>)` on answer-publish AND any product-field
  edit, plus catalog listing tags; (b) add the composite index + PDP Q&A pagination before
  volume is real.

## Tech Debt Ledger

| Item | Type | Impact | Effort | When it bites |
|------|------|--------|--------|---------------|
| No composite `(product_id, is_published, created_at)` index (m-4 SKIPPED) | Existing (pre-T4) | Med | S | T11 Q&A volume |
| PDP Q&A list has no pagination/display cap | Introduced | Med | S | T11 answering makes long lists real |
| In-memory rate limiter (per-instance) | Introduced (ticket-sanctioned) | Med | M | Multi-instance deploy; reuse for T8 |
| `firstOrSelf` duplicated `queries.ts` ↔ `product-detail.ts` (n-4 SKIPPED) | Introduced | Low | S | Third copy / drift |
| `fail()` + slug-select + tag boilerplate duplicated across the two read modules | Introduced | Low | S | T5 adds a third read module |
| `generateStaticParams` unbounded prerender | Introduced (latent) | Low | S | ~1,000+ products |
| Island serializes all variants+images | Introduced (latent) | Low | S | A T11-created product with dozens of variants/images |
| Q&A composite spam controls (durable limiter/CAPTCHA) | Existing (T1 backlog) | Med | M | Real public traffic |

**Debt REDUCED by T4:** the M-1/M-2/M-3/M-4 Stage-6 fixes closed real issues (per-entry
stock labels, unbounded rate-limit map, XFF spoofing, dead `defaultVariant`). No time bombs
introduced; the two behavior-changing fixes (limiter, query filter) are flagged for QA.
Dependency health: **zero new deps** (correct); relies on installed `radix-ui`, `next-intl`,
`@supabase/supabase-js`, `@hugeicons/*` — all current.

## Boy-Scout & Clean-Code Posture

- **File sizes:** all new files well under the ~400-line guidance (`product-detail.ts` 281,
  `submit-guard.ts` 181, `page.tsx` 254, `product-purchase-panel.tsx` 234). Healthy.
- **Functions:** small, one level of abstraction, intent-revealing names. No magic values —
  every tunable is in `config.ts` with a doc block and `_MS`/`_MAX` unit suffixes.
- **Errors never silenced:** `fail()` logs + throws; the Q&A action logs with context + maps
  to friendly enums; recently-viewed swallows storage errors deliberately with a single
  guarded `warnOnce` (edge 7 — justified, not a swallowed bug).
- **DRY debt (cross-cutting with T3):** the SKIPPED n-3 (container/rhythm literals) and n-4
  (`firstOrSelf` hoist) are real but correctly deferred — hoisting `firstOrSelf`/`fail`/tag
  helpers touches T3's tested `queries.ts`, out of T4 scope. This is now a genuine
  cross-module pattern (two read modules, a third coming in T5) and **worth a small dedicated
  refactor task** to extract a shared `catalog/read-primitives.ts` (`fail`, `firstOrSelf`,
  tag builders) BEFORE T5 mints a third copy. Backlogged.
- **Storage schema versioning:** `RECENTLY_VIEWED_STORAGE_KEY` is versioned (`:v1`) with a
  doc note to bump on incompatible change, and `isEntry` is a defensive shape guard that
  drops malformed/old entries (m-5 hardened the spread fields). The migration story is sound:
  a shape change bumps the key suffix → stale payloads are ignored, not mis-rendered.

## Refactors Applied

None — this stage is read-only on source per the orchestrator instruction (parallel with
Stage 9 Security). All findings are documented recommendations mapped to future tasks, with
backlog entries appended to `tasks/clean-code-backlog.md`.

## Architecture Score: 8.5/10

T4 is a textbook additive feature — it reuses the T3 architecture faithfully, introduces no
data model risk, keeps a clean single-island + pure-lib boundary, resolves i18n server-side,
and honestly documents + backlogs its known limits rather than hiding them. A new developer
in 6 months reading `product-detail.ts` next to `queries.ts` will immediately understand the
shared idiom. The half-point deductions: accepted-but-real DRY debt that now spans two modules
(the `firstOrSelf`/`fail`/tag duplication that should be extracted before T5 mints a third
copy) and two latent scaling ceilings (unbounded `generateStaticParams`, unpaginated Q&A) —
none of which bite in T4's lifetime, all with a clear owner task. Not a 10 only because the
DRY extraction should have been a small in-scope refactor rather than a third deferral.

## Recommendation: APPROVE

No architectural blockers. The design is sound, scales for Phase 1, and leaves clean seams
for T5/T6/T8/T11. Recommendations are all future-task-mapped, not T4 rework.

### Recommendations mapped to future tasks

- **T5:** No T4-imposed constraint. Honor the existing T3 backlog (DB-side filter path,
  indexes, cache-key strategy). When adding a third read module, first do the read-primitives
  extraction below so it doesn't copy `fail`/`firstOrSelf` a third time.
- **T6:** Consume the clean variant seam (`selectedVariantId` + `ProductVariantView.id` +
  `sku`). Read authoritative stock via the deferred `effective_stock` view / reservation RPC
  — NOT `stock.ts`/`variantStockState` (display-only, ISR-stale).
- **T8:** Do NOT reuse the in-memory `Map` limiter pattern for webhook idempotency — use the
  durable processed-events ledger (already backlogged). Promote the Q&A limiter to durable
  only if it ever guards more than best-effort Q&A spam.
- **T10/T11:** Wire `revalidateTag(product:<slug>)` + catalog listing tags on every product
  edit and Q&A publish (the `productCacheTag` seam is ready). Add the Q&A composite index and
  PDP Q&A pagination/display cap before answering makes long lists real.
