# Dev Summary: T10 — Admin foundation

Self-managed HMAC-signed HttpOnly session-cookie auth (NOT Supabase Auth) + a
locale-free `/admin` shell + Store Settings editor. Defense-in-depth guard
(Edge middleware → Web Crypto verify; Node layout + per-action re-verify). es-MX
only. Zero new deps. No migration.

## Files Changed

| Path | Change | Summary |
|------|--------|---------|
| `src/lib/env.ts` | modified | Added `getAdminEnv()` (`email`, `passwordHash`, `sessionSecret`) + `AdminEnv` — server-only, follows the MP/email accessor pattern; throws `MissingEnvVarError` on blank (edge 4 / R5). |
| `src/lib/admin/constants.ts` | created | Non-secret constants: cookie name (`posturpro_admin_session`), paths, `getSessionMaxAgeSeconds()` (8h default, env-overridable), login rate-limit config, `ADMIN_NAV_ITEMS` data-driven nav (Settings live; Products/Orders `soon`). Next-import-free → safe in Edge + client. |
| `src/lib/admin/session-payload.ts` | created | PURE runtime-agnostic codec: base64url encode/decode, `splitCookie`, `decodePayload` (version-checked), `isWithinMaxAge` (AC-5, edge 2). Shared by Node + Edge verifiers (R1). No crypto, no Next. |
| `src/lib/admin/session.ts` | created | `server-only`. AUTHORITATIVE `node:crypto` HMAC-SHA256 sign/verify (`createSessionCookieValue`, `isSessionValid`); constant-time `timingSafeEqual` (mirrors `webhook.ts`), then decode + expiry. |
| `src/lib/admin/session-edge.ts` | created | Edge (`crypto.subtle`) verify for middleware (R1). Same cookie format + secret; constant-time byte compare; fails closed on unset secret. NO `server-only` (throws in Edge). |
| `src/lib/admin/auth.ts` | created | `server-only`. scrypt password hashing (`scrypt$N$r$p$salt$hash`), `verifyCredentials` — case-insensitive email, constant-time password, dummy-hash timing parity on unknown email (R3), never authenticates on missing/unparseable hash (R5). `generatePasswordHash` for the dev/deploy hash command. |
| `src/lib/admin/login-rate-limit.ts` | created | Per-IP login limiter via the shared `sliding-window` core (AC-15); `ADMIN_LOGIN_RATE_LIMIT_DISABLED=1` e2e escape hatch (mirrors checkout). |
| `src/lib/admin/settings-input.ts` | created | PURE settings parser (AC-8, AC-10, edges 6/7, R7): strict `^\d+(\.\d{1,2})?$` money after `$`/space strip (rejects thousand separators, accepts 0/0.00, cents-overflow guard), name 1–200, email via shared `EMAIL_PATTERN`. Collects all field errors. |
| `src/lib/admin/session-guard.ts` | created | `server-only`. `hasValidAdminSession()` — thin `next/headers cookies()` → `isSessionValid` wrapper for server components; a missing-env failure → not authenticated (never "valid"). |
| `src/lib/store-settings.ts` | modified | Added `updateStoreSettings()` (admin-client write to the singleton; UPDATE by id, INSERT on missing-row edge 8; `updateTag(STORE_SETTINGS_CACHE_TAG)` busts the storefront read, AC-9). Co-located with the read path (SRP). |
| `src/middleware.ts` | modified | Added a tight `/admin` branch that returns BEFORE next-intl ever sees the request (R2): allow `/admin/login`, redirect unauthenticated `/admin/*` to login, redirect authed `/admin/login`→`/admin` (AC-7). Storefront locale/cart path byte-for-byte unchanged. |
| `src/app/admin/layout.tsx` | created | Parallel ROOT layout: own `<html lang="es-MX">`/`<body>` + font; no next-intl/cart/site chrome; `robots: noindex`. No guard here (login sits under it). |
| `src/app/admin/(app)/layout.tsx` | created | Authenticated sub-layout: authoritative session guard (defense-in-depth) → redirect to login if invalid; wraps children in `AdminShell` seeded with the live store name. |
| `src/app/admin/(app)/page.tsx` | created | `/admin` → `redirect("/admin/settings")` (no dead dashboard). T11/T12 overview seam documented. |
| `src/app/admin/(app)/settings/page.tsx` | created | Server reads live `store_settings`, seeds the form (money → `centsToPesos().toFixed(2)`), flags `rowMissing` (edge 8) with `SEED_*` defaults. |
| `src/app/admin/login/page.tsx` | created | Server login screen; already-authed → `redirect("/admin")` (AC-7); passes only `storeName` to the client (no secret crosses, AC-12). |
| `src/app/admin/actions.ts` | created | `"use server"`: `login` (rate-limit → verify → set cookie → redirect; generic errors, no enumeration; catches `MissingEnvVarError`→"unavailable"), `logout` (maxAge=0 → redirect), `saveStoreSettings` (re-verify session first → parse → write → bust cache). |
| `src/app/admin/admin-form-state.ts` | created | Serializable `AdminLoginState` / `AdminSettingsState` + `initial*` (the `"use server"` state-split rule). |
| `src/components/admin/admin-shell.tsx` | created | `"use client"` chrome: persistent sidebar ≥md, sticky top bar + slide-in drawer <md (reuses `.drawer-panel`/`.drawer-scrim`); active section derived from `usePathname()` (no prop threading). |
| `src/components/admin/admin-nav.tsx` | created | Data-driven nav from `ADMIN_NAV_ITEMS`: live `next/link` (aria-current), `soon` disabled span + "próximamente" `Badge`, shared logout. |
| `src/components/admin/logout-button.tsx` | created | Real `<form action={logout}>` POST (works without JS); full + `compact` presentations. |
| `src/components/admin/admin-page.tsx` | created | Generic section wrapper (title/description/divider) reused by Settings now, T11/T12 later. |
| `src/components/admin/login-form.tsx` | created | `"use client"` `useActionState(login)`: autofocus email, pending label swap + disabled fields, single generic error banner (no per-field blame, AC-3), `.enter-fade`. |
| `src/components/admin/store-settings-form.tsx` | created | `"use client"` `useActionState(saveStoreSettings)`: money fields `inputmode="decimal"` + `$` adornment + `tabular-nums`, inline field errors + focus-first-invalid, success/error/row-missing banners, pending state. |
| `.env.local` | modified (gitignored) | Added `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET` (see below). |

New tests: `session-payload.test.ts`, `session.test.ts`, `session-edge.test.ts`, `auth.test.ts`, `settings-input.test.ts`, `login-rate-limit.test.ts`, `secret-exposure.test.ts` (all colocated under `src/lib/admin/`).

## Data-Testids Added
- `admin-login-form`, `admin-login-email`, `admin-login-password`, `admin-login-submit`, `admin-login-error` — login screen
- `admin-nav-settings` / `admin-nav-products` / `admin-nav-orders`, `admin-logout`, `admin-nav-trigger` / `admin-nav-close` / `admin-nav-panel` / `admin-nav-overlay` — shell + nav
- `admin-settings-form`, `admin-settings-name` (+`-error`), `admin-settings-email` (+`-error`), `admin-settings-flat-rate` (+`-error`), `admin-settings-threshold` (+`-error`), `admin-settings-submit`, `admin-settings-success`, `admin-settings-error`, `admin-settings-row-missing` — settings form

## Env Vars (added to `.env.local`, all SERVER-ONLY, never `NEXT_PUBLIC_`)
- `ADMIN_EMAIL` — Owner login email. Dev value: `admin@posturpro.mx`.
- `ADMIN_PASSWORD_HASH` — scrypt hash `scrypt$N$r$p$saltHex$hashHex`. Dev password: **`posturpro-dev-2026`**.
- `ADMIN_SESSION_SECRET` — 32-byte hex HMAC key (rotating it logs everyone out, edge 3).
- Optional: `ADMIN_SESSION_MAX_AGE_SECONDS` (default 28800 = 8h), `ADMIN_LOGIN_RATE_LIMIT_DISABLED=1` (e2e escape hatch).

**Generate a real hash for a deploy:**
```bash
node -e 'const{randomBytes,scryptSync}=require("node:crypto");const s=randomBytes(16);const d=scryptSync(process.argv[1],s,64,{N:16384,r:8,p:1});console.log(["scrypt",16384,8,1,s.toString("hex"),d.toString("hex")].join("$"))' "YOUR_PASSWORD"
```

## Key Decisions
- **`updateTag` over `revalidateTag`**: Next 16 made `revalidateTag(tag)` deprecated (now needs a `profile` 2nd arg + logs a warning). `updateTag(tag)` is the single-arg replacement with immediate expiration — exactly the AC-9 "reflect on next render" semantics. Only valid inside a server action, which is the sole caller.
- **Route group `(app)` for the guard**: the authoritative session guard + shell live in `admin/(app)/layout.tsx`, so the sibling `/admin/login` renders the clean root layout without being redirected by its own guard. `(app)` doesn't affect URLs.
- **Active section from `usePathname()`** in `AdminShell`, not a prop — T11/T12 add sections without threading a prop through every page.
- **scrypt over bcrypt/argon2**: zero new deps, no native bindings; strong KDF in `node:crypto` (ticket decision).
- **Web Crypto in middleware, node:crypto authoritative** (R1): shared payload codec keeps both in lockstep; middleware is a fast UX gate, the layout/actions are the trust boundary.

## Deviations from Ticket/Spec
- **File names/locations**: spec listed `admin/page.tsx` + `admin/settings/page.tsx`; implemented as `admin/(app)/page.tsx` + `admin/(app)/settings/page.tsx` (route group) so the guard wraps authed pages without catching `/admin/login`. `admin-shell.tsx` and `logout-button.tsx` were extracted from the layout for SRP + reuse (spec allowed either). No behavioral deviation.
- **Cache bust API**: `updateTag` instead of `revalidateTag` (justified above) — same effect, avoids the Next 16 deprecation warning. The `STORE_SETTINGS_CACHE_TAG` constant is unchanged and shared.
- **`money-required` vs blank**: blank money is its own error ("Ingresa un monto (usa 0 para gratis)."), distinct from 0 (valid) — matches edge 6/7 intent.

## Edge Cases Handled
1. Forged/tampered cookie → signature mismatch → `false` → redirect (`session.ts`, `session-edge.ts`; tests).
2. Expired-but-signed cookie → `isWithinMaxAge` false → redirect (`session-payload.ts`; tests).
3. Secret rotation → all cookies fail HMAC → re-login (test: "different secret").
4. Missing admin env → `login` catches `MissingEnvVarError` → generic "no disponible", grants nothing; guard treats it as unauthenticated (`actions.ts`, `session-guard.ts`; test).
5. Concurrent save → last-write-wins on the singleton (single-owner; `updated_at` trigger).
6. Money 0 / 0.00 valid for both fields (`settings-input.ts`; tests).
7. Locale-formatted money (`1,000.00`, `1.000,00`, `$500`) → strip `$`/space, reject separators, never coerce (`settings-input.ts`; tests).
8. `store_settings` row absent → settings page seeds `SEED_*` + info banner; first save INSERTs the singleton (`store-settings.ts`, `settings/page.tsx`).
9. Direct POST to `saveStoreSettings` without a session → `requireSession()` re-verifies → redirect, DB untouched (`actions.ts`).
10. `/admin/`, `/admin` case/slash variants → verified via curl (307/308 to login; storefront `/`, `/en` unaffected).

## How to Test (manual)
1. `GET /admin` unauthenticated → 307 to `/admin/login` (verified: no admin markup in body).
2. Log in at `/admin/login` with `admin@posturpro.mx` / `posturpro-dev-2026` → cookie set (HttpOnly, Path=/admin) → `/admin` → `/admin/settings`.
3. Edit shipping flat rate / threshold in pesos → Guardar → "Configuración guardada."; storefront footer/checkout reflect new shipping on next render.
4. Try `1,000.00` in a money field → field error "Usa punto decimal y sin separadores…"; form stays filled.
5. Wrong password → "Correo o contraseña incorrectos." (same for unknown email — no enumeration).
6. Cerrar sesión → cookie cleared → `/admin/login`; `GET /admin` redirects again.
7. Verified live on the running dev server: `/`=200, `/en`=200, `/admin`=307→login, `/admin/login`=200, `/admin/settings`(unauth)=307→login, `/admin/`=308→`/admin`.

## Verification Results
- `npx tsc --noEmit` → 0 errors.
- `npx eslint` (admin lib/app/components + middleware/env/store-settings) → clean.
- `npx next build` (NEXT_QA_DIST_DIR=.next-t10-build) → exit 0; admin routes dynamic, storefront routes unchanged, middleware compiled (Edge Web-Crypto OK). Build dir removed; `tsconfig.json` restored clean.
- Unit: full suite **1342/1342 (75 files)** — baseline 1281 + 61 new admin tests. (One run showed a single pre-existing flake in `payment-panel.test.tsx` re: `window.location.assign`; passes 17/17 in isolation and the immediate re-run was 1342/1342 — unrelated to T10, which touches no payment/window code.)
- Integration: not run — T10 adds no migration and no new DB RPC; the only DB touch is the existing `store_settings` singleton via the admin client. `AC-14: NO migration needed` (row + CHECKs + singleton index + `updated_at` trigger already exist, migrations 0003/0006; writes are pure UPDATE/INSERT). Migrations remain 0001..0010.
- Storefront regression (R2): `/` and `/en` return 200 with the middleware change live; admin branch returns before next-intl.
- DB left pristine (no seed/reset run). No stray servers started (used the existing session's dev server for read-only curl checks; the prod build used a temp dist dir, now deleted).

## Seams for T11/T12
- **Nav**: flip `ADMIN_NAV_ITEMS[products|orders].status` to `"live"` + set `href` in `src/lib/admin/constants.ts` — no JSX change. `AdminShell` auto-resolves the active section from the path.
- **New sections**: add `src/app/admin/(app)/products/page.tsx` (and `/orders`) — they inherit the guard + shell automatically.
- **Dashboard**: replace the `redirect` in `admin/(app)/page.tsx` with an `AdminPage` overview.
- **Settings write path**: `updateStoreSettings` in `store-settings.ts` is the template for future admin writes (admin client + `updateTag`).
- **Session/guard**: `hasValidAdminSession()` (server components) + `requireSession()` pattern (in `actions.ts`) are reused verbatim by every future admin page/mutation. T12 refund/email wiring re-verifies the session the same way before calling the server-only refund/email modules.

## Known Limitations
- Single Owner, no roles/registration/reset (Phase 2, out of scope).
- Rate limiter + session are per-instance in-memory (best-effort, documented); fine for a single-owner low-traffic surface.
- Full login→settings e2e (server-action POST) is left to QA (Stage 7); the auth/session/parse cores are unit-tested and the round-trip was verified at the Node level against the real `.env.local`.

## Dependencies Added
- None. `node:crypto` (scrypt/HMAC/timingSafeEqual) + Web Crypto (`crypto.subtle`) are built-in; shadcn `Button`/`Badge` + Radix `Dialog`/`FocusScope` already vendored.
