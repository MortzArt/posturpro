# UI Design: T16 — B2B Landing Page (`/empresas`, offices + quote form)

> **Scope discipline (impeccable, extension mode).** This page is a **new whole surface
> INSIDE the committed Casa de Azulejo world** — not a new visual world. Per `new-work.md §3`
> "Create a whole surface inside an established world": the visual system is **fixed** (cobalt
> line-and-wash, grout-seam borders, roman-caps Libre Caslon captions in cartouche frames,
> `.enter-fade`/`.stagger`/`.link-arrow` motion). No concept tournament, no `concept-seed.mjs`
> roll (that is only for a genuinely open new world), no DESIGN.md rewrite. This spec resolves
> **only the new**: the offices purpose, section flow/hierarchy, the quote-form field set +
> state matrix, one new page-composition component, image slots, nav/footer placement, copy,
> and a11y. Every claim is truthful (PRODUCT.md hard rule — no fabricated proof).
>
> **Mode: Persuade.** The visitor (an office manager) must, within seconds, understand *what
> this is* (outfit your team's workspace with ergonomics-first chairs), *why it matters* (the
> three real pillars), and *what to do* (request a quote). The offer and the primary action are
> both visible above the fold; the form is the close.

---

## Design Principles for This Feature

1. **Persuade in the incumbent's grammar.** Every persuasive beat is a *painted tile panel* —
   cartouche frame, cobalt caption bar, roman-caps section title. The page reads as another hall
   in the same tiled house, not a bolt-on marketing template. No new component wears a look the
   home page doesn't already wear.
2. **Truth is the only proof.** No testimonials, client logos, "trusted by N offices", "X chairs
   delivered", stars, or press — none exist, none are invented (AC-3, PRODUCT.md). Persuasion
   comes from the **three real pillars**, an **honest process** (request → the owner responds),
   and the **real seeded brands pulled live** (breadth as *range*, never as endorsement).
3. **The phone is the store.** Mobile-first: single column at 375px, ≥44px touch targets,
   native `<select>` picker, zero horizontal overflow. Desktop is the enhancement (split hero,
   3-up pillar row).
4. **Compose, don't invent.** Reuse `Hero`, `EditorialBand`, `HomeSectionHeader`, the contact
   `fieldClasses`/`Field`/`FormBanner`/`SuccessBanner` grammar, `.enter-fade`, `.stagger`. The
   ONLY genuinely new UI is (a) one small server component for the 3-pillar / process grids, and
   (b) a labeled native `<select>` inside the otherwise-cloned form.
5. **Motion is Emil-disciplined.** `.enter-fade` on section mount (opacity + 8px rise, `ease-out`
   200ms, reduced-motion → opacity-only). No new motion is invented. No animation without
   purpose; the form's success/error banners reuse the shipped `.enter-fade`.

---

## Page Layout — `/empresas` (desktop → mobile)

The page is a stack of full-width `<section>` wrappers, **identical rhythm to the homepage**
(fragment of sibling `<section>` blocks, each owning its own container + vertical rhythm):
`mx-auto max-w-(--breakpoint-xl) px-4 py-16 md:px-6 md:py-24 lg:px-8` for the hero, and
`mx-auto max-w-(--breakpoint-xl) px-4 py-8 md:px-6 md:py-10 lg:px-8` for the interior bands
(matching `page.tsx:82` / `:96` verbatim).

### Desktop (≥1024px)

```
┌──────────────────── site-header (shell, unchanged; "Empresas" nav item now present) ─────────────┐
├───────────────────────────────────────────────────────────────────────────────────────────────┤
│  §1 HERO  (Hero component, reused)                                                                │
│  ┌───────────────────────────────┐   ┌──────────────────────────────────┐                        │
│  │ EQUIPA A TU EQUIPO             │   │  cartouche image slot            │                        │
│  │ (roman-caps display, cobalt)   │   │  B2B_HERO_IMAGE  4/3             │                        │
│  │ subcopy: fleet/volume framing  │   │  (or blank-tile Building glyph)  │                        │
│  │ [ Solicitar cotización ]  ·  ¿Cómo funciona? →                        │                        │
│  └───────────────────────────────┘   └──────────────────────────────────┘                        │
├───────────────────────────────────────────────────────────────────────────────────────────────┤
│  §2 VALUE — 3 PILLARS   (new B2BPillars component)                                                │
│  HomeSectionHeader:  "POR QUÉ POSTURPRO PARA OFICINAS"                                            │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐   (grid-cols-3, grout gap-6, .stagger entrance)     │
│  │ [glyph]    │ │ [glyph]    │ │ [glyph]    │                                                     │
│  │ Ergonomía  │ │ Multimarca │ │ Valor      │                                                     │
│  │ body …     │ │ body …     │ │ body …     │                                                     │
│  └────────────┘ └────────────┘ └────────────┘                                                     │
├───────────────────────────────────────────────────────────────────────────────────────────────┤
│  §3 PROCESS — HOW IT WORKS   (B2BProcess numbered strip)   id="como-funciona"                     │
│  "CÓMO FUNCIONA"   ①Solicita → ②Te contactamos → ③Cotización a medida  (3 numbered tiles)         │
├───────────────────────────────────────────────────────────────────────────────────────────────┤
│  §4 BRAND BREADTH   (FeaturedBrands, reused — REAL seeded brands, presented as range)             │
│  HomeSectionHeader: "MARCAS QUE MANEJAMOS"  ·  Ver todas →                                        │
│  ┌────┐ ┌────┐ ┌────┐  (brand tiles via IndexTile+BrandLogo, .stagger, .card-lift)                │
├───────────────────────────────────────────────────────────────────────────────────────────────┤
│  §5 QUOTE FORM  (QuoteForm client island)  — the close.  id="cotizacion" (scroll anchor target)   │
│  "SOLICITA TU COTIZACIÓN"                                                                          │
│  ┌───────────────────────── max-w-xl ─────────────────────────┐                                   │
│  │ Company* | Contact name*   (2-up ≥sm)                       │                                   │
│  │ Email*   | Phone (opt)     (2-up ≥sm)                       │                                   │
│  │ Team size*  (native select)                                │                                   │
│  │ Needs*   (textarea + counter)                              │                                   │
│  │ [banner slot]   [ Solicitar cotización ]                   │                                   │
│  └────────────────────────────────────────────────────────────┘                                   │
├──────────────────────────────── site-footer (shell; "Empresas" link now present) ────────────────┤
```

### Mobile (375px)

```
┌─ header (hamburger → drawer includes "Empresas") ─┐
│ §1  EQUIPA A TU EQUIPO (text-4xl)                  │
│     subcopy                                        │
│     [ Solicitar cotización ]                       │
│     ¿Cómo funciona? →                              │
│     ┌───────────── 4/3 cartouche ─────────────┐    │
│     │ image or Building blank-tile glyph        │   │
│     └──────────────────────────────────────────┘   │
│ §2  POR QUÉ POSTURPRO…  → 3 pillars stacked        │
│ §3  CÓMO FUNCIONA  → 3 numbered tiles stacked      │
│ §4  MARCAS QUE MANEJAMOS → 1-col brand tiles       │
│ §5  SOLICITA TU COTIZACIÓN                          │
│     company (full) / contact (full)                │
│     email (full) / phone (full)                    │
│     team size select (full, native picker)         │
│     needs textarea (full)                           │
│     [ Solicitar cotización ] (full)                 │
└────────────────────────────────────────────────────┘
```

---

## Section Flow (Persuade beats, grounded ONLY in PRODUCT.md truth)

| # | Section | Job | Truth grounding | Composed from |
|---|---------|-----|-----------------|---------------|
| 1 | **Hero** | Make the offer intelligible + desirable in one line; expose the primary action | Offices-furnishing-workspaces audience; volume-quote (no self-serve pricing) | **`Hero`** (reused) — headline + subcopy + primary CTA (`Solicitar cotización` → `#cotizacion`) + secondary link (`¿Cómo funciona?` → `#como-funciona`) + `B2B_HERO_IMAGE` cartouche |
| 2 | **Value — 3 pillars** | The persuasion spine | Pillar 1 ergonomics authority, 2 multi-brand breadth, 3 value/volume (PRODUCT.md "Positioning", verbatim intent) | **`B2BPillars`** (NEW server component) — `HomeSectionHeader` + 3 cartouche-bordered tiles, each a line-glyph seal + roman-caps title + body |
| 3 | **Process — how it works** | Set honest expectations: no instant price, a human responds | "request volume quotes through a quote form (no self-serve volume pricing)" — the whole honest mechanism | **`B2BProcess`** (NEW; same file/pattern as `B2BPillars`) — 3 numbered cobalt tiles: Solicita → Te contactamos → Cotización a medida |
| 4 | **Brand breadth** | Show range, not endorsement | The **real seeded brands** rendered live via `listBrands()` — exactly the homepage mechanism; if read fails or is empty, the section is **omitted** (never an empty grid, never a fake logo wall) | **`FeaturedBrands`** (reused verbatim) under a B2B heading |
| 5 | **Quote form** | The close / CTA | 6 fields, relays to owner by email only | **`QuoteForm`** (NEW client island, clones contact-form grammar) |

**Why this order:** hook (§1) → belief (§2 pillars, §4 real breadth as evidence a competitor can't
copy-paste) → objection-handling (§3 "what happens after I ask?") → action (§5). §3 sits before §4
so the reader knows the *mechanism* before the *range*; §4 (real brands) is the last piece of
persuasion before the ask, doing the "prove, don't claim" job with genuine catalog data.

---

## Composition Within Casa de Azulejo

| Casa de Azulejo block | Where it composes | Notes |
|---|---|---|
| **Cartouche frame** (`rounded-md border border-primary/30 bg-muted`, reserved aspect box) | Hero media (§1); pillar tile borders use the quieter `border-border` (grout) | Exactly the `HeroMedia` / `EditorialBand` frame grammar. Degrade-to-blank-tile on the hero. |
| **Cobalt caption bar / seal** (`bg-primary text-primary-foreground`) | Process tiles' round number seal (§3) | The AA scrim (8.37:1) for any text on cobalt |
| **Roman-caps section title** (`font-heading … tracking-wide`, cobalt/foreground) | Every `HomeSectionHeader` (§2, §4) + §5 form heading + §3 title | Reuses `HomeSectionHeader` markup 1:1 |
| **`.enter-fade`** | Every section root (opacity + 8px rise, ease-out 200ms) | Reused verbatim; reduced-motion → opacity-only (globals.css:426) |
| **`.stagger`** (40ms step, capped 5) | Pillar tiles (§2), process tiles (§3), brand tiles (§4 via `FeaturedBrands`) | Inline `transitionDelay = Math.min(index,5)*40ms` — same as `FeaturedBrands` |
| **`.link-arrow`** | Hero secondary link, `HomeSectionHeader` "Ver todas →" | Reused verbatim (`.group/brands` parent) |
| **`fieldClasses`** (`min-h-11 …`) | Every quote form input/select/textarea | Copied verbatim from contact-form:67 (guarantees ≥44px touch + focus ring + `aria-invalid` styling) |

---

## New Components (kept minimal — prefer composition)

Only **two** new UI files are justified. Both are small, single-concern, and wear the incumbent look.

### 1. `B2BPillars` + `B2BProcess`  (one new file: `src/components/b2b/b2b-sections.tsx`, server)

**Purpose**: render the 3-pillar value grid (§2) and the 3-step process strip (§3). Both are
pure presentational server components fed pre-resolved strings + a hugeicon per item (RSC-resolved
labels discipline — no client JS, no i18n hook inside). Grouped in one file because they share the
same tile grammar and neither is large (SRP: "render a labeled tile grid").

**Location**: `/empresas` sections §2 and §3.
**shadcn base**: none — composition of `<section>`/`<ul>`/`<li>` + `HugeiconsIcon`, matching the
existing home-component style (plain semantic markup + Tailwind, like `EditorialBand`).

**Layout (ASCII — pillar tile)**:
```
┌──────────────────────────── li ────────────────────────────┐
│  ┌──────┐   glyph seal: HugeiconsIcon 24, text-primary in    │
│  │glyph │   rounded-md bg-secondary p-2                      │
│  └──────┘                                                    │
│  Autoridad en ergonomía          (font-heading text-lg)     │
│  Curamos cada silla por cómo …   (text-sm muted, relaxed)   │
└─────────────────────────────────────────────────────────────┘
   border border-border bg-card rounded-md p-5, .stagger
```

**Layout (ASCII — process tile, numbered)**:
```
┌──────────────────────────── li ────────────────────────────┐
│  (1)  ← cobalt round seal: bg-primary text-primary-foreground │
│       size-8 grid place-items-center rounded-full tabular-nums│
│  Solicita tu cotización          (font-heading text-lg)     │
│  Cuéntanos qué necesita tu …     (text-sm muted)            │
└─────────────────────────────────────────────────────────────┘
```

**Props**:
```typescript
import type { IconSvgObject } from "@hugeicons/react";

interface PillarItem {
  icon: IconSvgObject;          // @hugeicons/core-free-icons object
  title: string;                // RSC-resolved
  body: string;                 // RSC-resolved
}
interface B2BPillarsProps {
  heading: string;                                       // roman-caps section title
  items: readonly [PillarItem, PillarItem, PillarItem];  // exactly 3 (fixed tuple)
}

interface ProcessStep {
  title: string;
  body: string;
}
interface B2BProcessProps {
  heading: string;
  id: string;                                            // "como-funciona" — hero secondary anchor target
  steps: readonly [ProcessStep, ProcessStep, ProcessStep]; // exactly 3
}
```

**States**: purely static, copy-driven — no loading/empty/error branch (strings always resolve
from the dictionary; never DB-backed). Icons are compile-time imports (cannot be null). No skeleton.

**Responsive**:
| Breakpoint | Layout |
|---|---|
| `<640px` | `grid-cols-1` — tiles stack full-width |
| `640–1024px` | pillars `sm:grid-cols-3` (short copy) else `sm:grid-cols-2`; process `sm:grid-cols-3` |
| `>1024px` | pillars `lg:grid-cols-3`; process `lg:grid-cols-3` |

Gap `gap-4 md:gap-6` (grout rhythm).

**Animations**:
- Mount: section root `.enter-fade` (opacity + 8px rise, `ease-out`, 200ms; reduced-motion →
  opacity-only). Trigger: `@starting-style` on first paint.
- Tile cascade: each `<li>` uses `.stagger` with inline `style={{ transitionDelay }}` =
  `Math.min(index, 5) * 40ms` (matches `FeaturedBrands`). Property: `transform`/`opacity` only.
- **No hover motion** on pillar/process tiles — they are read, not pressed (Emil: no motion without
  purpose; only links get `.card-lift`). Brand tiles in §4 keep their existing `.card-lift`.

### 2. `QuoteForm`  (`src/app/[locale]/empresas/quote-form.tsx`, `"use client"`)

The sole client island. **Clones `contact-form.tsx` grammar verbatim** — `useActionState`,
off-screen honeypot, first-invalid focus, success clear+focus+auto-hide, Retry, `FormBanner`,
`SuccessBanner`, `FieldError`, `CharacterCounter`, `fieldClasses`, `Field`. The **only new
primitive is `SelectField`** (a labeled native `<select>` for team size), defined inline in the
same file using the identical `fieldClasses` + label + `aria-describedby` error grammar as `Field`.

Full spec below.

---

## Quote Form Spec

### Layout (ASCII wireframe — desktop)

```
┌─────────────────────────── max-w-xl (form container) ───────────────────────────┐
│ [SuccessBanner — role=status, only when successVisible]                          │
│                                                                                  │
│ ┌── honeypot (absolute left-[-9999px], aria-hidden, tabIndex=-1) ──┐            │
│ │  <label>company_url</label> <input name="company_url" …>          │            │
│ └───────────────────────────────────────────────────────────────────┘          │
│                                                                                  │
│  ┌───────────────────────────┐  ┌───────────────────────────┐                   │
│  │ Empresa *                 │  │ Nombre de contacto *      │   (grid sm:2-cols) │
│  │ [input company]           │  │ [input name]              │                   │
│  └───────────────────────────┘  └───────────────────────────┘                   │
│  ┌───────────────────────────┐  ┌───────────────────────────┐                   │
│  │ Correo electrónico *      │  │ Teléfono (opcional)       │                   │
│  │ [input email]             │  │ [input phone]             │                   │
│  └───────────────────────────┘  └───────────────────────────┘                   │
│  ┌───────────────────────────┐                                                   │
│  │ Tamaño del equipo *       │   ← native <select>, options from QUOTE_TEAM_SIZES │
│  │ [ Selecciona un rango  ▾ ]│                                                   │
│  └───────────────────────────┘                                                   │
│  ┌───────────────────────────────────────────────────────────────┐              │
│  │ ¿Qué necesitas? *                                             │              │
│  │ [textarea needs, min-h-32 resize-y]                          │              │
│  │                                                   0/2000  ↙ counter          │
│  └───────────────────────────────────────────────────────────────┘              │
│                                                                                  │
│  [FormBanner slot — rate-limited (warning) / error (destructive), role=alert]    │
│                                                                                  │
│  [ Solicitar cotización ]   ← Button size=lg, min-h-11, sm:self-start            │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**Layout decision — 2-up field pairs on ≥sm.** Company/name and email/phone pair into
`grid grid-cols-1 gap-4 sm:grid-cols-2` rows; team-size and needs are full-width. Rationale: 6
fields read as a longer form than contact's 4 — pairing the four short single-line fields halves
the vertical scroll on desktop/tablet while every field stays full-width and ≥44px on mobile
(`grid-cols-1`). This is the one layout divergence from the contact form (single-column); it stays
inside the grammar (same `fieldClasses`, `Field`, gap rhythm) and never breaks 375px. The form
container stays `max-w-xl` like contact.

### Fields (6 + honeypot)

| Field | name | Type | Required | Notes |
|---|---|---|---|---|
| Company | `company` | `text` input | ✅ | `maxLength=QUOTE_COMPANY_MAX`; `autoComplete="organization"`; control-char stripped server-side |
| Contact name | `name` | `text` input | ✅ | `maxLength=QUOTE_NAME_MAX`; `autoComplete="name"`; control-char stripped |
| Email | `email` | `email` input | ✅ | `maxLength=QUOTE_EMAIL_MAX`; `autoComplete="email"`; `EMAIL_PATTERN` shape check server-side; becomes `replyTo` |
| Phone | `phone` | `tel` input | ⬜ optional | `maxLength=QUOTE_PHONE_MAX`; `autoComplete="tel"`; `inputMode="tel"` |
| Team size | `teamSize` | native `<select>` | ✅ | options = `QUOTE_TEAM_SIZES` (single source); first option is a disabled placeholder; membership-checked server-side |
| Needs | `needs` | `textarea` | ✅ | `maxLength=QUOTE_MESSAGE_MAX`; `min-h-32 resize-y`; live `CharacterCounter` |
| (honeypot) | `company_url` | off-screen `text` | — | `absolute left-[-9999px]` + `aria-hidden` wrapper + `tabIndex=-1` + `autoComplete="off"` |

> **`SelectField` (new primitive, inline in quote-form.tsx).** Same anatomy as `Field`: a
> `flex flex-col gap-1.5` wrapper, `<label htmlFor>` (`text-sm font-medium`), the control with
> `fieldClasses` + `aria-invalid`/`aria-describedby`, and a conditional `<FieldError>`. The
> control is `<select>` whose first `<option value="" disabled>` is the placeholder
> (`labels.teamSizePlaceholder`, e.g. "Selecciona un rango") and whose real options map over
> `QUOTE_TEAM_SIZES` with `defaultValue={state.values?.teamSize ?? ""}`. Use the **native**
> `<select>` — the keyboard/SR/mobile-picker-correct choice (AC-11); never a custom div-dropdown.
> The native arrow is acceptable; add `appearance-none` + a background chevron ONLY if it clashes
> visually.

### State Matrix (full — mirrors contact, serializable `QuoteFormState`)

| State | Visual | Behavior |
|---|---|---|
| **idle** | Empty fields with placeholders; team-size on its disabled placeholder; submit enabled reading "Solicitar cotización" | `initialQuoteFormState` (`status:"idle"`) |
| **submitting** (`pending`) | Submit disabled, label → "Enviando…"; form stays visible + filled; **no layout shift** | `useActionState` pending; `disabled={pending}` |
| **success** | Form `.reset()`s + counter → 0; a `role="status"` `.enter-fade` banner appears ("¡Solicitud enviada! Te contactaremos pronto."), receives focus; auto-hides after `QUOTE_SUCCESS_FEEDBACK_MS` (6000) | Effect keyed on `state.status`+`submissionId`; button returns to default label |
| **invalid** | Inline `text-destructive` `FieldError` under each offending field; `aria-invalid` + `aria-describedby` wired; **first invalid field focused**; typed values preserved | `{status:"invalid", fieldErrors, values}`; focus walk company→name→email→phone→teamSize→needs |
| **rate-limited** | `role="alert"` `bg-warning/10 text-warning` banner + `Alert02Icon`: "Espera un momento antes de enviar otra solicitud." (calm, glyph+text); values preserved | `{status:"rate-limited", values}`; no send |
| **error** | `role="alert"` `text-destructive` banner + `Alert02Icon`: "No pudimos enviar tu solicitud, inténtalo de nuevo."; submit label → "Reintentar"; values preserved; raw provider reason NEVER shown | `{status:"error", values}`; Retry re-submits preserved values |

First-invalid focus order (extends contact's 4-field walk to 6):
`company → name → email → phone → teamSize → needs`.

### Char counters — where warranted

- **Needs (textarea): YES.** Live `CharacterCounter` (reused verbatim): muted → `text-warning`
  within the last 10% → `text-destructive` at `QUOTE_MESSAGE_MAX`; `aria-live="polite"` only in the
  warn zone. Same as contact's message counter.
- **Company / name / email / phone: NO.** Short single-line caps; a counter would add noise (Emil:
  unseen restraint). `maxLength` on the input is the only ceiling surfaced; the server re-caps.

### Honeypot

Off-screen real input named **`company_url`** (a plausible-to-a-bot field name), wrapped in
`<div className="absolute left-[-9999px]" aria-hidden>` with `<label>` + `tabIndex={-1}` +
`autoComplete="off"` + `defaultValue=""`. Filled → `isQuoteHoneypotTripped` → server returns a
**FAKE `{status:"success"}`** (identical success banner) + a `console.warn`, **no send** —
indistinguishable from real success on the client (AC-7, edge 2).

---

## Copy Inventory (launch-grade, both locales)

> All strings live under the new **`empresas`** namespace (there is no `contacto` namespace — the
> Spanish `/contacto` route reads the `contact` namespace; `/empresas` follows the same convention
> with its own `empresas` namespace). Placeholder-quality bar: launch-grade, both locales, zero
> fabricated proof. es-MX is primary; en is a faithful equivalent (not a literal gloss). No numbers
> presented as social proof anywhere.

### `empresas` namespace — es-MX / en

```
empresas.metadata.title            "Cotizaciones para empresas · PosturPro"
                                    "Volume quotes for offices · PosturPro"
empresas.metadata.description       "Equipa el espacio de trabajo de tu equipo con sillas
                                     ergonómicas de múltiples marcas. Solicita una cotización por
                                     volumen — sin precios de autoservicio, atención directa."
                                    "Outfit your team's workspace with ergonomic chairs from
                                     multiple brands. Request a volume quote — no self-serve
                                     pricing, a direct reply."

── HERO (Hero component) ──
empresas.hero.title                 "Equipa a tu equipo con sillas que cuidan su postura"
                                    "Equip your team with chairs that protect their posture"
empresas.hero.subtitle              "Amueblamos oficinas con sillas ergonómicas de varias marcas.
                                     Cuéntanos el tamaño de tu equipo y te preparamos una
                                     cotización a la medida."
                                    "We furnish offices with ergonomic chairs from several brands.
                                     Tell us your team size and we'll prepare a quote tailored
                                     to you."
empresas.hero.cta                   "Solicitar cotización"           / "Request a quote"
empresas.hero.secondary             "¿Cómo funciona?"                / "How it works"
empresas.hero.imageAlt              "Espacio de trabajo de oficina equipado con sillas ergonómicas"
                                    "Office workspace furnished with ergonomic chairs"

── VALUE / PILLARS (B2BPillars) ──
empresas.value.heading              "Por qué PosturPro para oficinas"  / "Why PosturPro for offices"
empresas.value.pillars.ergonomics.title
                                    "Autoridad en ergonomía"           / "Ergonomics authority"
empresas.value.pillars.ergonomics.body
                                    "Curamos cada silla por cómo trata el cuerpo de quien se sienta
                                     en ella toda la jornada — postura primero, no solo estética."
                                    "We curate every chair for how it treats the body of the person
                                     sitting in it all day — posture first, not just looks."
empresas.value.pillars.brands.title "La selección más amplia"          / "The widest selection"
empresas.value.pillars.brands.body  "Varias marcas de sillas bajo un mismo techo, para que
                                     encuentres la opción correcta para cada rol de tu equipo."
                                    "Several chair brands under one roof, so you can find the right
                                     option for every role on your team."
empresas.value.pillars.value.title  "Precio por volumen"               / "Value at volume"
empresas.value.pillars.value.body   "Calidad premium a mejor precio, con una cotización pensada
                                     para el número de personas que vas a equipar."
                                    "Premium quality at a better price, with a quote sized to the
                                     number of people you're outfitting."

── PROCESS (B2BProcess) ──
empresas.process.heading            "Cómo funciona"                    / "How it works"
empresas.process.steps.request.title
                                    "Solicita tu cotización"           / "Request your quote"
empresas.process.steps.request.body "Llena el formulario con el tamaño de tu equipo y lo que
                                     necesitas. Sin compromiso."
                                    "Fill in the form with your team size and what you need.
                                     No commitment."
empresas.process.steps.reply.title  "Te contactamos"                   / "We get in touch"
empresas.process.steps.reply.body   "Una persona del equipo revisa tu solicitud y te responde
                                     directamente — sin precios automáticos."
                                    "Someone on our team reviews your request and replies to you
                                     directly — no automated pricing."
empresas.process.steps.quote.title  "Cotización a la medida"           / "A tailored quote"
empresas.process.steps.quote.body   "Recibes una propuesta de sillas y precio pensada para tu
                                     oficina y tu presupuesto."
                                    "You get a chair-and-price proposal built for your office and
                                     your budget."

── BRANDS (FeaturedBrands, reused) ──
empresas.brands.heading             "Marcas que manejamos"             / "Brands we carry"
empresas.brands.viewAll             "Ver todas las marcas"             / "View all brands"
                (viewAllHref = BRANDS_PATH; brand tiles pull live seeded brands)

── FORM (QuoteForm) ──
empresas.form.heading               "Solicita tu cotización"           / "Request your quote"
empresas.form.intro                 "Respondemos por correo. Entre más nos cuentes, mejor será la
                                     cotización."
                                    "We reply by email. The more you tell us, the better the quote."
empresas.form.company.label         "Empresa"                          / "Company"
empresas.form.company.placeholder   "Nombre de tu empresa"             / "Your company name"
empresas.form.name.label            "Nombre de contacto"               / "Contact name"
empresas.form.name.placeholder      "¿Con quién hablamos?"             / "Who are we speaking with?"
empresas.form.email.label           "Correo electrónico"               / "Email"
empresas.form.email.placeholder     "tucorreo@empresa.com"             / "you@company.com"
empresas.form.phone.label           "Teléfono"                         / "Phone"
empresas.form.phone.optional        "(opcional)"                       / "(optional)"
empresas.form.phone.placeholder     "10 dígitos"                       / "10 digits"
empresas.form.teamSize.label        "Tamaño del equipo"                / "Team size"
empresas.form.teamSize.placeholder  "Selecciona un rango"              / "Select a range"
empresas.form.teamSize.options.1-10   "1–10 personas"    / "1–10 people"
empresas.form.teamSize.options.11-50  "11–50 personas"   / "11–50 people"
empresas.form.teamSize.options.51-200 "51–200 personas"  / "51–200 people"
empresas.form.teamSize.options.200+   "Más de 200 personas" / "More than 200 people"
empresas.form.needs.label           "¿Qué necesitas?"                  / "What do you need?"
empresas.form.needs.placeholder     "Cuéntanos cuántas sillas, para qué roles, y cualquier
                                     preferencia de marca o presupuesto."
                                    "Tell us how many chairs, for which roles, and any brand or
                                     budget preferences."
empresas.form.charCount             "{count}/{max}"                    / "{count}/{max}"
empresas.form.submit                "Solicitar cotización"             / "Request a quote"
empresas.form.submitting            "Enviando…"                        / "Sending…"
empresas.form.retry                 "Reintentar"                       / "Try again"
empresas.form.honeypot              "No llenar este campo"             / "Do not fill this field"
empresas.form.success               "¡Solicitud enviada! Te contactaremos pronto."
                                    "Request sent! We'll be in touch soon."
empresas.form.errorGeneric          "No pudimos enviar tu solicitud, inténtalo de nuevo."
                                    "We couldn't send your request. Please try again."
empresas.form.rateLimited           "Espera un momento antes de enviar otra solicitud."
                                    "Please wait a moment before sending another request."

empresas.form.errors.companyRequired    "Escribe el nombre de tu empresa."   / "Enter your company name."
empresas.form.errors.companyTooLong     "El nombre es demasiado largo."       / "That name is too long."
empresas.form.errors.nameRequired       "Escribe un nombre de contacto."      / "Enter a contact name."
empresas.form.errors.nameTooLong        "El nombre es demasiado largo."       / "That name is too long."
empresas.form.errors.emailRequired      "Escribe tu correo electrónico."      / "Enter your email."
empresas.form.errors.emailInvalid       "Ese correo no parece válido."        / "That email doesn't look valid."
empresas.form.errors.emailTooLong       "El correo es demasiado largo."       / "That email is too long."
empresas.form.errors.phoneTooLong       "El teléfono es demasiado largo."     / "That phone number is too long."
empresas.form.errors.teamSizeRequired   "Elige el tamaño de tu equipo."       / "Choose your team size."
empresas.form.errors.teamSizeInvalid    "Elige una opción de la lista."       / "Choose an option from the list."
empresas.form.errors.needsRequired      "Cuéntanos qué necesitas."            / "Tell us what you need."
empresas.form.errors.needsTooLong       "El mensaje es demasiado largo."      / "That message is too long."
```

### Nav + footer keys

```
nav.items.offices        "Empresas"   / "For business"
footer.links.offices     "Empresas"   / "For business"
```

> **Label decision:** **es-MX "Empresas" / en "For business".** "Empresas" (companies) is the
> natural Spanish destination label and matches the `/empresas` slug. English uses **"For
> business"** rather than a literal "Companies" because it reads as an audience invitation on a
> storefront nav — clearer intent for the office-manager visitor. The slug stays `/empresas` in
> both locales; only the label localizes, consistent with every other route.

---

## Interaction Flows

### Flow A — Request a quote (happy path)
1. Visitor lands on `/empresas`; hero + pitch is **server-rendered, fully readable with no JS**.
2. Clicks **"Solicitar cotización"** (hero CTA) → in-page scroll to `#cotizacion` (native anchor;
   `scroll-mt-*` offsets the sticky header, mirroring `.static-heading:target`).
3. Fills the 6 fields; team-size via the native `<select>` (mobile shows the OS picker).
4. Submits → button disables, label → "Enviando…" (no layout shift; form stays filled).
5. Server: honeypot → validate → rate-limit → `sendQuoteRelay`. On `{ok:true}` → `{status:"success"}`.
6. Form clears, the `role="status"` `.enter-fade` success banner appears + takes focus ("¡Solicitud
   enviada! Te contactaremos pronto."), auto-hides after 6s. Next step implied ("we'll contact
   you") — no fabricated confirmation number.

### Flow B — "How it works" scan
1. Clicks hero secondary link **"¿Cómo funciona?"** → scroll to `#como-funciona` (§3).
2. Reads the 3 numbered steps → returns to the form via the §5 heading in view.

### Flow C — Validation error
1. Submits with company empty + malformed email → `{status:"invalid"}`.
2. Inline `FieldError`s render under company + email; **focus jumps to company** (first invalid);
   all typed values preserved; team-size keeps its selected option.

### Flow D — Owner email unconfigured / provider failure (edge 3, the real CI default)
1. Valid submit, but `EMAIL_OWNER_ADDRESS` unset → `sendQuoteRelay` → `{ok:false, reason}`.
2. Action logs reason **server-side only**, returns `{status:"error"}`; generic banner shows;
   submit label → "Reintentar"; values preserved; **raw reason never surfaced**.

### Flow E — Rate-limited flood (edge 4)
1. Same IP over `QUOTE_MAX_SUBMISSIONS_PER_WINDOW` → `{status:"rate-limited"}`.
2. Calm `bg-warning/10` `role="alert"` banner; values preserved; **quote limiter is its own
   instance** — a legit contact message is never throttled by quote traffic.

---

## Accessibility Checklist

- [ ] Every form control has an associated `<label htmlFor>` (company, name, email, phone,
      **teamSize `<select>`**, needs).
- [ ] Field errors wired via `aria-invalid` + `aria-describedby`; textarea `aria-describedby` also
      points at the live counter.
- [ ] First invalid field receives focus on `invalid` (keyboard user lands on the error).
- [ ] Success banner is `role="status"` + `tabIndex=-1` + receives focus; error / rate-limited
      banners are `role="alert"`.
- [ ] Status is **glyph + text** (`Alert02Icon` / `CheckmarkCircle02Icon`) — never color alone
      (colorblind-safe, AC-11).
- [ ] Team size is a **native `<select>`** — keyboard + SR + mobile-picker correct; never a custom
      div-dropdown.
- [ ] Honeypot wrapper `aria-hidden` + field `tabIndex=-1` — invisible to AT and keyboard.
- [ ] Hero CTA is a real `<a href="#cotizacion">`; §3 root `id="como-funciona"`; §5 root
      `id="cotizacion"`; both targets get `scroll-mt-24` (or the shell header height) — anchors work
      without JS and clear the sticky header.
- [ ] All text over imagery sits on the cobalt scrim / caption bar (8.37:1); no raw text on photo.
- [ ] Section titles are real `<h2>`s under the page `<h1>` (hero headline); logical heading order.
- [ ] `.enter-fade` / `.stagger` degrade to opacity-only under `prefers-reduced-motion`; no section
      relies on motion to be understood.
- [ ] Focus rings: every input/select/textarea/button inherits `focus-visible:ring-2 ring-ring` via
      `fieldClasses` / the shared `Button`.
- [ ] Tab order: nav → hero CTA → hero secondary → form fields in DOM order → submit. Logical.

---

## Design Tokens Used

- **Colors** (all from DESIGN.md, no new tokens): `--primary` (cobalt CTA, process seals, section
  titles), `--primary-foreground` (text on cobalt), `--foreground` (body ink), `--muted-foreground`
  (subcopy, meta), `--muted`/`--secondary` (blank-tile backing, glyph seals), `--border` (grout
  seams), `--card` (tile faces), `--ring` (focus), `--destructive` (field/form errors), `--warning`
  (rate-limit + counter warn). `--success`/`--gold`: **not used** (no proof/badge on this page).
- **Typography**: Display (hero) `text-4xl`→`lg:text-6xl` `font-heading` cobalt; H2/section
  `text-2xl`→`sm:text-3xl` `font-heading tracking-wide`; H3/tile-title `text-lg`→`sm:text-xl`; body
  `text-sm`→`sm:text-base leading-relaxed`; counter `tabular-nums`.
- **Spacing**: hero `py-16 md:py-24`; interior `py-8 md:py-10`; container
  `max-w-(--breakpoint-xl) px-4 md:px-6 lg:px-8`; grids `gap-4 md:gap-6`; `HomeSectionHeader`
  `mb-6 sm:mb-8` (more space above a heading than below).
- **Radius**: `rounded-md` (`--radius` 6px) on tiles/inputs/buttons/cartouche; `rounded-full` ONLY
  on the process number seals (deliberate seal-in-a-square exception).
- **Elevation**: flat glaze — `border border-border` at rest; cartouche `border-primary/30`;
  `shadow-sm` on hero media + brand tiles on hover (`.card-lift`). No heavy shadows.
- **Motion**: `--ease-out` (`cubic-bezier(0.23,1,0.32,1)`), 200ms enters; `.enter-fade`, `.stagger`
  (40ms step, cap 5), `.link-arrow` — all reused, all reduced-motion-gated.

---

## Image Slots (imagery.ts pattern)

| Slot | Add to | Aspect | Art direction | Degrade |
|---|---|---|---|---|
| **`B2B_HERO_IMAGE`** (NEW `string \| null`) | `src/lib/config/imagery.ts` (same file as `EDITORIAL_BAND_IMAGE`) | `4/3` (matches `HeroMedia`) | A real workspace scene consistent with DESIGN.md: bright cool-neutral daylight, an *office* furnished with chairs (the audience's scene), inside the cobalt cartouche frame. Licensed Unsplash stock, provenance in `public/images/SOURCES.md`. **Never proof imagery** (no branded logos, no "our client" framing). | `null` → `HeroMedia` blank-tile with a centered line-glyph. **Use `Building06Icon`** (or `Building03Icon`) instead of the chair glyph so the B2B fallback reads "offices", not "single product". Zero CLS (aspect box reserved). |

**Decision — one image slot, not two.** §1 hero carries the only photographic slot
(`B2B_HERO_IMAGE`). §2/§3 use **line-glyphs in seals**, not photos (icons drawn in the world's
grammar). §4 uses real brand logos/monograms via the existing `BrandLogo` (no new slot). A second
lifestyle band would be length without substance (Persuade: "sections that restate a claim add
length, not substance"). If the dev wants a §3 lifestyle band instead of numbered tiles, reuse
`EditorialBand` with `EDITORIAL_BAND_IMAGE` (already exists) rather than minting a new slot — but
the numbered-tile `B2BProcess` is the recommended, more honest treatment of "how it works".

> **Ship value:** `B2B_HERO_IMAGE` may ship as a real licensed office-workspace photo **or** `null`
> (Building blank-tile) for launch — both are AC-compliant and swap without layout rework. Ship a
> real workspace photo if one clears licensing; otherwise `null` reads as premium-not-broken.

---

## Nav / Footer Placement (exact)

### Nav — `src/components/layout/nav-items.ts`
- Extend the closed union: `key: "catalog" | "brands" | "styles" | "contact" | "offices"`.
- Append to `NAV_ITEMS` **after `contact`** (audience-secondary; primary shopping links lead):
  `{ key: "offices", href: "/empresas" }`.
- Flows automatically into the **desktop header** (`site-header.tsx:53`) and the **mobile drawer**
  (`mobile-nav.tsx:245`) — both iterate `NAV_ITEMS`. Label from `nav.items.offices`.
- Order: catalog → brands → styles → contact → **empresas** (last). B2B is confirmed-but-secondary.

### Footer — `src/components/layout/site-footer.tsx`
- The footer grid is already fully occupied at `lg:grid-cols-4` (store-info + STORE + HELP + LEGAL);
  **do not add a 5th column.** Add "Empresas" as a **new first entry in `STORE_LINKS`**:
  `const STORE_LINKS = [{ key: "offices", href: "/empresas" }, { key: "about", href: "/sobre-nosotros" }] as const;`
  Label from `footer.links.offices`.
- Rationale: the STORE (Tienda) column is the "who we are / what we offer" column; "Empresas" is an
  offer/audience destination that fits there, and the column is currently light (one link). No grid
  change, no new `footer.sections.*` key. Every href resolves to the live page → **zero dead links**
  (AC-8); existing links untouched.

---

## Responsive Spec (375 / 768 / 1024)

| Section | 375px (mobile) | 768px (tablet) | 1024px+ (desktop) |
|---|---|---|---|
| **Hero** | Copy stacked above 4/3 cartouche; CTA + secondary wrap; `text-4xl` | Same stack or `Hero` split begins; `text-5xl` | `lg:grid-cols-2` copy-left/media-right; `text-6xl` |
| **Pillars §2** | `grid-cols-1` — 3 tiles stacked | `sm:grid-cols-3` (short copy) or `sm:grid-cols-2` | `lg:grid-cols-3` |
| **Process §3** | `grid-cols-1` numbered tiles stacked | `sm:grid-cols-3` | `lg:grid-cols-3` |
| **Brands §4** | `grid-cols-1` (existing `FeaturedBrands`) | `sm:grid-cols-2` | `lg:grid-cols-3` |
| **Form §5** | All fields full-width single column; native `<select>` OS picker | Company/name + email/phone pair `sm:grid-cols-2`; teamSize/needs full | Same 2-up pairs; `max-w-xl`; submit `sm:self-start` |
| **Overflow** | **No horizontal overflow at 375 or 768** (AC-12) — all grids collapse to 1-col at `<sm`; container `px-4`; textarea `resize-y` only (no x). | — | — |

---

## Compliance Trace (AC → design)

- **AC-1/AC-2** — 5-section Persuade flow (hero pitch + 3-pillar value + process + form; brands as
  bonus breadth), inside the storefront shell, cobalt/roman-caps.
- **AC-3** — zero fabricated proof: pillars = real positioning, §4 = live seeded brands (omitted if
  empty), single image slot = licensed stock or null blank-tile; no hardcoded proof numbers.
- **AC-4** — 6 fields incl. native `<select>` over `QUOTE_TEAM_SIZES`; all labels/options from i18n.
- **AC-6/AC-7** — full state matrix + honeypot/validate/rate-limit ordering (form spec above).
- **AC-8/AC-9/AC-13** — nav+footer i18n links (zero dead), `generateMetadata` both locales, keys in
  both dictionaries + `CONSUMED_KEYS`.
- **AC-10** — cartouche frames, grout borders, roman-caps titles, `string|null` image slot,
  `.enter-fade` reduced-motion-gated; admin firewall untouched (no `ui/*`, no `:root`).
- **AC-11** — labeled controls + `aria-describedby` errors, native select, glyph+text status,
  8.37:1 scrim.
- **AC-12** — single-column collapse at `<sm`; no x-overflow at 375/768.

---

## Handoff notes for Dev (Stage 4)

- **New files (UI):** `src/components/b2b/b2b-sections.tsx` (`B2BPillars` + `B2BProcess`),
  `src/app/[locale]/empresas/quote-form.tsx` (clone contact-form; add inline `SelectField`).
- **Page RSC** (`empresas/page.tsx`) mirrors `contacto/page.tsx`: `resolveLocale` helper,
  `generateMetadata` from `empresas.metadata`, `setRequestLocale`, `getTranslations("empresas")`,
  build the flat `QuoteFormLabels` bag server-side, read brands via a `readB2BBrands()` helper
  (clone of the homepage `readFeaturedBrands` try/catch → `[]`), compose §1–§5. **No `notFound()`
  gate** — the page is copy-driven (not a `static_pages` row), so it renders even with empty content
  tables (edge 6).
- **Reuse verbatim:** `Hero`, `FeaturedBrands`, `HomeSectionHeader`, `fieldClasses`, `Field`,
  `FormBanner`, `SuccessBanner`, `FieldError`, `CharacterCounter`, `.enter-fade`, `.stagger`.
- **Icons (@hugeicons only):** hero fallback `Building06Icon`; pillars — ergonomics
  `Chair01Icon`, breadth `Store01Icon`/`Layers01Icon`, value `Tag01Icon`/`Coins01Icon`; form status
  `Alert02Icon`/`CheckmarkCircle02Icon`; hero secondary `ArrowRight01Icon`. Dev picks the closest
  available free-icon objects — never mix icon sets.
- **`QUOTE_TEAM_SIZES`** single-sources the `<select>` options AND the guard membership check — map
  over it in JSX (label via `empresas.form.teamSize.options.{value}`); do not duplicate the list.
- **Scroll anchors:** hero CTA `href="#cotizacion"`, secondary `href="#como-funciona"`; §3 root
  `id="como-funciona"`, §5 root `id="cotizacion"`; add `scroll-mt-24` to both targets.
- **Form container** stays `max-w-xl`; the only divergence from contact is the `sm:grid-cols-2` field
  pairing for the four short fields.
```
