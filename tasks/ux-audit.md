# UX Audit: T14 — SEO, Analytics & Launch Hardening (LIGHTWEIGHT pass)

**Stage 8 (UX) — full-cycle pipeline.** Scope per orchestrator: T14 mandates
ZERO visual change on everything it touched except ONE intended fix (the contact
character counter). No cookie banner shipped (cookieless-analytics decision →
AC-B2 N/A). This pass verifies that (a) the one visible fix is correct, and
(b) T14 changed nothing else visible on the pages it touched. It does NOT run a
full polish; it does NOT gold-plate invisible SEO surfaces.

## Verdict: **CLEAN — no regressions found, no fixes required.**

Every touched storefront surface was checked live against a **prod build +
`next start`** (`NEXT_PUBLIC_SITE_URL=https://posturpro.mx`, seeded local DB) in
both locales at 375px and 1024px. The single intended visible delta (contact
counter) is correct and live-updating; all other touched pages are visually
unchanged; the invisible SEO layer (JSON-LD/canonical/hreflang) renders nothing
visible and is not focusable/announced.

## Summary
- Surfaces audited: 12 (home, sillas, PDP, 3 taxonomy `[slug]`, contacto,
  empresas, showroom, `[pageSlug]`/sobre-nosotros, 404 ×2 locales)
- Regressions found: **0**
- Fixes required / made: **0**
- Pre-existing backlog items flagged (NOT fixed — firewall): **1** (PDP
  unknown-slug returns 200 not 404; pre-existing, out of T14 scope)

---

## Check 1 — Contact counter (the ONE intended visible delta) — PASS

`src/app/[locale]/contacto/page.tsx:72` already carries the fix:
`charCount: t.raw("charCount")` (hands the raw ICU template `"{count}/{max}"`
to the client `<CharacterCounter>`, which interpolates client-side). Verified
LIVE with Playwright (both locales × 375px & 1024px):

| Check | es-MX | en | Result |
|-------|-------|----|--------|
| Initial render | `0/2000` | `0/2000` | PASS (formatted N/M, not the `charCount` key, not `{count}/{max}`) |
| Live-update on type ("Hola mundo", 10 chars) | `10/2000` | `10/2000` | PASS — updates per keystroke |
| Near-limit (1995 chars) | `1995/2000` | `1995/2000` | PASS |
| Warning color at near-limit | amber (`text-warning`) | amber | PASS |
| `aria-live` near-limit | `polite` | `polite` | PASS (announces near cap, not per-keystroke) |
| `aria-describedby` textarea→counter | associated | associated | PASS |
| Horizontal overflow @375/1024 | none | none | PASS |

**Raw-key leak audit:** the only visible node is `>0/2000</span>`. The strings
`charCount` / `{count}/{max}` appear ONLY inside the `self.__next_f.push(...)`
RSC flight payload (as the serialized `t.raw` prop value), NEVER in a visible
`>text<` DOM node. Confirmed by DOM inspection + `body.innerText` scan (no
`{count}` in rendered text on any page).

**Counter a11y pattern matches empresas (no invented pattern):** the contact
`CharacterCounter` (`contact-form.tsx:442`) and the empresas one
(`quote-form.tsx:583`) are byte-for-byte identical in behavior —
`aria-live={warn ? "polite" : "off"}`, `tabular-nums`, muted → `text-warning`
→ `text-destructive`, tied to the textarea via `aria-describedby`. The shipped
pattern is consistent; nothing to change.

**Empresas counter unaffected:** live render `0/2000` with `data-testid="quote-counter"`,
identical styling — the contact fix did not touch it. PASS.

> Note: AC-A3's ticket text says "0/1200"; the real `CONTACT_MESSAGE_MAX` is
> **2000** (`src/lib/config/contact.ts:28`), so `0/2000` is the CORRECT render.
> The "1200" in the ticket is a stale number, not a defect. QA reported the same.

---

## Check 2 — Zero-visual-change on the other touched pages — PASS

T14's additions to these pages are metadata-only (`buildAlternates` →
canonical/hreflang in `<head>`), `buildOpenGraph` (`<head>`), and `<JsonLd>`
(a `<script type="application/ld+json">` that renders NO layout). The visible
`<Breadcrumbs>` on PDP/taxonomy/sillas/showroom/`[pageSlug]` are PRE-EXISTING
(T3), not added by T14.

| Page | @375 status/overflow | @1024 status/overflow | Stray JSON-LD text? | Verdict |
|------|----------------------|-----------------------|---------------------|---------|
| home | 200 / none | 200 / none | none | unchanged |
| sillas | 200 / none | 200 / none | none | unchanged |
| PDP (`silla-ejecutiva-milano`) | 200 / none | 200 / none | none | unchanged |
| categorias/oficina | 200 / none | 200 / none | none | unchanged |
| marcas/ergovita | 200 / none | 200 / none | none | unchanged |
| estilos/ejecutiva | 200 / none | 200 / none | none | unchanged |
| empresas | 200 / none | 200 / none | none | unchanged |
| showroom | 200 / none | 200 / none | none | unchanged |
| sobre-nosotros (`[pageSlug]`) | 200 / none | 200 / none | none | unchanged |

- **No JSON-LD text node leaks:** `body.innerText` on every page contains no
  `@context`, `BreadcrumbList`, `ld+json`, or `{count}` — the structured data
  is script-only, invisible.
- **No layout shift / duplicate breadcrumbs:** taxonomy pages render exactly
  ONE visible breadcrumb nav (`data-testid="breadcrumbs"` count = 1) plus one
  invisible `BreadcrumbList` script. The JSON-LD did NOT spawn a second visible
  trail.
- **No horizontal overflow** at any breakpoint on any page.

---

## Check 3 — Taxonomy pages under `force-dynamic` — PASS

All 3 `[slug]/page.tsx` (categorias/marcas/estilos) have
`export const dynamic = "force-dynamic";` and the route table confirms
`ƒ (Dynamic)`. The loading + empty states are preserved verbatim:

- **Loading state:** `<Suspense fallback={<ProductGridSkeleton/>}>` boundary
  retained on all 3 (grep-confirmed lines 140/115/106); the streamed HTML for
  `/categorias/oficina` contains `data-testid="product-grid-skeleton"` — the
  skeleton is intact.
- **Product grid renders:** `data-testid="product-grid"` + `product-card` in
  the server HTML at 200.
- **Responsive:** 200 with no overflow at 375px & 1024px, both locales.
- **Pagination:** `?page=2` → 200 (page-2 items); `?page=99` (out of range) →
  **200 clamped** to last page (edge case 1) — never 500.
- **Empty state:** the seed has no zero-product taxonomy to exercise live, but
  the `<EmptyState>` branch (`empty.category/brand/style`) is untouched in the
  source and returns 200 by construction (QA confirmed the branch is intact).

---

## Check 4 — 404 experience — PASS (rendered, not just status code)

Against the prod server (dev streams `notFound()` as a 200 doc; prod is real):

| Route | Status | Rendered experience (Playwright `body.innerText`) |
|-------|--------|---------------------------------------------------|
| `/no-existe-xyz` (es-MX) | **404** | "404 · Página no encontrada · La página que buscas no existe o fue movida. · Volver al inicio" — full header/footer chrome, styled |
| `/en/no-existe-xyz` | **404** | "404 · Page not found · The page you are looking for does not exist or has been moved. · Back to home" — correct en copy only |
| `/categorias/no-existe-slug` | **404** | styled 404 (taxonomy `force-dynamic` → real 404) |

Both locales serve the styled 404 page (NOT a blank error), with a clear
recovery CTA ("Volver al inicio" / "Back to home"). No es-MX↔en copy leak in
visible nodes (the es-MX strings seen in the `en` raw HTML live only in the
shared-layout `__next_f` payload, confirmed). No horizontal overflow.

---

## Check 5 — A11y spot-check on touched surfaces — PASS

| Check | Status | Details |
|-------|--------|---------|
| JSON-LD `<script>` not focusable | ✅ | `scriptFocusable = false` — no `tabindex`/`role` on any `application/ld+json` node; not in tab order, not announced. |
| JSON-LD not announced as content | ✅ | `<script>` content is never in the accessibility tree; `escapeForScriptSafe` keeps it a pure script. |
| Contact counter association | ✅ | `aria-describedby` links the textarea to the counter (`counterId`); `aria-live="polite"` near-limit, `off` otherwise — matches the empresas shipped pattern (not a new invention). |
| Counter color not sole signal | ✅ | The number itself (`N/M`) conveys state; color is a redundant cue. |
| 404 keyboard recovery | ✅ | "Volver al inicio"/"Back to home" is a real focusable `<Link>`. |
| No horizontal scroll @375 | ✅ | All 12 surfaces overflow-free. |

---

## States Audit (touched surfaces)

| Component / Page | Loading | Empty | Error/404 | Success | Mobile 375 | A11y |
|------------------|---------|-------|-----------|---------|------------|------|
| Taxonomy `[slug]` (×3) | ✅ Suspense skeleton | ✅ EmptyState (untouched) | ✅ real 404 | ✅ grid 200 | ✅ no overflow | ✅ |
| Contact form counter | n/a | n/a | n/a (client) | ✅ `N/M` live | ✅ no overflow | ✅ describedby+polite |
| Empresas counter | n/a | n/a | n/a | ✅ `0/2000` unaffected | ✅ | ✅ |
| 404 (es-MX / en) | n/a | n/a | ✅ styled + CTA | n/a | ✅ | ✅ |
| home / sillas / PDP / showroom / `[pageSlug]` | ✅ (pre-existing) | ✅ (pre-existing) | ✅ | ✅ 200 | ✅ | ✅ (JSON-LD invisible) |

---

## Copy Review

No copy was changed by this stage. The one copy-relevant surface — the contact
counter — now renders the correct `N/M` value instead of the leaked key; that
fix was already implemented (Dev/Fix). No E2E text assertions were touched
(`static-pages-contact.spec.ts` asserts on `data-testid`s, not the counter
literal, so no test update was needed).

| Location | Before (pre-T14) | After | Reason |
|----------|------------------|-------|--------|
| contacto counter | leaked `charCount` key (FORMATTING_ERROR) | `0/2000` live | `t.raw` template interpolated client-side (already shipped) |

---

## Motion / Animation

No motion was added or changed by T14 on any audited surface (the cookie banner
— the only motion-bearing spec — was NOT shipped; cookieless analytics → AC-B2
N/A). The taxonomy Suspense skeleton and contact counter use existing,
Emil-consistent patterns. Nothing to review or fix.

---

## Pre-existing backlog (NOT fixed — out of T14 scope / firewall)

1. **PDP unknown-slug returns HTTP 200 (not 404).**
   `GET /producto/<unknown-slug>` renders the in-page not-found UI with a 200
   status (Next SSG `notFound()`-under-`generateStaticParams` behavior). This is
   PRE-EXISTING — T14 did not change the PDP render mode (it only added JSON-LD
   /canonical/hreflang). Taxonomy pages, which T14 DID make `force-dynamic`,
   correctly return real 404. Not a T14 regression; flagged by QA for
   consideration. A fix (e.g. `dynamic`/on-demand 404 on PDP) belongs to a
   separate catalog-scoped ticket, not this launch-hardening pass. **Backlog,
   not fixed.**

No other issues. No pre-existing UX problems worth a backlog entry surfaced on
the touched surfaces.

---

## Verification method & tooling

- Prod build (`NEXT_PUBLIC_SITE_URL=https://posturpro.mx`,
  `NEXT_QA_DIST_DIR=.next-ux`) → `next start -p 3210` with the seeded local DB
  (REST reachable; 6 cat / 5 brand / 6 style / 30 products).
- Status matrix via `curl -L` (es-MX is the unprefixed default → `/es-MX/*`
  307-redirects to unprefixed, expected; followed with `-L`).
- Live render/interaction via Playwright (chromium) at 375px & 1024px, both
  locales: counter live-update, overflow, `aria-describedby`, JSON-LD focusability,
  404 `body.innerText`.
- Throwaway `.next-ux` dist dir removed; the Next-auto `tsconfig.json` include
  reverted. Tree left clean.

## Files changed by this stage: **NONE**

No regressions were found, so no fixes were made. `tsc --noEmit`, eslint, and
the unit suite remain at the QA-verified baseline (2041/2041, tsc 0, eslint
clean) — untouched. Did NOT git commit; did NOT touch BUILD_PLAN.md or
pipeline-state.md.

## UX Score: 9.5/10

The one intended visible fix is correct, bilingual, live-updating, accessible,
and consistent with the sibling pattern; the entire invisible SEO layer renders
nothing visible and is a11y-inert; every touched page is unchanged and
overflow-free at both breakpoints; 404s are styled in both locales. The half
point withheld is the pre-existing PDP-404-as-200 quirk (not a T14 defect, but a
real crawl/UX rough edge worth a follow-up ticket).
