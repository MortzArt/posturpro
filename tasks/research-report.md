# Research Report: T10 — Admin foundation

## Codebase Analysis

### Existing Patterns

- **Strict env / secret boundary** — `src/lib/env.ts`. `getPublicEnv` (NEXT_PUBLIC only) vs `getServerEnv`/`getMercadoPagoEnv`/`getEmailEnv` (server secrets), all via `requireEnv` which throws a named `MissingEnvVarError`. **Reuse:** add `getAdminEnv()` here for `ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH`/`ADMIN_SESSION_SECRET`, following the MP/email block verbatim (comment block + interface + accessor). This is the ONLY place admin secrets are read.
- **`server-only` guard for secret access** — `src/lib/supabase/admin.ts:10`, `src/lib/supabase/public.ts`, `src/lib/store-settings.ts:11`. Importing these from a client bundle is a build error. **Reuse:** `src/lib/admin/session.ts` and `auth.ts` start with `import "server-only"`.
- **HMAC + constant-time verify** — `src/lib/payments/webhook.ts:26` (`createHmac`, `timingSafeEqual`) and `timingSafeHexEqual` (`webhook.ts:188`) which length-checks then `timingSafeEqual`s decoded buffers. **Reuse strategy:** the admin session signer is structurally identical — HMAC-SHA256 the payload, hex-encode, compare with `timingSafeHexEqual`-style helper. Copy the discipline (never `===` on signatures; length check is not a timing leak for fixed-length digests), do not copy-paste the function (DRY-with-judgment; different secret, different payload).
- **`randomUUID` / node:crypto in server modules** — `src/lib/payments/refund.ts:26`. Confirms `node:crypto` is available in server-action/route runtime (Node runtime), NOT necessarily the Edge middleware runtime — see Risk R1.
- **Server-action + serializable state contract** — `src/app/[locale]/checkout/actions.ts` (`"use server"`, `placeOrder(prevState, formData)`) paired with `checkout-form-state.ts` (types only, because a `"use server"` file may export only async fns). Q&A (`src/lib/qa/…` + `qa-form-state.ts`) is the same shape. **Reuse:** `src/app/admin/actions.ts` + `src/app/admin/admin-form-state.ts`. Raw PG errors are mapped to friendly enums, never echoed (`actions.ts:23`, `mapThrownError`).
- **Best-effort per-IP rate limiter with test escape hatch** — `src/lib/checkout/rate-limit.ts` (`checkCheckoutRateLimit`, disabled by `CHECKOUT_RATE_LIMIT_DISABLED`), keyed by `clientIp` from the canonical `src/lib/request/client-ip.ts`. **Reuse:** a parallel `checkLoginRateLimit` (or generalize) for AC-15, with an `ADMIN_LOGIN_RATE_LIMIT_DISABLED` flag so e2e can log in freely.
- **Tag-cached read + bust-on-write** — `src/lib/store-settings.ts`: `getStoreSettingsStatic` is `unstable_cache([...], {tags:[STORE_SETTINGS_CACHE_TAG]})`; doc comment explicitly says busted "on demand by `revalidateTag(STORE_SETTINGS_CACHE_TAG)` (admin save, T10)." **Reuse:** the save action calls `revalidateTag(STORE_SETTINGS_CACHE_TAG)` — the seam is pre-built (AC-9).
- **Money boundary** — `src/lib/money.ts` (`formatMXN`, `pesosToCents`, `centsToPesos`); integer cents everywhere (`config/shared.ts`). **Reuse:** settings form displays/edits pesos, stores cents via these helpers (AC-8).
- **Cookie read/write via `next/headers`** — `src/lib/supabase/server.ts` (`await cookies()`, `cookieStore.set(name,value,options)`), Next 16 async cookies. **Reuse:** the login/logout actions set/clear the admin cookie the same way (`HttpOnly`, `SameSite=Lax`, `Secure` in prod, `Path=/admin`).
- **Layout as auth/render boundary** — `src/app/[locale]/layout.tsx` reads settings, sets `<html lang>`, wraps children. **Reuse:** `src/app/admin/layout.tsx` is a *parallel, independent* root-ish layout (own `<html lang="es-MX">`, no next-intl provider, no cart/site chrome) that additionally guards the session.

### Relevant Files

| File | Purpose | Relevance | Action |
| ---- | ------- | --------- | ------ |
| `src/lib/env.ts` | Validated env accessors, secret boundary | Add `getAdminEnv()` | Modify |
| `src/middleware.ts` | next-intl locale middleware | Add `/admin` guard branch; keep storefront intact | Modify |
| `src/lib/store-settings.ts` | Cached read + `STORE_SETTINGS_CACHE_TAG` | Bust tag on save; optional `updateStoreSettings` | Reference / Modify |
| `src/lib/supabase/admin.ts` | RLS-bypass client (`createAdminClient`) | The settings-write client | Reference |
| `src/lib/payments/webhook.ts` | HMAC + `timingSafeEqual` reference impl | Signing/verify blueprint | Reference |
| `src/lib/money.ts` | `pesosToCents`/`centsToPesos`/`formatMXN` | Money boundary in settings form | Reference |
| `src/lib/checkout/rate-limit.ts` | Best-effort per-IP limiter + disable flag | Login rate limit blueprint | Reference |
| `src/lib/request/client-ip.ts` | Canonical client IP | Limiter key | Reference |
| `src/app/[locale]/checkout/actions.ts` + `checkout-form-state.ts` | Server-action + state-type split | Login/settings action blueprint | Reference |
| `supabase/migrations/0003_commerce.sql:149` | `store_settings` table def | Column names + CHECKs | Reference |
| `supabase/migrations/0006_data_integrity_hardening.sql:50` | singleton index + name CHECK | Constraints the form must respect | Reference |
| `supabase/migrations/0005_rls_policies.sql:203` | `store_settings` grants (select only) | Confirms writes must use admin client | Reference |
| `src/lib/config/shared.ts` | `SEED_STORE_NAME`, `SEED_STORE_CONTACT_EMAIL`, shipping seeds | Defaults for missing-row edge | Reference |
| `src/lib/payments/secret-exposure.test.ts` | Client-bundle secret leak test | Blueprint for AC-12 test | Reference |
| `src/app/[locale]/layout.tsx` | Storefront layout pattern | Admin layout parallel | Reference |
| `src/components/ui/{button,input,label}.tsx` | shadcn primitives (vendored) | Login + settings form | Reference |

### Data Flow

**Login:** browser POSTs `/admin/login` form → `login()` server action → `checkLoginRateLimit(clientIp)` → `verifyCredentials(email, password)` (`getAdminEnv()` → scrypt compare, constant-time; dummy-hash on unknown email) → on success `createSessionCookieValue()` (HMAC over `{issuedAt, v}`) → `cookies().set(ADMIN_SESSION_COOKIE_NAME, value, {httpOnly, sameSite:"lax", secure, path:"/admin", maxAge})` → `redirect("/admin")`. On failure → `{status:"error"}` generic.

**Guarded request:** browser GET `/admin/settings` → `middleware` matches `/admin/*`, reads cookie, verifies signature+expiry → if invalid `NextResponse.redirect("/admin/login")`; if valid `NextResponse.next()` → `admin/layout.tsx` server component re-verifies (defense-in-depth) → renders nav + page → `admin/page.tsx` reads live `store_settings` (via `getStoreSettings`/`getStoreSettingsStatic`) → seeds form.

**Save settings:** browser POSTs settings form → `saveStoreSettings()` action → re-verify session (reject if absent, edge 9) → `parseStoreSettingsInput(formData)` (pure; pesos→cents, validate) → `createAdminClient().from("store_settings").update({...}).eq("id", row.id)` (or update-the-singleton) → `revalidateTag(STORE_SETTINGS_CACHE_TAG)` → `{status:"success"}`. Storefront `getStoreSettingsStatic` cache is now busted → footer/checkout render new values.

### Similar Features (Reference Implementations)

- **Mercado Pago webhook** (`src/lib/payments/webhook.ts`, `+ config.ts`, `+ webhook.test.ts`) — the closest analog to admin session signing: server-only secret from `env.ts`, HMAC-SHA256, constant-time compare, exhaustive unit tests over forged/malformed inputs. Follow this bar for `session.test.ts`.
- **Checkout action** (`actions.ts` + `checkout-form-state.ts` + `form-parsing.ts`) — the template for splitting: `"use server"` orchestration file, a types-only state file, and a pure parsing/validation lib (`form-parsing.ts`, `checkout/address.ts`). Mirror as `actions.ts` / `admin-form-state.ts` / `settings-input.ts`. Keeps each file small (clean-code) and the parser unit-testable without Next.
- **Store-settings read** (`store-settings.ts`) — already models graceful degradation (returns `null`, never throws) and the cache tag. The write path is the missing half T10 adds.

## Dependency Analysis

### Existing Dependencies to Leverage

- `node:crypto` (built-in) — `createHmac`, `timingSafeEqual`, `scrypt`/`scryptSync`, `randomBytes`. For the password hash use scrypt (in Node stdlib, no new dep) with a per-hash random salt encoded into `ADMIN_PASSWORD_HASH` (e.g. `scrypt$N$salt$hash`).
- `@supabase/supabase-js` `2.110.2` — `createAdminClient` for the settings UPDATE.
- shadcn/ui (`button`, `input`, `label` present; `radix-ui` `1.6.0` available) — login + settings forms.
- `next` `16.2.9` — `cookies()` (async), `redirect()`, `revalidateTag()`, `useActionState`, middleware `NextResponse`.
- `next-intl` `4.13.2` — unchanged; admin sits OUTSIDE its locale scope.

### New Dependencies Needed

- **None.** Explicitly avoid `next-auth`/`lucia`/`bcrypt`/`argon2`: a single hardcoded Owner does not justify an auth framework, and adding a native-binding hash lib (bcrypt/argon2) complicates the build. `node:crypto` scrypt is a first-class, dependency-free password KDF and is sufficient here. (If Security later insists on argon2, that is a follow-up, not a Phase-1 blocker.)

### Internal Dependencies

- `middleware.ts` depends on session verification — implication: verification logic must be importable in the **Edge runtime**. `node:crypto` may not be available there → see Risk R1. Keep `session.ts` free of Next imports so it can be used in both runtimes, or split a Web-Crypto verify path.
- `saveStoreSettings` depends on `STORE_SETTINGS_CACHE_TAG` staying the single tag both reads use — implication: don't fork the tag; import the constant, don't re-declare.
- Admin layout must NOT import the storefront `CartProvider`/`SiteHeader`/`NextIntlClientProvider` — implication: admin is a sibling route tree, not nested under `[locale]`, so it needs its own `<html>` (Next allows multiple root layouts for disjoint segments).

## External Research

### Framework Documentation

- **Next.js 16 App Router — multiple root layouts:** route groups / disjoint top-level segments (`app/[locale]/...` and `app/admin/...`) can each own an `<html>`/`<body>`. `admin/layout.tsx` being a root layout for the `/admin` subtree is the sanctioned way to give admin its own chrome and lang without inheriting storefront providers.
- **Middleware runtime:** Next middleware runs on the **Edge runtime** by default, where Node built-ins (`node:crypto`) are historically unavailable; the **Web Crypto API** (`crypto.subtle.importKey`/`sign`, `globalThis.crypto`) is the Edge-safe path for HMAC. Next 16 does allow opting middleware into the Node runtime in some configs — but the safe, portable design is: middleware does a **Web Crypto HMAC verify** (signature + expiry), and the layout/action does the authoritative `node:crypto` verify. Both share the same secret and payload format. Document whichever path Dev picks (Risk R1).
- **Cookie security:** `HttpOnly` (no JS access → mitigates XSS token theft), `SameSite=Lax` (CSRF mitigation for top-level nav; forms POST same-site so Lax is fine), `Secure` (prod only — localhost is http), `Path=/admin` (cookie never sent to storefront routes → keeps sessions separate, AC-13). `__Host-` prefix would force `Secure`+`Path=/`+no-Domain; we deliberately want `Path=/admin`, so a plain name (not `__Host-`) is correct.

### API Documentation

- N/A — no external HTTP API. Admin talks only to the local Supabase Postgres via the admin client.

## Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| **R1: `node:crypto` unavailable in Edge middleware** → build/runtime error when verifying the session in `middleware.ts` | High | High | Use **Web Crypto (`crypto.subtle`)** for the middleware-side HMAC verify (Edge-safe), keep `node:crypto` for the authoritative layout/action verify; OR opt middleware into the Node runtime if the project already does so. Keep `session.ts` payload format runtime-agnostic. Verified as the key design decision for Dev. |
| **R2: Storefront regression** from middleware change (locale routing / cart cookie) | Medium | High | Scope the `/admin` branch tightly; return `NextResponse.next()`/redirect ONLY for `/admin/*`, delegate everything else to next-intl unchanged. Re-run full e2e (cart 46, checkout 24) on a prod build with correct seed-before-build sequencing (pipeline-state E2E rule). |
| **R3: Timing/user-enumeration leak** on login | Medium | Medium | Verify the scrypt hash even when the email is unknown (dummy hash of equal cost); single generic error for both wrong-email and wrong-password (AC-3). Covered by an `auth.test.ts` case. |
| **R4: Secret leaks into client bundle** | Low | Critical | All admin secrets `server-only` + read only via `getAdminEnv()`; add a `secret-exposure`-style test (AC-12). Never `NEXT_PUBLIC_`. Never pass secrets into a `"use client"` component's props. |
| **R5: Missing/blank `ADMIN_PASSWORD_HASH` treated as "any password works"** | Low | Critical | `getAdminEnv()` throws `MissingEnvVarError` on blank; the login action catches it → generic "no disponible" and grants nothing (edge 4). Add a test that unset hash never authenticates. |
| **R6: Missing `store_settings` row 500s the settings page** | Low | Medium | Reuse the graceful-null read; seed the form from `SEED_*` and UPSERT on first save (edge 8). |
| **R7: Money parse coerces locale-formatted input to wrong cents** | Medium | High (wrong shipping charged) | Strict pure parser in `settings-input.ts` with explicit tests for `1,000.00`, `$500`, `1.000,00`, negatives, >2 decimals, overflow (edge 6/7, AC-10). |

### Performance Considerations

- Admin is a low-traffic, single-user surface — no perf concern. The middleware `/admin` branch adds one HMAC verify per admin request only (storefront requests short-circuit before the admin logic). Ensure the storefront path in middleware is not slowed (guard on `pathname.startsWith("/admin")` first).

### Security Considerations

- This is THE trust boundary. Enforce: HttpOnly+Secure+SameSite=Lax+Path=/admin cookie; HMAC-signed tamper-evident payload; bounded session lifetime; constant-time credential + signature checks; per-IP login rate limit; server-side re-verification in every mutation (never trust middleware alone); no secret in client bundle; generic error messages (no enumeration, no stack traces). Session invalidation lever = rotate `ADMIN_SESSION_SECRET`. Flag for the Security stage (9) at full depth.
- `SameSite=Lax` + a state-changing POST is acceptable for a single-owner tool, but the settings/logout actions should still re-verify the session server-side (they do) — that plus Lax is the CSRF story for Phase 1. A dedicated CSRF token is Phase-2 polish, not required here.

## Implementation Recommendations

### Suggested Order of Implementation

1. `src/lib/env.ts` `getAdminEnv()` + `.env.local` placeholders + hash-generation note — everything else reads from here.
2. `src/lib/admin/constants.ts` + `session.ts` + `auth.ts` with unit tests (pure, no Next) — the security core, test-first (characterization per clean-code).
3. `src/lib/admin/settings-input.ts` + tests — pure money/field validation.
4. `src/middleware.ts` `/admin` guard (Edge-safe verify) — protect the tree before building UI behind it.
5. `src/app/admin/layout.tsx` + `login/page.tsx` + `actions.ts` (login/logout) + `admin-form-state.ts` — get auth working end-to-end.
6. `src/components/admin/store-settings-form.tsx` + `admin/page.tsx` + `saveStoreSettings` action + `revalidateTag` — the feature.
7. `src/components/admin/admin-nav.tsx` with disabled Products/Orders slots — the shell T11/T12 inherit.
8. e2e: unauth redirect, login success/failure, settings save round-trip + storefront reflects new shipping.

### Key Decisions

- **`/admin` locale-free + es-MX-only admin UI** — recommended (see ticket decisions 1 & 2). Justified by single Spanish-speaking owner and routing simplicity; PRODUCT_SPEC does not ask for admin i18n.
- **Signed cookie over Supabase Auth** — recommended (decision 3). Keeps admin fully separate from `anon`/`authenticated` roles and avoids GoTrue provisioning for one account.
- **scrypt (node:crypto) over bcrypt/argon2 deps** — recommended: zero new deps, no native bindings, strong KDF.
- **Defense-in-depth (middleware + layout + action)** — recommended: middleware for fast redirect UX, layout/action for authoritative server-side enforcement.

### Anti-Patterns to Avoid

- Don't verify the session ONLY in middleware — middleware can be bypassed by matcher edge cases; the layout and every mutation must re-verify. Instead: three-layer check.
- Don't add an RLS `update`/`insert` grant to `authenticated` for `store_settings` — it would widen the storefront role for every guest. Instead: write via the RLS-bypass admin client (existing pattern).
- Don't put admin under `/[locale]/admin` — it collides with `localePrefix:"as-needed"` and forces admin i18n. Instead: sibling `/admin` tree with its own root layout.
- Don't use `===` to compare signatures/passwords, and don't early-return on unknown email — timing leaks. Instead: `timingSafeEqual` + dummy-hash parity.
- Don't add admin copy to the next-intl message catalogs — it breaks the storefront es-MX/en symmetry tests. Instead: author admin Spanish inline.
- Don't feed any admin secret into a `"use client"` component's props or a `NEXT_PUBLIC_` var. Instead: keep verification server-side, pass only booleans/data to client components.
- Don't re-declare the cache tag string — import `STORE_SETTINGS_CACHE_TAG` so read and bust stay in sync.
