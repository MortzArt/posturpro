# Research Report: T11 — Admin: Product Management

## Codebase Analysis

### Existing Patterns

- **Admin write template** — `updateStoreSettings()` in `src/lib/store-settings.ts:167`: `createAdminClient()` (RLS-bypass) → read-or-insert singleton → `updateTag(STORE_SETTINGS_CACHE_TAG)`. Reuse: every T11 write is the same shape (admin client, mutate, bust tags, map raw error to a friendly enum, never throw the PG error to the UI). The read/write live in the same module (SRP). T11 generalizes this from a singleton to keyed entities.
- **Pure input parser** — `parseStoreSettingsInput()` in `src/lib/admin/settings-input.ts:128`: no I/O, no Next imports, collects ALL field errors in one pass, returns a discriminated union `{ok:true, values} | {ok:false, fieldErrors}`. Reuse: `product-input.ts`, `variant-input.ts`, taxonomy/inventory/csv-row parsers copy this discipline. `parseMoneyToCents()` (`settings-input.ts:66`) is the strict money boundary — reuse verbatim (strips one `$`, rejects thousand separators, 3+ decimals, overflow); the cm/kg → mm/g parser mirrors it.
- **Server-action + form-state split** — `src/app/admin/actions.ts` (`"use server"`, only async exports) + `src/app/admin/admin-form-state.ts` (serializable state types/initial values for `useActionState`). `saveStoreSettings` (`actions.ts:114`) calls `await requireSession()` FIRST, then parses, then writes, returning `{status, fieldErrors?, values, submissionId}`. Reuse: identical pattern per T11 write; `requireSession()` (`actions.ts:145`) is copy-forward (or extract to a shared `src/lib/admin/require-session.ts`).
- **Client form** — `store-settings-form.tsx`: `useActionState`, `pending` disables inputs + swaps the submit label, `submissionId`-keyed success banner (`role="status"`), focus-first-invalid on `state.status==="invalid"`, `MoneyField` with `inputmode="decimal"` + `$` adornment (never `type="number"`), `.enter-fade` RM-safe motion. Reuse: the field components (`TextField`, `MoneyField`, `FieldError`, `Banner`) are the visual/interaction primitives to extract and share across every T11 form.
- **Cached catalog read + pure pagination** — `cachedRead()` in `read-primitives.ts:68`, `listProducts()` in `queries.ts:79` (count → clamp → range), pure math in `pagination.ts` (`parsePageParam`, `rangeFor`, `lastPageFor`, `paginationWindow`, `canonicalPageKey`). Reuse strategy: the admin list reuses ONLY the pure `pagination.ts` math; it must NOT use `cachedRead` (admin data is live) and must query the base `products` table via the admin client (not `products_public`) to see draft/archived.
- **Embedded-relation normalization** — `firstOrSelf()` (`read-primitives.ts:46`) collapses a PostgREST to-one embed that may surface as an array. Reuse in the admin edit-form read (brand/style embeds).
- **Seed idempotency by natural key** — `scripts/seed.ts` + `scripts/seed-data/products.ts`: upsert brands/styles/tags/categories on `slug`, products on `slug`, variants on `sku`, images on `(product_id, url)`. The CSV importer should match products by SKU and taxonomy by slug — the same natural keys the schema already enforces unique.

### Relevant Files

| File | Purpose | Relevance | Action |
| ---- | ------- | --------- | ------ |
| `supabase/migrations/0002_catalog.sql` | products/variants/images/brands/categories/styles/tags DDL + cycle trigger | The full model T11 edits; column names, CHECKs, FKs, `(product_id,url)` unique | Reference |
| `supabase/migrations/0004_content_qa.sql` | `product_questions` (answer/is_published/answered_at) | Q&A answering target | Reference |
| `supabase/migrations/0005_rls_policies.sql` | RLS baseline, `products_public` view, service_role grants | Why admin uses the secret client; new table needs `grant … to service_role` | Reference |
| `supabase/migrations/0006_data_integrity_hardening.sql` | slug/name/free-text CHECKs, no-blank | Constraints the parsers must pre-satisfy; `add_check_if_absent` helper for 0011 | Reference |
| `supabase/config.toml:42-48` | `[storage]` + `[edge_runtime]` DISABLED | Must re-enable `[storage]`; documents the boot-regression risk | Modify |
| `next.config.ts:27-44` | `next/image` remotePatterns | Supabase Storage host ALREADY allow-listed — no change needed | Reference (confirm) |
| `scripts/seed.ts`, `scripts/seed-data/products.ts` | seed orchestration + `seedImageUrl` | Import-key parity; bucket seed step if any | Reference / touch |
| `src/lib/store-settings.ts:167` | `updateStoreSettings` write template | THE write pattern to copy | Reference |
| `src/lib/admin/settings-input.ts` | pure parser + `parseMoneyToCents` | Reuse the parser discipline + money fn | Reference / reuse |
| `src/app/admin/actions.ts` | login/logout/save actions, `requireSession` | Action template; `requireSession` copy-forward | Reference |
| `src/app/admin/admin-form-state.ts` | serializable state contracts | Pattern for `products-form-state.ts` | Reference |
| `src/components/admin/store-settings-form.tsx` | client form primitives | Extract `MoneyField`/`Banner`/`FieldError` to share | Reference / refactor |
| `src/lib/admin/constants.ts:97` | `ADMIN_NAV_ITEMS` (`products` = soon) | Flip to `live`; add sections | Modify |
| `src/app/admin/(app)/layout.tsx` | guard + `AdminShell` wrapper | New routes inherit it automatically | Reference |
| `src/components/admin/admin-page.tsx` | section header wrapper | Reuse for every T11 page | Reference / reuse |
| `src/lib/catalog/pagination.ts` | pure pagination math | Reuse for the admin list | Reference / reuse |
| `src/lib/catalog/queries.ts:53` + `product-detail.ts:36` | `CATALOG_CACHE_TAG`, `productCacheTag`, `brand:/category:/style:` tags | The exact tags admin writes must bust | Reference / import |
| `src/lib/supabase/admin.ts` | `createAdminClient()` | The RLS-bypass client for all writes | Reference / reuse |
| `src/lib/money.ts` | `formatMXN`, `pesosToCents`, `centsToPesos` | List/format + parse | Reference / reuse |
| `src/app/[locale]/producto/[slug]/actions.ts:98` | anon Q&A insert path | Confirms Q&A is read/insert-only today; admin adds the answer/publish write | Reference |

### Data Flow

**Product edit (write):** owner submits `product-form.tsx` `<form action={updateProduct}>` → `useActionState` posts FormData → `updateProduct` (`"use server"`) `await requireSession()` (redirect on fail, no DB touch) → `parseProductInput(FormData)` (pure; field errors return early, form stays filled) → `product-write.ts` `createAdminClient()` UPDATE `products` + reconcile `product_categories`/`product_tags` (catch `23505` → field error) → `bustProductTags(slug, {brandSlug, styleSlug, categorySlugs})` calls `updateTag('catalog')` + `updateTag('product:'+slug)` + touched taxonomy tags → return `{status:"success", submissionId}` → client shows keyed banner. Next storefront render of `/producto/[slug]` (cached under `product:<slug>`+`catalog`) re-reads fresh.

**Admin product list (read):** `/admin/products?search=&brand=&status=&page=` server component → `parseListFilters(searchParams)` (pure, bounded) → `listAdminProducts(filters)` → `createAdminClient()` count-only query with filters → `parsePageParam(rawPage, lastPage)` → `.range(from,to)` data query with the same filters, `.order('updated_at', desc)` → returns rows (any status) → `product-table.tsx` renders. No `unstable_cache` — always live.

**Image upload:** `image-upload-field.tsx` client-validates type/size → server action receives the File → server re-validates → `createAdminClient().storage.from('product-images').upload(path, file)` → on success insert `product_images {product_id, url:publicUrl, variant_id?, sort_order, is_primary}` → on insert failure best-effort `storage.remove([path])` → bust `catalog`+`product:<slug>`.

**Inventory adjustment:** `inventory-adjust-dialog.tsx` → action → `parseAdjustment` → `createAdminClient().rpc('record_inventory_adjustment', {...})` (atomic: updates `products.stock`/`variant.stock` + inserts `inventory_adjustments`, rejects negative) → bust `catalog`+`product:<slug>`.

**CSV import:** upload → parse (RFC-4180) → `buildImportDiff(rows, existingSkus, taxonomySlugs)` (pure dry-run) → preview UI (create/update/errors) → owner confirms → batched writes (resilient per-row) → bust `catalog` once → summary.

### Similar Features (Reference Implementations)

- **T10 Store Settings** (`store-settings.ts` + `actions.ts` + `settings-input.ts` + `store-settings-form.tsx`) — the closest reference: it IS one instance of the exact write pattern every T11 slice repeats. Key patterns to follow: pure parser boundary, `requireSession` first, admin client, tag bust, serializable state, keyed success banner, focus-first-invalid, strict money field.
- **T3 catalog list** (`queries.ts` `listProducts` + `queries-internal.ts` count→clamp→range + `pagination.ts`) — the read/pagination reference. Follow the count→clamp→range shape; diverge by using the admin client + base table + no cache.
- **T4 Q&A** (`product-detail.ts:214` read published + `producto/[slug]/actions.ts:98` anon insert) — shows exactly the half of Q&A that exists; T11 supplies the missing admin answer/publish write.
- **Category cycle guard** (`0002_catalog.sql:47` trigger + `categories_no_self_parent` CHECK) — the admin category UI must respect and surface these, not reimplement them.

## Dependency Analysis

### Existing Dependencies to Leverage

- `@supabase/supabase-js` `^2.110.2` — the admin client (`createAdminClient`) exposes `.from()`, `.rpc()`, AND `.storage.from(bucket).upload/remove/getPublicUrl` for image handling. No separate storage SDK needed.
- `next/cache` `updateTag` — Next 16 cache-bust (already used in `store-settings.ts:197`); the ONLY correct bust primitive here.
- `@hugeicons/react` + `@hugeicons/core-free-icons` — all icons (drag handle, upload, trash, etc.). Never mix icon sets.
- `shadcn` `^4.13.0` (devDep, CLI) — vendor `table`, `textarea`, `dialog`, `tabs` as source (not runtime deps).
- `react` 19.2 `useActionState` / `useOptimistic` — form state + optimistic image reorder.
- `src/lib/money.ts`, `src/lib/catalog/pagination.ts`, `src/lib/admin/settings-input.ts` (money parser), `src/lib/utils.ts` (`cn`) — internal, reuse directly.

### New Dependencies Needed

- **None.** CSV parse/generate is hand-rolled (RFC-4180 is ~80 lines pure). Drag ordering uses native HTML5 drag / pointer events + keyboard fallback. This satisfies the ticket's zero-new-dep constraint and CLAUDE.md's "grep for an existing one" rule. If UI-design finds native drag genuinely unworkable for the accessibility bar, `@dnd-kit/core` is the recommended fallback (tree-shakeable, a11y-first) — but it must be justified, pinned, and is not the default.

### Internal Dependencies

- `image-write.ts` depends on the `product-images` bucket existing (0011/config) — implication: Slice 3 is blocked by Slice 0.
- `inventory-write.ts` depends on `record_inventory_adjustment` RPC (0011) → `database.types.ts` regenerated — implication: run `db:types` after 0011 before typing the RPC call.
- The admin list read depends on the base `products` table via the admin client — it deliberately does NOT depend on `products_public` (which hides draft/archived and cost_price).
- `cache-tags.ts` depends on the exported tag constants in `queries.ts`/`product-detail.ts` — import them, never re-declare the strings (single source of truth).

## External Research

### API Documentation

- **Supabase Storage (local, self-hosted CLI):** the bucket is created via SQL (`insert into storage.buckets (id, name, public) values ('product-images','product-images', true)`) inside migration `0011`, or via `storage.from().createBucket` at seed time. Public buckets serve objects at `https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<path>` — the exact pattern already allow-listed in `next.config.ts`. RLS on `storage.objects` governs writes; the service_role (admin client) bypasses it, so no storage policy is strictly required for Phase 1 writes (owner-only). Gotcha: `upload` rejects duplicate paths unless `upsert:true`; use a content-hash or product-id/uuid path to avoid collisions.
- **Storage re-enable cost/risk (the key decision):** `config.toml:37-41` documents WHY storage was disabled — its container ran ~30s of `vector_store` migrations before binding port 5000, exceeding the CLI health-check window under Docker load and aborting `supabase start`/`db reset` (observed 2026-07-14). `[analytics]` (Logflare/vector) is ALSO disabled and is the heavy/flaky coupling. **Recommendation: re-enable `[storage]` only** (leave `[analytics]` and `[edge_runtime]` off). Modern `supabase` CLI storage no longer hard-couples to the analytics/vector stack for a plain buckets+objects workload, so with analytics off the storage container should bind within the window. **This must be VERIFIED with a clean `supabase stop && supabase start && supabase db reset` before ship (AC-2, edge 10).** If it regresses, the fallback is a local **filesystem/`public/`-dir upload** dev shim behind the same `image-write.ts` interface (swappable for real Storage in staging) — but Supabase Storage is preferred because the storefront and `next.config` already assume that URL shape, keeping dev and prod identical.

### Library Documentation

- **RFC-4180 CSV** — the rules to implement: fields separated by `,`, records by CRLF (accept LF too); a field containing `,`/`"`/newline must be double-quoted; a literal `"` inside a quoted field is escaped by doubling (`""`); strip a leading UTF-8 BOM. Parser is a small state machine (in-quote / out-quote); generator quotes only when needed. Both are pure and exhaustively unit-testable (matches the codebase's `webhook.ts`/`address.ts` pure-boundary discipline).
- **`next/image` with uploaded URLs** — no code change; the dynamic Supabase host pattern (`next.config.ts:29-37`) covers `/storage/v1/object/public/**`. Confirm `NEXT_PUBLIC_SUPABASE_URL` is set in the env the build reads (it is, per T1).

## Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| Re-enabling `[storage]` breaks local `supabase start`/`db reset` (the documented regression) | Medium | High (blocks all local dev + e2e) | Enable storage ONLY (analytics stays off); verify with clean stop/start/reset before ship; documented filesystem fallback behind `image-write.ts` |
| Ticket is huge (9 features) → files blow the 400-line cap / functions the 30-line cap | High | Medium (eslint `max-lines` error, review churn) | Up-front module decomposition (see Files to Create); one parser + one write module per entity; extract shared form primitives from `store-settings-form.tsx` |
| Image storage/DB divergence (orphan file or dangling row) | Medium | Medium | Reconcile in `image-write.ts`: DB row is source of truth; best-effort orphan cleanup on either-side failure; log mismatch (edge 4) |
| CSV import writes garbage or partially applies | Medium | High (corrupts real catalog) | Mandatory dry-run preview (zero writes until confirm); strict per-row parser reusing `parseMoneyToCents`; taxonomy-by-slug (unknown → row error, never auto-create); resilient batch; single cache bust at end |
| Variant-vs-product stock authority handled inconsistently across list/adjust/CSV | Medium | Medium | Encode the schema rule (variant stock authoritative when variants exist) in ONE shared helper; use it everywhere; make the UI state which field it edits (edge 7) |
| Admin list read accidentally uses `products_public` (hides draft/archived) or gets cached | Low | High (owner can't see/fix drafts; stale after edits) | Explicit AC-4: base table + admin client + no `unstable_cache`; a test asserts a draft product appears in the admin list |
| A CSV export / upload route handler under `/api` bypasses the session guard (middleware excludes `/api`) | Medium | Critical (unauth catalog dump/write) | Keep writes in server actions; any route handler lives under `/admin/(app)/` or self-calls `requireSession()` at entry (AC-34, carries the T10 documented `/api/admin/*` rule) |
| `record_inventory_adjustment` RPC not atomic → ledger diverges from stock | Low | Medium | Single `plpgsql` fn doing both writes in one statement/transaction; CHECK `resulting_stock >= 0`; characterization test |

### Performance Considerations

- **Admin list N+1 for cover thumbnails:** fetch the cover image per product in the same query via an embedded `product_images` filter (`is_primary=true`) or a batched `IN (product_ids)` stitch (the `queries-internal.ts` pattern) — never one query per row.
- **CSV row cap:** bound imports with `CSV_MAX_ROWS` (e.g. 5,000) so a 50k-row file can't exhaust memory / block the action; parse streaming-ish or reject early. Export is bounded by the catalog size (Phase 1 ~30–hundreds) — fine.
- **No cache on admin reads is intentional** — the admin is a single low-traffic user; live correctness > cache hit rate. Add DB indexes (0011) for the filter/order columns so uncached filtered reads stay fast.

### Security Considerations

- **Privileged write surface + file upload = the main new attack surface.** Every action must `requireSession()` at entry (defense-in-depth beyond the middleware/layout guard). Server-side re-validate image MIME + size (never trust the client `accept`/size). Store uploads under a non-guessable path (product id + uuid) in a public-read bucket; do not expose the secret key (all in `server-only`/`"use server"`; keep the `secret-exposure` guard green — AC-34).
- **CSV as an input boundary:** treat every cell as hostile — bound lengths (0006 CHECKs are the backstop), reject formula-injection-prone leading `=`/`+`/`-`/`@` in exported cells if the file may be opened in a spreadsheet (prefix-escape on export), and never build SQL by string concat (PostgREST/RPC parameterizes).
- **T12 session gate (carry-forward, NOT required for T11):** stateless sessions have no server-side revocation (SEC-M-1); acceptable for T11 product edits, but the session-version check must land before T12's refund-capable sessions. T11 must not regress this posture.
- **RLS discipline:** the new `inventory_adjustments` table gets RLS enabled with NO anon grant (service_role only) — matches the orders/customers trust model in 0005.

## Implementation Recommendations

### Suggested Order of Implementation

1. **Slice 0 — Foundation** (migration 0011 + storage re-enable + `db:types` + nav flip + admin list read convention). First because every other slice depends on the bucket, the RPC, the regenerated types, and the read layer. Verify `db reset` is green with storage on before proceeding.
2. **Slice 1 — Product list + filters.** Establishes the entity landing page; low-risk; exercises the new read convention end-to-end.
3. **Slice 2 — Add/edit product form.** The core write path; establishes the shared form primitives (extract from `store-settings-form.tsx`) every later slice reuses.
4. **Slice 3 — Images.** Depends on Slice 0 bucket + Slice 2 edit page; highest UI-craft (drag order).
5. **Slice 4 — Variants.** Depends on Slice 2/3 (variant images); reuses the same parser/write discipline.
6. **Slice 5 — Taxonomy.** Independent of the product form; can parallelize with 3/4 if desired; handles the cycle/restrict edge cases.
7. **Slice 6 — Inventory + duplicate + Q&A.** Small, mostly independent writes reusing established patterns.
8. **Slice 7 — CSV import/export.** LAST — highest risk, depends on the product/taxonomy write layer and the diff being expressible; ships behind the mandatory dry-run.

### Key Decisions

- **Image storage: re-enable Supabase Storage (analytics stays off), verify boot, filesystem fallback documented.** Recommended over a bespoke filesystem store because the storefront + `next.config` already assume the Supabase public-URL shape — keeping dev/prod identical and avoiding a later migration.
- **Admin reads are uncached, base-table, admin-client.** The storefront cached-view pattern is the WRONG tool here (T10 arch requirement). Reuse only the pure `pagination.ts` math.
- **Cache busting via one shared helper** importing the exported tag constants — bust `catalog` broadly (covers all listings/facets/search) plus the specific `product:`/`brand:`/`style:`/`category:` slug tags touched. Never string-literal a tag.
- **CSV: hand-rolled, dry-run-gated, SKU/slug-keyed, resilient.** Zero deps; no writes until confirm; unknown taxonomy is a row error, not silent creation.
- **Extract shared form primitives** (`MoneyField`, `Banner`, `FieldError`, `TextField`) from `store-settings-form.tsx` into `src/components/admin/form/` before building 6 more forms (DRY; avoids copy-paste of a sibling per CLAUDE.md).

### Anti-Patterns to Avoid

- Don't read the admin list through `products_public` or `cachedRead` — you'll hide drafts/archived and serve stale data after edits. Use the base table + admin client + live read.
- Don't reimplement the category cycle guard in TS as the only defense — the DB trigger is authoritative; the UI prevention is UX, the caught trigger error is the safety net.
- Don't hardcode cache-tag strings in T11 — import `CATALOG_CACHE_TAG`/`productCacheTag` etc. so a tag rename can't silently break invalidation.
- Don't trust client-side image type/size — re-validate server-side; a crafted request can post any bytes.
- Don't let one bad CSV row abort the batch, and don't write anything before the owner confirms the dry-run.
- Don't add a customer-email column to `product_questions` to notify askers — out of scope; the schema has no such column by design.
- Don't copy image files on product duplicate (Phase 1 shares URLs) — a true file-copy is deferred; document it.
- Don't put a write behind an `/api/admin/*` route handler without a self-`requireSession()` — the middleware matcher excludes `/api`.
- Don't add a file over ~400 lines — decompose the product form and write layer up front.
