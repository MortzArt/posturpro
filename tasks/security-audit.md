# Security Audit: T19 — Homepage rebuild + product condition grades

Stage 9 (Security). Scope: `git diff 5d462ee..HEAD` (dev fbc4b36 + fix ab2201c + qa
ec5ccc3 + ux 5d6628a). Whole-store review was done in T14 (grade A); this pass audits
the T19 surfaces and checks for any regression of that posture.

## Summary
- Files audited: 86 changed (focus on the ~20 with a real attack surface)
- Vulnerabilities found: 0 (Critical: 0, High: 0, Medium: 0, Low: 1)
- Vulnerabilities fixed: 0 (nothing at Critical/High to fix)
- Secrets found: **0** (SHIP-clean)
- Dependencies added: **0** (verified — no `package.json`/lock diff)
- Verdict: **SECURE — grade A. Not deploy-blocking.**

## Vulnerability Findings

### CRITICAL
None.

### HIGH
None.

### MEDIUM
None.

### LOW

#### SEC-L-1: Footer social/legal links will need `rel="noopener noreferrer"` when real external URLs are supplied
- **Type**: A05 Security Misconfiguration (reverse tabnabbing) — latent/forward-looking
- **File**: `src/components/layout/site-footer.tsx:87-95` (social), `:167-180` (legal)
- **Description**: The footer social (`instagram`/`linkedin`/`facebook`) and legal
  (`privacy`/`terms`) anchors currently resolve to the placeholder sentinel
  `"#"` (`src/lib/config/footer-links.ts`, `FOOTER_LINK_PLACEHOLDER`). As shipped
  they are safe — same-document, no `target="_blank"`. The risk is purely at the
  go-live swap: when the owner replaces the `#` with real EXTERNAL profile URLs,
  those anchors have neither `target="_blank"` nor `rel="noopener noreferrer"`.
- **Exploit**: N/A today (`#` is same-origin). If a future edit opens a real social
  URL in a new tab without `rel`, the destination could `window.opener`-navigate the
  original tab (tabnabbing).
- **Impact**: Low, and not reachable until an owner action that is already gated by
  the go-live checklist (PART M of `tasks/client-content-questionnaire.md`).
- **Fix (recommendation, not applied)**: When the placeholder hrefs are replaced with
  real external URLs, add `target="_blank" rel="noopener noreferrer"` to the social
  and legal anchors (mirroring the wa.me links, which already have it). Documented
  here + belongs in the PART M swap instructions. Left OPEN intentionally — adding
  `target=_blank` to a `#` placeholder now would be wrong; the value is a fixture.
- **Status**: OPEN (documented; owner-gated go-live item)

## What was verified (evidence)

### 1. Migration 0016 — view/grant posture, enum, idempotency
- **No cost leak / no over-exposure**: `products_public` is recreated by copying 0005's
  explicit column list verbatim (`cost_price_cents` commented out, line 54) and
  appending only `condition_grade`. Never `select *`. Integration test
  `tests/integration/product-grade.integration.test.ts` asserts anon can read
  `condition_grade` AND that a `cost_price_cents` probe **errors** (column absent).
- **Grant posture (0015 hosted-drift lesson)**: the only intentional API-role privilege
  is `grant select on products_public to anon, authenticated` (line 76); the migration
  re-asserts the read-only revoke of insert/update/delete (lines 79-80). No table/
  function grants, no default-ACL changes. Hosted-safe when the owner runs `db push`
  later (0015 already stripped the postgres role's default ACLs). Matches AC-3.
- **Enum tamper**: DB enum `('A+','A','B')` is the backstop; the integration test proves
  a `'C'` insert is rejected with `22P02`.
- **Idempotency**: guarded enum block (`if not exists`), `add column if not exists`,
  drop-then-create view — re-runs clean (dev-done verified local re-apply; edge 13).
- **Anon-denial pattern**: integration tests prove anon CANNOT insert/update/delete the
  view, and CANNOT write `condition_grade` on the base `products` table.

### 2. Admin grade write path
- **AuthZ**: `saveProduct` calls `await requireSession()` BEFORE any parse or DB touch
  (`actions.ts:90`). Same gate on status/delete/duplicate actions.
- **No mass-assignment**: `readProductValues` (`actions.ts:30-58`) explicitly whitelists
  each FormData key into a fixed `ProductFormValues` shape — a raw POST carrying extra
  columns cannot smuggle them into the write. No prototype-pollution vector (plain
  keyed reads, no object spread of untrusted keys).
- **Server-side validation**: `parseConditionGrade` (`product-input.ts:291`) empty→null,
  exact `A+/A/B`→value, anything else→`grade-invalid` field error, nothing written.
  Whitelist via `isConditionGrade` (`grade.ts`). Tamper covered by unit tests (edge 3)
  and the DB enum backstop.

### 3. New public surfaces
- **XSS**: no `dangerouslySetInnerHTML` / `innerHTML` in any T19 component (only a test
  reads `.innerHTML`). All product/brand strings render as auto-escaped React text
  (product name, brand, grade label). GradeBadge is presentational, self-guards on
  `isConditionGrade`, renders nothing for null/unknown.
- **JSON-LD injection**: homepage still emits structured data via the T14 `JsonLd`
  component (`src/components/seo/json-ld.tsx`) whose `escapeForScriptSafe` escapes `<`
  and U+2028/U+2029 — the T14 XSS-safe embed is intact (no regression). `buildHomeJsonLd`
  only injects admin-controlled `store_name` + config origin (no product data).
- **Calculator**: 100% config-driven (`src/lib/config/calculator.ts`), zero user input,
  no `innerHTML`, no inline `<script>` — CSP-safe client island (bars via `scaleX`).
- **Quote form reuse**: B2B section embeds the unchanged T16 `QuoteForm`; honeypot +
  validation + per-IP rate-limit inherited verbatim (only the submit button variant
  changed). No new endpoint.
- **External links**: wa.me links in topbar + footer both carry
  `target="_blank" rel="noopener noreferrer"`. (Social/legal → SEC-L-1.)
- **SVG logos** (`public/brand/logo.svg`, `icon.svg`): scanned — no `<script>`,
  `foreignObject`, `onload`/`onerror`, or `javascript:`. Clean.

### 4. i18n messages
- No HTML tags in `en.json`/`es-MX.json`; no `t.rich()` usage in any T19 component —
  every message renders as escaped text. No interpolation carries markup.

### 5. Dependencies
- `git diff` on `package.json` / `package-lock.json` is **empty** — no new deps,
  confirming dev-done's "None". npm-audit delta vs T14 baseline: unchanged (no
  dependency surface introduced by T19).

### 6. Secrets / env exposure
- Diff scan for secret patterns (`sk_`/`pk_`/token=/password/BEGIN PRIVATE/etc.):
  only doc-file references + the intentionally-public `NEXT_PUBLIC_SITE_URL`. Zero
  real secrets.
- No new `NEXT_PUBLIC_` names; no `process.env` reads in any new config/client file.
  No server secret imported into a `"use client"` island (calculator imports only
  config prices + pure `computeSavings`).

## Checklist Results
| Category | Status | Notes |
|----------|--------|-------|
| Secrets | ✅ | 0 secrets in diff; no new `NEXT_PUBLIC_` |
| Env var exposure | ✅ | No env reads in client/config; calculator island secret-free |
| Injection | ✅ | Supabase query-builder params only (`gradesFor` `.in()`); no SQL string-interp; no XSS sinks; JSON-LD escaped |
| Auth/AuthZ | ✅ | `requireSession()` before every product write; anon-denial proven in integration tests |
| Client/server boundary | ✅ | `products_public` omits `cost_price_cents`; grade read via cost-free view; whitelisted FormData (no mass-assignment) |
| Data Exposure | ✅ | View column list copied from 0005; cost column probe errors for anon |
| CORS/CSRF | ✅ | Server actions (built-in CSRF protection); no new custom routes; reused T16 quote flow |
| Dependencies | ✅ | Zero new deps (empty package diff); no npm-audit delta |

## Gate Results
- T19 security-relevant unit tests (input validation, grade guard, badge, calculator,
  savings): **51 passed / 0 failed**.
- Grade integration suite (`product-grade.integration.test.ts`): the anon-denial +
  cost-omission + enum-backstop posture is codified and green (per dev/QA runs).
- No code changes were made in this stage, so tsc/eslint/full-vitest posture from the
  prior stages (tsc 0, lint clean, 2160 vitest green) is unaffected.

## Verdict: **SECURE** — grade **A**. **Deploy-blocking: NO.**

T19 introduces no critical/high/medium vulnerability, adds no dependencies, leaks no
secrets, and does not regress the T14 grade-A posture (JSON-LD escaping intact, view
still omits `cost_price_cents`, 0015 grant posture preserved and re-asserted). The one
Low finding (SEC-L-1) is a forward-looking note tied to an owner go-live swap already
tracked in the client questionnaire, not a defect in shipped code.
