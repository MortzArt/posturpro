# Task: T10 — Admin foundation

## Priority

**Critical** — This is the trust boundary for the entire management dashboard. T11 (product management) and T12 (order management) are `blocked by: T10` and will inherit its auth model, layout, route-protection pattern, and settings-write pattern. Getting the auth architecture right here prevents rework across two full-cycle tasks and closes the single highest-value attack surface in the app. A weak admin auth here is a store-takeover vulnerability.

## Complexity

**medium** — Justification against the criteria:

- New subsystem (admin auth + admin shell), but scoped: **single Owner account, no user table, no roles, no registration, no password reset** (all explicitly Phase 2 per PRODUCT_SPEC "Deferred to Phase 2" line 92). This keeps it well below `high`.
- Estimated **9–13 files** (new middleware branch, session lib, login page + action, admin layout + nav, settings page + action + validation lib, messages). Lands in the 5–15 band.
- Introduces ONE genuinely new pattern (a self-managed signed session cookie) — but it reuses the existing `node:crypto` HMAC/`timingSafeEqual` discipline already proven in `src/lib/payments/webhook.ts`, the existing `src/lib/env.ts` secret boundary, and the existing admin (RLS-bypass) Supabase client. No new data model beyond the update path on the existing `store_settings` row.
- It is NOT `high`: no new integration, no architectural rewrite, no new tables. It is NOT `low`: it adds a new auth pattern and a new protected route tree, more than a pattern-copy.

Because full-cycle auto-classifies `medium` → **skip the hacker stage**, run all other stages. Given this is an auth trust boundary, Security (9) and Arch (10) MUST run at full depth (not lightweight) despite `medium`.

## Feature Type

**full-stack** — New backend (session issuance/verification, settings write via admin client, possible migration) AND new frontend (login screen, admin shell/nav, Store Settings form). All pipeline stages relevant; UI Design (3) and UX (8) run at full depth for the login + settings surfaces.

## User Story

As the **store Owner**, I want a secure admin area — separate from any shopper session — where I log in once and edit my store's name, contact email, shipping flat rate, and free-shipping threshold, so that I can operate the store without a developer and without exposing the storefront to my credentials.

## Background

**What exists today:**

- The storefront is entirely guest/cookie-cart based. There is **no authentication of any kind** — no Supabase Auth users, no `auth` library, no session concept. The only "identities" are `anon` and the RLS-bypassing service role.
- `store_settings` is a **DB-enforced singleton** (`store_settings_singleton` unique index on `((true))`, migration 0006) with columns `store_name`, `contact_email`, `shipping_flat_rate_cents`, `free_shipping_threshold_cents`, `currency`, `updated_at` (auto-touched by trigger `store_settings_set_updated_at`). Non-blank name enforced by CHECK `store_settings_name_nonblank` (1–200 chars). Both cents columns have CHECK `>= 0`.
- The storefront **reads** `store_settings` via `getStoreSettingsStatic()` (`src/lib/store-settings.ts`), an `unstable_cache` read tagged `STORE_SETTINGS_CACHE_TAG = "store-settings"`. That file's doc comment already says the tag is bust-on-save "(admin save, T10)" — the wiring seam is pre-built. Checkout also reads it (`getStoreSettingsStatic` → `computeShipping`).
- RLS: `store_settings` grants **`select` only** to `anon, authenticated`; there is **no `update`/`insert` grant to any client role** (migration 0005). All privileged writes in this app go through the RLS-bypassing admin client (`src/lib/supabase/admin.ts`, `server-only`).
- Secrets are single-sourced and validated in `src/lib/env.ts` with a strict public/server split; no secret is ever `NEXT_PUBLIC_`. `node:crypto` `createHmac` + `timingSafeEqual` are already used correctly in `src/lib/payments/webhook.ts`.
- Locale middleware (`src/middleware.ts`) is pure next-intl with matcher `/((?!api|_next|_vercel|.*\\..*).*)`. Storefront routes live under `src/app/[locale]/`.

**What's missing:** any way for the Owner to authenticate and any UI to edit the store settings. Today changing shipping requires editing the DB row by hand.

**Why it matters now:** T11/T12 cannot start without the admin shell + route guard this task establishes.

## Key Product & Architecture Decisions (binding for Dev)

1. **Admin lives at a locale-free `/admin`, NOT under `/[locale]/admin`.** Justification: (a) PRODUCT_SPEC does not require admin i18n; the operator is a single Spanish-speaking owner (spec line 12). (b) Keeping admin out of `[locale]` avoids the `localePrefix: "as-needed"` ambiguity (is `/admin` the es-MX-unprefixed admin or a locale?) and keeps admin URLs stable/uncrawlable. (c) The next-intl middleware must be updated to **exclude `/admin` from locale handling** and instead run the admin session guard for it.
2. **Admin UI is single-locale es-MX** (Spanish), NOT internationalized. Justification: single non-technical owner, Spanish market; i18n of admin is explicitly Phase-2-adjacent and adds cost with zero Phase-1 value. Admin copy is authored directly in Spanish (constants/JSX), NOT added to the `next-intl` storefront message catalogs (those stay symmetric es-MX/en for the storefront only). This keeps the storefront `messages.test.ts` symmetry tests green.
3. **Auth mechanism: a self-managed, HMAC-signed, HttpOnly session cookie — NOT Supabase Auth.** Justification: Supabase Auth (a) requires provisioning an `auth.users` row and wiring GoTrue, a heavier dependency for a single hardcoded Owner; (b) would create a second "authenticated" identity that RLS policies (`grant ... to authenticated`) already reference for the storefront — mixing an admin `authenticated` session into that role risks silently widening storefront grants. A dedicated signed cookie keeps the admin session **fully separate from any shopper/Supabase session** (spec requirement) and never touches the `anon`/`authenticated` Postgres roles. Credentials: `ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH` (scrypt hash) read via `src/lib/env.ts`; the session cookie payload is signed with `HMAC-SHA256(payload, ADMIN_SESSION_SECRET)`.
4. **Route protection is defense-in-depth: middleware guard + layout guard.** The Next.js middleware verifies the session cookie for every `/admin/*` request except `/admin/login` and redirects unauthenticated requests to `/admin/login`. The admin **layout** (server component) ALSO verifies the session and redirects — so a route that somehow bypasses the matcher is still protected. Every admin mutation (server action) re-verifies the session server-side before touching the DB (never trust the middleware alone).
5. **All admin writes go through the existing admin (RLS-bypass) client** (`createAdminClient`), server-only. No new Supabase client. No RLS `update` grant is added (would widen the `authenticated` role for everyone).

## Acceptance Criteria

- [ ] AC-1: Visiting `/admin` (or any `/admin/*` except `/admin/login`) while unauthenticated redirects (HTTP 307/302) to `/admin/login`. No admin markup is sent to the browser.
- [ ] AC-2: Submitting the login form with the correct `ADMIN_EMAIL` + password sets an HttpOnly, `SameSite=Lax`, `Secure` (in production), `Path=/admin` session cookie and redirects to `/admin`. Email comparison is case-insensitive; password verification is constant-time against the scrypt hash.
- [ ] AC-3: Submitting the login form with a wrong email OR wrong password shows a single generic error ("Correo o contraseña incorrectos") — the response does NOT reveal which field was wrong, and the timing does not distinguish "unknown email" from "wrong password" (verify the hash even on unknown email, or compare against a dummy hash).
- [ ] AC-4: The session cookie value is tamper-evident: it carries an HMAC-SHA256 signature over its payload (issued-at + version) using `ADMIN_SESSION_SECRET`; any modification, truncation, or forged cookie fails `timingSafeEqual` verification and is treated as unauthenticated.
- [ ] AC-5: The session expires after a bounded lifetime (`ADMIN_SESSION_MAX_AGE_SECONDS`, default 8 hours). An expired cookie (issued-at older than max-age) is rejected server-side even if its signature is valid, and the user is redirected to `/admin/login`.
- [ ] AC-6: A "Cerrar sesión" (logout) control in the admin nav clears the session cookie (maxAge=0) and redirects to `/admin/login`. After logout, AC-1 holds again.
- [ ] AC-7: While authenticated, `/admin/login` redirects to `/admin` (no reason to re-login).
- [ ] AC-8: The Store Settings screen renders the four editable fields pre-populated from the live `store_settings` row: `store_name` (text), `contact_email` (email), shipping flat rate and free-shipping threshold (both shown/edited in **pesos**, e.g. `500.00`, converted to/from integer cents at the boundary via `pesosToCents`/`centsToPesos`).
- [ ] AC-9: Saving valid settings updates the single `store_settings` row via the admin client, calls `revalidateTag(STORE_SETTINGS_CACHE_TAG)`, and shows a success confirmation. The storefront footer/checkout reflect the new values on their next render (no manual cache clear).
- [ ] AC-10: Server-side validation rejects: blank store name, name > 200 chars, invalid email, negative or non-numeric money, money that isn't a clean 2-decimal peso value, and money values that overflow a safe integer. Field-level Spanish error messages are shown; the form stays filled with the user's input.
- [ ] AC-11: The admin layout shows a navigation shell with the store name, links for the current + future admin sections (Store Settings live; Products/Orders present as **disabled/"próximamente"** placeholders so T11/T12 slot in without a nav rewrite), and the logout control. Nav marks the active section.
- [ ] AC-12: `ADMIN_SESSION_SECRET`, `ADMIN_PASSWORD_HASH`, `ADMIN_EMAIL` are read ONLY through `src/lib/env.ts` server accessors, are `server-only`, and are NEVER prefixed `NEXT_PUBLIC_`. `grep NEXT_PUBLIC .env.local` shows none of them; the client bundle contains none of them (verify in the spirit of `src/lib/payments/secret-exposure.test.ts`).
- [ ] AC-13: The admin session cookie is a DIFFERENT cookie name from `NEXT_LOCALE` and any cart cookie, is scoped to `Path=/admin`, and is never read/written by any storefront code. Storefront behavior is byte-for-byte unchanged (existing e2e still 100% green).
- [ ] AC-14: A new migration `0011_*.sql` (idempotent) exists ONLY if a DB change is genuinely needed; the expectation is **no schema change** (row + CHECKs already exist; T10 writes are pure UPDATEs). Confirm and state explicitly in `dev-done.md`.
- [ ] AC-15: Login is rate-limited per client IP (reuse the best-effort limiter pattern from `src/lib/checkout/rate-limit.ts`): after N failed attempts in a window, further attempts return a generic "demasiados intentos" error. Disabled behind the same env-flag escape hatch used in tests.
- [ ] AC-16: `tsc` strict passes, ESLint `max-lines` passes (no file > 1000; new files target < 400), no `any`, no non-null `!`. Session/auth lib functions ≤ 30 lines.

## Edge Cases

1. **Forged/tampered cookie** — attacker crafts a cookie with a valid-looking payload but wrong/absent signature → `timingSafeEqual` fails → treated as unauthenticated → redirect to `/admin/login`. No stack trace, no "invalid signature" leak.
2. **Expired-but-signed cookie** — signature verifies but `issuedAt + maxAge < now` → rejected as expired → redirect to login. (Prevents an old stolen cookie living forever.)
3. **`ADMIN_SESSION_SECRET` rotated/changed** — every previously issued cookie now fails HMAC verification → all sessions invalidated (owner must re-login). Documented as the intended "log everyone out" lever.
4. **Missing admin env vars at runtime** (`ADMIN_PASSWORD_HASH` unset) → login action catches `MissingEnvVarError`, logs with context, shows a generic "no disponible" error — NEVER a stack trace, and NEVER treats "no hash configured" as "any password works."
5. **Concurrent settings save** — two tabs save different values; last write wins on the singleton row (single owner, acceptable). `updated_at` reflects the latest write via the existing trigger.
6. **Money edge: threshold = 0** (free shipping for everyone) and **flat rate = 0** (always free) are VALID (CHECK is `>= 0`) — must be accepted, not rejected as "empty."
7. **Money edge: locale-formatted input** — user types `1,000.00` or `1.000,00` or `$500` in the peso field → parser must strip/normalize or reject with a clear message, never silently coerce to a wrong cents value.
8. **`store_settings` row absent** when opening the settings page (fresh/broken DB) → page shows a clear "no se encontró la configuración" state seeded from `SEED_*` config defaults, and the first save UPSERTs/creates the singleton (or shows a recoverable error) rather than 500ing.
9. **Direct POST to the settings server action without a session** (CSRF-style / API poking) → action re-verifies the session server-side first and rejects with unauthenticated; the DB is never touched.
10. **Trailing-slash / case variants of `/admin`** (`/admin/`, `/Admin`) and `/admin` hitting the locale matcher — verify the middleware branch catches all admin paths and the storefront locale logic never rewrites them.

## Error States Table

| Trigger | User Sees | System Does |
| ------- | --------- | ----------- |
| Wrong email or password | "Correo o contraseña incorrectos" (single generic message) | Constant-time verify; log a warning w/ client IP + timestamp (no credentials); increment failed-attempt counter; return error state |
| Too many failed logins in window | "Demasiados intentos. Intenta de nuevo en unos minutos." | Best-effort per-IP limiter blocks; no DB/hash work performed |
| Unauthenticated access to `/admin/*` | Redirect to `/admin/login` (no admin markup) | Middleware + layout guard both redirect |
| Tampered/expired session cookie | Redirect to `/admin/login` | HMAC/expiry check fails silently; treated as anonymous |
| Missing admin env config | "El acceso de administrador no está disponible." | Catch `MissingEnvVarError`, log with context, no auth granted |
| Settings validation failure | Field-level Spanish errors; form stays filled | Server action returns `{status:"invalid", fieldErrors}`; no DB write |
| Settings DB write error | "No se pudo guardar. Intenta de nuevo." | Map raw PG error to friendly enum; log with context; single-row UPDATE is atomic |
| `store_settings` row missing | "No se encontró la configuración de la tienda." + prefilled defaults | Read returns null; form seeds from `SEED_*` constants; save creates/UPSERTs the singleton |
| Settings saved OK | "Configuración guardada." success banner | UPDATE row; `revalidateTag("store-settings")`; re-render with fresh values |

## UX Requirements

Admin surfaces are es-MX only. Apply `emil-design-eng` (calm, restrained, purposeful) — this is an operator tool, not a marketing surface. shadcn/ui first (`Button`, `Input`, `Label` already vendored). Enter animations `ease-out`, respect `prefers-reduced-motion`.

- **Loading**: Login submit → button shows a disabled/pending state (`useActionState` `isPending`), no double-submit. Settings save → pending state on the save button; fields disabled while saving.
- **Empty**: Settings page when `store_settings` row missing → informational state with prefilled seed defaults and a clear "save to create" affordance; NOT a blank crash.
- **Error**: Login → single generic inline error above the form. Settings → field-level errors inline under each field + a top-level banner for non-field errors. Recovery is always "correct and resubmit."
- **Success**: Login → redirect to `/admin`. Settings save → non-blocking success banner ("Configuración guardada"), values visibly updated, form remains editable.
- **Mobile (375px)**: Login card centered, full-width fields, min 44px tap targets. Admin nav collapses to a top bar / simple stacked menu. Settings form single-column, money fields with `inputmode="decimal"`.
- **Tablet (768px)**: Admin nav as a persistent sidebar or top bar; settings form comfortably single-column with max content width; no horizontal scroll.

## Technical Approach

### Files to Create

- `src/lib/admin/session.ts` — `server-only`. `createSessionCookieValue()`, `verifySessionCookieValue(value)`, `isSessionValid(value)` using `node:crypto` `createHmac` + `timingSafeEqual` (mirror `payments/webhook.ts`), enforcing `ADMIN_SESSION_MAX_AGE_SECONDS`. Pure functions on strings — no Next imports (unit-testable).
- `src/lib/admin/auth.ts` — `server-only`. `verifyCredentials(email, password)` (case-insensitive email compare + scrypt constant-time password check against `ADMIN_PASSWORD_HASH`, dummy-hash on unknown email for timing parity). 
- `src/lib/admin/constants.ts` — non-secret constants: `ADMIN_SESSION_COOKIE_NAME`, `ADMIN_LOGIN_PATH`, `ADMIN_ROOT_PATH`, `ADMIN_SESSION_MAX_AGE_SECONDS`, `ADMIN_LOGIN_MAX_ATTEMPTS`, nav item definitions. (No magic values elsewhere.)
- `src/lib/admin/settings-input.ts` — pure validation: parse/validate the settings form (name, email, peso→cents), returns typed result + field errors. Unit-testable, no I/O.
- `src/app/admin/layout.tsx` — server component. Verifies session (defense-in-depth), renders `<html lang="es-MX">` admin chrome + nav + logout. Separate from the storefront `[locale]` layout (no `NextIntlClientProvider`, no cart, no site header/footer).
- `src/app/admin/page.tsx` — admin home = Store Settings screen (or redirect to `/admin/settings`; pick one, be consistent). Renders the settings form seeded from the live row.
- `src/app/admin/login/page.tsx` — login screen (redirects to `/admin` if already authed, AC-7).
- `src/app/admin/actions.ts` — `"use server"`. `login(prevState, formData)`, `logout()`, `saveStoreSettings(prevState, formData)`. Each mutation re-verifies session (except login). Sets/clears cookie via `next/headers` `cookies()`. Calls `revalidateTag`.
- `src/app/admin/admin-form-state.ts` — serializable state contracts for `useActionState` (login + settings), mirroring `checkout/checkout-form-state.ts` (a `"use server"` file may only export async fns, so state types live here).
- `src/components/admin/admin-nav.tsx` — nav shell (active state, disabled future links, logout button).
- `src/components/admin/store-settings-form.tsx` — `"use client"` form using `useActionState`, pending/error/success states.
- Tests alongside: `session.test.ts`, `auth.test.ts`, `settings-input.test.ts` (QA stage expands).

### Files to Modify

- `src/middleware.ts` — add an `/admin` branch: keep next-intl for storefront paths, but for `/admin/*` run the session guard (redirect to `/admin/login` when unauthenticated; allow `/admin/login`). Ensure `/admin` is processed and NOT locale-rewritten by next-intl. Keep verification **Edge-runtime-safe** — see research report Risk R1: if `node:crypto` is unavailable in the Edge middleware runtime, do a lightweight Web Crypto signature check in middleware and the full authoritative check in the layout, and document the split.
- `src/lib/env.ts` — add `getAdminEnv()` returning `{ email, passwordHash, sessionSecret }`, all required, `server-only`, following the exact `getMercadoPagoEnv`/`getEmailEnv` pattern (named `MissingEnvVarError`).
- `.env.local` (+ document in `dev-done.md`) — add `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET` placeholder values and a note on generating the scrypt hash. Never `NEXT_PUBLIC_`.
- `src/lib/store-settings.ts` — likely NO change (bust-on-save tag already exists); optionally add `updateStoreSettings(input)` here (admin-client write + `revalidateTag`) to co-locate the write path with the read path (SRP).

### Data Model Changes

- **None expected.** `store_settings` singleton + all CHECKs, the singleton unique index, and the `updated_at` trigger already exist (migrations 0003/0006). T10 writes are pure UPDATEs via the admin client. If Dev finds a genuine gap (e.g. an UPSERT-safe path for the missing-row edge), add idempotent migration `0011_*.sql`; otherwise document "no migration needed" (AC-14).

### API Endpoints

No REST endpoints. All server-side work via **server actions** (`src/app/admin/actions.ts`), matching the checkout/Q&A pattern:
- `login(prevState, FormData{email,password})` → `AdminLoginState`
- `logout()` → redirect
- `saveStoreSettings(prevState, FormData{store_name, contact_email, shipping_flat_rate, free_shipping_threshold})` → `AdminSettingsState`

### Dependencies

- **None new.** `node:crypto` (built-in) for HMAC/scrypt/timingSafeEqual (already used in `payments/webhook.ts` + `payments/refund.ts`). shadcn/ui primitives already vendored. `next-intl` unaffected. Do NOT add an auth library (`next-auth`, `lucia`) — overkill for one hardcoded Owner and would fight the RLS role model.

## Out of Scope

- Multiple admin users, roles (Owner/Staff), invitations, registration — Phase 2.
- Password reset / "forgot password" — Phase 2 (owner rotates via `ADMIN_PASSWORD_HASH` env + redeploy).
- Product management, order management, Q&A answering, inventory — T11/T12 (this task only stubs their nav slots).
- Admin i18n / English admin UI — deferred (single-locale es-MX by decision above).
- Any change to storefront auth, cart, or the `anon`/`authenticated` RLS roles.
- 2FA, session revocation lists, "remember me", device management — not in Phase 1 spec.
- Store settings beyond the four named fields (currency stays MXN, seeded, not user-editable in Phase 1).
