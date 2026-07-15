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
