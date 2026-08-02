# Code Review + Fix: T16 — B2B landing page (`/empresas`, offices + quote form)

## Summary

Standard S4 (ReviewFix), single-pass over all 29 files of S3 commit `f713355`. The
implementation is a faithful, well-hardened clone of the shipped T13 contact stack composed
into the T15 Casa de Azulejo world — the risk-center (public input → owner email) is genuinely
mirrored, not just claimed. One MAJOR affordance regression was found and FIXED inline (the
team-size `<select>` had its native dropdown arrow stripped with no replacement, against the
binding ui-design spec). No critical issues. All 14 ACs verified in code; the 8 edge cases hold.
`tsc`, `eslint`, and the full 1920-test unit suite are green after the fix.

## Issues Found & Resolved

### Critical Issues

None found. The public write path is correctly ordered (honeypot → validate → rate-limit →
relay), every user field is trimmed + length-capped, company/name are additionally
control-char-stripped (T13 `stripControlChars` genuinely mirrored — verified byte-for-byte),
the team-size enum is membership-checked server-side (tampered value rejected as
`teamSizeInvalid`, never reaches the template), the relay template HTML-escapes every field
via `renderParagraph`'s default `escape=true` + explicit `escapeHtml` on the needs body, the
raw provider reason is logged server-side only and never surfaced, and the action never throws
to the client. No secret/config leakage in the serializable state.

### Major Issues

#### M-1: Team-size `<select>` stripped of its native dropdown affordance

- **Severity**: MAJOR
- **File**: `src/app/[locale]/empresas/quote-form.tsx:461`
- **Problem**: The native `<select>` used `className={cn(fieldClasses, "appearance-none bg-none pr-3")}`.
  `appearance-none bg-none` removes the browser's native dropdown chevron, and no replacement
  chevron (background image or sibling icon) was provided. The control renders visually
  identical to a plain text input — no affordance that it opens a picker.
- **Impact**: Discoverability/recognition regression (a user cannot tell it is a dropdown);
  also an undocumented deviation from the BINDING ui-design spec (`tasks/ui-design.md` §SelectField,
  line 304: *"The native arrow is acceptable; add `appearance-none` + a background chevron ONLY
  if it clashes"*). It was not among the 2 documented deviations.
- **Fix Applied**: Dropped `appearance-none bg-none pr-3`; the control now uses `fieldClasses`
  verbatim, restoring the native OS dropdown arrow (the spec's default, explicitly "acceptable").
  `pr-3` was redundant with the `px-3` already in `fieldClasses`. Added a comment citing the spec.
- **Status**: FIXED

### Minor Issues

#### m-1: Honeypot short-circuit is a (benign) timing oracle

- **File**: `src/app/[locale]/empresas/actions.ts:52`
- **Suggestion**: The honeypot fake-success returns before validate/rate-limit/relay, so a
  honeypot-tripped response is measurably faster than a real submission. In principle a bot
  could time-distinguish it.
- **Status**: SKIPPED — identical to the shipped, QA'd contact action (the spec mandates
  "mirror contact verbatim"); the honeypot targets crude bots, not timing-attack-resistant
  adversaries, and adding artificial delay would be a speculative change to a proven pattern.
  Noted for the record, not a regression.

#### m-2: `renderQuoteRelay` / `sendQuoteRelay` are a second copy of the contact relay grammar

- **File**: `src/lib/email/templates/quote-relay.ts`, `src/lib/email/dispatch.ts:325`
- **Suggestion**: `sendQuoteRelay` is byte-for-byte `sendContactRelay` (owner-guard → render →
  `sendWithTimeout` → `replyTo`); `quotedNeedsHtml` duplicates `quotedMessageHtml`. Two copies
  now exist. The ticket explicitly specified a clone (separate template/seam per T9/T13
  discipline), so this is correct for now.
- **Status**: SKIPPED (backlog) — three copies is the refactor trigger; a shared
  `sendOwnerRelay(input, render)` helper + a shared `quotedBodyHtml` should be extracted when a
  third owner-relay lands. Not actioned this stage (two copies, DRY-with-judgment per CLAUDE.md).

## Acceptance Criteria Verification

| #     | Criterion                                              | Status | Evidence                                                                                                   |
| ----- | ------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------- |
| AC-1  | Renders at both locales in storefront shell            | PASS   | `page.tsx` bespoke route; layout gates unknown locale via `notFound()`; sections in `.theme-storefront`    |
| AC-2  | Persuade structure (hero/value/process/form)           | PASS   | `page.tsx:175-235` — Hero → B2BPillars → B2BProcess → (brands) → QuoteForm; CTA `#cotizacion` anchor       |
| AC-3  | Zero fabricated proof                                  | PASS   | Grep of `empresas` copy: only team-size ranges + "10 digits" placeholder; no counts/testimonials/logos    |
| AC-4  | 6 fields incl. constrained team-size `<select>`        | PASS   | `quote-form.tsx` fields; `SelectField` over `QUOTE_TEAM_SIZES`; all labels from i18n both locales           |
| AC-5  | Valid submit relays via `sendQuoteRelay`/`renderQuoteRelay`, replyTo=visitor | PASS | `dispatch.ts:325` `replyTo: input.fromEmail`; `quote-relay.ts` renders all 6 fields |
| AC-6  | Full serializable state matrix                         | PASS   | `quote-form-state.ts` union; form effects clear+focus+auto-hide / preserve on failure; error never leaks reason |
| AC-7  | Abuse controls in order (honeypot→validate→rate-limit) | PASS   | `actions.ts:52-90`; dedicated limiter instance `rate-limit.ts:22`; server-only `QUOTE_RATE_LIMIT_DISABLED` hatch |
| AC-8  | Nav + footer links, both locales, zero dead            | PASS   | `nav-items.ts:23`; `site-footer.ts:37`; `nav-items.test.ts` asserts `offices → /empresas`                   |
| AC-9  | Per-page `generateMetadata` both locales               | PASS   | `page.tsx:50-62` locale-resolved title+description, no shared helper (matches contact precedent)            |
| AC-10 | DESIGN.md compliance; admin firewall                   | PASS   | Cobalt tiles/roman-caps; `string\|null` hero slot degrades to Building glyph; `.enter-fade`/`.stagger` reduced-motion-gated; no admin/`ui/*` edit |
| AC-11 | WCAG AA; labeled fields + `aria-describedby`; native select | PASS | `aria-invalid`/`aria-describedby` wired; native `<select>` (arrow restored, M-1); status = glyph+text        |
| AC-12 | No overflow at 375/768                                  | PASS   | `grid-cols-1 sm:grid-cols-2`, `max-w-(--breakpoint-xl)`, `break-words`; e2e asserts no-overflow (per dev)   |
| AC-13 | Exact bilingual parity; keys-used updated               | PASS   | Parity script: 0 asymmetry, 62 `empresas` keys; keys-used registers all + nav/footer keys                   |
| AC-14 | Unit tests + e2e; tsc/eslint/suite green                | PASS   | 1920/1920 unit; action branch matrix exhaustive; `tsc`=0, `eslint`=0 post-fix                               |

## Edge Case Verification

| # | Edge Case                              | Status  | Evidence                                                                                     |
| - | -------------------------------------- | ------- | -------------------------------------------------------------------------------------------- |
| 1 | Team-size enum tampering               | HANDLED | `submit-guard.ts:141` `isQuoteTeamSize`; action test `teamSizeInvalid` / empty→`teamSizeRequired` |
| 2 | Honeypot filled                        | HANDLED | `actions.ts:52` fake success + `console.warn`, no send; test asserts even with other invalid fields |
| 3 | Owner email unconfigured / send fail   | HANDLED | `dispatch.ts:326` `{ok:false,reason:"owner address unavailable"}` → `{status:"error"}`, reason logged only |
| 4 | Rate-limit flood, isolated from contact| HANDLED | Dedicated `limiter` instance (`rate-limit.ts:22`); isolation asserted both directions (per dev)  |
| 5 | Whitespace / oversized / control-char  | HANDLED | Trim→required; `needsTooLong` cap; `stripControlChars` on company+name (mirrors contact, verified) |
| 6 | Missing/unknown locale, empty tables   | HANDLED | Layout `notFound()` gates `/zz/empresas`; copy-driven (no `static_pages`); `readB2BBrands`→`[]`  |
| 7 | `prefers-reduced-motion`               | HANDLED | `.enter-fade`/`.stagger` have reduce blocks (globals.css:426,542); no new keyframes             |
| 8 | JS-disabled / slow network             | HANDLED | Real `<form action>`; server re-validates trimmed values; pitch is server-rendered              |

## Fix Summary

- Critical: 0/0 fixed
- Major: 1/1 fixed (M-1 select affordance), 0 skipped
- Minor: 0 fixed, 2 skipped (m-1 benign/matches precedent; m-2 DRY-with-judgment, backlog at 3rd copy)

## Quality Score: 9/10

Disciplined, faithful reuse of two shipped stacks; the security-critical path (validate + enum +
control-char strip + escape + error-reason suppression + limiter isolation) is correct and
exhaustively tested. One point off for the M-1 spec-deviating select-affordance strip that
shipped undocumented — a real (if small) UX regression the dev summary did not flag. Fixed inline.

## Recommendation: APPROVE

All critical/major issues are fixed inline and verified (`tsc`=0, `eslint`=0, 1920/1920 unit
tests green). Both skipped minors are justified (matches shipped precedent / DRY-with-judgment
deferred to the third copy). Ready for S5 QA.
