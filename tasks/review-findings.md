# Code Review: T11 — Admin Product Management (commit 5a2b60b)

## Summary

A large, disciplined, well-architected feature (99 files, +10,572). The trust boundary is solid: **every** server action and the export route re-verify the session at entry before any DB touch; the admin secret key stays `server-only`; migration 0011's RPC has correct atomicity, row-locking, negative-block, `SECURITY DEFINER + search_path='' + service_role-only grant`. The catalog cache is busted through one shared helper. The paired pure-parser / write-layer pattern is clean and heavily tested. However, there are **real data-integrity gaps on partial-failure paths** (product update + CSV upsert are best-effort sequential, not transactional, and can leave a half-mutated product), a **stale cache tag on brand/style/category reassignment**, a couple of **client-side correctness bugs** (index-keyed row errors, last-page range math), and some **defense-in-depth hardening** (variant-id PostgREST interpolation, image magic-byte sniffing). None are launch-blocking for a single-Owner Phase-1 surface, but the two partial-failure MAJORs should be fixed before this is trusted with the real catalog.

## Critical Issues (MUST FIX)

None. No auth bypass, no secret exposure, no SQL/PostgREST injection reachable by an unauthenticated party, no stored-XSS vector that executes, no data loss on delete (order history is snapshot-preserved).

## Major Issues (SHOULD FIX)

### M-1: `updateProduct` leaves a half-mutated product on link-sync failure
- **ID**: M-1
- **Severity**: MAJOR
- **File**: `src/lib/admin/products/product-write.ts:71-90` (`updateProduct` + `syncCategories` at :150-165)
- **Problem**: `updateProduct` updates the base `products` row, THEN calls `syncLinks`, which does delete-then-insert of category/tag rows. Unlike `createProduct` (which rolls back the inserted row on link failure), the update path has **no rollback**. If the category insert fails after the delete succeeds, the product keeps its new column values but is left with **zero categories**. The action returns a generic "write-failed" banner while the DB is silently corrupted.
- **Impact**: A transient error mid-save wipes a product's category associations without telling the operator; the product may drop off category facet pages. Not recoverable without re-editing.
- **Suggested Fix**: Wrap the update + M2M sync in a single transactional RPC (mirrors the T7/T8 RPC pattern), OR snapshot the prior category/tag rows and restore them on `syncLinks` failure.
- **Status**: FIXED

### M-2: `updateProduct` cache bust ignores the OLD brand/style/category slugs
- **ID**: M-2
- **Severity**: MAJOR
- **File**: `src/lib/admin/products/product-write.ts:87-88` → `bustForProduct` at :191-210
- **Problem**: On update, `bustForProduct` resolves slugs only from the **new** `values.brand_id` / `values.style_id` / `categoryIds`. If the operator moves a product from brand A to brand B (or removes a category), only the new facets are busted; `brand:A` (and any removed category facet) keeps serving the stale listing that still includes the product.
- **Impact**: A re-branded/re-categorized product lingers on its old facet page until the broad `catalog` tag otherwise expires. AC-11/AC-24 "bust touched taxonomy tags" is only half-met for reassignment.
- **Suggested Fix**: Before the update, read the product's current brand/style/categories; union OLD and NEW taxonomy slugs and pass both to `bustCatalogTags` (as already done for the product slug).
- **Status**: FIXED

### M-3: CSV `applyImport` reports success/failure incorrectly and leaves partial M2M state
- **ID**: M-3
- **Severity**: MAJOR
- **File**: `src/lib/admin/csv/csv-import-write.ts:38-59` (`applyImport`) + `upsertProduct` :62-107, `syncCategories` :110-122
- **Problem**: `upsertProduct` commits the product row FIRST, then calls `syncCategories`/`syncTags` (delete-then-insert). If a link sync throws, the whole row is pushed to `result.failed` — but the product row was already created/updated with its links partially replaced. The summary tells the operator the row **failed** when the product actually persisted with broken links. Per-row isolation (AC-31) holds; within-row atomicity does not.
- **Impact**: A CSV import that hits a link error produces a misleading count and silently corrupts those products' taxonomy; on re-run the operator can't tell which rows landed.
- **Suggested Fix**: Do each row's product upsert + link sync in one transaction/RPC (all-or-nothing) before counting it created/updated/failed.
- **Status**: FIXED

### M-4: Variant delete interpolates un-validated ids into a PostgREST filter string
- **ID**: M-4
- **Severity**: MAJOR (defense-in-depth; admin-scoped)
- **File**: `src/lib/admin/products/variant-write.ts:50-56` (`deleteRemovedVariants` — `not("id","in", \`(${keepIds.join(",")})\`)`); ids come from `variant-input.ts:parseVariant` which accepts `raw.id.trim()` with **no UUID validation**.
- **Problem**: The client-controlled variant `id` is string-interpolated into a raw PostgREST `in (...)` list. A crafted id containing `)`, a comma, or a nested filter fragment can alter the delete predicate. It is behind admin auth (attacker = trusted Owner), but it is the one place raw request data is concatenated into a filter expression.
- **Impact**: A malformed/hostile id could broaden the delete predicate (delete other products' variants) or error out. Low likelihood, high blast radius.
- **Suggested Fix**: Validate each variant `id` against a UUID regex in `parseVariant`; prefer a typed `.in()` array over manual string interpolation.
- **Status**: FIXED

### M-5: `product-table.tsx` "Mostrando X–Y de Z" range is wrong on the last page
- **ID**: M-5
- **Severity**: MAJOR (visible correctness bug)
- **File**: `src/components/admin/products/product-table.tsx:30,39`
- **Problem**: `rangeStart = (page - 1) * rows.length + 1` uses the current page's row count as the page size. On the final page `rows.length < ADMIN_PRODUCTS_PER_PAGE`, so the starting index is wrong (e.g. page 2 with 3 rows shows "Mostrando 4–6" instead of "26–28").
- **Impact**: Incorrect result-count copy on every non-full page.
- **Suggested Fix**: `rangeStart = (page - 1) * ADMIN_PRODUCTS_PER_PAGE + 1`.
- **Status**: FIXED

### M-6: `variant-editor.tsx` attaches row errors by array index, not stable key
- **ID**: M-6
- **Severity**: MAJOR
- **File**: `src/components/admin/products/variant-editor.tsx:57,89,105-113,176-181`
- **Problem**: Rows render with a stable `row.key`, but `rowErrors` is keyed by positional `index`. After a delete/reorder between submit and error render, the server's per-index errors attach to the wrong row.
- **Impact**: "SKU duplicado" shown on the wrong variant; operator fixes the wrong field.
- **Suggested Fix**: Key `rowErrors` by `row.key`/server id; have `saveVariantsAction` map the offending SKU to the stable key, not the index.
- **Status**: FIXED

### M-7: Image-manager delete relies on state surviving the dialog close (stale-closure race)
- **ID**: M-7
- **Severity**: MAJOR
- **File**: `src/components/admin/products/image-manager.tsx:59,128-137`
- **Problem**: `confirmDelete` reads `pendingDelete` then nulls it, while `AlertDialog onOpenChange` also nulls it on close. Depending on Radix event ordering, `pendingDelete` can already be null at confirm → `if (!image) return` silently no-ops the delete.
- **Impact**: Intermittent "delete did nothing" — operator thinks the image is gone but it persists.
- **Suggested Fix**: Capture the target image in a ref (or pass its id into the confirm handler) instead of relying on state living across the close.
- **Status**: FIXED

### M-8: `product-filters.tsx` debounce timer not cleared on unmount
- **ID**: M-8
- **Severity**: MAJOR (React correctness)
- **File**: `src/components/admin/products/product-filters.tsx:47,71-74`
- **Problem**: The search debounce `setTimeout` is stored in a ref but never cleared; navigating away mid-debounce fires `router.replace` after unmount.
- **Impact**: Unmounted-update warnings + a spurious URL replace after leaving the list.
- **Suggested Fix**: `useEffect(() => () => clearTimeout(debounceRef.current), [])`.
- **Status**: FIXED

### M-9: `taxonomy-manager.tsx` uses non-null `!` on `.find()` results (AC-33 violation)
- **ID**: M-9
- **Severity**: MAJOR
- **File**: `src/components/admin/taxonomy/taxonomy-manager.tsx:82,101,112`
- **Problem**: `props.brands.find(...)!` (styles/tags too) assert non-null. A stale click after the row list changed throws a runtime TypeError, and it directly violates CLAUDE.md + AC-33 ("no non-null `!` to silence the compiler").
- **Impact**: AC-33 non-compliance + a crash path on a benign race.
- **Suggested Fix**: Guard the `find` result (`if (!row) return;`) and drop the `!`.
- **Status**: FIXED

## Minor Issues (NICE TO FIX)

### m-1: Image MIME validation trusts client-declared `file.type` (no magic-byte sniff)
- **File**: `src/lib/admin/products/image-write.ts:34-41,62-65`
- **Problem**: The public `product-images` bucket accepts anything labeled `image/jpeg|png|webp`; bytes are never sniffed. SVG (the real stored-XSS vector) is correctly excluded, and Supabase serves with `X-Content-Type-Options: nosniff` at the declared image type, so a polyglot won't execute — risk is low, but a script payload can be stored on a public origin.
- **Suggested Fix**: Sniff leading magic bytes (JPEG `FF D8 FF`, PNG `89 50 4E 47`, WEBP `RIFF..WEBP`); derive `contentType` from the sniffed type, not `file.type`.

### m-2: CSV export formula-escape omits leading TAB/CR
- **File**: `src/lib/admin/csv/csv-parse.ts:105` (`escapeCsvCell` — `/^[=+\-@]/`)
- **Problem**: OWASP's lead-char set also includes TAB (0x09) and CR (0x0D).
- **Suggested Fix**: `/^[=+\-@\t\r]/`.

### m-3: Admin list search strips `% , ( ) *` but not `.` / `:` / `\`
- **File**: `src/lib/admin/products/list-query.ts:60-64`
- **Problem**: The `or()` breakout is closed (commas/parens stripped), but PostgREST treats `.` as an operator separator; leaving it is harmless for `ilike` values but a gap if the filter shape changes.
- **Suggested Fix**: Also strip `.` `:` `\`, or use per-column `.ilike()` instead of the hand-built `or()` string.

### m-4: `setCoverImage` is not atomic (clear-all then set-one)
- **File**: `src/lib/admin/products/image-write.ts:138-160`
- **Problem**: Clears every `is_primary`, then sets one; if the second update fails the product has NO cover.
- **Suggested Fix**: Single statement `update ... set is_primary = (id = $target)` (or RPC).

### m-5: CSV dry-run detects in-file duplicate SKUs but not duplicate SLUGS
- **File**: `src/lib/admin/csv/csv-product-map.ts:158-181` (no `seenSlugs`)
- **Problem**: Two rows with distinct SKUs but the same resolved slug both preview as "create"; the second only fails at confirm (23505) — resilient but the dry-run under-reports errors (AC-30).
- **Suggested Fix**: Track `seenSlugs` in `buildImportDiff` and flag the second as a preview error.

### m-6: CSV export is unbounded (full table into memory)
- **File**: `src/lib/admin/csv/csv-generate.ts:92-101`
- **Problem**: Import has row/byte caps; export reads all products + images/categories/tags with no limit. Fine at 30, a risk as the catalog grows.
- **Suggested Fix**: Stream the CSV or cap/paginate the export read.

### m-7: Inventory negative-result error not wired to the field's `aria-describedby`
- **File**: `src/components/admin/products/inventory-adjust-dialog.tsx:191-197`
- **Problem**: The negative `FieldError` uses a detached hardcoded id the amount input never references; SR users aren't told why submit is disabled.
- **Suggested Fix**: Surface the negative case as the amount `TextField`'s `error` prop.

### m-8: Uncontrolled dialog/form fields don't reset per entity/submission
- **File**: `src/components/admin/taxonomy/taxonomy-entity-dialog.tsx:69-71,117-128`; `src/components/admin/products/product-form.tsx:187-208,234-269`
- **Problem**: The dialog stays mounted while `draft` is swapped; `defaultValue`/`useState`-seeded fields don't reset for a different entity. Product form: uncontrolled inputs don't re-sync to `state.values` on an `invalid` response.
- **Suggested Fix**: `key={draft?.id ?? "new"}` on the dialog; `key={state.submissionId}` on the form's uncontrolled fieldset (or make them controlled).

### m-9: `qa-inbox` double-renders / mis-routes validation vs action errors
- **File**: `src/components/admin/qa/qa-inbox.tsx:135-167`
- **Problem**: `TextareaField error={error}` plus a separate `FieldError` gated on `error && !answer` renders content errors twice, and shows field errors for non-content write failures.
- **Suggested Fix**: Content errors → the field; transient action failures → a Banner; drop the duplicate `FieldError`.

## NITs
- `fields.tsx` 466 lines (over ~400 soft target, under 1000 hard cap; ESLint green) — cohesive primitive family; a `text/numeric/banner` split would keep it under target. (Dev deviation #5 — acknowledged.)
- `fields.tsx:106,178,241,309` — `aria-describedby={cn(...)}` reuses the className joiner to build an id list; works but reads oddly.
- `product-form.tsx:56-60 & 312-325` — `FIELD_ORDER` + `fieldKeyToTestid` duplicate field→testid knowledge also in JSX (two sources of truth).
- `admin-pagination.tsx:37` — ellipsis key uses array index (harmless: stable, non-interactive).
- `product-filters.tsx:120` — `"  ".repeat(depth)` in a native `<option>` collapses in most browsers; use a glyph prefix like the dialog's `"— ".repeat(depth)`.
- `csv-import-dialog.tsx:92` — `setTimeout(reset, 200)` magic number, no cleanup; name it `_MS`, clear on reopen.
- `dialog.tsx:79` + a few sr-only "Close" strings untranslated in an es-MX-only admin UI.

## Animation review (`.dialog-content-motion`, `.reorder-item`, globals.css)
PASS against review-animations STANDARDS. Enter uses `--ease-out` (never ease-in); exit shorter (140ms) than enter (180ms); only `transform`/`opacity` animated (compositor-friendly, no layout properties); `@starting-style` for the enter; `prefers-reduced-motion` fully guarded (opacity-only for dialog, snap for reorder). `.reorder-item` 200ms transform-only. All motion earns its place (modal presence + reorder continuity). No findings.

## The 5 Dev Deviations — adjudication
1. **next.config protocol derived from SUPABASE_URL** — JUSTIFIED (local http host must be allow-listed for next/image; still https in prod). Satisfies AC-16/17.
2. **AdminShell max-w-2xl→max-w-5xl + AdminPage actions slot** — JUSTIFIED for the table; settings self-constrains so T10 unchanged. Confirm at QA (AC-35).
3. **Q&A as /admin/qa nav destination** — JUSTIFIED (S3 decision; AC-28 says "a Q&A view").
4. **Scroll-spy rail deferred to UX** — ACCEPTABLE (sticky bar + anchors deliver coherence; AC-unaffected).
5. **fields.tsx 466 lines** — ACCEPTABLE (under hard cap, ESLint green).
- Un-flagged: **AC-1 "`db:types` regenerates database.types.ts"** NOT met literally — types HAND-authored into `types/tables-content.ts`+`rpc.ts`, per the documented repo convention (commits 177cba7/b021caa). New table/RPC types match migration 0011 and tsc passes, so the AC INTENT is met. Verification note, not a defect.

## Acceptance Criteria Verification
| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| AC-1 | Migration 0011 applies/idempotent; ledger+RPC+indexes; types | PASS (note) | `0011_*.sql` idempotent; types hand-authored & correct; tsc green |
| AC-2 | config.toml re-enables storage; healthy; public bucket | PASS | `[storage] enabled=true` (analytics/edge off); guarded bucket insert; stop/start/reset ×2 + smoke |
| AC-3 | Nav flips products→live, guard inherited | PASS | `constants.ts` flip + Catálogo group |
| AC-4 | Admin list: any status, admin client, BASE table, paginated, uncached | PASS | `list-query.ts` admin client + base table + no `unstable_cache` + `pagination.ts` |
| AC-5 | Table shows cover/name/brand/SKU/price/stock/status/updated | PASS | `AdminProductRow` (range-copy bug M-5 aside) |
| AC-6 | Search + brand/category/status/stock filters, URL-synced, AND | PASS | `list-filters.ts` + `applyFilters` |
| AC-7 | Pagination + clamp + empty state | PASS | `parsePageParam`/`rangeFor` + `ProductEmptyState` |
| AC-8 | Row→edit link + "Nuevo" CTA | PASS | routes present |
| AC-9 | Full product model incl. cost price/dims/materials/M2M | PASS | `product-input.ts` |
| AC-10 | Peso-string money; strict cm/kg parsers | PASS | reuses `parseMoneyToCents`/`parseCmToMm`/`parseKgToG` |
| AC-11 | Create/edit write + bust; session first | PARTIAL | session PASS; M-1 (update partial-fail) + M-2 (old-taxonomy bust) |
| AC-12 | Dup slug/SKU → field error, no 500 | PASS | `23505`→field |
| AC-13 | Inline errors, form filled, focus-first-invalid; generic banner | PASS (see m-8) | collect-all; no raw PG echoed |
| AC-14 | Upload jpeg/png/webp ≤5MB; server re-validates | PASS (see m-1) | `validateFile`; magic-byte sniff absent |
| AC-15 | Drag + kbd reorder; single cover enforced | PASS (see m-4) | `usePointerReorder`+buttons; at-most-one cover (not atomic) |
| AC-16 | Delete row+object; failed object-delete keeps row; promote cover | PASS | `deleteImage`+`removeStorageObject`+`promoteNextCover` |
| AC-17 | Storefront reflects image change; next/image renders | PASS | busts catalog+product; host allow-listed |
| AC-18 | Variant CRUD hex/SKU/stock/override/sort | PASS | `variant-input.ts` |
| AC-19 | Variant-image assoc; remove variant handles images + warn | PASS | `setImageVariant`; cascade; editor warns |
| AC-20 | Variant writes strict; dup SKU field error | PASS | `mapVariantError` |
| AC-21 | Brand/style/tag CRUD; slug uniqueness friendly | PASS | `23505`→slug-duplicate |
| AC-22 | Category nesting; cycle client+server | PASS | client hides self + `categories_no_cycle` (0002) + mapError |
| AC-23 | Delete restrict/set-null/detach | PASS | `23503`→restrict; set null |
| AC-24 | is_active hide facet after bust | PARTIAL | entity toggle busts; but M-2 reassignment leaves stale old-facet |
| AC-25 | Manual adjustment delta/absolute + reason; atomic | PASS | `record_inventory_adjustment` RPC |
| AC-26 | Negative rejected (CHECK + friendly) | PASS | RPC pre-check + CHECK; `parseAdjustment` |
| AC-27 | Duplicate deep copy, unique slug/SKU, forced draft | PASS | `product-duplicate.ts` (rollback on child failure) |
| AC-28 | Q&A unanswered-first; one-write answer; unpublish; delete; bust | PASS | `qa-write.ts` + `qa-read` |
| AC-29 | Export all, columns, RFC-4180, headers | PASS | `csv-generate.ts` + escape (TAB/CR gap m-2) |
| AC-30 | Import dry-run preview, ZERO writes | PASS | `dryRunImportAction` (slug-dup gap m-5) |
| AC-31 | Confirm by slug; resilient; counts; bust once | PARTIAL | between-row resilient + single bust PASS; within-row atomicity M-3 |
| AC-32 | Malformed CSV rejected, zero writes | PASS | UTF-8 fatal decode + caps + header validate |
| AC-33 | tsc/eslint/build; no >400 (cap 1000); no any/! | PARTIAL | green per dev-done; M-9 `!` violation; fields.tsx 466>400 soft |
| AC-34 | Secret not in client; no route bypasses requireSession | PASS | `admin.ts` server-only; every action guards first; export self-guards + middleware |
| AC-35 | Storefront regression green; admin e2e serial | DEFERRED to QA | not runnable in review |

## Edge Case Verification
| # | Edge Case | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Duplicate slug/SKU | HANDLED | `23505`→field; create rolls back M2M; **update does NOT (M-1)** |
| 2 | Category cycle | HANDLED | client + `categories_no_cycle` trigger (0002) + mapError |
| 3 | Delete category-w/children / brand-in-use | HANDLED | `23503`→restrict; brand/style set-null |
| 4 | Image failures | HANDLED | client+server MIME/size; DB-fail removes object; storage-fail keeps row+logs |
| 5 | CSV chaos | HANDLED | RFC-4180 (BOM/CRLF/`""`); per-row errors; caps; non-UTF8 reject |
| 6 | Concurrent inventory | HANDLED | RPC `for update` row-lock; never negative |
| 7 | Variant-vs-product stock | HANDLED | list note + explicit dialog target |
| 8 | Session expiry | HANDLED | `requireSession()` before any DB touch, every action + export |
| 9 | Unpublish cached question | HANDLED | busts `product:<slug>` |
| 10 | Storage re-enable regression | HANDLED | analytics/edge off; reset ×2; fallback documented |
| — | Variant/product delete vs order history | HANDLED (verified) | `order_items` snapshots (name/sku/variant_label); FK set-null (0003) — no history loss |

## Quality Score: 8/10

Strong architecture, exemplary auth discipline, correct migration/RPC, well-tested pure layers. Docked for three partial-failure data-integrity gaps (M-1/M-3 non-atomic product+link writes, M-2 stale reassignment cache), the un-validated variant-id interpolation (M-4), and a cluster of client correctness bugs (M-5 range, M-6 index-keyed errors, M-7 delete race, M-8 timer leak, M-9 `!` AC-33 violation).

## Recommendation: APPROVE-WITH-FIXES

Fix the MAJORs before this is trusted with the real catalog. Priority: M-1/M-2/M-3 (partial-failure integrity + stale cache) and M-9 (AC-33 `!` violation); then M-4 (id validation) and M-5/M-6/M-7/M-8 (client correctness). MINORs (magic-byte sniff, TAB/CR escape, export bound, a11y wiring, uncontrolled-field reset) are good hygiene for the Fix stage but not launch-blocking for a single-Owner Phase-1 surface. No CRITICAL/security-blocking issues; the trust boundary is sound.

---

## STAGE 6 (ultrafix) RESOLUTION — every finding FIXED or SKIPPED

### Majors (9/9 FIXED)
- **M-1** FIXED — `product-write.ts` `updateProduct` now snapshots prior category/tag links before the update and restores them on link-sync failure (mirrors `createProduct`). Regression-locked: `admin-catalog-write-atomicity.integration.test.ts` (original categories survive a forced FK failure).
- **M-2** FIXED — `bustForUpdate` unions OLD (snapshot) + NEW brand/style/category ids and busts both facet sets. Regression-locked: integration test asserts both `category:A` and `category:B` busted on a move.
- **M-3** FIXED — `csv-import-write.ts` `upsertProduct` wraps the link-sync in try/catch: a new row is deleted on failure, an updated row's prior links are restored, before the row is counted. Regression-locked: integration create+update cases with a poisoned taxonomy map (`upsertProduct` exported for the test).
- **M-4** FIXED — `parseVariant` validates a non-empty `id` against `UUID_PATTERN` (`id-invalid`) before it reaches the raw PostgREST `not(id.in.(...))` filter. Unit tests cover break-out payloads.
- **M-5** FIXED — new pure `displayRangeFor(page,pageSize,total)` in `pagination.ts`; `product-table.tsx` uses page SIZE + total, not `rows.length`. 5 unit tests incl. the last-page case.
- **M-6** FIXED — `VariantRawInput` carries a stable `key`; `parseVariantSet` + `saveVariantsAction` + `variant-editor.tsx` key row errors by it, never the array index. Unit test asserts key-based attribution.
- **M-7** FIXED — `image-manager.tsx` captures the delete target in a ref (`pendingDeleteRef`); `confirmDelete` reads the ref, immune to the Radix onOpenChange-null race. (Only e2e can fully exercise the timing; logic is now race-free.)
- **M-8** FIXED — `product-filters.tsx` clears the debounce timer on unmount via `useEffect` cleanup.
- **M-9** FIXED — the 3 non-null `!` in `taxonomy-manager.tsx` replaced with `if (!row) return;` guards (AC-33 compliant).

### Minors
- **m-1** FIXED — `image-write.ts` sniffs JPEG/PNG/WEBP magic bytes; stored `contentType`/extension derive from the sniffed type, not `file.type`. (Covered by the storage upload path; sniff logic internal to the server-only module — e2e/manual verifies the reject.)
- **m-2** FIXED — `escapeCsvCell` lead-char set now `/^[=+\-@\t\r]/` (adds TAB/CR). Unit test added.
- **m-3** FIXED — admin list search strips `. : \` in addition to `% , ( ) *`.
- **m-4** FIXED (pragmatic) — `setCoverImage` reordered to set the new cover FIRST then clear others, so a mid-write failure leaves TWO covers (storefront picks one), never ZERO. A single-statement/RPC form is disproportionate for this single-Owner path (noted inline).
- **m-5** FIXED — `buildImportDiff` tracks `seenSlugs`; a second row resolving to the same slug is flagged in the dry-run. Unit test added.
- **m-6** FIXED — CSV export read bounded by `CSV_EXPORT_MAX_ROWS` (10,000). Streaming/pagination remains the follow-up as the catalog grows (noted inline).
- **m-7** FIXED — inventory dialog surfaces the negative-result message via the amount `TextField`'s `error` prop (wired to `aria-describedby`); the detached `FieldError` removed.
- **m-8** FIXED — `taxonomy-entity-dialog` remounts per entity (`key={draft?.id||"new"}`); `product-form` uncontrolled fieldset remounts per submission (`key={state.submissionId}`) so `defaultValue`s re-seed from `state.values`.
- **m-9** FIXED — `qa-inbox` splits `contentError` (field) from `actionError` (Banner); the duplicate `FieldError` removed.

### Nits
- **nit-1** SKIPPED — `fields.tsx` 466 lines is under the 1000 hard cap, ESLint green; splitting is churn with no correctness benefit (adjudicated ACCEPTABLE in review).
- **nit-2** SKIPPED — `aria-describedby={cn(...)}` works correctly; renaming the joiner is cosmetic and touches every field primitive (regression risk > benefit).
- **nit-3** SKIPPED — `FIELD_ORDER`/`fieldKeyToTestid` de-duplication is a refactor with test-surface risk; the two sources are currently consistent and covered by e2e focus tests.
- **nit-4** SKIPPED — pagination ellipsis index key is harmless (stable, non-interactive), noted so in the review itself.
- **nit-5** FIXED — category-filter `<option>` indent now uses a visible `"— "` glyph prefix (matches the dialog) instead of relying on NBSP rendering.
- **nit-6** FIXED — `csv-import-dialog` reset delay named `RESET_AFTER_CLOSE_MS`; the timer is tracked in a ref and cleared on unmount + reopen.
- **nit-7** FIXED — `ui/dialog.tsx` sr-only/footer "Close" → "Cerrar" (admin is es-MX only; no other consumer).

### Verification (independent, this stage)
- `tsc --noEmit`: 0 errors. `eslint .`: clean. `tsconfig.json`: unchanged.
- Unit: 1462/1462 (87 files) — baseline 1451 + 11 new (M-4 ×4, M-5 ×5, m-2 ×1, m-5 ×1; 1 existing test re-keyed for M-6).
- Integration: 202/202 (18 files) via `scripts/run-integration.sh` — baseline 197 + 5 new (M-1, M-2, M-3-create, M-3-update, + seed) in 1 new file.
- DB left pristine-seeded (30 products, 0 stray rows); port 3000 clear; no stray servers.
- No git commit (orchestrator commits).
