# Hacker Report: T19 — Homepage rebuild + product condition grades

Stage 11 (Chaos). Ran real-browser chaos (Playwright/chromium, prod build on
:3457) + a static code audit across all T19 surfaces in both locales, 320–1440px,
JS-on/off, reduced-motion, and network-degraded paths. DB left pristine.

## Summary
- Dead UI found: **1** (footer placeholder links) — **fixed**
- Visual bugs: **0**
- Logic bugs: **0**
- Race conditions: **0** (double-submit + rapid-select both provably safe)
- Missing states: **0** (all states resolved at Stage 8 UX)
- Items fixed: **1**
- Firewalled (pre-existing / owner-gated, not fixed): **1** (placeholder *destinations*)
- Product improvements suggested: **10** (all Phase-2)

## Dead UI
| # | Element | File:Line | Issue | Fixed? |
|---|---------|-----------|-------|--------|
| 1 | Footer social (Instagram/LinkedIn/Facebook) + legal (privacy/terms) links | `site-footer.tsx` (via `footer-links.ts` `FOOTER_LINK_PLACEHOLDER="#"`) | Rendered as `<a href="#">` → a **dead action**: clicking scroll-jumps to page top with no destination (5 links). | ✅ |

**Fix:** Added `ExternalFooterLink` helper — when a link's href is still the
placeholder sentinel it renders as a non-navigating `<span aria-disabled="true">`
(identical styling, `cursor-default`, no scroll-jump). The instant a real URL is
set in `footer-links.ts` it upgrades to a live `<a target="_blank" rel="noopener
noreferrer">`. Preserves the one-line-swap config workflow; testids unchanged.
Verified live: HTML now emits `<span aria-disabled="true" data-testid="footer-social-…">`.

> Firewall note: the *destinations* (real social profiles / legal pages) remain
> owner-gated go-live data (dev-done Known Limitations, `client-content-questionnaire.md`
> PART M). I did NOT invent URLs — I only removed the dead-click behavior.

## Visual Bugs
None. Verified programmatically:
| Check | Result |
|-------|--------|
| Horizontal overflow @320px on `/`, `/en`, `/sillas`, `/empresas`, `/carrito`, 404 | 0px on every page |
| Header overflow @768px (BUG-1 regression) | 0px (compact chrome held through tablet) |
| GradeBadge + StockBadge coexistence @320px | opposite corners, `max-w-[45%] truncate`, no clip |
| WhatsApp FAB vs footer/CTA @320px | no overlap (bottom-right fixed, clears content) |
| Topbar @320px | scrolls-x, no break; 3rd message reachable |

## Logic Bugs
None. Calculator math (`savings.ts`) is hardened: `/0` guarded, savings floored at
0, bar fraction clamped to `[0.08, 1]` — no NaN, no negative, no inversion.
| Chaos | Result |
|-------|--------|
| Calculator: 8× rapid open/select spam | no NaN, correct final value |
| Calculator: keyboard-only (Enter/Arrow/Enter) | correct value, 0 console errors |
| Calculator: reduced-motion | recomputes correctly, 0 errors |
| FAQ: open all 4 + keyboard | 4 independent native `<details>`, work with JS off |

## Race Conditions
| # | Scenario | File | Result |
|---|----------|------|--------|
| 1 | B2B quote **double-submit** (2 clicks in one tick) | `quote-form.tsx:322` | Submit is `disabled={pending}` → server log shows exactly **1** relay attempt, never 2. Safe. |
| 2 | Calculator rapid select mid-animation | `savings-calculator.tsx` | Synchronous `useMemo` recompute + keyed spans; no stale render. Safe. |
| 3 | Locale rapid toggle + back/forward | shell | 0 real console errors, no hydration mismatch. |

## Missing States — none (all resolved at Stage 8)
Verified live: JS-disabled → hero/copy/8 product links/FAQ all render (calculator
SSRs a valid default); network relay-fail → friendly error + retry (T16 reused);
honeypot → fake success, no send (server log confirms `honeypot tripped`);
invalid email → inline "correo no parece válido"; unconfigured WhatsApp →
config-gated (topbar link/FAB/footer all guard).

## Grade system end-to-end
| Path | Result |
|------|--------|
| DB migration 0016 | enum `{A+,A,B}`, column nullable, 30 rows NULL — pristine |
| `products_public` view | exposes `condition_grade`, omits `cost_price_cents` |
| Read paths project grade | `queries-internal.ts` + `search.ts` + `product-detail.ts` all project + guard |
| PDP renders grade | `getProduct` returns `conditionGrade`; GradeBadge renders (13/13 integration tests pass live) |
| Tampered POST (`condition_grade=X`) | rejected by `parseConditionGrade` (unit tests pass) + DB enum backstop |
| null grade | no badge, no empty gap (self-guarding component) |

> Note: catalog LIST + homepage reflect a grade change only after
> `revalidateTag(CATALOG_CACHE_TAG)` (the admin-save path). A **direct DB write**
> (my test method) does NOT invalidate the `unstable_cache`, so a curl of a
> pre-cached page showed no badge — this is correct cache behavior, verified via
> the dynamic PDP read + the 13 passing live integration tests, NOT a bug.

## Console / Network Audit
Swept `/`, `/en`, `/sillas`, `/en/sillas`, `/empresas`, PDP, `/carrito`,
`/checkout`, `/contacto`, 404 — **0 real console errors, 0 warnings, 0 hydration
mismatches** in both locales. The only network noise is `…/sillas?_rsc=…
ERR_ABORTED` — benign Next.js `<Link>` prefetch **cancellations** (prefetch
aborted on navigation), not asset 404s. Favicon/logo SVGs load clean.

## Anchor cross-reference (all land)
`#main-content`, `/#proceso`, `/#garantia`, `/#empresas`, `/#impacto`,
`/#catalogo`, `/#calculadora`, `/#cotizacion` — every target id exists
(process-steps, trust-faq, b2b-section, values-impact, page.tsx). Nav + footer
anchors resolve to the homepage sections. Zero dead anchors.

## Product Improvements (Phase 2)
| # | Improvement | Impact | Effort | Priority |
|---|-------------|--------|--------|----------|
| 1 | **Calculator: prefill the model the user is viewing** (deep-link `?model=aeron` from a PDP "see your savings" link) | High | S | P2 |
| 2 | **Grade filter/sort on catalog** (badge display shipped; filtering deferred to T5) | High | M | P2 |
| 3 | **Grade tooltip/legend** on hover (what A+/A/B mean) — reuse FAQ copy in a popover | Med | S | P2 |
| 4 | **Sticky mobile CTA bar** ("Explorar catálogo" + WhatsApp) so the primary action is always in thumb reach on long scroll | High | M | P2 |
| 5 | **Calculator "share/save my estimate"** (copy link with model preselected) for B2B buyers | Med | M | P3 |
| 6 | **Real testimonials + logos** with structured-data `Review`/`AggregateRating` (placeholders ship now) — SEO + trust | High | M | P2 |
| 7 | **Topbar: dismissible "free shipping" urgency variant** (localStorage-remembered) instead of static-only | Low | S | P3 |
| 8 | **B2B quote: inline team-size → volume-discount hint** ("10–50 → ~15% off") to reduce back-and-forth | Med | S | P2 |
| 9 | **Homepage catalog: "New arrivals / By grade" quick tabs** above the featured grid | Med | M | P3 |
| 10 | **Footer: wire real social/legal URLs** (owner data) — removes the placeholder-span state entirely | Med | S | P2 |

## Fixes Applied
- **Footer dead-action hardening** — `src/components/layout/site-footer.tsx`: new
  `ExternalFooterLink` helper renders placeholder-sentinel social/legal links as a
  non-navigating `<span aria-disabled>` (was a scroll-jumping `<a href="#">`);
  upgrades to a real `<a target="_blank" rel="noopener noreferrer">` automatically
  when a URL is configured. 5 links (3 social + 2 legal) covered.

## Tests After Fixes
- `npx tsc --noEmit`: **0 errors**
- ESLint (`site-footer.tsx`): **clean**
- `vitest run`: **2175 passed / 0 failed** (132 files)
- `next build`: **exit 0**
- E2E (chromium, affected set: `whatsapp-and-footer`, `responsive-motion`, `home`): **27 passed / 0 failed** — incl. footer social/legal render test + 768px BUG-1 no-overflow assertion
- Grade integration (live DB): **13 passed / 0 failed**

## Chaos Score: 1/10
(Lower = calmer.) The T19 build is exceptionally robust: zero console errors
across 10 page types in both locales, zero horizontal overflow at 320px, hardened
calculator math, provable double-submit protection, full graceful degradation
(JS-off, reduced-motion, network-fail, honeypot), and a colorblind-safe,
cache-correct grade system. The single finding was a low-severity dead-action on
owner-gated placeholder footer links — now fixed. Held at 1 (not 0) only because
that dead `href="#"` shipped into a T19-introduced surface at all.

## Verdict: PASS
