# Architecture Review: T10 — Admin foundation

## Summary

A disciplined, layered admin subsystem that reuses the codebase's proven primitives (env boundary, HMAC/`timingSafeEqual` discipline, shared sliding-window limiter, tag-cached read/bust) rather than inventing parallel ones. The auth architecture (Node-authoritative + Edge fast-path + shared pure codec) is the right long-term shape, dependency direction is clean in both directions, and the T11/T12 extension seams are genuine flag-flips. The debts taken are deliberate, documented, and correctly scoped to phases where they do not yet bite — with **two** that must be pinned before T12 (not T11): the `/api`-excluded middleware matcher and the by-design-absent server-side revocation for a refund-capable session.

## Pattern Compliance

| Pattern | Status | Notes |
|---------|--------|-------|
| Separation of concerns (lib computes / components render / actions orchestrate) | ✅ | `session-payload.ts` (pure codec) → `session.ts`/`session-edge.ts` (crypto) → `session-guard.ts` (Next integration) → `actions.ts` (orchestration). `settings-input.ts` is pure and I/O-free. Components render only. Textbook. |
| Boundary validation | ✅ | `parseStoreSettingsInput` validates every field at the action boundary; money parser is strict (`^\d+(\.\d{1,2})?$`, overflow-guarded). `requireSession()` re-verifies before any DB touch (edge 9). No Zod in repo — hand-rolled parsers are the established convention (mirrors `checkout/address.ts`). |
| Typed contracts | ✅ | State types split into `admin-form-state.ts` (the `"use server"` export rule), fully typed; `AdminEnv`/`StoreSettingsWrite`/`AdminSessionPayload` all explicit. No `any`, no non-null `!` found. |
| Service layer (views → services → models) | ✅ | Write path co-located in `store-settings.ts` (`updateStoreSettings`) alongside the read path, through the RLS-bypass admin client — same seam the storefront read already advertised. No business logic in components or pages. |
| Type safety | ✅ | `settings-input.ts` success branch uses guard-narrowing to avoid `as` casts (m-6 fix). `tsc --noEmit` clean per dev-done. |
| shadcn / design-system reuse | ✅ | `Button`/`Input`/`Label`/`Badge` reused; mobile drawer **reuses** the storefront `.drawer-panel`/`.drawer-scrim` CSS rather than inventing new motion — spatial consistency, no new animation debt. |
| Env / secret boundary | ✅ | `getAdminEnv()` added following `getMercadoPagoEnv`/`getEmailEnv` verbatim; all three admin secrets server-only, never `NEXT_PUBLIC_`, single-sourced. |
| DRY (shared cores, not copies) | ✅ | Login limiter, checkout limiter, and MP-preference limiter **all** import the one `createSlidingWindowLimiter` core (verified: 3 importers + the module itself). `clientIp` is the canonical shared helper. Zero copy-paste. |

### Dependency-direction analysis (verified by grep + subagent)

- **admin → storefront**: none. The only grep hits in `src/lib/admin` / `src/app/admin` / `src/components/admin` for storefront symbols are **comments documenting the deliberate absence** of `CartProvider`/`SiteHeader`/next-intl. No real import crosses into storefront UI/domain.
- **storefront → admin**: none. No `src/app/[locale]/*`, `components/site`, `components/cart`, or `components/product` file imports anything under `lib/admin` / `components/admin` / `app/admin`. (`checkout/actions.ts` imports `@/lib/supabase/admin` — the Supabase RLS-bypass SDK client, NOT the admin subsystem — correctly scoped.)
- **`server-only` placement is correct**: guarded — `auth.ts` (line 23), `session.ts`, `session-guard.ts`, `login-rate-limit.ts`. Deliberately unguarded (and correct) — `constants.ts` (Edge+client safe), `session-payload.ts` (runtime-agnostic), `session-edge.ts` (`server-only` throws in the Edge bundle), `settings-input.ts` (pure). Verified directly: `auth.ts` DOES carry `import "server-only"` (a parallel subagent flagged it as missing — that was a read error; the guard is present). This split is intentional and internally consistent.
- **Internal admin import graph is acyclic**: `constants.ts` is a leaf (imports only icons/types); `session-payload.ts` → `constants.ts`; `session.ts`/`session-edge.ts` → `session-payload.ts` + `constants.ts` + (Node only) `env.ts`; `session-guard.ts` → `session.ts` + `constants.ts`. No back-edges. No circular risk.

## Data Model Review

- **No schema change (AC-14 correct).** `store_settings` singleton, CHECKs, unique index, and `updated_at` trigger already exist (migrations 0003/0006). T10 writes are pure UPDATE/INSERT. This is the right call — adding a migration for a pre-existing row would be noise.
- **Write path is sound.** `updateStoreSettings` reads the singleton `id`, UPDATEs by id, and falls back to INSERT (seeding `currency` from config) on the missing-row edge. Explicit column select (not `*`) documents the dependency and avoids over-fetch.
- **RLS bypass via admin client is the correct architecture** — not an RLS `update` grant. Granting `update` to `authenticated` would silently widen the storefront role for every guest (the storefront `authenticated`/`anon` roles share the same policies). The RLS-bypass admin client + defense-in-depth session gate is strictly safer and matches every other privileged write in the app. **Keep.**
- **Cache-tag semantics.** Read (`getStoreSettingsStatic`, `unstable_cache` tagged `STORE_SETTINGS_CACHE_TAG`) and bust (`updateTag(STORE_SETTINGS_CACHE_TAG)`) share the single imported constant — no tag fork. `updateTag` (Next 16 single-arg) over deprecated `revalidateTag(tag)` is the right modernization. Concurrent-read consistency: last-write-wins on the singleton (single owner, edge 5) is acceptable; a storefront read racing a bust re-reads on next render — eventually consistent, no stale-forever window.

## API Review

No REST endpoints — all server-side work via server actions (`login`/`logout`/`saveStoreSettings`), matching the checkout/Q&A convention. Consistent with the codebase; nothing to standardize here.

- **Error contract** is consistent: actions return a serializable discriminated union (`status: "idle"|"error"|"rate-limited"|"unavailable"` / `"invalid"|"success"|"error"`); raw PG errors mapped to a friendly enum, never echoed. Matches `checkout-form-state.ts`.
- **`submissionId` monotonic counter** drives keyed banner replay — same pattern as checkout/Q&A. Good.
- **T12 note (see recommendations):** T12 refunds/uploads may reach for route handlers (`/api/admin/*`) rather than actions. The middleware matcher **excludes `/api`** (`/((?!api|_next|_vercel|.*\\..*).*)`), so any such handler is **not** middleware-guarded and must call the session check itself. Server actions do not have this gap (they carry `requireSession()`).

## Scalability Assessment

| Concern | Severity | Recommendation |
|---------|----------|----------------|
| In-memory rate limiter is per-instance on serverless | Low | Documented residual in `sliding-window.ts`. Fine for a single-owner surface; DB atomicity + MP idempotency are the hard backstops. Revisit only if admin scales horizontally under load (it won't in Phase 1/2). |
| Middleware cost added to every request | Low (storefront), N/A | Storefront path is **truly zero-cost**: `isAdminPath()` is checked first and returns before any admin logic; non-admin requests fall straight through to `intlMiddleware`. Only `/admin/*` pays one Web-Crypto HMAC verify. Correct branch placement. |
| Edge HMAC key import per request | Low | Mitigated: `session-edge.ts` caches the imported `CryptoKey` keyed by secret. |
| `DUMMY_HASH` scrypt at module load | Low | One-time ~tens-of-ms server cold-start cost, never on the request path (N-3, documented). Acceptable. |
| Settings page `force-dynamic` | Low | Correct — session-gated, must not cache per-user. No unbounded fetch anywhere (singleton reads only). |
| T11 product list (future) | Watch | Product/order lists MUST paginate + index filtered columns (brand/category/status/stock per spec line 70). Not a T10 issue, but the admin read pattern T10 establishes (single-row `maybeSingle`) does not yet demonstrate pagination — T11 will need its own list-read convention. Flag for T11 planning. |

## ADR-Style Decision Records

### ADR-1: Self-managed HMAC-signed cookie over Supabase Auth — **KEEP**
Correct for Phase 1/2. A dedicated signed cookie keeps the admin identity entirely off the Postgres `anon`/`authenticated` roles the storefront RLS depends on; adopting Supabase Auth would create a second `authenticated` identity that could silently widen storefront grants. Node-authoritative + Edge fast-path + shared pure codec (`session-payload.ts`) is the right decomposition and the single most reused-forward asset. **Extends cleanly to T11/T12** (every future page/mutation calls `hasValidAdminSession()`/`requireSession()` verbatim).

### ADR-2: No server-side session revocation — **ACCEPTED DEBT, revisit BEFORE T12**
By design, the only invalidation lever is rotating `ADMIN_SESSION_SECRET` (logs everyone out) or waiting out the 8h max-age. For T11 (product edits) this is acceptable. For **T12 this gates refunds** — a stolen/leaked cookie can issue refunds for up to 8 hours with no per-session kill switch. This is a real, if low-likelihood (single owner, HttpOnly, `Path=/admin`, `Secure`), tradeoff. **Recommendation:** before T12 ships, either (a) shorten max-age for the refund surface, or (b) add a minimal server-side session-version/`nonce` check (a single row/env counter that `isSessionValid` compares) so the owner can revoke without a redeploy. The payload `v` field already leaves room. Not a T10 blocker; explicitly a T12 gate. Roles/multi-user remain Phase 2.

### ADR-3: `(app)` route-group deviation — **KEEP**
Ticket specified `admin/page.tsx` + `admin/settings/page.tsx`; implemented under `admin/(app)/` so the authoritative guard lives in `(app)/layout.tsx` and wraps only authenticated pages, leaving `/admin/login` under the clean root layout. `(app)` does not affect URLs. This is a *better* structure than the ticket's flat one — the guard boundary is expressed by the file tree, and T11/T12 pages inherit it by living in `(app)/`. Sound.

### ADR-4: Two root layouts (`admin/layout.tsx` parallel to `[locale]/layout.tsx`) — **KEEP**
Sanctioned Next.js pattern for disjoint segments. Admin owns its own `<html lang="es-MX">`, no next-intl/cart/site chrome, `robots: noindex`. Correctly isolates admin as a separate product surface.

### ADR-5: Node/Edge verifier duplication with intentional asymmetry — **KEEP, with a standing test fence**
Two verifiers (Node `node:crypto` authoritative, Edge `crypto.subtle` fast-gate) share the pure codec. Intentional asymmetry: Node **throws** on blank secret (loud misconfig, mapped to unauthenticated by callers), Edge returns **false** (fail-closed UX gate). Both fail-closed. The M-1 `session-parity.test.ts` cross-runtime fence from a single fixture is exactly the right guard against drift. **This must stay green forever** — it is the only thing preventing the two verifiers from silently diverging.

## Tech Debt Ledger

| Item | Type | Impact | When it bites | Effort to Fix |
|------|------|--------|---------------|---------------|
| No server-side revocation (rotate-secret only) | Introduced (by design) | Med | **T12** (refund-capable session) | M |
| Middleware matcher excludes `/api` — future `/api/admin/*` handlers unguarded by middleware | Latent | Med | **T12** if refunds/uploads use route handlers | S (guard-in-handler) |
| In-memory per-instance rate limiter | Existing (shared core) | Low | Phase 2 horizontal scale | M (shared store) |
| Single-Owner assumption baked into `getAdminEnv()` (one email/hash) + `verifyCredentials` | Introduced (by design) | Low | Phase 2 (roles/multi-user) | M |
| `SameSite=Lax` + no CSRF token (relies on re-verify + Lax) | Accepted | Low | Phase 2 polish | S |
| `DUMMY_HASH` module-load scrypt cost | Introduced | Negligible | never (cold start only) | — |
| Shared sliding-window limiter extraction | **Reduced** | — | — | — (debt paid: 3 limiters now share one audited core) |
| Canonical `clientIp` reuse | **Reduced** | — | — | — |

Net: T10 **reduces** more structural debt than it introduces (limiter + client-ip consolidation), and every introduced debt is documented at its site with a phase.

## System Boundaries

- **Clean separation** between the `/admin` tree and the `[locale]` storefront tree (verified both directions).
- **No circular dependencies** in the admin lib graph (acyclic DAG confirmed).
- **Clean frontend/backend interface**: client forms receive only booleans/strings (`storeName`, `initialValues`, `rowMissing`) — no secret ever crosses to `"use client"`. `secret-exposure.test.ts` pins this.
- **Error propagation**: env failures throw `MissingEnvVarError`, caught at every boundary (`login`, `requireSession`, `hasValidAdminSession`) and mapped to unauthenticated/"unavailable" — never a stack trace, never "any password works" (edge 4/R5).

## T11/T12 Readiness Verdict — **READY**

The seams are real, not aspirational:
- **Nav**: flip `ADMIN_NAV_ITEMS[products|orders].status` to `"live"` + set `href` in `constants.ts` — verified data-driven, zero JSX change; `AdminShell` resolves the active section from `usePathname()`.
- **New sections**: `src/app/admin/(app)/products/page.tsx` + `/orders` inherit the guard + shell automatically by living in `(app)/`.
- **Write template**: `updateStoreSettings` (admin client + `updateTag`) is a clean template for T11/T12 writes.
- **Session reuse**: `hasValidAdminSession()` (pages) + `requireSession()` (mutations) are reused verbatim; T12 refunds re-verify then call the existing `refundOrderPayment` (`payments/refund.ts:68`).
- **File sizes**: largest admin file is 344 lines (`store-settings-form.tsx`), well under the 400 target — headroom for T11/T12 to add without splitting.

The guard/layout/nav pattern will hold at 10+ routes. No coupling forces rework. Two items to land **before T12** (not T11): ADR-2 revocation story and the `/api`-matcher guard convention.

## Refactors Applied

None. This stage runs review-only, in parallel with Security (Stage 9). No code changed, no commits, `pipeline-state.md` and `security-audit.md` untouched.

## Prioritized Recommendations

**Before T11 starts:**
1. **None are blocking.** The foundation is T11-ready as-is. (Optional) Add a one-line comment in `middleware.ts` `config` noting the `/api` exclusion so T12 authors don't assume middleware guards API routes.

**Before T12 starts (auth becomes refund-gating):**
2. **Resolve ADR-2**: add a lightweight server-side revocation (session-version counter compared in `isSessionValid`) OR shorten max-age for refund actions. A refund-capable session with an 8h un-revocable window is the one debt worth paying down before money can move.
3. **Establish the guarded-route-handler convention**: if T12 uses `/api/admin/*` route handlers (uploads/refund callbacks), each MUST call `hasValidAdminSession()`/`requireSession()` at entry — middleware will not cover them. Document this as the admin API-route rule now.
4. **Add a pagination + indexed-filter convention** for the T11 product list / T12 order list reads; the singleton read pattern T10 established does not generalize to lists.

**Deferred (Phase 2, no action now):**
5. Multi-user/roles (widens `getAdminEnv` → a user table + role claim in the session payload — the `v` version field already leaves room for a payload bump).
6. Distributed rate-limit store; CSRF token.

## Architecture Score: 9/10

Will this make sense in 6 months with 2x the team? Yes. The layering is legible (pure → crypto → integration → orchestration), the naming reveals intent, the debts are documented at their sites with phases, and the reuse (shared limiter, shared codec, shared client-ip, shared cache tag) means a new engineer learns one pattern and applies it everywhere. The one point off is ADR-2: shipping a refund-capable auth (T12) on a session with no revocation lever other than a global secret rotation is the single decision that will generate a "why can't I kill one session?" ticket — it is correctly deferred out of T10, but must be answered before T12, not after.

## Recommendation: **APPROVE**

---
---

# Architecture Review: T11 — Admin Product Management

## Summary

T11 is a large (~35 new files, ~11k lines lib+components) but disciplined extension of the T10 admin subsystem. It executed the four T10 architectural recommendations for the list surface faithfully: the pagination + indexed-filter convention landed as a clean, reusable template (`list-query.ts` + the shared `pagination.ts` math + supporting indexes in 0011), the T12 API gate held (no `/api/admin/*` handlers exist; the one route handler self-guards), the write template generalized cleanly into paired `*-input.ts`/`*-write.ts` modules across all five domains, and cache invalidation is funnelled through a single airtight helper. The one genuinely load-bearing architectural decision that diverges from the codebase's own precedent is **best-effort application-level compensation for multi-table product/CSV writes** (`product-write.ts`, `csv-import-write.ts`, `product-duplicate.ts`) where the established pattern for stock/order writes (0008/0009/0010) is a **transactional SQL RPC**. T11 got the inventory path right (a real RPC), so the compensation choice is deliberate, not accidental — but it is the debt to watch, and the ADR below states when it bites. Concurrency between the two stock-mutation paths (checkout reservation vs admin adjustment) is safe: both take a row-level write lock on the same row and serialize.

## Pattern Compliance

| Pattern | Status | Notes |
|---------|--------|-------|
| Separation of concerns (lib computes / components render / actions orchestrate) | ✅ | Pure `*-input.ts` parsers (unit-tested), I/O `*-write.ts` modules, thin actions, render-only components. `fields.tsx` primitives carry zero business logic. |
| Boundary validation | ✅ | Every field parsed at the action boundary through pure collect-all parsers (strict money/dimension/hex/slug parsers mirror `checkout/address.ts`); server re-validates image MIME by **sniffing magic bytes** (m-1), CSV bounded by row + byte caps; RPC re-checks reason length + negative-result. Hand-rolled parsers are the repo convention (no Zod). |
| Typed contracts | ✅ | Discriminated-union write results everywhere (`ProductWriteResult`, `TaxonomyWriteResult`, `AdjustmentWriteResult`, `ImageUploadResult`); serializable form-state kept OUT of `"use server"` files (`products-form-state.ts`). |
| Service layer (base-table reads via admin client, RLS-bypass writes) | ✅ | Admin list reads the BASE `products` table (any status) via `createAdminClient()`, NOT `products_public`; all writes go through the RLS-bypass client — same seam T10 established. |
| Type safety (no `any`, no non-null `!`) | ✅ | AC-33 held (M-9 removed three `!` on `.find()`). The only casts are the intentional, documented `as unknown as` bridges around PostgREST's deep filter generics in `list-query.ts` (`FilterableQuery` structural type) — a pragmatic, localized escape hatch, not a boundary `any`. |
| shadcn / design-system reuse | ✅ | `table`/`textarea`/`dialog`/`tabs`/`alert-dialog`/`progress` vendored via CLI (dev-time, zero runtime deps); drag/tree/stepper/CSV hand-rolled per the zero-dep constraint. |
| DRY (shared cores, not copies) | ⚠️ | Strong for cache tags / slug / units / form primitives (all single-sourced). **One real seam:** the CSV importer (`csv-import-write.ts`) re-implements the create/update + link-sync + compensation logic that `product-write.ts` already owns, rather than calling it. Layered cleanly (both depend only on shared leaves) but the compensation logic now lives in two places — see Recommendations. |
| Cache-invalidation discipline | ✅ | `bustCatalogTags` is the **only** caller of `updateTag` across all of `src/lib/admin` and `src/app/admin` (verified by grep — zero direct `updateTag`/`revalidateTag` calls elsewhere). Tag strings imported from the storefront read layer, never literals. Airtight. |

### Dependency-direction analysis (verified by grep)

- **Internal admin-domain graph is layered and acyclic.** The two most-imported modules are the intended shared leaves: `products/cache-tags.ts` (8 importers) and `products/slug.ts` (6). No domain imports another domain's **write** module.
  - `csv/**` → imports only `products/cache-tags` + `products/slug` (leaves), and has its OWN write path — it does NOT import `product-write.ts`. Layered, but duplicative (see DRY row).
  - `products/**` → does NOT import `taxonomy/**`. Clean.
  - `taxonomy-write.ts` → imports `products/cache-tags` (leaf) only.
- **One layering inversion (type-only, low-severity):** `products/product-input.ts` and `products/product-read.ts` (lib layer) import the `ProductFormValues` **type** from `@/app/admin/(app)/products/products-form-state` (app layer) — a lib→app upward edge. It is `import type` (erased at compile) and the target is a pure contract file (not the `"use server"` action file), so no runtime app code is dragged into lib. Directionally the contract belongs under `lib/admin/products/`. Nit-level; note for T12 so the order-form contract is placed in lib from the start.
- **No lib→app runtime import** anywhere. **No storefront↔admin cross-import** regressions (T10 boundary intact).

## Data Model Review

- **Migration 0011 is correct and idempotent.** `inventory_adjustments` is a proper append-only ledger: `on delete cascade` FKs to both `products` and `product_variants`, a `resulting_stock >= 0` CHECK, a bounded `reason` CHECK matching the app constant exactly, two composite indexes (`(product_id, created_at desc)`, `(variant_id, created_at desc)`) that serve the history view directly, RLS deny-all + `grant … to service_role` (identical posture to orders/payments). No anon/authenticated grant — right call for a privileged audit trail.
- **Indexes for the admin list are correct and minimal:** `products (updated_at desc)` (the default sort) and `products (lower(name))` (the ilike search); status/brand/style indexes already existed (0002). The category filter resolves via the M2M table (indexed FK) into an `in (…)` id set — acceptable at Phase-1 catalog size, and it correctly short-circuits to an empty result when a category has no products.
- **The RPC `record_inventory_adjustment` is the right shape** — `SECURITY DEFINER`, pinned empty `search_path`, schema-qualified, `FOR UPDATE` row lock, delta-or-absolute mode, negative-result rejected before the write (CHECK as backstop), execute revoked from public + granted to service_role only. Matches the 0008/0009 RPC posture verbatim. This is the model the product/CSV writes should aspire to (ADR-1).
- **No column changes** to `products`/`product_variants`/`product_images` — the full model pre-existed; T11 writes are pure DML. Correct (no migration noise).
- **Storage bucket created in-migration** via a `to_regclass`-guarded `storage.buckets` insert with `on conflict … do update set public = true` — idempotent, degrades cleanly if storage is ever disabled again. Sound.
- **Group-scoping (multi-tenant FK) N/A** — PosturPro is single-store; there is no client/group dimension. (Noted so T12 doesn't invent one.)

## API Review

- **Server actions are the primary surface** (products/csv/image/inventory/variant/taxonomy/qa actions), consistent with T10 and the checkout convention. Each re-verifies `requireSession()` before any DB touch (edge 8). Serializable discriminated-union results, PG errors mapped to friendly enums, never echoed.
- **The single route handler** (`products/export/route.ts`) **self-guards** with `hasValidAdminSession()` at entry (401 on unauth) AND lives under `/admin/(app)/` — belt-and-suspenders satisfying AC-34 and the T10 recommendation #3. `Cache-Control: no-store`, correct `Content-Type`/`Content-Disposition`. Verified: **no `/api/admin/*` handlers exist** (the only `/api` route is the MP webhook, which authenticates by signature). **The T12 gate on unguarded admin API routes is respected.**
- **Export is bounded** (`CSV_EXPORT_MAX_ROWS`, m-6) — no unbounded full-table dump; documented as a stream/paginate follow-up when the catalog approaches the cap.

## Scalability Assessment

| Concern | Severity | Recommendation |
|---------|----------|----------------|
| Admin list is uncached + does 4 sequential-ish queries per page (category-ids → count → range → stitch covers+variant-stock) | Low | Correct by design (admin data must be live). Batch-stitch avoids N+1; the two stitch queries + count are indexed. Fine to thousands of products. Revisit only if the catalog reaches tens of thousands. |
| CSV export reads whole table into memory | Low | Bounded at `CSV_EXPORT_MAX_ROWS` (10k). Above Phase-1 catalog; documented streaming follow-up. |
| `reorderImages` issues one UPDATE per image in a loop | Low | Bounded by images-per-product (small). A single-Owner path; not worth an RPC. |
| `product-duplicate`/`csv-import` read ALL slugs + ALL SKUs into a Set for de-dup | Low→Watch | O(catalog) memory per operation. Fine at Phase-1 scale; if the catalog grows large this becomes a per-duplicate full-table scan. Acceptable now; note for Phase 2 bulk ops. |
| Compensation-window under concurrent admins | Low (single Owner) | See ADR-1. Two admins editing the same product's links simultaneously could interleave a delete/insert; single-Owner assumption makes this near-impossible in Phase 1, real in Phase 2 (roles). |
| Storage objects orphaned on best-effort delete failure | Low | DB row is source of truth; orphan logged, never blocks. A periodic reconciliation sweep is a Phase-2 nicety, not a debt that bites. |

**No unbounded fetch on any hot path.** The storefront read paths are untouched (T11 only busts their tags).

## ADR-Style Decision Records

### ADR-1 (T11): Best-effort application-level compensation vs a transactional SQL RPC for multi-table catalog writes — **KEEP for T11, MIGRATE to an RPC before Phase-2 multi-admin (not required for T12)**

**The decision.** `product-write.ts` (create/update), `csv-import-write.ts` (`upsertProduct`), and `product-duplicate.ts` each perform a base-row write + M2M link sync (+ children) as **separate PostgREST calls**, then hand-roll compensation on partial failure: create/duplicate **delete** the just-inserted row on child-failure; update **snapshots prior links and restores** them on link-sync failure (M-1/M-3 fixes). This is genuine, tested compensation (each has a regression test that fails without it) — not a fire-and-forget.

**Why it's a real architectural question.** The codebase's OWN precedent for multi-table writes that must not diverge is a **transactional SQL function**: `create_order` (0008) reserves stock across N line items + inserts the order + customer + discount redemption in ONE transaction with `FOR UPDATE` locks and guarded decrements; `advance_order_status`/`record_payment_event`/`record_refund` (0009/0010) all follow suit; and T11's OWN `record_inventory_adjustment` (0011) is a textbook example. So T11 had the pattern in front of it and chose it for inventory but NOT for products/CSV.

**Trade-off.** Compensation is more legible to a TypeScript developer (the logic is co-located, unit-testable with a poisoned map, no plpgsql), and the failure it guards (a network blip between the base write and the link sync) is genuinely rare. But it is **not atomic**: a process crash, a serverless timeout, or a second concurrent writer between the two calls can leave a half-state the compensation never runs for. An RPC (`create_product_with_links(payload jsonb)` returning the id, mirroring `create_order`) would make create/update/duplicate/import truly atomic and delete ~120 lines of duplicated snapshot/restore/rollback code across three modules (paying the DRY debt in the compliance table at the same time).

**When it bites.**
- **Not T12.** T12 is orders, not catalog writes; it will build its OWN stock-restore RPC (see readiness) and does not touch this code. The compensation debt does not block T12.
- **Phase 2 (multi-admin / roles).** The single-Owner assumption is what makes "no concurrent writer" true today. The moment two staff users can edit the same product, the compensation window (base write committed, link sync interleaved by another writer's delete/insert) becomes a real inconsistency source. **That is the trigger to migrate to an RPC.**

**Recommendation.** KEEP the compensation for T11 ship (it is correct, tested, and the risk is near-zero at single-Owner scale). Before Phase-2 multi-admin, extract a `create_product_with_links` / `upsert_product_with_links` RPC and route product-write + csv-import + duplicate through it — this simultaneously closes the atomicity gap AND the one DRY seam. Effort: M. Do NOT block T12 on it.

### ADR-2 (T11): CSV importer owns a parallel write path instead of reusing `product-write.ts` — **ACCEPTED, fold into ADR-1's RPC migration**

The importer's `upsertProduct` duplicates `product-write.ts`'s create/update+link-sync+compensation. Justifiable in isolation (CSV writes by SKU-match with taxonomy-by-slug resolution and a resilient per-row batch, a different orchestration than the form's by-id write), but the *inner* multi-table write is the same operation written twice. The clean resolution is the ADR-1 RPC: both callers become thin adapters over one atomic `upsert_product_with_links`. Until then, a shared-behavior test fence (both paths must roll back identically) prevents drift.

### ADR-3 (T11): Absolute-set inventory adjustment is last-writer-wins against a concurrent checkout — **KEEP (documented, correct for single Owner)**

`record_inventory_adjustment` and `create_order` both take a row-level write lock on the same `products`/`product_variants` row (adjustment via `SELECT … FOR UPDATE`, checkout via the matched-row `UPDATE … WHERE stock >= qty`), so they **serialize** — they never interleave, stock never goes negative (both guard), and the ledger's `resulting_stock` is read after the lock so it never diverges from the true post-write stock (edge 6 satisfied). The one accepted nuance: an *absolute* set blindly overwrites whatever a just-committed checkout left (delta computed from the post-lock current value). For a single Owner this is the intended semantics and is documented in the migration. Roles/audit-of-who Phase 2.

## T10-Recommendation Report Card

| T10 recommendation (before T11 / before T12) | Status in T11 | Evidence |
|---|---|---|
| #1 Comment the `/api` middleware exclusion so T12 authors don't assume coverage | ➖ Partially moot | No `/api/admin/*` handler was added; the export route self-guards and documents the exclusion in its header. The standing convention is now demonstrated, not just described. |
| #3 Guarded-route-handler convention (any admin route handler self-calls the session check) | ✅ Landed | `products/export/route.ts` calls `hasValidAdminSession()` at entry → 401. First instance of the convention, implemented exactly as prescribed. |
| #4 Pagination + indexed-filter convention for the list read (singleton pattern does not generalize) | ✅ Landed cleanly | `list-query.ts` reuses the pure `pagination.ts` (count → clamp → range via `parsePageParam`/`rangeFor`), filters are a pure bounded `list-filters.ts`, URL-synced, and 0011 adds the sort/search indexes. **This is a verbatim-adoptable template for the T12 order list.** |
| #2 ADR-2 session revocation (a T12 gate) | ➖ Not in T11 scope, untouched | dev-done confirms the reserved payload `v` field is untouched; SEC-M-1 still open. Correctly still a T12 gate, not regressed. |

**Verdict: the T10 list/API recommendations that were T11's to execute all landed as prescribed.** The one recommendation that was explicitly a *T12* gate (revocation) remains open and un-regressed.

## Tech Debt Ledger

| Item | Type | Impact | When it bites | Effort |
|------|------|--------|---------------|--------|
| Compensation instead of transactional RPC for product/CSV/duplicate multi-table writes (ADR-1) | Introduced (deliberate) | Med | **Phase 2** (multi-admin); NOT T12 | M |
| CSV importer duplicates product-write's inner write logic (ADR-2) | Introduced | Low→Med | Phase 2 (drift risk); resolved by ADR-1's RPC | M (folded into ADR-1) |
| `product-input.ts`/`product-read.ts` import a type UPWARD from the action-dir contract file | Introduced | Low | Never functionally; a smell. Fix by moving the contract into `lib/admin/products/` | S |
| `taxonomy-write.ts` `bustEntity` builds a `map` local then `void map`s it (dead code) | Introduced | Negligible | Never; violates "no dead code" clean-code rule | XS |
| `fields.tsx` = 466 lines (over 400 soft target) | Introduced | Negligible | Never — cohesive 8-primitive family, under 1000 hard cap, ESLint green. **Do not split** (would fragment across 8 consumers for no cohesion gain). | — (accept) |
| Duplicate/import read all slugs+SKUs into memory | Introduced | Low | Phase 2 large catalog | M |
| Orphaned storage objects on best-effort delete failure | Introduced (by design) | Low | Never blocks; Phase-2 reconciliation sweep | S |
| SEC-M-1 no server-side session revocation (from T10) | Existing | Med | **T12** (refunds) | M |
| Pagination + list-read convention | **Reduced** | — | — | — (a reusable template now exists for T12) |
| Cache-invalidation scattered → single `bustCatalogTags` helper | **Reduced** | — | — | — |
| Form primitives duplicated → shared `fields.tsx` (T10 settings form refactored onto it) | **Reduced** | — | — | — |

Net: T11 introduces one Med debt (compensation, deliberate, Phase-2-scoped) and several negligible smells, while **reducing** three structural debts (list convention, cache discipline, form-primitive duplication). The introduced debts are documented at their sites with phases — consistent with the T10 hygiene.

## System Boundaries

- **Storefront↔admin isolation intact** — admin reads base tables / busts storefront tags; no import crosses either way (T10 boundary preserved).
- **Admin lib domain graph is acyclic and layered** — shared leaves (`cache-tags`, `slug`, `units`, `format`, `require-session`, `constants`) at the bottom; domain write/read modules above; no domain→domain write coupling.
- **One minor inversion** (type-only lib→app contract import) — cosmetic, noted for T12.
- **Cache is the single cross-cutting boundary and it is airtight** — every write path funnels through one helper; T12 order writes will bust nothing catalog-related (orders have no `catalog`/`product:`/facet tag), so the separation the ticket asked to verify holds by construction: catalog and order caches are disjoint tag namespaces. No over-busting risk — a product save busts `catalog` + only the touched slug tags (M-2 unions old+new), not a per-entity storm.

## T12 Readiness Verdict — **READY**

- **Order list** adopts `list-query.ts` + `pagination.ts` + `list-filters.ts` verbatim (base-table admin read, count→clamp→range, URL-synced bounded filters, batch-stitch for any derived columns). The template is proven.
- **Order writes** should follow the **transactional-RPC** precedent (0008/0009/0010), NOT the T11 compensation pattern — T12's "cancel with automatic stock restore" is a multi-table stock+status write that MUST be atomic, so it belongs in a `cancel_order` SQL function mirroring `create_order` (which there is currently no RPC for — T12 builds it). The `advance_order_status` RPC already exists for the status pipeline.
- **Session gate** (`requireSession()` / `hasValidAdminSession()`) reused verbatim; the guarded-route-handler convention is now demonstrated for any refund callback.
- **Cache separation verified** — order writes touch no catalog tag; no cross-contamination.
- **The one hard T12 gate is unchanged and external to T11**: SEC-M-1 (no server-side session revocation) MUST land before refund-capable sessions ship. T11 did not regress it.

## Refactors Applied

**None.** This stage runs review-only, in parallel with Security (Stage 9). No code changed, no commits; `tasks/security-audit.md` and `tasks/pipeline-state.md` untouched.

## Prioritized Recommendations

**Before T12 (blocking the T12 gate, not T11):**
1. **Land SEC-M-1** (session-version/revocation) before refund-capable T12 sessions — carried from T10 ADR-2, still the single money-moving gate.
2. **Build T12 stock-restore as a transactional RPC** (`cancel_order`), NOT the T11 compensation pattern — follow the `create_order`/`advance_order_status` precedent so cancel+restore is atomic.
3. **Place the T12 order-form contract in `lib/admin/orders/`** (not under `app/admin/…`), avoiding the type-only lib→app inversion T11 introduced.

**Nice-to-have before T12 (non-blocking, cheap):**
4. Delete the dead `map`/`void map` in `taxonomy-write.ts:bustEntity` (Boy-Scout, XS).

**Deferred to Phase 2 (do not act now):**
5. **Migrate product/CSV/duplicate multi-table writes to a `create_product_with_links` RPC** (ADR-1) — closes the atomicity gap AND the CSV/product-write DRY seam in one move. Trigger: the introduction of multi-admin/roles. Effort M.
6. Storage orphan-reconciliation sweep; streaming CSV export; slug/SKU de-dup via a targeted query instead of full-table load.

## Architecture Score: 9/10

Will this make sense in 6 months with 2× the team? Yes. Five new domains all speak the same dialect — a pure parser, an I/O writer returning a typed union, an action that re-verifies the session and maps errors to a friendly enum, one shared cache-bust helper, one shared field-primitive family. A new engineer learns the product path and can read the taxonomy, inventory, Q&A, and CSV paths without relearning anything. The list convention and cache discipline are genuinely reusable templates T12 inherits for free, and the concurrency story between the two stock paths is correct and locked. The one point off is ADR-1: the codebase established a transactional-RPC precedent for exactly this class of multi-table write, T11 followed it for inventory but chose application-level compensation for products/CSV — a legible, well-tested choice that is nonetheless the one place the system's own best pattern was not applied, duplicates ~120 lines across three modules, and will need to become an RPC before a second admin exists. Correctly deferred out of T11; flag it now so Phase 2 doesn't discover it as a bug.

## Recommendation: **APPROVE** (ship T11; act on the three before-T12 items during T12 planning, not now)
