# Task: T11 — Admin: Product Management

## Priority

**Critical** — T11 is the operator's core daily surface and unblocks a real launch: without it the owner cannot load the real catalog (CSV import), fix prices/stock, upload photography, or answer customer questions. It is a direct Phase-1 deliverable in PRODUCT_SPEC (Admin dashboard → Products) and the sole remaining admin-catalog gate before T12 (orders) and T14 (launch hardening). T10 (foundation) SHIPPED today and is explicitly T11-READY.

## Complexity

**high** — justified against the criteria:

- New subsystem, not a pattern copy: 9 sub-features, a new **admin-write data layer** (`src/lib/admin/products/*`, `.../taxonomy/*`, `.../images/*`, `.../csv/*`, `.../inventory/*`, `.../qa/*`), a **new pagination + indexed-filter read convention** (the T10 arch requirement — the settings singleton `maybeSingle` pattern does NOT generalize).
- New **data model migration `0011`** (inventory-adjustment ledger + atomic RPC) and a **new Supabase Storage bucket** re-enabled locally (config was deliberately disabled in commit 5571af6).
- 35+ files created/modified spanning migration, seed touch, lib, actions, route dirs, and ~20 components.
- New architectural decision (image storage) with cross-cutting infra impact (`supabase/config.toml`, migration, `next.config`).

This exceeds the `medium` bar (5–15 files, existing patterns only) on every axis. Full-cycle at `high` depth (all 12 stages) is appropriate. The ticket is decomposed into **7 build slices** so Dev ships coherent, reviewable increments.

## Feature Type

**full-feature** — substantial new admin UI (list, forms, drag-order image manager, taxonomy managers, CSV dialogs, Q&A inbox) AND substantial new server logic (write layer, CSV parse/generate, inventory ledger, cache-busting, image upload). All pipeline stages run at full depth. Note: admin is **es-MX only, no next-intl** (T10 decision) and **not indexed** — SEO/structured-data concerns apply lightly; Security & Arch run full (privileged write surface + new storage bucket + file upload = real attack surface).

## User Story

As the **store owner (single, non-technical Owner)**, I want to **manage my full catalog — products, variants, images, taxonomy, stock, and customer questions — from the admin dashboard, and bulk-load/export via CSV**, so that **I can launch with my real catalog, keep prices and inventory accurate, present proper product photography, and answer shoppers without touching the database or a developer**.

## Background

**What exists today (T1–T10):**

- Full catalog schema (migrations `0001`–`0010`): `products`, `product_variants`, `product_images`, `brands`, `categories` (nestable, cycle-guarded by trigger + self-parent CHECK), `styles`, `tags`, `product_categories`/`product_tags` (M2M), `product_questions` (Q&A). Money is integer cents (MXN); dimensions in mm, weight in g. Product `status` enum = `draft` / `active` / `archived`.
- Storefront reads the catalog through the `products_public` VIEW (active-only, omits `cost_price_cents`) and child-table RLS gated on `is_active_product()`. Reads are cached via `cachedRead`/`unstable_cache` under tags: **`catalog`** (all listings/facets/search/brand-index/style-index), **`brand:<slug>`**, **`style:<slug>`**, **`category:<slug>`**, **`product:<slug>`** (`productCacheTag`).
- Admin foundation (T10): locale-free `/admin` tree, HMAC session auth, `(app)` route-group guard sub-layout + middleware + per-action `requireSession()`. New sections = flag-flip in `src/lib/admin/constants.ts` (`ADMIN_NAV_ITEMS`: `products` is `status:"soon"` at `/admin/products`) + a route dir under `src/app/admin/(app)/`. Writes follow the **`updateStoreSettings` template** (`createAdminClient()` RLS-bypass + `updateTag(tag)` cache bust; pure input parser in `settings-input.ts`; server action re-verifies session, returns a serializable state enum, never echoes raw PG errors; `useActionState` + keyed success banner + focus-first-invalid on the client).
- `next.config.ts` **already allow-lists** the Supabase Storage host (`https://<ref>.supabase.co/storage/v1/object/public/**`) for `next/image` **and** `picsum.photos` (seed placeholders). Image upload via Supabase Storage was anticipated.
- Seed (`scripts/seed-data/products.ts`) uses `picsum.photos` placeholder URLs; images upsert on the `(product_id, url)` unique constraint (import can reuse this).

**What's missing / why this matters:**

- No admin write path for any catalog entity. No product list read that shows draft/archived (storefront reads only `active` via the view). No image upload (**Supabase Storage is DISABLED** in `supabase/config.toml`). No inventory-adjustment audit trail. No CSV pipeline. No Q&A answering (schema supports it; storefront only reads `is_published=true` and inserts unpublished via anon RLS).
- No drag/reorder UI exists anywhere; only 7 shadcn/ui primitives are vendored (`badge, button, checkbox, input, label, select, slider`).

## Scope Decisions (descopes / deferrals with justification)

**All 9 sub-features are IN SCOPE for T11 — none descoped.** Rationale per the two candidates flagged:

1. **CSV import + export — KEEP (Phase 1, required).** PRODUCT_SPEC is explicit and repeats it three times: Assumptions ("Catalog: not ready… **CSV import loads the real catalog when it exists**"), Admin → Products ("**CSV import + export**"), Pending client inputs ("**Real catalog CSV**"). The store ships with seed data specifically because the real catalog arrives as CSV. Descoping it would block launch. **Constraint:** implement with **zero new dependencies** — a hand-rolled RFC-4180 parser/generator (small, pure, unit-testable) is required. CSV import is the single riskiest slice; it ships last (Slice 7) behind a **mandatory dry-run preview** (no writes until the owner confirms a parsed diff).

2. **Q&A answering — KEEP (Phase 1, required).** The infrastructure fully exists: `product_questions` table (0004) with `answer`, `is_published`, `answered_at`; storefront reads published Q&A (`product-detail.ts:214`) and inserts unpublished questions via anon RLS (`producto/[slug]/actions.ts:98`). The ONLY missing piece is the admin surface to write `answer` + flip `is_published` — exactly the T10 write template. Small, low-risk slice (Slice 6). **In scope:** list unanswered/answered, answer, publish/unpublish, delete spam. **Out of scope:** email-notify the asker (no asker-email column on `product_questions`; do not add one).

**Deferred to Phase 2 (do NOT build — BUILD_PLAN rule 2), even though schema/UI would be adjacent:**

- Discount-code management UI (Phase 2 explicitly).
- Rich-text description editor / homepage section manager / media library (Phase 2). Product description is a **plain `<textarea>`** in T11.
- Bulk product actions, low-stock alerts, manual order creation, sales/best-seller reports (Phase 2 Admin).
- Product **translations editing** UI. The `translations` table exists but T11 edits the **base-table columns only** (es-MX authored inline). Do not build a per-locale field editor (tracked for a later i18n task).
- Customer accounts, size variants, reviews, product video, etc. (spec SKIP list).

## Acceptance Criteria

Binary PASS/FAIL. Grouped by build slice.

**Slice 0 — Foundation (migration, storage, nav, read convention)**

- [ ] AC-1: Migration `0011` applies cleanly on a seeded DB (`supabase db reset` + `db:seed` green), is idempotent (re-runnable), adds an `inventory_adjustments` ledger table, a `record_inventory_adjustment` atomic RPC, and any needed admin-list indexes; `npm run db:types` regenerates `database.types.ts` with the new table + RPC.
- [ ] AC-2: `supabase/config.toml` re-enables `[storage]`; `supabase start`/`db reset` still comes up healthy locally within the CLI health-check window; a `product-images` **public-read** bucket exists (created idempotently — via migration `storage.buckets` insert or a seed step, documented in dev-done). The re-enable is verified with a clean `db reset` before ship (edge 10).
- [ ] AC-3: `ADMIN_NAV_ITEMS` in `src/lib/admin/constants.ts` flips `products` to `status:"live"`; `/admin/products` renders inside the existing `AdminShell` with the guard inherited from `(app)/layout.tsx` — no shell/nav rewrite.
- [ ] AC-4: A new **admin product-list read** returns products of **any status** (draft/active/archived) via `createAdminClient()` (RLS-bypass) against the base `products` table (NOT `products_public`), paginated (server-side `.range()`), filterable, and **NOT wrapped in `unstable_cache`** (admin data is always live; reuse the pure pagination math in `pagination.ts` — count → clamp → range — not the storefront cached readers).

**Slice 1 — Product list + filters**

- [ ] AC-5: `/admin/products` lists products in a table showing at minimum: cover thumbnail, name, brand, SKU, price (MXN formatted via `formatMXN`), stock (product or summed-variant), status badge, updated date.
- [ ] AC-6: Search filters by name/SKU (case-insensitive substring); filter controls exist for brand, category, status, and a stock filter (in-stock / out-of-stock). Filters combine (AND) and are reflected in the URL query so the view is shareable/back-button-safe.
- [ ] AC-7: Pagination works with `ADMIN_PRODUCTS_PER_PAGE`; an out-of-range/malformed `?page` clamps to a valid page (reuse `parsePageParam`/`rangeFor`). Empty result renders an empty state, not a crash.
- [ ] AC-8: Each row links to `/admin/products/[id]/edit`; a "Nuevo producto" CTA links to `/admin/products/new`.

**Slice 2 — Add / edit product form (full model)**

- [ ] AC-9: The form covers the **full product model**: name, slug (auto-suggested from name, editable, uniqueness-validated), description (plain textarea), brand (select), style (select), SKU (unique-validated), price, compare-at price, **cost price** (internal — clearly labelled "no visible para clientes"), status, dimensions (width/depth/height/seat-height, edited in cm → stored mm), weight (edited kg → stored g), materials (frame/upholstery/finish), `is_featured`, `is_best_seller`, categories (multi-select, M2M), tags (multi-select/create, M2M).
- [ ] AC-10: Money fields use the T10 peso-string pattern (`inputmode="decimal"`, `$` adornment, strict server parse → cents; no `type="number"`). Dimension/weight fields parse cm/kg → integer mm/g with the same strictness (reject junk, negatives, overflow) via a pure parser.
- [ ] AC-11: Create writes a new product row (+ M2M rows) via the admin client and busts `catalog` (+ touched `brand:`/`style:`/`category:` tags); edit updates in place and busts `catalog` + `product:<slug>` (+ touched taxonomy tags). Save re-verifies the session first (a direct POST without a valid cookie redirects to login and never touches the DB).
- [ ] AC-12: A duplicate slug or SKU returns a **field-level** error ("ya existe"), keeps the form filled, and does not 500 (handled before, or by catching the unique-violation `23505`).
- [ ] AC-13: All validation errors surface inline per-field, keep the form filled, and focus the first invalid field (T10 form contract). A DB write failure shows a generic banner, never a raw PG error.

**Slice 3 — Multi-image upload, drag ordering, cover**

- [ ] AC-14: On the edit page the owner can upload one or more images (client validates type ∈ {jpeg,png,webp} and size ≤ a documented max, e.g. 5 MB); files upload to the `product-images` bucket via a server action using the admin client; a `product_images` row is created with the resulting public URL. Server re-validates type/size (never trusts the client).
- [ ] AC-15: Images can be **reordered by drag** (keyboard-accessible fallback: move-up/move-down buttons); the new `sort_order` persists. Exactly one image can be set as **cover** (`is_primary=true`); setting a new cover clears the previous one (at most one primary per product, enforced).
- [ ] AC-16: An image can be deleted (removes the `product_images` row AND the storage object; a failed storage delete still removes the row and logs, never blocks the owner). Deleting the cover promotes the next image to cover.
- [ ] AC-17: After any image change, the storefront reflects it (bust `catalog` + `product:<slug>`); `next/image` renders the uploaded URL without a config change (host already allow-listed).

**Slice 4 — Variant management**

- [ ] AC-18: On the edit page the owner can add/edit/remove color variants: color name, color hex (validated `^#[0-9A-Fa-f]{6}$` — matches DB CHECK), per-variant SKU (unique), stock, optional price override (blank = inherit base price), sort order.
- [ ] AC-19: Variant images: an uploaded image can be associated with a specific variant (`product_images.variant_id`) or left product-level (`variant_id=null`). Removing a variant reassigns or removes its images coherently (FK is `on delete cascade`; owner is warned before delete).
- [ ] AC-20: Variant writes validate hex/SKU/stock/price with the same strictness and bust the right tags. A duplicate variant SKU is a field error, not a 500.

**Slice 5 — Taxonomy management (brands, categories, styles, tags)**

- [ ] AC-21: CRUD for **brands** (slug, name, description, logo_url, is_active), **styles** (slug, name, description, is_active), **tags** (slug, name). Slug uniqueness validated with a friendly field error.
- [ ] AC-22: CRUD for **categories** with **nesting** (parent select). The UI prevents choosing a parent that would create a cycle; if the DB `categories_no_cycle` trigger fires anyway, it is caught and shown as a friendly error (not a 500).
- [ ] AC-23: Deleting a category with children is blocked with a clear message (DB is `on delete restrict` — catch and explain; do not orphan). Deleting a brand/style used by products succeeds (FK `on delete set null`) and the affected products fall back gracefully. Deleting a tag/category detaches it from products (M2M `on delete cascade`).
- [ ] AC-24: Toggling `is_active=false` on a brand/category/style immediately hides its products/facet on the storefront after cache bust (bust `catalog` + the entity slug tag).

**Slice 6 — Inventory adjustment + duplicate + Q&A**

- [ ] AC-25: From a product/variant the owner can make a **manual inventory adjustment** entering a delta (±) or an absolute new count **and a required reason** (free text, bounded length). The adjustment updates the product/variant `stock` AND writes an `inventory_adjustments` row (product_id, variant_id nullable, delta, resulting_stock, reason, created_at) as an **atomic** operation (the `record_inventory_adjustment` RPC — the two writes never diverge).
- [ ] AC-26: An adjustment that would drive stock negative is rejected (DB CHECK `stock >= 0` is the backstop; validate before to give a friendly error).
- [ ] AC-27: **Duplicate product** creates a deep copy: new product row with a unique slug/SKU (suffix `-copia` until unique), copied variants (new unique SKUs), copied image rows (referencing the same storage URLs — no file copy in Phase 1; documented), copied M2M category/tag links, forced `status='draft'`. The copy opens in the edit form.
- [ ] AC-28: **Q&A answering:** a Q&A view lists questions with unanswered-first ordering; the owner can write an answer (bounded 1–5000 chars, matching DB CHECK), which sets `answer`, `answered_at=now()`, and `is_published=true` in one write; can unpublish; can delete spam. Answering/unpublishing busts `product:<slug>` so the storefront reflects it.

**Slice 7 — CSV import + export**

- [ ] AC-29: **Export** produces a CSV of all products (documented column set: slug, SKU, name, brand slug, category slugs, style slug, price/compare/cost in pesos, stock, status, dimensions cm, weight kg, materials, tags) with RFC-4180 quoting (fields with commas/quotes/newlines quoted; embedded quotes doubled). Downloads with a `Content-Disposition` filename and `text/csv` type.
- [ ] AC-30: **Import** accepts an uploaded CSV, parses it (RFC-4180), and shows a **dry-run preview**: rows to create, rows to update (matched by SKU — documented key), and per-row validation errors — **with NO database writes** until the owner explicitly confirms.
- [ ] AC-31: On confirm, valid rows are written (create/update) referencing brands/categories/styles by slug (unknown taxonomy slug → row error in preview, not silent creation); the import is resilient (one bad row does not abort the batch — bad rows are reported, good rows commit) and the result summarizes counts. Caches are busted once at the end.
- [ ] AC-32: A malformed CSV (missing required header, non-UTF-8, empty file, > `CSV_MAX_ROWS`) is rejected with a clear message and zero writes.

**Cross-cutting**

- [ ] AC-33: `tsc` 0 errors, eslint clean (incl. `max-lines`), prod build exits 0. No new file > 400 lines (hard cap 1000). No `any`, no non-null `!` at boundaries. Functions ≤ 30 lines / one level of abstraction.
- [ ] AC-34: The admin secret key never enters the client bundle (all writes in `"use server"` actions / `server-only` lib; the `secret-exposure`-style guard stays green). No image-upload or CSV route bypasses `requireSession()` (if any `/api/admin/*` handler is added, it self-guards — middleware excludes `/api`).
- [ ] AC-35: Storefront regression suite stays green (existing catalog/PDP/search/cart e2e); admin e2e runs serially on a fresh dev server + fresh seed per the T10 harness rules.

## Edge Cases

At least 5 — the unhappy paths that MUST be handled:

1. **Duplicate slug/SKU race:** two saves (or a duplicate + an import) collide on the unique constraint. Expected: the DB `23505` unique-violation is caught and mapped to a per-field "ya existe" error; the write rolls back; no partial product with orphaned M2M rows remains.
2. **Category cycle attempt:** owner sets category B's parent to its own descendant A. Expected: UI hides invalid parents; if bypassed, the `categories_no_cycle` trigger raises `check_violation` and the action shows "no puede ser su propio ancestro" — never a 500.
3. **Delete category with children / brand-in-use:** child-bearing category delete is blocked (`on delete restrict` caught → "reasigna o elimina las subcategorías primero"); brand delete succeeds and its products' `brand_id` becomes null and they still render (storefront tolerates null brand embed via `firstOrSelf`).
4. **Image upload failures:** unsupported MIME (svg/gif/heic), 0-byte file, oversized file, storage bucket unreachable/quota, or a partial upload (file lands but the `product_images` insert fails, or vice-versa). Expected: client pre-validates type/size; server validates again; a storage-vs-DB divergence is reconciled (on DB-insert failure the just-uploaded object is best-effort deleted; on storage-delete failure the row is still removed and the orphan logged) — no dangling half-state shown to the owner.
5. **CSV chaos:** UTF-8 BOM, CRLF vs LF, quoted fields containing commas/newlines/`""`, a row with too few/many columns, a price like `"1,500.00"` (thousand separator — rejected per the strict money parser, reported as a row error not coerced), a negative/huge/`NaN` stock, an unknown brand/category slug, a duplicate SKU appearing twice within the same file, and a file above `CSV_MAX_ROWS`. Expected: parser is RFC-4180-correct; every bad row is surfaced in the dry-run with a reason; the row cap rejects oversized files; nothing is written until confirm; good rows still import when bad rows exist.
6. **Concurrent inventory adjustment vs. a checkout stock decrement (T7):** owner sets absolute stock to 3 while a checkout reserves 2. Expected: the adjustment is atomic (RPC) and the ledger records the resulting stock; last-writer-wins is acceptable for the single Owner, but stock never goes negative and the ledger never diverges from `products.stock`/`variant.stock`.
7. **Variant stock vs. product stock ambiguity:** a product with variants — which stock is authoritative? Expected: follow the schema rule (per-variant stock authoritative when variants exist; product `stock` is the no-variant fallback). The list's stock column and the adjustment UI make explicit which they act on; do not silently edit the wrong field.
8. **Session expiry mid-edit:** owner leaves the edit form open past the 8h session, then submits. Expected: `requireSession()` redirects to `/admin/login`; the DB is never touched; no data loss beyond the unsaved form (documented — no autosave in Phase 1).
9. **Unpublish a question the storefront cached as published:** unpublish busts `product:<slug>`; the question disappears from the PDP after revalidation.
10. **Storage re-enable regresses local `supabase start`** (the exact failure that caused it to be disabled — vector/analytics container coupling): Expected: re-enabling is verified to still boot within the health-check window; if the regression recurs, the documented fallback is used and re-tested — the migration/config change ships only with a green `db reset`.

## Error States Table

| Trigger | User Sees | System Does |
| ------- | --------- | ----------- |
| Duplicate slug/SKU on save/import | Inline field error "Ya existe un producto con ese SKU/slug." | Catches PG `23505`, rolls back, returns field-error state; no partial write |
| Category cycle / self-parent | Field error "Una categoría no puede ser su propio ancestro." | Trigger raises `check_violation`; action maps to friendly error |
| Delete category with children | Banner "Reasigna o elimina las subcategorías primero." | `on delete restrict` FK error caught; no delete |
| Invalid money/dimension input | Inline "Usa punto decimal, sin separadores de miles." / "Máximo 2 decimales." | Pure parser rejects before write; form stays filled |
| Unsupported/oversized image | Inline "Formato no permitido (usa JPG/PNG/WebP)." / "La imagen supera 5 MB." | Client + server validate; upload not attempted |
| Storage upload fails | Banner "No se pudo subir la imagen. Intenta de nuevo." | Logs cause; no `product_images` row created; owner can retry |
| Storage/DB image divergence | (nothing broken shown) | Best-effort orphan cleanup; DB row is source of truth; logs mismatch |
| DB write failure (any entity) | Generic banner "No se pudo guardar. Intenta de nuevo." | Logs full PG error server-side; returns `error` enum; never echoes raw error |
| Session expired on submit | Redirect to `/admin/login` | `requireSession()` redirect before any DB access |
| CSV missing header / empty / too large | Banner naming the problem ("Falta la columna 'sku'." / "El archivo excede N filas.") | Parse aborts; zero writes |
| CSV per-row validation error | Dry-run preview lists row #, column, reason | Row excluded from the confirmed write; good rows still commit |
| Stock adjustment → negative | Inline "El inventario no puede quedar negativo." | Validated before write; DB CHECK is backstop |
| Q&A answer too long (>5000) | Inline "La respuesta no puede superar 5000 caracteres." | Rejected before write (matches DB CHECK) |

## UX Requirements

For every state, on the **es-MX admin** (no next-intl), mobile-first, shadcn/ui + Tailwind + @hugeicons only, `.enter-fade`/RM-safe motion per T10:

- **Loading:** product list shows a table skeleton (rows) while the server component streams; forms are SSR-populated (no skeleton — data present at render, T10 pattern). Image upload shows a per-file progress/spinner and disables submit while pending (`useActionState` `pending`). CSV dry-run shows an "Analizando archivo…" state.
- **Empty:** no products → centered empty state with icon + "Aún no hay productos" + "Nuevo producto" CTA (and, when filters are active, "No hay resultados con estos filtros. Limpiar filtros."). No images on a product → dashed dropzone placeholder. No questions → "No hay preguntas por responder."
- **Error:** field-level errors inline under the field (destructive, `role="alert"`, icon), form stays filled, focus moves to first invalid field; write failures as a banner (`role="alert"`). CSV errors as a scrollable per-row list.
- **Success:** save → non-blocking success banner (keyed replay, `role="status"`), form stays editable (T10 pattern); create/duplicate → redirect to the edit page with a success banner; image reorder/cover → optimistic UI confirmed on server response; CSV import → summary card ("Creados: N · Actualizados: M · Con errores: K").
- **Mobile (375px):** the product list becomes a stacked card list (thumbnail + name + key facts) instead of a wide table; filters collapse into a sheet/disclosure; forms single-column; the image manager stacks vertically with large drag handles + move-up/down buttons (touch); tap targets ≥ 44px (`min-h-11`).
- **Tablet (768px):** two-column form where sensible (dimensions grid); the product table renders inside a horizontally scrollable overflow container if needed (never breaks page layout).
- **Accessibility:** drag-reorder has a keyboard path (move-up/down buttons + `aria-live` announcing new position); every input has a `<label htmlFor>`; the color-hex field has a swatch preview with a text alternative; the cover selector has radio-group semantics ("una sola portada").

## Technical Approach

### Files to Create

**Migration / infra**
- `supabase/migrations/0011_admin_inventory_and_storage.sql` — `inventory_adjustments` ledger table (+ indexes); `record_inventory_adjustment` RPC (atomic stock update + ledger insert, `SECURITY DEFINER`, `set search_path=''`, schema-qualified, bounded reason); create `product-images` storage bucket (public read) idempotently; admin-list supporting indexes if warranted (e.g. `products (updated_at desc)`, `lower(name)`/trigram for search).
- `scripts/seed-data/*` — touch only if the bucket needs a seed step (document).

**Read layer (admin, live, no cache)**
- `src/lib/admin/products/list-query.ts` — paginated, filtered admin product-list read via `createAdminClient()` (any status), count → clamp → range using `pagination.ts`. ≤ 400 lines.
- `src/lib/admin/products/list-filters.ts` — pure parse/normalize of the list URL search-params (search, brand, category, status, stock, page) → typed, bounded filter object (unit-testable, cache-key-safe bounding like `canonicalPageKey`).
- `src/lib/admin/products/product-read.ts` — read one product with variants/images/categories/tags for the edit form (admin client).

**Write layer + pure parsers (mirror `settings-input.ts` + `updateStoreSettings`)**
- `src/lib/admin/products/product-input.ts` — pure product-field parser (name/slug/sku/money/dimensions/materials/flags) → DB-ready row + field errors.
- `src/lib/admin/products/product-write.ts` — create/update/duplicate/delete product (+ M2M) via admin client; maps `23505` → field error; busts tags via the shared helper.
- `src/lib/admin/products/variant-input.ts` + `variant-write.ts` — variant parse + CRUD.
- `src/lib/admin/products/image-write.ts` — upload to bucket, create/reorder/set-cover/delete `product_images`; orphan reconciliation.
- `src/lib/admin/taxonomy/{brand,category,style,tag}-input.ts` + `taxonomy-write.ts` — taxonomy parse + CRUD (category cycle/restrict handling).
- `src/lib/admin/inventory/inventory-input.ts` + `inventory-write.ts` — adjustment parse + `record_inventory_adjustment` RPC call.
- `src/lib/admin/qa/qa-read.ts` + `qa-write.ts` — list questions (admin client), answer/publish/unpublish/delete.
- `src/lib/admin/csv/csv-parse.ts` + `csv-generate.ts` — RFC-4180 pure parser/generator (no deps).
- `src/lib/admin/csv/csv-product-map.ts` — map CSV rows ↔ product rows + dry-run diff builder (pure).
- `src/lib/admin/products/cache-tags.ts` — one helper that busts `catalog` + touched `brand:`/`style:`/`category:`/`product:` tags (single source of truth for T11 cache discipline; imports the exported tag constants, never string literals).
- `src/lib/admin/products/slug.ts` — slugify + unique-suffix helper (create/duplicate/import).
- `src/lib/admin/units.ts` — pure cm↔mm, kg↔g parse/format with the strict-parser discipline.

**Actions (`"use server"`) + serializable form-state contracts (contracts live OUTSIDE the action file — T10 rule that a `"use server"` module may only export async fns)**
- `src/app/admin/(app)/products/actions.ts` (+ `products-form-state.ts`)
- Image / variant / inventory / duplicate / taxonomy / qa / csv actions — grouped to keep each file ≤ 400 lines.

**Routes (inherit guard + shell from `(app)/layout.tsx`)**
- `src/app/admin/(app)/products/page.tsx` (list), `new/page.tsx`, `[id]/edit/page.tsx`
- `src/app/admin/(app)/taxonomy/page.tsx` (brands/categories/styles/tags, tabbed), `qa/page.tsx`, `import-export/page.tsx` (or CSV within the products list header).
- (Optional) `src/app/admin/(app)/products/export/route.ts` — guarded CSV-download route handler that calls the session check at entry (see API note).

**Components (`src/components/admin/products/*`, `.../taxonomy/*`, etc.)**
- `product-table.tsx`, `product-filters.tsx`, `product-empty-state.tsx`
- `product-form.tsx` (+ field-group children: `dimensions-fields.tsx`, `taxonomy-select.tsx`, `tag-input.tsx`) — decomposed to respect the 400-line cap.
- `image-manager.tsx` (dropzone + drag-order list + cover radio + delete), `image-upload-field.tsx`
- `variant-editor.tsx` (+ `variant-row.tsx`)
- `taxonomy-manager.tsx`, `category-tree.tsx`
- `inventory-adjust-dialog.tsx`, `qa-inbox.tsx`, `csv-import-dialog.tsx` (dry-run preview), `csv-export-button.tsx`
- Shared UI: add `table.tsx`, `textarea.tsx`, `dialog.tsx`, `tabs.tsx` to `src/components/ui/` via the shadcn CLI (do not hand-roll).

### Files to Modify

- `supabase/config.toml` — `[storage] enabled = true` (verify boot; document the vector/analytics-coupling risk that caused the original disable).
- `src/lib/admin/constants.ts` — flip `products` nav item to `live`; add `taxonomy`/`qa` section ids (or nest under products) — keep the `AdminSectionId` union honest.
- `src/lib/supabase/database.types.ts` (+ `types/tables-*.ts`, `types/rpc.ts`) — regenerate for `inventory_adjustments` + RPC.
- `src/lib/config/*` — add T11 constants: `ADMIN_PRODUCTS_PER_PAGE`, image MIME allow-list + `IMAGE_MAX_BYTES`, `CSV_MAX_ROWS`, `PRODUCT_IMAGES_BUCKET`, adjustment-reason max length (no magic values).
- `next.config.ts` — no change expected (Supabase Storage host already allow-listed); confirm during dev.

### Data Model Changes

- **New table `inventory_adjustments`** — `id`, `product_id` (FK cascade), `variant_id` (nullable FK cascade), `delta int`, `resulting_stock int check >= 0`, `reason text` (bounded 1–500), `created_at`. RLS enabled; no anon grant (service_role only, like orders/customers). `grant all … to service_role` per the 0005 baseline.
- **New RPC `record_inventory_adjustment(p_product_id, p_variant_id, p_delta OR p_absolute, p_reason)`** — atomic stock write + ledger insert; rejects negative result.
- **Storage:** `product-images` bucket (public read). No column changes to `product_images` (it already has `url`, `variant_id`, `sort_order`, `is_primary`, and the `(product_id, url)` unique constraint import/upsert can rely on).
- **No changes** to `products`/`product_variants` columns — the full model already exists.

### API Endpoints

Prefer **server actions** over route handlers (consistent with T10; middleware guards `/admin` pages but excludes `/api`). If a route handler is required for streaming a CSV export download, it MUST live under `/admin/...` (middleware-reachable) OR self-call `requireSession()` at entry (AC-34). Recommended: CSV export as a server action returning a `Response`/data URL, or a guarded route handler `src/app/admin/(app)/products/export/route.ts` that runs the session check first.

### Dependencies

- **No new runtime dependencies.** CSV parse/generate is hand-rolled (RFC-4180). Drag ordering uses native HTML5 drag / pointer events + a keyboard fallback (no `dnd-kit`, no `react-beautiful-dnd`) — evaluate in UI-design; if a library is truly unavoidable, justify and pin, but the default is zero-dep.
- shadcn/ui components (`table`, `textarea`, `dialog`, `tabs`) added via the shadcn CLI (already a devDependency) — vendored source, not runtime deps.

## Out of Scope

- Discount-code management UI, rich-text/description editor, homepage/section manager, media library (Phase 2).
- Product **translation** editing (per-locale field UI) — base es-MX columns only.
- Bulk product actions, low-stock alerts, sales/best-seller reports, manual order creation (Phase 2).
- Emailing question-askers (no asker-email column; do not add).
- Copying image **files** on product duplicate (Phase 1 references the same storage URLs; a true file-copy is deferred and documented).
- Order management, refunds, packing slips, customer list (T12).
- Any storefront-facing change beyond cache-invalidation correctness.
