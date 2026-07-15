# Dev Summary: T11 — Admin Product Management

Full-feature, HIGH complexity, built in **7 slices in order**, each verified (tsc + eslint + tests + dev-server smoke) before the next. All 35 ACs implemented. Zero new runtime dependencies.

## Verification Numbers (all green)

- **tsc** `--noEmit`: **0 errors**.
- **eslint** (whole repo): **clean** (incl. `max-lines`; largest new file `form/fields.tsx` = 466 lines, under the 1000 hard cap).
- **prod build** (`next build`, `NEXT_QA_DIST_DIR=.next-build-check`): **exit 0**; tsconfig restored (`git checkout -- tsconfig.json`), build dir removed. All admin routes present.
- **Unit**: **1451/1451** (87 files) — baseline 1376 + **75 new** across 9 new pure-module test files (slug, units, list-filters, product-input, variant-input, taxonomy-input, inventory-input, csv-parse, csv-product-map). Baseline held.
- **Integration**: **197/197** (17 files) via `scripts/run-integration.sh` — baseline 188 + **9 new** (RPC atomicity/negative-block/blank-reason, 23505 mapping, category cycle trigger, delete-restrict, storage upload→fetch→delete round-trip + bucket-public).
- **Storage boot cycle**: `supabase stop && supabase start && supabase db reset` verified clean **twice** with `[storage]` enabled (analytics/edge_runtime stay off). Bucket `product-images` (public) present after reset.
- **Storage smoke**: real upload → public-URL fetch (200, byte-exact) → delete → 400, against local storage.
- **Manual spot-check (dev server)**: login → create product (validation errors + success redirect) → upload image → add+save variant → CSV export (200, correct headers, 31 lines) → CSV import dry-run (create/error counts) → confirm import (2 created) → Q&A answer/publish (nav badge, card moves segments) → taxonomy tabs + category tree → **cache-bust proof**: an admin-created active product's PDP renders on the storefront immediately after save.
- **DB left pristine** (30 seed products, 0 ledger rows, 0 storage objects); **no stray servers** (port 3000 clear); **tsconfig unchanged**.

## Per-Slice Summary

**Slice 0 — Foundation.** Migration `0011` (idempotent): `inventory_adjustments` ledger (+ indexes, RLS deny-all, `grant … to service_role`); atomic `record_inventory_adjustment` RPC (`SECURITY DEFINER`, `search_path=''`, row-lock, delta-or-absolute, negative-block, bounded reason); admin-list indexes (`products (updated_at desc)`, `lower(name)`); idempotent `storage.buckets` insert for `product-images` (public, guarded by `to_regclass`). Re-enabled `[storage]` in `config.toml` (documented the analytics-coupling root cause). Hand-authored the new table + RPC types into `types/tables-content.ts` + `types/rpc.ts` (repo convention: types are hand-maintained, NOT generated — `db:types` is a reconciliation aid only). Nav flipped `products` → live + added `taxonomy`/`qa` under a "Catálogo" group with a Q&A unanswered-count badge. New config module `config/admin-products.ts`. Shared `cache-tags.ts` (imports `CATALOG_CACHE_TAG`/`productCacheTag`, never literals), `slug.ts`, `units.ts`, `require-session.ts`, `format.ts`. Extracted shared form primitives to `components/admin/form/fields.tsx` and refactored the T10 settings form onto them (DRY).

**Slice 1 — List + filters.** `list-filters.ts` (pure, bounded), `list-query.ts` (admin client, BASE table, any status, no cache, count→clamp→range via `pagination.ts`, batch-stitched covers + variant-summed stock, no N+1). Page + `ProductTable` (desktop table / mobile cards), `ProductFilters` (URL-synced, debounced), `AdminPagination`, `ProductStatusBadge` (shape+text, never color-only), `ProductEmptyState`, `ProductRowActions` (`⋮` menu).

**Slice 2 — Product form.** `product-input.ts` (pure, collect-all), `product-write.ts` (create/update/status/delete + M2M sync + 23505→field, rollback on link failure). Single long form (`product-form.tsx`) with sticky action bar, slug auto-suggest, focus-first-invalid, error summary, unsaved-changes guard + `beforeunload`, category multi-select + tag input. New + edit pages.

**Slice 3 — Images.** `image-write.ts` (server MIME/size re-validation, non-guessable path, storage/DB reconciliation, cover-at-most-one, promote-next-on-cover-delete, orphan cleanup). `usePointerReorder` hook (native Pointer Events, no `@dnd-kit`). `ImageManager` (dropzone, drag + ↑/↓ keyboard path with `aria-live`, cover radiogroup, delete confirm, optimistic).

**Slice 4 — Variants.** `variant-input.ts` (pure, in-file dup-SKU detection), `variant-write.ts` (reconcile set, 23505→row error). `VariantEditor` (inline rows, hex swatch, delete confirm warning images). Saved via a dedicated action.

**Slice 5 — Taxonomy.** `taxonomy-input.ts` + `taxonomy-write.ts` (23505→slug-dup, `check_violation`→cycle, FK→restrict). Tabbed manager, shared entity dialog, delete dialog (correct per-table consequence), recursive `CategoryTree` (`role=tree`, expand/collapse, re-parent via edit-dialog select).

**Slice 6 — Inventory + duplicate + Q&A.** `inventory-input.ts`/`inventory-write.ts` (RPC call, negative→friendly), `InventoryAdjustDialog` (explicit product-vs-variant target, live preview, negative-block), `InventoryLedger`. `product-duplicate.ts` (deep copy: unique slug `-copia`/SKU, variants, image rows share URLs, M2M, forced draft, rollback). `qa-read.ts`/`qa-write.ts`, `QAInbox` (answer+publish one write, unpublish, delete, segmented filter, char counter).

**Slice 7 — CSV.** `csv-parse.ts` (RFC-4180 state machine + generator, BOM/CRLF/quotes/formula-escape, zero deps), `csv-product-map.ts` (header validation, per-row plan, unknown-slug/dup-SKU/bad-money errors, SKU-keyed create/update), `csv-generate.ts` (export), `csv-import-write.ts` (resilient batch, one bad row never aborts, single cache bust). Guarded export route `products/export/route.ts` (self-`requireSession()` at entry + middleware-covered). `CsvImportDialog` 4-step stepper (mandatory dry-run → confirm → result), `CsvToolbar`.

## Key Decisions

- **Types are hand-authored** (not `db:types`-generated) per the repo's documented convention — added the new table/RPC types by hand to `types/`.
- **Variants save via a dedicated action** (not folded into the product FormData) — cleaner uniqueness/hex validation and matches the separate image/inventory action pattern; the ui-design listed per-row save as an accepted alternative.
- **List-context inventory adjust targets product-level stock** (variant-level lives on the edit page) — keeps the list a lean single-query read (no per-row variant fetch); the dialog shows an explanatory note when the product uses variant stock (edge 7).
- **Native Pointer Events reorder** over `@dnd-kit` (zero-dep constraint); ↑/↓ buttons are the guaranteed keyboard path.
- **Export as a guarded `/admin/…/export` route** — middleware covers `/admin/*` AND the handler self-guards (401), satisfying AC-34 defensively.

## Deviations from Ticket / UI-Design (with justification)

- **`next.config.ts` DID need a change** (ticket expected none): the config derived the storage host but hardcoded `protocol: "https"`. Local Supabase is `http://127.0.0.1:54321`, so the local host was not allow-listed and `next/image` 500'd on uploaded images. Fixed by deriving the protocol from `NEXT_PUBLIC_SUPABASE_URL` (http local / https prod). Verified.
- **`AdminShell` content width widened** `max-w-2xl` → `max-w-5xl` and **`AdminPage` gained an `actions` slot** — required to fit the product table + header CTAs. The settings form self-constrains, so T10 is visually unchanged (admin e2e is the proof at QA).
- **Q&A is a nav destination `/admin/qa`**, not a section inside the edit page (per the S3 nav decision); the edit page links to it via the product-name link on each Q&A card. The edit page keeps an inventory-history section.
- **Product-form section rail (scroll-spy)** is not an `IntersectionObserver` rail — the sticky action bar + single form + anchor `id`s deliver the coherence; a scroll-spy rail is pure polish deferred to UX (Stage 8). Functionality/AC unaffected.
- **`components/admin/form/fields.tsx` is 466 lines** (over the ~400 soft target, under the 1000 hard cap / ESLint passes). Kept as one cohesive field-primitive family; splitting would fragment it across ~8 consumers. Flagged for the arch/clean-code pass if a split is preferred.

## Edge Cases Handled

1. **Duplicate slug/SKU** — `23505` caught, mapped to a per-field "ya existe"; product insert rolls back on M2M failure (no orphans). (integration: `admin-catalog-write`)
2. **Category cycle** — client hides self in the parent select; DB trigger `check_violation`/`P0001` caught → "no puede ser su propio ancestro". (integration verified)
3. **Delete category with children / brand-in-use** — FK `23503` → "reasigna o elimina las subcategorías primero"; brand/style delete succeeds (set null). (integration verified)
4. **Image failures** — client + server MIME/size validation; DB-insert failure best-effort removes the just-uploaded object; storage-delete failure still removes the row + logs.
5. **CSV chaos** — RFC-4180 parser (BOM/CRLF/quotes/`""`); per-row errors for bad money (thousand sep), unknown slug, in-file dup SKU, bad status/slug; row cap + empty + non-UTF-8 + bad-header rejected with zero writes; resilient batch. (unit: `csv-parse`, `csv-product-map`)
6. **Concurrent inventory** — atomic RPC with row-lock; ledger never diverges; negative blocked. (integration verified)
7. **Variant-vs-product stock** — list shows "(var)" hint; adjust dialog states its target explicitly.
8. **Session expiry** — every action `requireSession()` first (redirect, no DB touch); form `beforeunload` guard.
9. **Unpublish cached question** — busts `product:<slug>` (verified: answer flow moved the card + set is_published).
10. **Storage re-enable regression** — verified clean stop/start/reset twice; documented filesystem fallback behind `image-write.ts`.

## Data-Testids (representative)

`admin-products-table`, `admin-products-search`, `admin-products-filter-{brand,category,status,stock}`, `admin-products-new`, `admin-product-row-{id}`, `admin-product-actions-{id}` (+ edit/duplicate/adjust/archive), `admin-page-{n}`; `admin-product-form`, `admin-product-{name,slug,sku,price,status,…}`, `admin-product-submit`, `admin-product-error-summary`, `admin-product-created-banner`; `admin-image-{dropzone,input,card-{id},cover-{id},up-{id},down-{id},delete-{id},delete-confirm}`; `admin-variant-{add,save,color,hex,sku,price,stock,delete,rows}`; `inventory-adjust-{dialog,amount,reason,preview,submit,negative}`; `taxonomy-tab-{brand,category,style,tag}`, `taxonomy-{new,save,name,slug}`, `taxonomy-row-{id}`, `category-tree`, `category-node-{id}`; `qa-{list,empty,card-{id},answer-{id},publish-{id},toggle-{id},delete-{id}}`, `admin-nav-qa-badge`; `admin-csv-{export,import}`, `csv-{import-dialog,file-input,continue,confirm,close,result,import-error}`.

## Seams for T12

- Admin-list read convention (`list-query.ts`: base table + admin client + no cache + `pagination.ts` math + batch-stitch) is the template for the T12 order list.
- Paired `*-input.ts` (pure) + `*-write.ts` (DB) modules + serializable action results is the reusable write pattern.
- `requireSession()` extracted to `src/lib/admin/require-session.ts` — reuse in all T12 actions.
- `bustCatalogTags` shared helper is the single cache-invalidation point.
- Shared form primitives in `components/admin/form/fields.tsx` (TextField/MoneyField/SelectField/TextareaField/SwitchField/NumberUnitField/Banner/FieldError) ready for order forms.
- **T12 GATE unchanged**: stateless sessions still have no server-side revocation (SEC-M-1) — must land the session-version check or shorter max-age before refund-capable T12 sessions (this task did not regress it; the reserved payload `v` field is untouched).

## Dependencies Added

**None.** shadcn `table`, `textarea`, `dialog`, `tabs`, `alert-dialog`, `progress` vendored as source via the CLI (dev-time, not runtime deps). CSV + drag + tree + stepper are hand-rolled.

## Migration / Storage Notes

- `0011_admin_inventory_and_storage.sql` — LOCAL only (`supabase db reset`); remote is empty/unlinked. Idempotent + re-runnable.
- `config.toml` `[storage] enabled = true` (analytics + edge_runtime remain OFF — they, not storage, caused the original boot regression). If storage ever regresses local boot, the fallback is a filesystem/`public/` dev shim behind the `image-write.ts` interface (documented in that module).
- Bucket `product-images` created via the migration's guarded `storage.buckets` insert (no seed step needed).
