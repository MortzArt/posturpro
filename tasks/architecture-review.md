# Architecture Review: T19 — Homepage rebuild + product condition grades

Stage 10 (Arch). Reviewer: staff architect. Scope = `git diff 5d462ee..HEAD` (86 files, +4941/−1875). Read-only on source; this report is the only write. Runs in parallel with Stage 9 (Security).

## Summary

A disciplined, systems-coherent full-stack change. The condition-grade data model is minimal and correctly shaped for Phase-2 evolution; `grade.ts` is a genuine single source of truth. The 13-section homepage is a thin server-component composition with exactly one client island. The token architecture (green palette + dedicated `--cta` orange, storefront-scoped) holds the admin/storefront firewall. The one real architectural debt is a **brand-narrative coherence gap**: the T15 "cobalt/azulejo" identity survives in live and orphaned surfaces that T19's palette swap silently contradicts. Everything else is APPROVE-grade.

## Pattern Compliance

| Pattern | Status | Notes |
|---------|--------|-------|
| Separation of concerns | ✅ | Sections render; calculator math in `lib/catalog/savings.ts`; prices in `lib/config/calculator.ts`; validation in `lib/admin/products/product-input.ts`. No business logic in components. |
| Boundary validation | ✅ | `isConditionGrade` guard applied at every trust boundary: admin write (`parseConditionGrade`), search read (`gradesFor`), PDP read (`product-detail.ts:258`), badge render. DB enum is the backstop (integration-tested to reject `'C'`). |
| Typed contracts | ✅ | `ProductConditionGrade` union derived from `PRODUCT_CONDITION_GRADES` const; no `any`, no non-null `!` in source (two test `!`s replaced with narrowing in Stage 6). |
| Service layer (view → lib → DB) | ✅ | Reads flow through `products_public` via `lib/catalog/*`; writes through existing admin server actions. No new HTTP surface; grade rides the established `search_products` + batch-stitch pattern (mirrors cover-image stitching). |
| Type safety | ✅ | `tsc --noEmit` 0 errors. Supabase types hand-edited per repo convention (split hand-maintained modules). |
| shadcn patterns | ✅ | New `cta` button variant + `xl` size added to the existing `cva`; calculator uses shadcn Select; FAQ uses native `<details>` (no new dep, CSP-safe). |

## Data Model Review

**Grade shape — correct choice.** A Postgres `enum` (not a check constraint, not a lookup table) is right for a 3-value, rarely-changing, presentation-only attribute. A lookup table would add a join and FK for zero current benefit; a check constraint would lose the named type reused across the view and generated types. The nullable, no-default, no-backfill column is the correct additive migration — every existing row → NULL, zero data risk (AC-4, integration-verified).

**Single source of truth — genuine.** To add a grade "C" you touch: (1) `src/lib/catalog/grade.ts` — the `PRODUCT_CONDITION_GRADES` array (the real source; validation, read-guard, badge, admin all derive from it); (2) a migration `ALTER TYPE ... ADD VALUE 'C'`; (3) the four hand-maintained Supabase type modules (`enums.ts`, `tables-products.ts`, `tables-catalog.ts`, `database.ts` — mechanical mirror); (4) two message-file labels. The DB-enum ↔ generated-types duplication is an inherent Postgres cost, not a T19 flaw. `product-input.ts`, `search.ts`, `grade-badge.tsx`, `recently-viewed.ts`, `product-detail.ts` all need **zero** changes — they consume the const/guard. The design works as intended.

**View regeneration pattern — the one durable-guard gap.** Migration 0016 regenerates `products_public` by copying 0005's explicit column list forward and appending `condition_grade` (never `select *`). This is the correct *security* posture (no internal-column leak) and grants are correctly restored to 0005/0015 posture (integration-tested: anon SELECT-only, no insert/update/delete, base table ungranted). **But** the only automated guard is a *negative* one — tests assert `cost_price_cents` is absent. There is **no positive column-set pin**: if the next dev adds a public column to `products` and forgets the view, no test fails; the column silently never reaches cards/PDP. Failure mode is a missing feature, not a leak — so severity is Medium, not High. Recommendation below.

**Indexes.** None needed — grade is display-only (Out of Scope explicitly defers grade filter/sort). If/when a grade facet lands (Phase 2), a partial index `where condition_grade is not null` should accompany it.

## API Review

No new HTTP endpoints (correct — grade rides existing admin server actions and cached reads). The search read path deserves a scalability note: `gradesFor` issues a **second** `products_public` round trip per page to stitch grades, parallel to the cover-image batch (`Promise.all([coversFor, gradesFor])`). This honors AC-9 without a second migration or touching the T16 RPC, and is the pragmatic call at seed scale. Phase-2 note below — fold it into the RPC eventually.

## Scalability Assessment

| Concern | Severity | Recommendation |
|---------|----------|----------------|
| Homepage RSC weight (13 sections) | Low | Pure server components; only strings + a handful of featured products cross the wire. One client island (calculator). No unbounded fetch — featured products capped at `HOME_FEATURED_PRODUCTS`. |
| `gradesFor` extra round trip per catalog page | Low→Med (Phase 2) | Fine at seed scale (batched by id, `Promise.all` with covers). Fold `condition_grade` into the `search_products` RPC return when it's next revised. |
| Calculator bundle | Low | Client island imports only React hooks + shadcn Select + `formatMXN` + pure `computeSavings`. No heavy deps. Bars animate `transform: scaleX` (compositor-friendly, no CLS). |
| Build staticness | Low | 133 static pages, exit 0 — homepage stays statically rendered; grade reads cached under `CATALOG_CACHE_TAG`, revalidated on admin save. |
| Motion / CLS | Low | New motion classes animate transform/opacity only, all reduced-motion gated. |

## Tech Debt Ledger

| Item | Type | Impact | Effort |
|------|------|--------|--------|
| **Stale brand-narrative surface** — `direction-contract.tsx` (LIVE, imported in `[locale]/layout.tsx`) emits a build-embedded comment still declaring the T15 "cobalt `#1545a2` / azulejo" identity; T19 shipped greens + orange. The direction contract now misdescribes the shipped design. | Introduced (by omission) | Med | S |
| **Orphaned `editorial-band.tsx` + test** — dropped from `page.tsx` in the recompose, not deleted; only referenced in a comment. Dead code (CLAUDE.md: delete unused code). | Introduced (by omission) | Low | S |
| **`products_public` has no positive column-set pin** — only `cost_price_cents`-absence is tested; new-column drift unguarded. | Existing, un-reduced | Med | S |
| **`gradesFor` second query per page** — extra `products_public` read to stitch grades; should fold into the RPC. | Introduced (accepted) | Low | M |
| **base-button `transition-all`** — shared button `cva` (line 8) animates more properties than needed; deferred per Stage-6 notes. | Existing | Low | S |
| **Admin `--sidebar-primary` still cobalt** (`globals.css:165`, `:root`) | Existing (out of scope) | None | — |

Reduced debt this cycle: motion layer extracted from `globals.css` (was over the 1,000-line hard cap) into three domain files + a new `css-line-count.test.ts` guard; footer placeholder hrefs centralized into `lib/config/footer-links.ts`.

## Coherence / firewall checks (verified)

- **Palette swap complete at the token layer** — no hardcoded hex/oklch in any `src/components/home`, `layout`, or `grade-badge` file. All brand values flow through `.theme-storefront` token utilities. The only stranded cobalt is in *comments/narrative*, not applied styles (debt #1/#2).
- **Admin/storefront firewall holds** — `--cta*` and brand greens resolve only under `.theme-storefront`; admin `:root` stays neutral. Font-heading seam intact.
- **i18n parity durably guarded** — 623 keys, identical sets in `en.json` / `es-MX.json` (verified by direct diff: 0 unique to either). `messages.test.ts` + `keys-used.test.ts` fail CI on drift or empty leaf. Placeholders (stats, testimonials, calculator prices, footer links) are all owner-swappable via message files / config with zero code changes.
- **Reuse discipline clean** — T16 `QuoteForm` reused as-is via a serializable label bag (no fork); `GradeBadge`/`StockBadge` share grammar but are intentionally distinct (grade is single-treatment + colorblind-safe by design, not a red/amber scale); `footer-links.ts` config pattern is DRY.
- **Server/client split correct** — exactly one island (`savings-calculator.tsx`); FAQ is native `<details>`; all 11 other sections are pure server presentational; `B2BSection` is an async server component (justified — composes the reused form).
- **File caps** — largest touched: `page.tsx` 285, `site-footer.tsx` 218, `savings-calculator.tsx` 162. All under the 400 soft cap. All CSS files under the 1,000 hard cap (guard test added).

## Refactors Applied

None. Read-only architecture review. The two structural items (stale direction-contract, orphaned editorial-band) are code-quality debt best cleared by the fix/UX owner rather than an architect edit mid-parallel-stage, and neither blocks ship. Logged above with effort estimates.

## Recommendations (tagged)

1. **[now]** Update `direction-contract.tsx`'s committed narrative to the green/orange identity, OR delete it if the T15 direction-contract ritual is no longer load-bearing. A live artifact that lies about the shipped design misleads the next developer within a sprint. Effort: S.
2. **[now]** Delete orphaned `editorial-band.tsx` + `editorial-band.test.tsx` (and stale "EditorialBand" comment refs). Effort: S.
3. **[Phase 2]** Add a positive column-set pin for `products_public` — an integration test asserting the exact expected column set (or that every non-internal `products` column is present). Closes the view-drift gap the migration comment currently only documents. Effort: S.
4. **[Phase 2]** Fold `condition_grade` into the `search_products` RPC return to eliminate the `gradesFor` second round trip. Effort: M.
5. **[Phase 2]** When a grade facet/filter lands, add a partial index and the RPC filter arg together. Effort: M.
6. **[never]** Do not promote `--cta` to a general accent or repurpose `--primary` — the dedicated orange-for-CTA-only token is the correct constraint; keep it.

## Architecture Score: 9/10

Will this make sense in 6 months with 2x the team? Yes. The grade system is the kind of additive, single-source, guard-at-every-boundary change a new engineer extends by editing one array. The homepage is a legible server-composition shell. The token firewall means a future rebrand is a token-block edit, not a component sweep. The point off is the brand-narrative incoherence (a live artifact contradicting the shipped palette) plus the view-column-drift guard gap — both cheap to close, neither a ship blocker.

## Recommendation: APPROVE-WITH-NOTES

Approve for ship. The two `[now]` cleanups (stale direction-contract, orphaned editorial-band) are Small-effort hygiene that should be swept before or immediately after merge; the view-column pin is a Phase-2 durability improvement.
