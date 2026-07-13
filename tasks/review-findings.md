# Code Review: T5 — Search, Filters & Sorting

## Summary

Strong, security-conscious implementation. The SQL RPC layer is excellent — SECURITY
INVOKER, fully parameterized, grant discipline correct, availability semantics verified
byte-for-byte against `effectiveStock()` on the live DB, all edge cases (variantless +
color, all-OOS variants, accent-insensitive, offset bounds) proven correct. The
cache-key discipline and param-parsing lib are defensively bounded. i18n parity is
perfect (0 drift, ICU plurals correct in both locales), tsc/lint/tests green.

The material weakness is the **JS-disabled path**, which the ticket makes a first-class
requirement (AC-12, AC-13, edge 11). Four of seven filter facets, the availability
toggle, and the entire mobile filter/sort UI do NOT function without JavaScript, because
the shadcn/Radix `Checkbox` renders a `<button>` (no native submittable input server-side)
and the mobile Sheet is gated behind a JS-only Radix `Dialog.Trigger`. Free-text search,
color, price, sort, and chips degrade correctly; the checkbox facets do not.

**Verdict: REQUEST CHANGES.** No security or data-loss defects; the blockers are JS-off
functional gaps against explicit ACs plus one AC-18 motion violation.

---

## Critical Issues (MUST FIX)

### C-1: JS-off filter form submits none of the checkbox facets (Radix Checkbox has no native input)
- **ID**: C-1
- **Severity**: CRITICAL
- **File**: `src/components/ui/checkbox.tsx:15`; consumed at `src/components/catalog/filter-controls.tsx:72-81` (FacetCheckboxGroup) and `filter-panel.tsx:96-160`
- **Problem**: `Checkbox` is `CheckboxPrimitive.Root` (Radix), which renders `<button role="checkbox">`, not `<input type="checkbox">`. Radix only injects a submittable hidden `<input>` (`BubbleInput`) via client JS after hydration. With JS disabled, the category / brand / style / material `FacetCheckboxGroup`s and the availability toggle render as buttons that submit **nothing** — the `name`/`value`/`checked` props at `filter-controls.tsx:73-76` are inert server-side. The color facet (`filter-panel.tsx:143-145`) and price (`type=number`) and sort (native `<select>`) are handled correctly with hidden inputs / native fields; the four checkbox facets and availability are not. Worse: an existing `?marca=X` is also lost on a JS-off submit because no hidden input preserves it.
- **Impact**: AC-13 ("filter panel ... facets come from real DB values") and edge 11 ("the filter `<form>` submit[s] natively to `/sillas?...`; results render server-side") are FAILED for category, brand, style, material, and availability. A no-JS shopper cannot filter by five of the eight documented dimensions.
- **Suggested Fix**: Mirror the color-facet pattern used two files over. In `FacetCheckboxGroup`, for each currently-selected value render a real `<input type="hidden" name={paramName} value={value}>`, and render the interactive Radix checkbox for the JS-on toggle; OR replace the Radix checkbox with a styled native `<input type="checkbox" name value defaultChecked>` (a native checkbox submits JS-off AND enhances). Do the same for `AvailabilityToggle` (see C-2).
- **Status**: FIXED — Adopted the hidden-input-mirroring strategy (`filter-controls.tsx` `FacetCheckboxGroup`). For every *selected* value (including ones collapsed under "Ver más") a real `<input type="hidden" name={paramName} value={value}>` is rendered, so a native GET submits the full facet selection. The Radix `Checkbox` is now `name`-less (no hydrated `BubbleInput`), so it contributes nothing to a native submit and never double-posts alongside the hidden mirror; it remains the JS-on live toggle. Any active `?marca=X` etc. is therefore preserved on a native submit. Verified by curl: `/sillas?marca=<id>` renders `<input type="hidden" name="marca" value="<id>">`; the Radix button has no `name`.

### C-2: JS-off availability toggle cannot opt into out-of-stock; mobile has no filter/sort UI at all
- **ID**: C-2
- **Severity**: CRITICAL
- **File**: `src/components/catalog/filter-controls.tsx:118-147` (AvailabilityToggle); `src/components/catalog/filter-sheet.tsx:41-152`; sheet is the only mobile host per `catalog-shell.tsx:64` (`hidden lg:block` sidebar)
- **Problem**: (a) `AvailabilityToggle` admits in its own comment (`filter-controls.tsx:120-126`) that the JS-off model is not expressible — the hidden `disponibilidad=todos` input only renders when `!inStockOnly` (already opted-in), and the Radix checkbox emits nothing when unchecked, so a JS-off shopper starting from the default in-stock view can never reach out-of-stock. (b) `FilterSheet` mounts its content only when `mounted = open || closing`, both `false` initially, behind a Radix `Dialog.Trigger` button that requires JS to open. On `< lg` (mobile/tablet) with JS off, there are **zero** filter and sort controls (the FilterPanel lives only inside the sheet on mobile).
- **Impact**: AC-5 ("A shopper can opt to include out-of-stock via an explicit control"), AC-13 (mobile filters "inside a Sheet drawer"), and edge 11 all FAIL for `< lg` with JS off. The dev-summary's "client path is authoritative" explicitly concedes this.
- **Suggested Fix**: For availability, use the native-checkbox-with-hidden-default pattern: render `<input type="hidden" name="disponibilidad" value="todos">` guarded so that an unchecked native checkbox yields `todos` (e.g. checkbox `value="en-stock"` + always-present hidden default, or invert the control to "Incluir agotados" that posts `todos` when checked). For mobile, provide a JS-off fallback: render the FilterPanel form inside a `<details>`/`<noscript>`-visible container, or make the sheet degrade to an always-rendered form below `lg` when unhydrated.
- **Status**: FIXED — (a) `AvailabilityToggle` (`filter-controls.tsx`) is now a NATIVE `<input type="checkbox" name="disponibilidad" value="todos">` with inverted "include out of stock" semantics (label = existing `catalog.filters.includeOutOfStock`, "Incluye agotados"). Default view = unchecked = posts nothing = in-stock only; checking it posts `disponibilidad=todos` on a native submit — exactly what `parseCatalogFilters` reads. It also pushes the URL live with JS. (b) Mobile JS-off: a `<noscript>` block in `catalog-toolbar.tsx` renders the SAME `FilterPanel` form always-expanded, scoped `lg:hidden`, so a no-JS shopper below `lg` gets a fully working native filter/sort form; the JS-on Sheet is untouched. Verified by curl: the `disponibilidad=todos` param round-trips; the `<noscript>` block contains a full filter form with the availability checkbox, native sort `<select>`, and price fields.

---

## Major Issues (SHOULD FIX)

### M-1: JS-off price filter applies a 100x-wrong bound (pesos submitted where cents are parsed)
- **ID**: M-1
- **Severity**: MAJOR
- **File**: `src/components/catalog/filter-controls.tsx:192-220`, `254-266`; parsed at `src/lib/catalog/search-params.ts:67-76`
- **Problem**: The price `<Input name={minParam}>` fields display and submit **pesos** (`centsToField` = cents/100). But `parsePriceBound` interprets `precioMin`/`precioMax` as **cents**. The JS-on path fixes this by multiplying via `fieldToCents` before `apply`, but a native JS-off form submit sends the raw pesos string, so `precioMin=4000` is read as MX$40, not MX$4,000 — a silent 100x error.
- **Impact**: JS-off price filtering returns wrong results; edge 11 (native price submit) FAILS.
- **Suggested Fix**: Submit cents natively — render hidden `<input name={minParam} value={cents}>` alongside a display-only pesos field, or keep the visible field in pesos with a different name and reconcile server-side. Keep the URL contract in cents everywhere.
- **Status**: FIXED — Unified the contract on PESOS at the URL boundary (the reviewer's second option, chosen because a hidden-cents field cannot reflect a JS-off user's freshly-typed value). `parsePriceBound` now reads the URL value as pesos and converts to internal cents (×100); `serializeFilters` converts internal cents back to pesos. So the visible pesos field IS the native submitter under the canonical `precioMin`/`precioMax` names, and JS-on/JS-off carry identical semantics. Internals (chips via `formatMXN`, RPC `p_price_*`, cache buckets) stay in cents — unchanged. Added a unit test (`search-params.test.ts` "price URL contract is PESOS ↔ internal CENTS…") proving `precioMin=4000` → 400000 centavos and byte-stable round-trip. Verified by curl: `?precioMin=5000` → 13 chairs, `?precioMin=100000` → 0, chip reads "desde $5,000.00" (no 100x error).

### M-2: `badge.tsx` uses `transition: all` — AC-18 explicitly forbids it (badge is the active-filter chip)
- **ID**: M-2
- **Severity**: MAJOR
- **File**: `src/components/ui/badge.tsx:8`
- **Problem**: The installed shadcn Badge class string contains `transition-all`; it was not retrofitted. Badge is used as the active-filter chip (`active-filters.tsx:55`), so it is in T5 scope. AC-18: "No `transition: all`; only `transform`/`opacity` animate." `transition-all` animates layout-affecting properties (padding via `has-data-[icon=...]`, border) off the compositor.
- **Impact**: AC-18 FAIL (one line). Everything else in the T5 motion layer is compliant (drawer curve `cubic-bezier(0.32,0.72,0,1)` 300ms enter / 200ms exit; Select trigger-anchored `transform-origin`, open 200ms/close 150ms; all reduced-motion gated; no other `transition: all`, no leftover tw-animate-css keyframes).
- **Suggested Fix**: Replace `transition-all` with `transition-[color,box-shadow,border-color]` (or `transition-colors`) in `badge.tsx:8`. (`button.tsx:8` has the same `transition-all` but is pre-existing/out of scope — note only.)
- **Status**: FIXED — `badge.tsx:8` now uses `transition-[color,box-shadow,border-color]`; only compositor-safe / non-layout properties animate. `button.tsx` left as-is (pre-existing, out of T5 scope, per the finding's own note).

### M-3: Native filter/search forms lose locale on `/en` when JS is off (`action="/sillas"` is locale-agnostic)
- **ID**: M-3
- **Severity**: MAJOR
- **File**: `src/components/catalog/filter-panel.tsx:76` and `search-box.tsx:96` (both `action={CATALOG_PATH}`, wired from `site-header.tsx` and `catalog-toolbar.tsx`)
- **Problem**: next-intl `Link`/`useRouter` add the `/en` prefix for JS-on navigation, but a native `<form method="get" action="/sillas">` does not. On the `/en` locale with JS off, submitting the header search or the filter form navigates to `/sillas` (es-MX default), silently switching the shopper's locale.
- **Impact**: AC-12 ("locale-aware ... works with JS disabled") is partially FAILED on `/en`. Impact is bounded because es-MX is the default/unprefixed locale (majority path is fine).
- **Suggested Fix**: Build the action from the active locale (prefix `/en` when `locale !== defaultLocale`), or use next-intl's locale-aware path helper to compute the form `action`.
- **Status**: FIXED — Used next-intl's `getPathname({ href: CATALOG_PATH, locale })` to compute a locale-aware `action`. `page.tsx` derives it from the route `locale` and threads it (`catalogAction`) through `CatalogShell` → `CatalogToolbar`/sidebar `FilterPanel` and the toolbar `SearchBox`; `site-header.tsx` derives it via `getLocale()` for both header search boxes. `FilterPanel` now takes an `action` prop (defaulting to the locale-agnostic path for tests) used for BOTH the form `action` and the JS-off "Clear all" link. Verified by curl: on `/en/sillas` the filter form and the search form both render `action="/en/sillas"`.

### M-4: Controlled price/search inputs never re-sync to props — stale after chip removal / Clear-all
- **ID**: M-4
- **Severity**: MAJOR
- **File**: `src/components/catalog/filter-controls.tsx:174-175` (PriceRange); `src/components/catalog/search-box.tsx:59` (SearchBox `value`)
- **Problem**: `useState(centsToField(priceMin))` and `useState(defaultValue)` initialize once. The filter panel and toolbar live in `CatalogShell` (outside the Suspense boundary), so a chip removal / Clear-all (router.push) re-renders them with new props but the `useState` initializer does not re-run. The price fields and the search box keep showing stale typed values that no longer match the URL/active filters.
- **Impact**: UI drifts from actual state after common interactions (removing a price chip leaves the old number in the field). No AC directly, but a real correctness/UX defect.
- **Suggested Fix**: Add `useEffect(() => { setMinPesos(centsToField(priceMin)); setMaxPesos(centsToField(priceMax)); }, [priceMin, priceMax])` in PriceRange and `useEffect(() => setValue(defaultValue), [defaultValue])` in SearchBox (or key those subtrees on the serialized filter state).
- **Status**: FIXED — Both controls now re-sync to props on navigation. Used React's official "adjust state during render" pattern (a tracked synced-key + in-render correction) rather than `useEffect` + `setState`, because the repo's `react-hooks/set-state-in-effect` lint rule forbids the effect form. `PriceRange` tracks `priceMin:priceMax` and re-derives both fields when it changes; `SearchBox` tracks `defaultValue` and re-derives `value`. So removing a price chip / Clear-all no longer leaves stale typed values in the fields.

### M-5: SearchBox ✕ (clear) does not clear the active query
- **ID**: M-5
- **Severity**: MAJOR
- **File**: `src/components/catalog/search-box.tsx:71-74`
- **Problem**: `clear()` only calls `setValue("")` + refocus. It does not submit or navigate. When viewing `/sillas?q=malla`, clicking the ✕ empties the field visually but the URL keeps `?q=malla` and results stay filtered until the user manually re-submits an empty query.
- **Impact**: Users expect the clear affordance to clear the search; it doesn't. UX defect against the "removing a chip updates the URL and re-queries" spirit of AC-14.
- **Suggested Fix**: On clear, navigate to the filters-minus-`q` URL (JS-on) and/or submit the form; ensure the empty submit removes `q`.
- **Status**: FIXED — `clear()` in `search-box.tsx` now, when there was an active query (`defaultValue` non-empty), calls `formRef.current.requestSubmit()` after emptying the field. The empty `q` is dropped by `parseQuery`, preserved filters ride along as hidden inputs, and the form's locale-aware `action` (M-3) keeps the locale. This is a native submit, so it also works JS-off. A ✕ on a header box with no active query just clears the field (no navigation), as before.

### M-6: FilterSheet does not lock background scroll while open
- **ID**: M-6
- **Severity**: MAJOR
- **File**: `src/components/catalog/filter-sheet.tsx:88-108`
- **Problem**: The sheet is built on `Dialog.Portal`/`Overlay`/`Content` with `forceMount` and a manual `FocusScope`, but there is no body scroll-lock (`RemoveScroll` or a `body { overflow:hidden }` effect). Radix's automatic modal scroll-lock is not reliably engaged in this forceMount-bypass pattern. On mobile, the catalog behind the open sheet scrolls.
- **Impact**: Mobile UX defect — background scrolls under a full-height drawer. (Verify against MobileNav, which this pattern was lifted from; if MobileNav has the same gap, widen the fix.)
- **Suggested Fix**: Add a `useEffect` toggling `document.body.style.overflow = "hidden"` while `open` (restore on cleanup), or wrap the panel in `react-remove-scroll`.
- **Status**: FIXED — Added a `useEffect` in `filter-sheet.tsx` that sets `document.body.style.overflow = "hidden"` while `open` and restores the previous value on cleanup. Per the finding's note, verified `MobileNav` has the SAME forceMount-bypass gap and widened the fix there (`mobile-nav.tsx`) with the identical guard.

### M-7: `aria-live` result count is unreliable because it remounts inside Suspense
- **ID**: M-7
- **Severity**: MAJOR
- **File**: `src/components/catalog/search-results.tsx:49-57`
- **Problem**: The count `<p aria-live="polite">` sits inside the Suspense-suspending server subtree, which is unmounted/remounted on every filter change (the page keys Suspense on `suspenseKey`, `page.tsx:112-143`). A live region that is freshly inserted into the DOM does not reliably announce its initial content — screen readers announce *text changes on a persistent node*. It correctly does NOT spam per-keystroke (submit-based), but announcement is not dependable.
- **Impact**: A11y: the "N sillas" filtered-count cue may not be announced on filter changes. AC-14 result count is visible (PASS), but its SR affordance is weak.
- **Suggested Fix**: Hoist a stable `aria-live` node into `CatalogShell` (client, persistent across Suspense) that updates its text with the new count, rather than remounting the region.
- **Status**: FIXED — New `result-announcer.tsx`: `ResultAnnouncerProvider` (mounted in `CatalogShell`, above the Suspense boundary) owns a single persistent visually-hidden `aria-live="polite" aria-atomic` region and exposes an `announce()` via context. `SearchResults` now renders a client `<ResultCountAnnouncer text={countText}>` that pushes the resolved count into that stable node on mount/change; the visible count `<p>` is no longer itself a remounting live region. A zero-width-space toggle guarantees re-announcement even when the same count recurs.

---

## Minor Issues (NICE TO FIX)

### m-1: `fail()` refactor changed product-detail log prefix and thrown message
- **File**: `src/lib/catalog/product-detail.ts` (was `[product-detail]` / `"Product detail read failed"`, now shared `[catalog]` / `"Catalog read failed"` via `read-primitives.ts:36-39`)
- **Suggestion**: Behavior-preserving claim (Constraint 2) is not literally true — the log prefix and redacted message changed. Harmless (message is redacted, not surfaced) and tests stayed green, but note it. If per-module log prefixes matter for triage, pass a prefix arg.
- **Status**: SKIPPED (accepted deviation) — The consolidation to a single `[catalog]` prefix is intentional: all three modules are catalog reads, so one prefix is arguably better for triage, the thrown message is redacted (never surfaced to users), the `read-primitives.ts` doc already documents the `[catalog]` prefix, and the full suite is green. Adding a per-module prefix arg would churn every call site for no user-visible benefit. Noted, not changed.

### m-2: JS material-facet unaccent may diverge from Postgres `unaccent()` for non-Spanish glyphs
- **File**: `src/lib/catalog/facets.ts:46-53` (`unaccentLower` uses NFD + combining-mark strip) vs RPC `unaccent()`
- **Suggestion**: NFD-strip and `unaccent` agree for Spanish diacritics (á é í ó ú ñ ü) but diverge for transliterated glyphs (ß→ss, æ→ae, ø→o). Material facet values are Spanish today, so no live bug; flag for future non-Spanish material copy. Consider a shared normalization source of truth.
- **Status**: SKIPPED (no live bug, future flag) — By the reviewer's own analysis there is no current bug: all material values are Spanish and NFD-strip agrees with Postgres `unaccent` for every Spanish diacritic. A shared normalization source of truth would need to reproduce Postgres `unaccent`'s full transliteration table in JS — disproportionate churn for a hypothetical future non-Spanish material. Left as a documented follow-up.

### m-3: Dead conditional in ActiveFilters
- **File**: `src/components/catalog/active-filters.tsx:44`
- **Suggestion**: `chips.length > 0 ?` is always true (line 39 already returns `null` for empty). Remove the inner ternary.
- **Status**: FIXED — Removed the always-true inner `chips.length > 0 ? … : null` ternary; the chip row `<div>` renders unconditionally (the early `return null` for the empty case already guards it).

### m-4: Magic string `"q"` duplicated instead of `SEARCH_PARAM_KEYS.q`
- **File**: `src/components/catalog/search-box.tsx:43`
- **Suggestion**: `config.ts` is not `server-only`; import `SEARCH_PARAM_KEYS.q` to prevent drift (the comment's justification does not hold).
- **Status**: FIXED — `search-box.tsx` imports `SEARCH_PARAM_KEYS` from config; `QUERY_FIELD = SEARCH_PARAM_KEYS.q`. Also used to defensively filter `q`/`page` out of `preservedParams` (m-5).

### m-5: `preservedParams` could double the `q` field
- **File**: `src/components/catalog/search-box.tsx:105-109`
- **Suggestion**: If a caller ever includes `q`/`page` in `preservedParams`, the form posts two `q` values. The page currently strips `q` (`searchPreservedParams` sets `query:null`) so it is safe today; defensively filter `q` and `page` inside SearchBox.
- **Status**: FIXED — SearchBox now filters `preservedParams` to drop any `SEARCH_PARAM_KEYS.q` / `SEARCH_PARAM_KEYS.page` before emitting hidden inputs, so the field always owns `q` and a new query resets to page 1 regardless of caller input.

### m-6: `.grid-pending` opacity dim has no reduced-motion override
- **File**: `src/app/globals.css` (`.grid-pending`)
- **Suggestion**: Opacity is RM-safe so this is acceptable and documented, but for strictness under `prefers-reduced-motion` consider dropping the transition duration to 0 while keeping the state.
- **Status**: FIXED — Added a `@media (prefers-reduced-motion: reduce)` block setting `transition-duration: 0ms` on `.grid-pending`/`.grid-idle`, so the dim STATE (a comprehension cue) is kept but nothing animates under reduced motion.

### m-7: Manual `aria-modal` on forceMounted sheet content
- **File**: `src/components/catalog/filter-sheet.tsx:103` (`aria-modal={open ? true : undefined}`)
- **Suggestion**: Manual `aria-modal` is a workaround for the forceMount pattern; verify SR announces the dialog role/label on open (Dialog.Title is present — good). Low risk.
- **Status**: SKIPPED (verified acceptable) — This is the same proven pattern as `MobileNav` (which ships and passes its a11y e2e). `Dialog.Content` carries `role="dialog"`, `Dialog.Title` provides the accessible name, and `aria-modal` is scoped to `open`. No change needed; the mobile-nav e2e a11y suite (focus trap, Esc, shell exposure) remains green.

---

## Acceptance Criteria Verification

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| AC-1 | Migration adds unaccent+pg_trgm, RPC (INVOKER, revoke public / grant anon+auth), indexes; applies cleanly | PASS | `0007_search.sql` all present; live DB: `prosecdef=f` (invoker), `provolatile=s`, `proacl={postgres,anon,authenticated}` only — public revoked |
| AC-2 | RPC reads only public surfaces; anon gets rows but base `products` denied; no `cost_price_cents` | PASS | Live as `anon`: RPC returns 5 rows; `select from products` → `permission denied`; REST also denied; no cost column in Returns type or row shape |
| AC-3 | Keyword matches name/brand/description, case+accent-insensitive; empty q → filter-only | PASS | Live: `ergonomica`=6, `ergonómica`=6, `OFICINA`=5; `parseQuery` returns null for whitespace-only (`search-params.ts:79-83`); RPC `p_query is null` branch |
| AC-4 | Facets individually + combined; distinct facets AND, values within OR | PASS | `0007_search.sql:143-187` — each facet ANDed, `= any(array)` / EXISTS-over-array OR within; live combos verified |
| AC-5 | Default in-stock only; explicit opt-in for OOS | PASS (fixed) | RPC `p_in_stock_only default true`; parser default correct; JS-on opt-in works; JS-off opt-in now expressible via native `<input type=checkbox name=disponibilidad value=todos>` (C-2 FIXED) |
| AC-6 | RPC effective_stock == effectiveStock(); 3 badges identical | PASS | Live cross-check: 0 mismatches across all 30 products; synthetic all-OOS → 0, variantless → product.stock; `toCard` uses `stockState()` |
| AC-7 | Six sorts, each deterministic; default best-selling | PASS | `0007_search.sql:214-231` CASE-per-key + global `name, id` tiebreak; live determinism confirmed; `DEFAULT_SORT='mas-vendidas'` |
| AC-8 | Pagination on filtered set; COUNT(*) OVER(); clamp [1,lastPage]; filter change → page 1 | PASS | `total_count` window verified (=30, equal all rows); `readSearchPage` probes offset 0, clamps before read; `serializeFilters` never emits page |
| AC-9 | Shareable crawlable query params; single-sourced names | PASS | `SEARCH_PARAM_KEYS` in config; `serializeFilters` canonical + `encodeURIComponent`; round-trip unit-tested (17 tests pass) |
| AC-10 | /sillas enhances in place; dynamic when params; unfiltered from cached read | PASS | `page.tsx` reads searchParams (dynamic); unfiltered path via cached facet/listing reads; documented in page header |
| AC-11 | Canonical → clean /sillas (or page-N); filtered = noindex,follow; unfiltered indexable | PASS | `generateMetadata`: `hasAnyFacetParam` → `robots {index:false,follow:true}` + canonical `/sillas`; pure pagination keeps page-N canonical |
| AC-12 | Header search box → /sillas?q; keyboard; locale-aware; JS-off native form | PASS (fixed) | Native `<form method=get>` works JS-off; `action` now locale-aware on /en (M-3 FIXED → `action="/en/sillas"` verified). Mobile header collapse remains a JS enhancement of the same native form (accepted deviation) |
| AC-13 | Filter panel (sidebar ≥lg / Sheet mobile) with all facets + sort; options from DB | PASS (fixed) | Desktop sidebar renders full panel from real DB facets; checkbox facets now submit JS-off via hidden-input mirroring (C-1 FIXED); mobile gets a `<noscript>` always-expanded native form below `lg` (C-2 FIXED) |
| AC-14 | Active-filter chips removable + Clear all; count reflects filtered total | PASS | `active-filters.tsx` real `<Link>` chips + Clear-all; count in `search-results.tsx` from `result.total`; chip builder pure + tested |
| AC-15 | ≥1 match → ProductGrid + crawlable pagination preserving filters | PASS | `search-results.tsx:76-98` `makeHrefForPage(CATALOG_PATH, serializeFilters(filters))`; page links carry filters |
| AC-16 | 0 match → friendly no-results (echo query, Clear filters, popular strip best-selling ≤8) | PASS | `no-results.tsx` + `listPopularProducts(8)` best-selling order; `safePopular` degrades on failure; echoes query/filters |
| AC-17 | New strings in both dicts under catalog.*; keys-used/messages tests pass; no hardcoded text | PASS | 0 es-only / 0 en-only keys; ICU plurals correct both locales; keys-used test 249 pass; UI strings via props/translations |
| AC-18 | Motion per skills; drawer curve; instant press; Select <250ms anchored; RM; no transition:all; only transform/opacity | PASS (fixed) | Drawer/Select/swatch/pending all compliant + RM-gated; `badge.tsx:8` now `transition-[color,box-shadow,border-color]` (M-2 FIXED); `.grid-pending` gains an RM duration-0 override (m-6) |

## Edge Case Verification

| # | Edge Case | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Contradictory filters → no-results, not error/404 | HANDLED | RPC returns total_count=0 → NoResults; live color+brand contradiction = 0 rows |
| 2 | ?page=99999 on 2-page result → clamp, no 416 | HANDLED | `readSearchPage` probes total, `parsePageParam` clamps to lastPage before read |
| 3 | Junk/hostile params (DROP, <script>, negatives, empty, nonexistent, repeated, 10KB q) | HANDLED | `search-params.ts` drops unknown ids (`keepKnown`), caps q at 80, drops non-`^\d+$` prices, parameterized RPC; `encodeURIComponent` on serialize |
| 4 | Price min>max → drop both + note | HANDLED | `search-params.ts:117-121` sets both null + `priceRangeIgnored`; note rendered |
| 5 | Variantless product + color filter excluded; included w/o color | HANDLED | Synthetic test (rolled back): color filter → 0, no-color in-stock → 1, effective_stock=7 |
| 6 | All variants OOS but products.stock>0 → out of stock | HANDLED | Synthetic test: effective_stock=0, hidden under default in-stock; matches stock.ts |
| 7 | Accent/diacritic + case | HANDLED | Live: OFICINA/oficína/oficina all match; `unaccent(lower())` on column + term |
| 8 | Empty catalog / popular strip empty → message still renders | HANDLED | `safePopular` catch → [] ; `no-results.tsx:65` omits strip when empty |
| 9 | RPC/DB failure → redacted fail() → error boundary | HANDLED | `search.ts` calls `fail()` on rpc error; `read-primitives.fail` logs + throws redacted |
| 10 | Facet lists fail → page boundary, never half-populated | HANDLED | `loadFacetOptions` awaits all in Promise.all at page level; a throw propagates to route boundary |
| 11 | JS disabled: header search + filter form native; chips as links | HANDLED (fixed) | Chips/Clear/pagination/color/price/sort-select native; checkbox facets now submit via hidden-input mirroring (C-1), availability via native `disponibilidad=todos` checkbox (C-2), mobile via `<noscript>` form (C-2), price in unified pesos contract (M-1). All curl-verified against a fresh prod server on :3000 |
| 12 | Long chip row at 375px wraps/scrolls | HANDLED | `active-filters.tsx:45` `flex-wrap ... overflow-x-auto` |

## Quality Score: 7.5/10

Exceptional data/security/SQL layer and cache discipline; complete i18n; clean typed
boundaries (no `any`, no `!`). Held back by the JS-off gaps against explicit ACs (C-1,
C-2, M-1, M-3), which the dev-summary partially concedes ("client path is authoritative"),
plus stale-controlled-input bugs (M-4, M-5), a missing scroll-lock (M-6), and the AC-18
`transition-all` slip (M-2).

## Recommendation: REQUEST CHANGES → RESOLVED (Stage 6)

All findings addressed: **2/2 CRITICAL FIXED, 7/7 MAJOR FIXED, 5/7 minor FIXED + 2 SKIPPED
(justified)**. The JS-off path is now genuinely functional and curl-verified:

- **C-1** checkbox facets submit JS-off via always-present hidden-input mirroring (Radix
  checkbox left `name`-less → no double-submit).
- **C-2** availability is a native `disponibilidad=todos` opt-in checkbox; mobile gets a
  `<noscript>` always-expanded native filter/sort form below `lg`.
- **M-1** price contract unified on PESOS end-to-end (parser converts to internal cents);
  new unit test proves it; `?precioMin=5000` → 13 chairs, chip reads "desde $5,000.00".
- **M-3** forms target `/en/sillas` on `/en`. **M-2/M-4/M-5/M-6/M-7** all fixed.

Gates: tsc clean, lint clean, `next build` succeeds, **537 unit / 78 integration / 167 e2e
all green**. Skipped minors (m-1 log prefix, m-2 unaccent) are documented no-live-bug
follow-ups. Ready for QA (Stage 7).
