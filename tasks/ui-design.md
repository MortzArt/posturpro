# UI Design: T14 — SEO, Analytics & Launch Hardening (LIGHTWEIGHT pass)

> **Scope note (read first).** T14 is complexity=HIGH / feature-type=full-feature,
> but almost its entire surface is **invisible** (sitemap.ts, robots.ts, JSON-LD,
> metadataBase, canonical/hreflang, OG, e2e infra, seed/reset, deploy checklist,
> security-header recommendations). This document deliberately covers ONLY the
> three UI-relevant slices:
>
> 1. **The conditional cookie-consent banner (Group B2)** — a **contingency spec**,
>    BUILD ONLY IF the owner selects a cookie-based analytics vendor. The recommended
>    default (`@vercel/analytics`, cookieless) means **no banner ships and AC-B2 is
>    N/A**. This spec exists so Dev/UX never has to design under pressure if the
>    owner picks a cookie vendor later.
> 2. **Zero-visual-change regression constraints** on the taxonomy `[slug]` pages
>    (`force-dynamic`) and the contact page (`t.raw` counter fix).
> 3. **An explicit "NO UI needed" list** for the rest of T14 so later stages
>    (Dev/UX/Hacker) do not gold-plate invisible SEO surfaces with invented chrome.
>
> Taste authority: `emil-design-eng` (motion), `impeccable`/DESIGN.md (Casa de
> Azulejo look). Impeccable owns look/identity; Emil owns motion restraint.

---

## Design Principles for This Feature

- **Least surface wins.** T14 is a deploy-hardening task, not a redesign. The
  correct amount of new UI is one conditional banner (maybe zero) and one raw-key
  fix. Anything more is scope creep — call it out, don't build it.
- **The banner is chrome, and chrome is tilework.** If the banner ships, it is a
  cobalt-on-glaze painted panel from the Casa de Azulejo world (DESIGN.md), reusing
  existing tokens and the existing `Button` primitive — no new palette, no new
  component library.
- **Consent must never cost SEO or LCP.** The banner is a client island mounted as
  a sibling overlay (like the WhatsApp FAB), never in `<main>`, never blocking the
  server-rendered document. It must not shift layout, must not be a render-blocking
  dependency of first paint, and must not delay the LCP image.
- **Non-blocking, non-modal by default.** A cookieless-analytics world needs no
  banner at all; even the cookie-vendor contingency is a **dismissible bottom bar**,
  NOT a focus-trapping modal that blocks the store. LFPDPPP (Mexico's privacy law)
  requires notice + a decline path, not a hostage-taking interstitial.
- **Bilingual parity is mandatory.** Every string ships in es-MX (default) and en
  in lockstep, through next-intl message files.
- **Motion is Emil-restrained.** Enter `ease-out`, `transform`/`opacity` only,
  `prefers-reduced-motion` fallback, interruptible. Reuse the existing `.enter-fade`
  motion class rather than inventing a new keyframe.

---

## Part 1 — Cookie-Consent Banner (CONTINGENCY — Group B2)

> **BUILD GATE (binding):** This component ships **ONLY IF** the owner (via AC-B1)
> selects a **cookie-based** analytics/monitoring vendor (e.g. a cookie-setting
> Plausible variant, or any GA-style tracker). **IF the owner accepts the
> recommended `@vercel/analytics` (cookieless, first-party) → this banner is NOT
> built and AC-B2 is N/A.** Dev must confirm the vendor decision in
> `tasks/next-ticket.md` / the deploy checklist before creating any file below.
> If the decision is "cookieless / deferred", Dev writes a one-line note in
> `dev-done.md` ("cookie banner N/A — cookieless analytics") and moves on.

### Component: `CookieConsentBanner`

**Purpose**: Give first-time visitors a bilingual, LFPDPPP-compliant notice that
non-essential (analytics) cookies are used, with an explicit Accept and Decline
path, and remember the choice so it never nags on repeat visits.

**Location**: Site-wide overlay on the storefront only. Mounted as a **sibling to
the WhatsApp FAB** inside `CartProvider` in `src/app/[locale]/layout.tsx` (same
tree position as `<WhatsAppButton />`, AFTER the `flex min-h-dvh flex-col` div, so
it is a true fixed overlay outside layout flow). **Never** rendered inside `<main>`
(would affect document flow / could shift LCP). **Never** on `/admin` (admin is a
parallel root layout without `.theme-storefront` — the firewall keeps it out).

**shadcn base**: **No new primitive.** Reuse `src/components/ui/button.tsx`
(`Button`) for the two actions. Do **not** use `dialog.tsx` — Dialog is a
focus-trapping modal with a scrim; this banner is intentionally **non-modal** so it
never blocks the store or SEO/LCP. Build the container as a plain `fixed` client
`<div role="region">` styled with existing tokens + the existing `.enter-fade`
motion class (globals.css:414). This mirrors how `FilterSheet` composes primitives
rather than adding a library.

**File**: `src/components/consent/cookie-consent.tsx` (single small client island,
`"use client"`, target ≤ ~120 lines per Clean Code). A tiny pure helper for the
localStorage read/write may live inline or in `src/lib/consent/storage.ts` if it
grows past a few lines.

### Layout (ASCII wireframe)

**Desktop / tablet (≥ 640px)** — bounded bottom-left bar, offset from the WhatsApp
FAB on the bottom-right so the two never collide:

```
                                                  ┌───────────┐
                                                  │  (page)   │
                                                  └───────────┘
┌───────────────────────────────────────────────┐
│ 🍪  Usamos cookies                              │   ● ← WhatsApp
│ Usamos cookies de análisis para mejorar la      │      FAB (z-50,
│ tienda. Consulta nuestro Aviso de Privacidad.   │      bottom-right,
│                                                  │      untouched)
│              [ Rechazar ]   [ Aceptar ]         │
└───────────────────────────────────────────────┘
 ↑ fixed bottom-left, max-w-md, cobalt-bordered glaze tile
```

**Mobile (< 640px)** — full-width bottom bar, buttons side by side, sitting ABOVE
the safe-area inset and NOT covering the WhatsApp FAB or any primary page CTA (the
FAB stays pinned bottom-right at z-50; the banner sits as a full-bleed bar whose
content is inset so it doesn't overlap the 56px FAB):

```
┌─────────────────────────────────────────────┐
│ 🍪 Usamos cookies                            │
│ Cookies de análisis para mejorar la tienda.  │
│ Ver Aviso de Privacidad.                     │
│  ┌───────────────┐  ┌───────────────┐        │
│  │   Rechazar    │  │    Aceptar    │        │
│  └───────────────┘  └───────────────┘     ●  │ ← FAB still visible/tappable
└─────────────────────────────────────────────┘
   ↑ pb includes env(safe-area-inset-bottom)
```

### Props

```typescript
// The banner reads its own persisted state; it takes only presentational/i18n
// inputs so the server layout can pass translated copy without a client i18n hook
// re-render on mount. (Mirrors how WhatsAppButton receives server-resolved strings.)
interface CookieConsentBannerProps {
  /** Fully-translated, ready-to-render copy (resolved server-side via getTranslations). */
  labels: {
    title: string;            // consent.title
    description: string;       // consent.description  (plain text, no ICU placeholders)
    privacyLinkLabel: string;  // consent.privacyLinkLabel  (linked sentence)
    accept: string;            // consent.accept
    reject: string;            // consent.reject
    /** aria-label for the region, e.g. "Aviso de cookies". */
    regionLabel: string;       // consent.regionLabel
  };
  /** Locale-correct href to the privacy/aviso-de-privacidad static page (built via getPathname). */
  privacyHref: string;
  /**
   * Called when the user accepts. Host wires this to enable the cookie-based
   * analytics loader. Optional so the banner is inert if analytics isn't wired yet.
   */
  onAccept?: () => void;
  /** Called when the user declines. Host ensures no non-essential cookie is set. */
  onReject?: () => void;
}
```

> Typed, no `any`. `onAccept`/`onReject` are optional so the component degrades to a
> pure notice+dismiss if the owner defers wiring the actual tracker.

### Consent persistence mechanism

- **Storage:** `localStorage` (NOT a cookie — a cookie to record cookie-consent needs
  its own essential-cookie carve-out; localStorage sidesteps that and is client-only
  so it never touches SSR).
- **Key:** `posturpro.consent.analytics` (namespaced, versionable).
- **Values:** the string `"granted"` | `"denied"`. Absent/unparseable → treat as
  "not yet decided" → show the banner.
- **Read timing:** on mount, inside a `useEffect` (never during render — avoids
  hydration mismatch, since the server has no `localStorage`). Initial client render
  is `null` (nothing), then the effect decides whether to reveal. This guarantees
  the server-rendered HTML contains **no banner markup that could affect LCP**.
- **Write timing:** on Accept → set `"granted"` + call `onAccept`; on Decline → set
  `"denied"` + call `onReject`. Either choice hides the banner for good on this
  device. Wrap the read/write in `try/catch` (private-mode / disabled storage) — on
  failure, show the banner but don't crash; never an empty catch (log context).
- **Versioning:** if the cookie/vendor policy materially changes later, bump the key
  (`...analytics.v2`) to re-prompt. Document the current key in a code comment.

### States

| State | Visual | Behavior |
| ----- | ------ | -------- |
| **Undecided (first visit)** | Banner visible: cobalt-bordered glaze tile, cookie glyph, title, description with inline privacy link, `Rechazar` (outline) + `Aceptar` (primary) buttons. | Entered with `.enter-fade`. Focusable, keyboard-dismissible. Analytics NOT loaded until Accept (opt-in posture for a cookie vendor). |
| **Accepted** | Banner gone (unmounted). | localStorage `granted`; `onAccept` fires (host loads tracker). Never shown again on this device. |
| **Declined** | Banner gone (unmounted). | localStorage `denied`; `onReject` fires; no non-essential cookie set. Never shown again. |
| **Returning (already decided)** | Nothing rendered at all. | Effect reads localStorage, finds a value, renders `null`. Zero DOM cost. |
| **No-JS** | Nothing rendered (client island never hydrates). | **Acceptable ONLY IF** the cookie vendor's script is itself gated behind Accept (no JS ⇒ no tracker ⇒ no cookie ⇒ nothing to consent to). Store fully usable. This is the LFPDPPP-safe default: analytics is opt-in, so no-JS = no tracking = compliant with no banner shown. |
| **Reduced motion** | Banner appears with opacity-only fade, no translate. | `.enter-fade` already drops the transform under `prefers-reduced-motion` (globals.css:426). No extra work. |
| **Storage unavailable** | Banner shows (can't read a prior choice). | `try/catch` swallow-with-log; user can still Accept/Decline; write may no-op but the store never breaks. |

> There is intentionally **no loading, empty, error, or success/toast state** — the
> banner has no async work, no network call, no failure mode beyond storage access.
> Do NOT invent a "cookie preferences saved" toast (there is no Toaster in the repo,
> and the codebase deliberately avoids one). Dismissal IS the feedback.

### Responsive

| Breakpoint | Layout Change |
| ---------- | ------------- |
| `< 640px` (mobile) | Full-width bottom bar (`inset-x-0 bottom-0`), content padded `px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]`. Buttons side-by-side (`Rechazar` then `Aceptar`), each `flex-1`. Content inset on the right (`pr-20`) so it never sits under the 56px WhatsApp FAB. |
| `640–1024px` (tablet) | Bounded card `max-w-md`, pinned `bottom-4 left-4` (opposite corner from the FAB at `bottom-4 right-4`). Buttons right-aligned in a row. |
| `≥ 1024px` (desktop) | Same bounded card, `bottom-6 left-6` (mirrors the FAB's `md:bottom-6 md:right-6`). Never full-width. |

**Collision rule with the WhatsApp FAB (binding):** the FAB is `z-50`, bottom-right,
`right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))]` (`md:` 1.5rem). The banner
uses **`z-40`** (below the FAB — the FAB must always stay tappable) and lives
**bottom-left** on ≥640px. On mobile the banner is full-width but its interactive
content (buttons) must not extend under the FAB's bottom-right 56px square — reserve
right padding (`pr-20`) OR keep buttons left-of-center. Both elements share the same
`env(safe-area-inset-bottom)` treatment so neither clips on notched phones. Note the
mobile drawer scrim is `z-[60]`, so the stack is: drawer 60 > FAB 50 > banner 40 —
no conflict.

### Animations

- **Mount (enter):** reuse `.enter-fade` (globals.css:414) — `opacity 0→1` +
  `translateY(8px)→0`, **200ms `--ease-out`** (`cubic-bezier(0.23,1,0.32,1)`).
  Trigger: the mount effect sets a visible flag after reading localStorage. Property:
  `transform` + `opacity` only (compositor-safe).
  *Vocabulary: "Slide-and-fade up, ease-out, 200ms."*
- **Exit (dismiss):** on Accept/Reject, fade+translate out over **~150ms `--ease-out`**
  (exit faster than enter, per Emil), then unmount. Simplest compliant option: set a
  not-visible state, let a `.enter-fade`-style transition run in reverse via a `data-`
  attribute, unmount on `transitionend`. If fiddly, an instant unmount is acceptable
  (dismissal is a deliberate, one-time action — Emil's "occasional" tier tolerates
  either). Do NOT block the store waiting for the exit.
- **Button press:** `Aceptar`/`Rechazar` inherit the `Button` primitive's existing
  press feedback — no custom motion.
- **Reduced motion:** `.enter-fade`'s `@media (prefers-reduced-motion: reduce)` block
  (globals.css:426) already strips the translate and keeps a plain opacity fade.
  Nothing to add. *Never* animate position under reduced motion.

### Accessibility

- Container: `role="region"` with `aria-label={labels.regionLabel}` (e.g. "Aviso de
  cookies") so screen-reader users can find/skip it. It is a **landmark notice, not a
  dialog** — do NOT use `role="dialog"`/`aria-modal` (it is non-modal and must not
  trap focus or block the store).
- **Focus management:** because it is non-modal, do NOT auto-move focus into it on
  mount (that would yank a reading user). It sits in natural tab order at the end of
  the page; first Tab after the footer reaches `Rechazar` then `Aceptar`. Both buttons
  get the standard cobalt `focus-visible:ring-ring` from the `Button` primitive.
- **Keyboard dismissal:** `Escape` while focus is within the region declines (treated
  as "denied" — the privacy-preserving default) and closes it. Both actions are also
  reachable by Tab+Enter. Document the Escape=decline behavior in a comment.
- The cookie glyph is decorative → `aria-hidden`. The privacy link is a real
  `<Link>`/anchor with a visible underline (color is never the only affordance).
- Color contrast: cobalt text on glaze/white (`text-popover-foreground` on
  `bg-popover`) is AA per DESIGN.md contrast table (14.10:1); `Aceptar` uses
  `bg-primary`/`text-primary-foreground` (8.37:1). No new pairings introduced.
- Not a keyboard trap; must not steal focus from form fields elsewhere on the page.

### Copy inventory (both locales — new `consent` namespace)

Add a new top-level `"consent"` namespace to **both** `src/messages/es-MX.json`
(source of truth) and `src/messages/en.json`, in lockstep. **6 keys.** All plain
strings — **no ICU placeholders**, so `t("consent.x")` is safe (this class of raw-key
bug — see AC-A3/A4 — is avoided by design here).

| Key | es-MX (default) | en |
| --- | --- | --- |
| `consent.title` | `Usamos cookies` | `We use cookies` |
| `consent.description` | `Usamos cookies de análisis para entender cómo se usa la tienda y mejorarla.` | `We use analytics cookies to understand how the store is used and improve it.` |
| `consent.privacyLinkLabel` | `Consulta nuestro Aviso de Privacidad.` | `Read our Privacy Notice.` |
| `consent.accept` | `Aceptar` | `Accept` |
| `consent.reject` | `Rechazar` | `Decline` |
| `consent.regionLabel` | `Aviso de cookies` | `Cookie notice` |

> The description + privacy link render as two adjacent sentences (description, then
> the linked notice), NOT as an interpolated ICU string — this keeps every value a
> plain string and sidesteps the `t.raw` placeholder trap entirely. `privacyHref`
> points at the localized `aviso-de-privacidad` static page via `getPathname`.
> **12 total translated strings (6 keys × 2 locales).** If the owner's vendor or
> LFPDPPP counsel later requires a granular "manage preferences" flow, a
> `consent.manage`/`consent.preferences` key set can extend this — out of scope for
> the contingency.

### Interaction flow — first-visit consent (if banner ships)

1. Visitor lands on any storefront page → server renders the full document with **no
   banner markup** (SEO/LCP unaffected).
2. Client hydrates → banner island's effect reads
   `localStorage["posturpro.consent.analytics"]`.
3. If a value exists → render `null` (returning visitor, done).
4. If absent → set visible=true → banner enters bottom-left (desktop) / bottom-bar
   (mobile) with `.enter-fade`, offset from the WhatsApp FAB.
5. User picks:
   - **Aceptar** → write `"granted"`, call `onAccept()` (host loads the cookie
     tracker), fade out, unmount.
   - **Rechazar** (or `Escape`) → write `"denied"`, call `onReject()` (host loads no
     tracker / sets no non-essential cookie), fade out, unmount.
6. Choice persists per-device; the banner never reappears unless the consent key is
   version-bumped.

---

## Part 2 — Regression Constraints on Existing Visible Surfaces

These are **behavior-preserving** edits. The design instruction is a hard constraint,
not a redesign: **ZERO visual change is permitted** except the one explicitly-required
counter fix.

### 2a. Taxonomy `[slug]` pages — `export const dynamic = "force-dynamic"`

**Files:** `categorias/[slug]/page.tsx`, `marcas/[slug]/page.tsx`,
`estilos/[slug]/page.tsx`.

- This is a **render-mode** change (SSG → dynamic) that fixes the confirmed prod-500
  (`DYNAMIC_SERVER_USAGE`). It has **no rendered-UI effect whatsoever** at 200.
- **Binding UI constraints (no visual change allowed):**
  - The `<Suspense fallback={<ProductGridSkeleton/>}>` boundary MUST remain — the
    skeleton loading state is preserved verbatim (ticket UX: "SEO edits must NOT
    remove it").
  - The `<EmptyState>` for zero-product taxonomies (`empty.category/brand/style`)
    MUST remain unchanged and still return 200.
  - The product grid markup / `gridTemplateColumns` structure is e2e-asserted
    (DESIGN.md per-surface rule) — do not touch it.
  - `?page=N` pagination (incl. out-of-range clamp to `lastPage`) renders exactly as
    before, now at 200 instead of 500.
- **Verification of "no visual change":** the page that previously 500'd now renders
  the same Casa de Azulejo tile-wall it was always meant to. There is nothing new to
  design — Dev adds one line per page and the existing UI is what appears.

### 2b. Contact page — `t("charCount")` → `t.raw("charCount")` (the ONE visual fix)

**File:** `src/app/[locale]/contacto/page.tsx:59`.

- This IS the required visual change: the character counter must render the formatted
  **`"N/M"`** (e.g. `0/1200`, live-updating as the user types) in both es-MX and en —
  **NOT** the literal `charCount` key and **NOT** the raw `{count}/{max}` template.
- The fix is a one-liner mirroring `empresas/page.tsx:147`: hand the raw ICU template
  `"{count}/{max}"` to the client `<CharacterCounter>` via `t.raw`, which interpolates
  `count`/`max` client-side. No component redesign, no style change to the counter.
- **Design constraint:** the counter's existing position, typography (`text-sm`
  muted, `tabular-nums`), and placement under the message textarea are unchanged. The
  only difference a user sees is a correct number instead of a leaked key. Do not
  restyle the counter, the textarea, or the form.

---

## Part 3 — Explicit "NO UI NEEDED" list (do NOT gold-plate)

The following T14 deliverables have **no rendered UI** and must NOT receive any
invented chrome, banner, badge, panel, modal, or visible affordance. Later stages
(Dev, UX, Hacker) should treat these as headless/infra and design **nothing** for
them:

- **`src/app/sitemap.ts`** — returns `MetadataRoute.Sitemap` (XML). No page, no UI.
- **`src/app/robots.ts`** — returns `MetadataRoute.Robots` (plain text). No UI.
- **JSON-LD** (`Product`, `Organization`, `WebSite`, `BreadcrumbList`) — rendered as
  `<script type="application/ld+json">` in the document. It is **invisible structured
  data for crawlers**, NOT a breadcrumb UI, NOT a rating widget, NOT a rich card in
  the page. Do NOT add a visible breadcrumb trail "because there's a BreadcrumbList"
  — the `BreadcrumbList` is metadata only. (A visible breadcrumb, if ever wanted, is a
  separate future ticket, out of T14 scope.)
- **`metadataBase` + default `openGraph`/`twitter`** (layout) — affects
  `<head>`/social-preview cards on external platforms only. No on-site UI.
- **`canonical` + `alternates.languages` (hreflang)** — `<head>` link tags. No
  visible UI. The existing header locale toggle already handles user-facing language
  switching; hreflang is crawler-facing and must NOT spawn a second UI switcher.
- **OG image** — used by external scrapers (social/chat previews), not rendered
  in-app. If a default OG image asset is needed it follows DESIGN.md cartouche/cobalt
  art direction, but it is an asset, not a component.
- **e2e infra** (`playwright.config.ts`, `package.json` scripts, prod e2e server) —
  developer tooling. No UI.
- **Seed/reset path + deploy-readiness checklist** (`supabase/*`, `.md` docs) —
  developer/ops docs. No UI.
- **Security headers / CSP (AC-B6, Stage 9)** — HTTP response headers. No UI.
- **Analytics / error-monitoring wiring (Group B)** — if `@vercel/analytics` is
  chosen, it is a headless `<Analytics />` component with **no visible chrome and no
  consent banner**. Sentry is likewise headless. Neither renders user-facing UI.

> If any later stage feels an urge to add a visible element for something in this
> list, that urge is scope creep — stop and re-read this section.

---

## Accessibility Checklist (banner contingency)

- [ ] Region has `role="region"` + `aria-label` (landmark, not dialog).
- [ ] Both action buttons have visible text labels + cobalt `focus-visible` rings.
- [ ] Does NOT auto-focus on mount (non-modal — never yanks a reading user).
- [ ] Does NOT trap focus; is fully keyboard reachable via Tab in natural order.
- [ ] `Escape` within the region declines + dismisses (privacy-preserving default).
- [ ] Cookie glyph is `aria-hidden`; privacy link is a real underlined anchor.
- [ ] Color is never the only signal (buttons have text; link is underlined).
- [ ] Contrast AA on all pairings (reuses existing DESIGN.md-verified tokens).
- [ ] Respects `prefers-reduced-motion` (opacity-only fade, no translate).
- [ ] Bilingual parity: all 6 keys present in es-MX and en.

## Design Tokens Used (banner contingency)

- **Colors:** `bg-popover` (glaze white), `text-popover-foreground` (cobalt ink),
  `border-border` (grout seam), `bg-primary`/`text-primary-foreground` (Aceptar CTA),
  `--ring` (focus). Decline uses `Button variant="outline"` (grout border, cobalt
  text). **No new tokens** — everything from `.theme-storefront` in globals.css.
- **Typography:** `--font-sans` (Inter) body/UI; `text-sm`/`text-base`. `consent.title`
  may use `font-heading` small-caps as a tile caption if desired, but a plain semibold
  sans title is acceptable and lighter.
- **Radius:** `rounded-lg` (`--radius-lg`) for the panel (a "large panel" per DESIGN.md
  elevation rules); buttons keep the primitive `rounded-md`.
- **Elevation:** `shadow-lg` with the cobalt-tinted `--shadow-color` (Floating tier —
  same class of surface as the FAB/dialog per DESIGN.md).
- **Motion:** existing `.enter-fade` class + `--ease-out` token. No new keyframes.
- **Icon:** a `@hugeicons/core-free-icons` cookie/shield glyph via `HugeiconsIcon`
  (same import pattern as `WhatsAppButton`), `aria-hidden`.

---

## Handoff notes for Dev (Stage 4) — do not miss

1. **Confirm the vendor decision BEFORE building the banner.** If analytics is
   cookieless (`@vercel/analytics`, the recommendation) or deferred → **do not create
   `cookie-consent.tsx` at all**; note "AC-B2 N/A (cookieless)" in `dev-done.md`. Only
   build if the owner picks a cookie-based vendor.
2. **If built:** it is a `"use client"` island mounted as a sibling to
   `<WhatsAppButton />` in `src/app/[locale]/layout.tsx` (inside `CartProvider`, after
   the flex div). Pass server-resolved `labels` + `privacyHref` as props (mirror
   `WhatsAppButton`'s server-resolves-strings pattern) so there's no client i18n
   round-trip.
3. **z-40, bottom-left** (desktop) — never collide with the `z-50` bottom-right FAB;
   share `env(safe-area-inset-bottom)`. On mobile the banner is full-width but reserve
   right padding (`pr-20`) so buttons don't sit under the 56px FAB. Stack: drawer 60 >
   FAB 50 > banner 40.
4. **localStorage key `posturpro.consent.analytics`**, values `"granted"`/`"denied"`,
   read in `useEffect` (never in render — hydration safety), wrapped in `try/catch`
   (log, don't swallow silently). Banner absent from SSR HTML so LCP is untouched.
5. **New `consent` namespace: 6 keys × 2 locales = 12 strings, all plain (no ICU).**
   Add to es-MX.json and en.json in lockstep. es-MX is source of truth.
6. **Regression:** the 3 taxonomy `force-dynamic` edits and the contact `t.raw` edit
   are behavior/appearance-preserving. Keep the `<Suspense>`/skeleton, `<EmptyState>`,
   grid structure, and counter styling exactly as-is. The ONLY visible delta is the
   contact counter now rendering `N/M` instead of a leaked key.
7. **Everything in Part 3 is headless — design and build zero UI for it.**
