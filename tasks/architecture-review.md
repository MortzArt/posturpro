# Architecture Review: T5 — Search, Filters & Sorting

**Reviewer:** ultraarch (Stage 10) · **Scope:** commits 033dafe, 7fe75f5, a7cd15a, f5dceb1, c4ba5c2
**Mode:** read-only on source (recommendations only) · **Parallel with:** Stage 9 (Security)

## Summary

T5 introduces a genuinely new subsystem — a DB-side filtered/sorted query path
(`search_products` RPC) — and does it with unusual discipline: the security
model mirrors `products_public`, the cache-cardinality DoS was reasoned about
and defused, the read primitives were extracted before the third consumer
copied them, and the SSR-first / JS-off constraint was honored at real cost to
the team's preferred pattern (Suspense/streaming). This is a **sound
foundation**, not a trap. The concerns are all *scale-latent* (they bite at
catalog growth or when T7 starts writing orders, not today) and are precisely
the kind an architect should backlog now so they don't surprise a future dev.

**Verdict: SOUND — 8.5/10.** Approve. No blocking refactor. Seven forward-mapped
backlog entries added.

---

## Pattern Compliance

| Pattern | Status | Notes |
|---------|--------|-------|
| Separation of concerns | ✅ | Pure parse/serialize (`search-params.ts`), pure chip builder (`active-filter-chips.ts`), DB reads (`search.ts`/`facets.ts`), RPC in migration, components render. Business logic is out of components. |
| Boundary validation | ✅ | Every URL value treated as hostile in `parseCatalogFilters`: unknown ids dropped against `KnownFacetValues`, `q` truncated, price sanitized, sort snapped to closed set, inverted price dropped. RPC fully parameterized. |
| Typed contracts | ✅ | `CatalogFilters` is the single canonical shape UI + query layer consume; RPC typed in `database.types.ts`; no `any`, no `!`. `SearchRow`/`CoverRow`/`SearchArgs` interfaces at the boundary. |
| Service layer (views → services → models) | ✅ | Page → `search.ts`/`facets.ts` → RPC/anon client. Page never touches Supabase directly. RPC reads only anon-safe surfaces (`products_public` + `product_variants` + `product_categories`). |
| Type safety | ✅ | `tsc` clean; `SortKey` derived from `SORT_KEYS` const so the sort union can't drift from config. |
| shadcn patterns | ✅ (justified deviation) | input/checkbox/select/slider/badge/label installed via CLI. `FilterSheet` built on Radix Dialog + repo `.drawer-panel` instead of shadcn `sheet` — deliberate, to reuse the already-proven interruptible MobileNav motion rather than retrofit `tw-animate-css` keyframes. Reasonable and documented. |
| Cache-key discipline | ✅ | Free-text never cached; filter-only cached under a canonicalized bounded key (sorted known ids, closed sort, bucketed price, `canonicalPageKey`). Directly closes the T3 cache-DoS backlog item. |
| No new deps | ✅ | Zero npm additions; extensions ship with the Supabase image. |

---

## Data Model Review

**No table/column changes** — additive migration only (2 extensions, 1 RPC, 7
indexes). Backward-compatible, `if not exists`/`create or replace` throughout, so
`db reset` (0001→0007) and live re-apply are both idempotent. This is the right
shape for a read-path feature.

**The RPC as a foundation — sound, with a versioning caveat.** `search_products`
is the correct choice over PostgREST-embedded filters (can't filter parent by a
child aggregate or return a filtered count) and over a materialized view (refresh
machinery for no benefit at this scale, still can't take runtime params). The
`COUNT(*) OVER ()` "page rows + filtered total in one round trip" is the right
call. `SECURITY INVOKER` + `revoke from public` + `grant anon/authenticated` +
`set search_path = public` is textbook and mirrors the `products_public` grant
discipline. Anon cannot reach `cost_price_cents` by construction (view omits it,
base table ungranted) — verified belt-and-suspenders.

**Function-in-migration versioning story.** The RPC is `create or replace`, so
0008+ can `ALTER` it by re-declaring the whole body in a new migration. The
discipline to hold: the RPC's arg signature is repeated verbatim in the
`revoke`/`grant` statements (12-type list) — any future arg change must update
**three** places in lockstep (signature, revoke, grant) or the grant silently
drops. There is also the usual drift risk: the live DB was patched via
`docker exec psql` during dev, so the migration file is the source of truth only
if every future change goes through a migration (never a live-only `create or
replace`). Recommend a one-line convention note in 0007's header for 0008 authors.
(Folded into T5-4/T5-7 discipline; no separate entry.)

**AC-6 parity is structurally guaranteed, not just tested.** The RPC's
`COALESCE(SUM(v.stock), pp.stock)` is byte-identical to `effectiveStock()`;
SUM over zero variants is NULL → COALESCE falls to product stock exactly in the
no-variant case. This is the one place a search path could silently diverge from
the display path, and it's pinned correctly.

**Index reality (EXPLAIN-verified against :54322, 30 products / 69 variants):**
At seed scale the planner **seq-scans everything** — correct, because the tables
are tiny (a 12ms–37ms function scan). The indexes are forward-looking. But two of
them are **dead by construction**, not merely unused-at-scale:

1. **pg_trgm GIN indexes can't serve the keyword branch.** The predicate wraps the
   column in `unaccent(lower(...))`, so a plain-column trigram index is not
   matchable. The migration's own comment admits this. `EXPLAIN ANALYZE` on
   `?q=ergonomica` confirms: `Seq Scan on products` with a Filter (24 rows removed),
   GIN untouched, ~22ms.
2. **`product_variants_color_hex_idx` can never serve the color filter.**
   `color_hex` is stored **mixed-case** (`#1D4ED8`, `#B91C1C` in the live DB); the
   filter does `lower(v.color_hex) = any(<lowercased array>)`. The plain index is on
   the raw (mixed-case) column, so the lowercased predicate can't use it — even at
   scale. EXPLAIN confirms the color-EXISTS branch seq-scans.

Neither is a correctness bug and neither hurts at 30 rows. Both become real full
scans once the catalog is large. The fix in both cases is a **functional index**
(`gin(f_unaccent(lower(name)) gin_trgm_ops)` requires an IMMUTABLE unaccent wrapper;
`btree(lower(color_hex))` or normalize the stored casing). Backlogged for the
growth milestone (T5-2, T5-3).

**Best-selling semantics (Constraint 4) hold through T7.** `sales_count DESC,
is_best_seller DESC, name ASC, id ASC` is deterministic today and becomes truthful
automatically when T7 increments `sales_count` on paid orders — **no materialized
count needed**, no re-sort logic to change. `listPopularProducts` reuses the exact
ordering so the no-results strip never diverges. This ages well; the only future
watch item (a concurrency-safe `sales_count` increment) belongs to the existing T7
reservation backlog, not here.

---

## API Review

No new HTTP endpoints — access is the Supabase RPC via the cookie-free
`createPublicClient()`, called server-side only. Consistent with the T3/T4 read
layer. The RPC "contract" (typed args + `TABLE(...)` return) is versioned
implicitly by the migration file and typed in `database.types.ts`.

**The one genuine API-shape concern: the double RPC call per page.**
`readSearchPage` runs a **probe at offset 0** to learn `total` and clamp `?page`,
then runs the **real read** at the clamped offset. Page 1 reuses the probe (one
call); pages 2+ pay **two** full RPC invocations, and each invocation materializes
the entire filtered set (the `COUNT(*) OVER ()` window forces it before LIMIT). At
30 rows this is invisible (probe = the whole catalog). At scale, a deep `?page=N`
on a broad filter does the full filter+sort+count **twice**. This faithfully
carries the T3 "count-first, then clamp" pattern (correct for avoiding 416s), but
the RPC could return the count on the *clamped* page in a single call if the clamp
were computed DB-side, or the probe could be a count-only variant. Backlogged
(T5-4) as a scale optimization, not a correctness issue.

Pagination hrefs correctly preserve filter state (`makeHrefForPage(base, query)`)
and page-1 self-canonicalizes to the clean filtered URL. Param names single-sourced
in `SEARCH_PARAM_KEYS`.

---

## Frontend Architecture

21 T5 feature components in `src/components/catalog/` (25 files incl. pre-T5). This
is **cohesive, not sprawl** — every file is one concern (search-box, sort-select,
color-swatch, filter-controls, filter-panel, filter-sheet, active-filters,
no-results, catalog-toolbar, catalog-shell, search-results, catalog-grid-region,
result-announcer). None over 301 lines. The server/client split is clean and the
`"use client"` boundary is drawn at the smallest reasonable node.

**One structural watch item: the client-context ladder.** `CatalogShell` wraps
`FilterNavigationProvider` (shared `useTransition` + serialize/apply) **and**
`ResultAnnouncerProvider` (persistent live region, added in the UX stage to fix
M-7). Two providers today, both justified, both single-purpose — **not** yet a
god-context, but the seed of one: the next dev who needs "another piece of shared
catalog client state" will be tempted to bolt it onto one of these. Watch, don't
fix (T5-5).

The **SSR-first inline-`await`** decision (Stage 7b, dropping `<Suspense>`) is the
correct trade for the no-JS constraint and is well-documented in `page.tsx`. It is
**not** permanently incompatible with streaming — it's a consequence of Next's
current dynamic-route `$RC` streaming-holder behavior with JS off; PPR/`cacheComponents`
in a future Next upgrade re-opens streaming without breaking no-JS (T5-6).

---

## Scalability Assessment

| Concern | Severity | When it bites | Recommendation |
|---------|----------|---------------|----------------|
| pg_trgm GIN dead for accent-insensitive keyword search (column wrapped in `unaccent(lower())`) | Med | Catalog grows past a few hundred products; every `?q=` is then a full seq scan | IMMUTABLE unaccent wrapper + functional GIN index on name/description/brand.name. Backlog T5-2. |
| `product_variants_color_hex_idx` unusable — mixed-case storage vs lowercased predicate | Med | Color filter on a large variant table = seq scan even with the index present | Normalize stored `color_hex` to lowercase (+CHECK) OR add `btree(lower(color_hex))`. Backlog T5-3. |
| Double RPC per page (probe + read) + `COUNT(*) OVER ()` materializes full filtered set | Med | Deep pagination on a broad filter at scale runs the full filter+sort+count twice | Single-call DB-side clamp, or a count-only probe variant. Backlog T5-4. |
| `/sillas` blocks on the RPC inline (no streaming) → TTFB = RPC latency | Low→Med | If RPC p95 climbs past ~150–200ms (large catalog, cold cache, remote DB), TTFB degrades with no skeleton to mask it | Next 16 `cacheComponents`/PPR (static shell + dynamic results hole) on upgrade; or an edge-cached shell. Version-specific, NOT permanent. Backlog T5-6. |
| malla / mesh search-scope gap (materials unsurfaced by keyword) | Med | Now — a shopper searching "malla" misses mesh chairs whose mesh lives only in `material_*` | Materials-in-search-text (recommended) — see backlog T5-8. |
| Filter-combo cache cardinality | Low | Handled — bounded canonical key; free-text bypasses cache entirely | None. Closes T3 backlog item. |
| Facet reads full-scan variants/products | Low | Large catalog; but `catalog`-tag cached, recompute only on revalidate/admin-save | Acceptable; revisit only if facet reads dominate ISR recompute. |

**No unbounded fetches introduced.** Every read is `LIMIT`-bounded (RPC `p_limit`,
popular `POPULAR_PRODUCTS_MAX`, cover batch scoped to the page's ids). The category
membership `.in()` scale ceiling is a **pre-existing** T3 item, correctly *not*
re-solved here (search doesn't route through that path).

---

## Forward-Compatibility (T6–T14)

- **T6 Cart — no harmful coupling.** URL-state/filter architecture is entirely
  read-side (`searchParams` → `CatalogFilters` → RPC). `ProductCard` stays a pure
  server component with a single `<Link>` wrapper, so the backlogged T6 quick-add
  client island slots in unchanged. Nothing in T5 constrains cart state. ✅
- **T7 Checkout / best-selling truth — ages correctly** (see Data Model). No
  materialized count required. ✅
- **T11 Admin edits / cache invalidation — coherent, NOT a T4-style gap.** The
  filter-combo cache entries are tagged `CATALOG_CACHE_TAG` (`"catalog"`), the same
  tag all facet/taxonomy/listing reads use. There is currently **no**
  `revalidateTag("catalog")` call anywhere (only doc comments reference it) — correct,
  since no write path exists yet. When T11 lands its admin save and calls
  `revalidateTag("catalog")`, the filter-combo entries bust **with** everything else.
  No new invalidation surface, no orphan tag. Caveat: T11 must remember search
  facet-value sets (colors/materials/price domain) are also `catalog`-tagged, so a
  save that adds a variant color re-derives the known-color set on next read. Flagged
  as a T11 note (T5-1). ✅
- **T13 Homepage "featured/popular" — reusable, with a shape caveat.**
  `listPopularProducts(limit)` is exported cleanly from `search.ts`, filter-
  independent, always cached, best-selling order — T13 can reuse it directly for
  "popular." BUT "featured" is a different intent; if T13 wants editorial ordering it
  needs a new path (or a `sort` param on a shared helper), NOT a cargo-culted copy.
  Recommend T13 reuse for popular and not overload it for featured (T5-1). ✅
- **T14 SEO — centralized enough.** Canonical/noindex logic lives in one place
  (`generateMetadata` in `sillas/page.tsx`). It is page-local, not a shared util, so
  if T14 adds faceted URLs on other routes the rule must be lifted into a shared
  helper rather than re-derived. Fine now; note for T14.

**"Which read path do I use?" — the rule is clear enough to not cargo-cult.**
`queries.ts` = view+stitch for taxonomy/unfiltered listings; `search.ts` = the RPC
for anything variant-filtered/searched/availability-filtered/custom-sorted;
`product-detail.ts` = single-product deep read. `search.ts`'s header documents when
to use it. The soft spot: nothing *enforces* the rule — a future dev could reach for
`search.ts` for a simple unfiltered list (works, but skips the cheaper view path).
Worth a one-line decision-guide comment when `queries.ts` is split (existing T3 LOW).

---

## Read-Layer Coherence

The T4-flagged duplication **was** eliminated: `fail()`/`firstOrSelf()` now live
once in `read-primitives.ts`, imported by `queries.ts`, `product-detail.ts`,
`search.ts`, and `facets.ts` — no third/fourth copy; suite stayed green across the
extraction. ✅

**Partial-extraction nit (minor):** `read-primitives.ts` also exports `cachedRead()`,
but only `facets.ts` uses it. `queries.ts` (~8 sites) and `search.ts` (2 sites) still
call `unstable_cache(...)` **inline** with the `{ tags, revalidate }` shape written by
hand. So "single-source the cache boilerplate" is half-done — the wrapper exists but
the two biggest consumers didn't adopt it. Not a bug (identical behavior), and
`search.ts` has one legit inline site (conditional caching), but a reader sees two
cache idioms in the same module family. Backlogged as cleanup (T5-7), low effort.

**Cache posture is ONE mental model, not three:** "bounded key ⇒ cache under the
`catalog` tag; unbounded (free-text) ⇒ never cache." T3 entity reads, filter-combo
reads, and facet reads all follow it; free-text search is the single documented
exception. Coherent.

---

## Tech Debt Ledger

| Item | Type | Impact | Effort to Fix |
|------|------|--------|---------------|
| pg_trgm GIN indexes present but unusable (column-wrapping) | Introduced (documented) | Med (at scale) | M |
| `color_hex` index unusable (mixed-case vs lowercased predicate) | Introduced (undocumented until now) | Med (at scale) | S–M |
| Double RPC per page + full-set materialization | Introduced (T3 pattern carried) | Med (at scale) | M |
| `cachedRead` wrapper adopted by only 1 of 3 consumers | Introduced | Low | S |
| Free-text `unaccent` JS-vs-Postgres divergence (m-2, skipped) | Existing/deferred | Low (Spanish-only today) | S |
| malla / mesh search-scope gap (materials not in searchable text) | Introduced (UX-deferred) | Med (real discovery miss) | S–M |
| T3 cache-DoS cardinality item | **Reduced** (closed by Constraint 3) | — | — |
| T4 read-primitive duplication | **Reduced** (closed by extraction) | — | — |
| T3 filter/sort index gap | **Reduced** (indexes added; caveats above) | — | — |
| queries.ts 710 lines (split before more logic) | Existing (T3 LOW) | Low | M |

**On the two Stage-5 skipped minors (m-1, m-2): still right to skip.**
m-1 (`fail()` log prefix consolidation) is intentional and redacted — no live bug.
m-2 (JS `unaccent` vs Postgres `unaccent` divergence) is Spanish-only today and the
JS side is only used to derive the *material facet terms*, so a divergence would at
worst mislabel a material option, never silently empty results — leaving it is fine
until the catalog goes multi-locale content-wise. Confirmed as low, deferred.

No time bombs. Dependency health: no new deps; extensions Supabase-bundled.

---

## Refactors Applied

**None.** Read-only architecture review (parallel with Stage 9 Security). No source
changes. Every finding is scale-latent or a low-effort cleanup better sequenced into
its target future task; none warrants a high-risk refactor of a green
569-unit / 110-integ / 259-e2e suite at this gate.

---

## Architecture Score: 8.5/10

Will this make sense in 6 months with 2× the team? **Yes.** The subsystem is
small-filed, single-concern, and documented at exactly the decision points a future
dev will question (why RPC, why not cache free-text, why inline-await, why
Radix-not-shadcn-sheet, why bucketed price). Security and cache models are coherent
and reuse established patterns. The −1.5 is entirely for the two **dead-by-construction
indexes** (they read as "covered" but aren't — the kind of thing that bites silently
at scale) and the double-RPC-per-page pattern, all mapped to backlog with concrete
fixes. Nothing here is a redesign risk; the RPC is a foundation cart/homepage/admin
can build on without unwinding it.

## Recommendation: **APPROVE**

Ship T5. Carry the seven backlog entries forward to their mapped tasks. No blocking
work.
