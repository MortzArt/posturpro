# Dev Summary: T16 — B2B landing page (`/empresas`, offices + quote form)

Standard pipeline, S3 (Dev). Feature type: full-feature. The page reuses two shipped
stacks — the T13 contact-relay flow (form → action → guard → rate-limit → email template →
dispatch) and the T15 Casa de Azulejo world (home components, image slots, motion). Only the
genuinely new (offices purpose, quote field-set + team-size enum, the 2 new UI files, the new
relay template + dispatch seam, nav/footer/i18n wiring) was authored; everything else composes.

## Files Changed

### Created (13)
| Path | Change | Summary |
|------|--------|---------|
| `src/lib/config/quote.ts` | created | Non-secret tunables: field caps, `QUOTE_TEAM_SIZES` enum + `isQuoteTeamSize` guard (single source for the `<select>` AND the server membership check), dedicated limiter tunables, `QUOTE_SUCCESS_FEEDBACK_MS`. |
| `src/lib/quote/submit-guard.ts` | created | PURE `validateQuoteSubmission` — trim → control-char strip on company+name → length caps → `EMAIL_PATTERN` shape → **team-size enum membership** (edge 1) → returns trimmed+validated `values` only when `ok`. `isQuoteHoneypotTripped`. Typed field/error unions. |
| `src/lib/quote/rate-limit.ts` | created | DEDICATED `createSlidingWindowLimiter` INSTANCE (own key-space) + `checkQuoteRateLimit(ip, now?)` + `QUOTE_RATE_LIMIT_DISABLED=1` server-only hatch + `resetQuoteRateLimitState`/`quoteRateLimitKeyCount`. Isolated from contact's bucket (edge 4). |
| `src/lib/email/templates/quote-relay.ts` | created | PURE `renderQuoteRelay(input, chrome)` → `RenderedEmail`, es-MX owner-facing. Renders all 6 fields; needs body quoted verbatim + `escapeHtml`; es-MX team-size labels; subject `Solicitud de cotización de {company}`. `QuoteRelayInput` exported. Mirrors `contact-relay.ts` structure. |
| `src/components/b2b/b2b-sections.tsx` | created | `B2BPillars` + `B2BProcess` — two small pure SERVER components (grout tiles on `bg-card`, roman-caps titles, `.enter-fade` mount + `.stagger` cascade, no hover motion). Props take `IconSvgElement` + pre-resolved strings. Process seals number the steps (sequence = information). |
| `src/app/[locale]/empresas/quote-form-state.ts` | created | Serializable `QuoteFormState` + `QuoteFormValues` + `initialQuoteFormState` (outside the `"use server"` module). |
| `src/app/[locale]/empresas/actions.ts` | created | `"use server"` `submitQuoteForm` — honeypot→fake success / validate→invalid / rate-limit→rate-limited / `sendQuoteRelay`→success\|error. Never throws to client; raw reason logged server-side only. |
| `src/app/[locale]/empresas/quote-form.tsx` | created | The sole client island. Clones contact-form grammar (`useActionState`, off-screen `company_url` honeypot, full state matrix, first-invalid focus walk, success clear+focus+auto-hide, Retry). 4 short fields pair 2-up on `sm`; inline `SelectField` = labeled NATIVE `<select>` over `QUOTE_TEAM_SIZES`. Live `CharacterCounter` on needs only. |
| `src/app/[locale]/empresas/page.tsx` | created | Bespoke static RSC. `generateMetadata` (empresas.metadata, both locales); `readB2BBrands` try/catch→`[]`; composes §1 Hero → §2 pillars → §3 process → §4 brands (omitted if empty) → §5 form. No `notFound()` gate (copy-driven, edge 6). |
| `src/lib/quote/submit-guard.test.ts` | created | Field matrix + enum accept/empty/tamper/near-miss + control-char strip + honeypot. |
| `src/lib/quote/rate-limit.test.ts` | created | Per-IP window, disable hatch, **quote↔contact isolation both directions + independent key counts** (edge 4). |
| `src/lib/email/templates/quote-relay.test.ts` | created | Every field in HTML + text, phone fallback, unknown team-size fallback, needs escaped verbatim, hostile company/name escaped, single-line subject. |
| `src/app/[locale]/empresas/actions.test.ts` | created | Branch map: happy / trimmed-relay / verbatim-needs / invalid+preserved / enum-tamper / enum-empty / 100k cap / rate-limited / honeypot / {ok:false} / throw / non-Error throw / gate ordering. |
| `e2e/empresas-quote.spec.ts` | created | Both-locale 200 + sections, no-overflow 375/768, hero anchors, labeled fields + native select + off-screen honeypot, validation, error-on-submit + preserved values, nav+footer zero-dead-links. |

### Modified (10)
| Path | Change | Summary |
|------|--------|---------|
| `src/lib/config.ts` | modified | `export * from "./config/quote"` barrel re-export. |
| `src/lib/config/imagery.ts` | modified | `+ B2B_HERO_IMAGE` (`string \| null`, 4/3, licensed office-workspace photo, degrades to Building glyph). |
| `src/lib/email/dispatch.ts` | modified | `+ sendQuoteRelay(input)` seam beside `sendContactRelay` (owner-addr guard → render → `sendWithTimeout` → `replyTo = visitor email`; NO ledger). Imports `renderQuoteRelay`. |
| `src/components/home/hero.tsx` | modified | `+ fallbackIcon?: IconSvgElement` prop (default `Chair01Icon` — homepage unchanged); B2B passes `Building06Icon` so the null-degrade reads "offices". |
| `src/components/layout/nav-items.ts` | modified | Extend closed `key` union with `"offices"`; append `{ key: "offices", href: "/empresas" }` (flows into desktop header + mobile drawer automatically). |
| `src/components/layout/nav-items.test.ts` | modified | Assert 5 items incl. `offices → /empresas`. |
| `src/components/layout/site-footer.tsx` | modified | `offices` first entry in `STORE_LINKS` (no new column). |
| `src/messages/es-MX.json`, `src/messages/en.json` | modified | `+ empresas` namespace (62 keys) + `nav.items.offices` + `footer.links.offices`, in lockstep. Parity: zero asymmetry. |
| `src/messages/keys-used.test.ts` | modified | Registered all new `empresas.*` + `nav.items.offices` + `footer.links.offices` in `CONSUMED_KEYS`. |
| `playwright.config.ts` | modified | `+ QUOTE_RATE_LIMIT_DISABLED=1` in the e2e webServer env. |

### Asset + provenance
| Path | Change | Summary |
|------|--------|---------|
| `public/images/b2b/office-workspace.jpg` | created | Licensed Unsplash photo (EFFYDESK, `photo-1688578735997-32626d2babd4`, `ElELSfycRvw` — a woman in an ergonomic office chair at a desk). 4/3 · 1400×1050 · 261 KB (≤300 KB). |
| `public/images/SOURCES.md` | modified | Appended the `B2B_HERO_IMAGE` row with source URL + photographer + profile. |

## Data-Testids Added
- `b2b-pillars`, `b2b-pillar-tile` — value section (b2b-sections.tsx)
- `b2b-process`, `b2b-process-step` — process section (b2b-sections.tsx)
- `quote-form` — the form (quote-form.tsx)
- `quote-company` / `quote-name` / `quote-email` / `quote-phone` / `quote-teamSize` / `quote-needs` — fields
- `quote-company-error` … `quote-needs-error`, `quote-teamSize-error` — field errors
- `quote-counter` — needs char counter
- `quote-submit` — submit button
- `quote-success` (role=status) / `quote-form-error` / `quote-rate-limited` (role=alert) — banners
- (hero reuses `hero-cta-catalog` / `hero-link-brands` / `hero-image-fallback`; footer reuses `footer-link-offices`)

## Key Decisions
- **Team-size `<select>` is uncontrolled + `key={`teamSize-${submissionId}`}`.** React 19's `<form action>` resets an uncontrolled `<select>` back to its placeholder after the action; re-keying per submission remounts it with the preserved `defaultValue`, so the chosen range survives an `invalid`/`rate-limited`/`error` re-render for retry. Text inputs preserve natively (real DOM edits) — only the select needed this. Verified live + by e2e.
- **`IconSvgElement`, not `IconSvgObject`.** The UI spec named `IconSvgObject`; the actual `@hugeicons/react` export is `IconSvgElement` — used for the pillar icons and the new hero `fallbackIcon`.
- **NEW `renderQuoteRelay` + `sendQuoteRelay`, not overloaded contact ones** (T9/T13 discipline) — different field set + subject; each stays a simple pure function / a thin dispatch seam.
- **Dedicated quote limiter instance** — isolated key-space so a quote flood never throttles a legitimate contact message (edge 4), asserted both directions in the test.
- **`B2B_HERO_IMAGE` filled** (owner decision, consistent with T15) with a verified-provenance EFFYDESK office-workspace photo; still degrades to the Building-glyph blank tile when set to `null`.
- **Numbered process seals are justified** vs. the craft-floor "no section numbers" default: the sequence (request → we reply → tailored quote) IS the information the reader needs.

## Deviations from Ticket / Spec
- **`IconSvgObject` → `IconSvgElement`** (the correct exported type name). No behavioral change.
- **Team-size select preserved via `key`-remount** rather than the spec's plain `defaultValue` — a React-19 form-reset detail the spec didn't anticipate; the visible behavior (selection preserved on error) matches the state matrix exactly.
- No other deviations. Section flow, form layout (2-up short fields + full-width select/needs), copy, nav/footer placement, image slot, and motion all match `tasks/ui-design.md`.

## Edge Cases Handled
1. **Team-size enum tampering** → `teamSizeInvalid` (empty → `teamSizeRequired`); server never trusts client enum text. `submit-guard.ts` + guard/actions tests.
2. **Honeypot filled** → FAKE `{status:"success"}`, `console.warn`, no send, no oracle (short-circuits before validate/IP). `actions.ts` + actions test.
3. **Owner email unconfigured / provider failure** → `sendQuoteRelay` `{ok:false}` → `{status:"error"}`, raw reason logged server-side only, values preserved, Retry. `actions.ts` relay-failure mapping.
4. **Rate-limit flood** → dedicated instance denies over-limit, values preserved; never shares contact's bucket. `rate-limit.ts` + isolation test.
5. **All-whitespace / oversized / control-char fields** → trim→required; `needs` >max capped as `needsTooLong` before the template; CR/LF/control chars stripped from company+name (single-line subject). `submit-guard.ts` + tests.
6. **Missing/unknown locale or empty content tables** → copy-driven (no `static_pages` row, no `notFound()` gate); `readB2BBrands` degrades to `[]` (§4 omitted); `/zz/empresas` → in-shell 404, never 500 (verified live).
7. **`prefers-reduced-motion`** → reused `.enter-fade`/`.stagger` degrade to opacity-only (globals.css).
8. **JS-disabled / slow network** → real `<form action>`; server re-validates trimmed values; the pitch is server-rendered.

## How to Test
1. Visit `http://localhost:3000/empresas` and `/en/empresas` — hero pitch, 3 pillars, 3 process steps, brand strip, quote form all render; labels localize.
2. Submit empty → inline errors on company / needs / team-size; focus lands on company.
3. Enter a bad email → `emailInvalid`. Select a team size, fill valid fields, submit → with no `EMAIL_*` env the error banner shows, values (incl. team size) preserved, button → "Reintentar".
4. Resize to 375px and 768px — single column, no horizontal overflow; the `<select>` uses the OS picker on mobile.
5. Nav "Empresas" (desktop header + mobile drawer) and the footer "Empresas" link both resolve to the live page.
6. Success path (needs full email env): `EMAIL_API_KEY=… EMAIL_FROM_ADDRESS=… EMAIL_OWNER_ADDRESS=dummy EMAIL_DEV_PREVIEW=1 QUOTE_RATE_LIMIT_DISABLED=1 npm run dev` → a valid submit clears the form and shows the `role="status"` success banner (auto-hides after 6s).

## Test Status
- `npx tsc --noEmit`: **clean** (whole project).
- `eslint` (all 23 touched files): **clean**.
- Full unit suite: **1920/1920 passed** (112 files; +174 across the 4 new test files).
- `e2e/empresas-quote.spec.ts`: **20/20 passed** (chromium + mobile).
- Live spot-check on `:3000`: both locales HTTP 200 with all sections/anchors/honeypot/select/hero-image; per-locale metadata; nav+footer links present with localized labels; `/zz/empresas` → in-shell 404.

## Known Limitations
- **Success-path live spot-check is blocked-on-user.** `.env.local` has no `EMAIL_API_KEY`/`EMAIL_FROM_ADDRESS`/`EMAIL_OWNER_ADDRESS`, and Next blocks a second dev server on the port already in use — so a real dev-preview success render couldn't be captured this stage. The relay-ok → success mapping is proven exhaustively at the action level, and `sendQuoteRelay` is byte-for-byte the shipped `sendContactRelay` pattern (owner-guard → render → `sendWithTimeout` → `replyTo`, EMAIL_DEV_PREVIEW path). Default e2e asserts the correct error-on-submit (edge 3), exactly as T13 QA did.
- Quote requests are relayed by email only (no DB persistence / admin inbox) — explicit Out of Scope (a quotes table is a future task).

## Dependencies Added
- **None.** No npm install, no migration, no `next.config.ts` change, no admin/`ui/*`/`:root`/`sans` edit (firewall holds).

## Review + Fix Pass (ReviewFix Stage)

### Issues Found & Fixed

| ID  | Severity | Title | Status | File | Fix Applied |
| --- | -------- | ----- | ------ | ---- | ----------- |
| M-1 | MAJOR | Team-size `<select>` stripped of native dropdown affordance | FIXED | `src/app/[locale]/empresas/quote-form.tsx:461` | Removed `appearance-none bg-none pr-3` → plain `fieldClasses`; native OS arrow restored (ui-design.md §SelectField: "native arrow is acceptable"). `pr-3` was redundant with `fieldClasses`' `px-3`. Only className changed; no test asserted the removed classes. |
| m-1 | MINOR | Honeypot short-circuit is a benign timing oracle | SKIPPED | `src/app/[locale]/empresas/actions.ts:52` | Identical to the shipped/QA'd contact action (spec mandates "mirror contact verbatim"); crude-bot filter, not a timing-resistant control. Noted, not a regression. |
| m-2 | MINOR | `sendQuoteRelay`/`renderQuoteRelay` are a 2nd copy of the contact relay grammar | SKIPPED | `src/lib/email/dispatch.ts:325`, `src/lib/email/templates/quote-relay.ts` | Ticket specified the clone (T9/T13 discipline). Extract a shared `sendOwnerRelay(input, render)` + `quotedBodyHtml` at the THIRD owner-relay (DRY-with-judgment per CLAUDE.md), not at two copies. Backlog. |

### Summary

- Critical: 0/0 fixed
- Major: 1/1 fixed, 0 skipped
- Minor: 0/2 fixed, 2 skipped (both justified: matches shipped precedent / DRY-with-judgment deferred to 3rd copy)

**Verification after fix**: `tsc --noEmit` = 0, `eslint` (changed files) = 0, full unit suite **1920/1920** (112 files) green. The security-critical path (validate + `stripControlChars` mirror + enum server-boundary + `escapeHtml` on every field + error-reason suppression + dedicated-limiter isolation) was verified in code, not trusted from claims. **Verdict: APPROVE, 9/10.**
