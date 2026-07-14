# UI Design: T7 — Checkout & Order Creation

> Stage 3 (UI Design) artifact. Scope: the client-facing checkout surface only —
> layout, components, states, interactions, motion, responsiveness, a11y, and the
> i18n keys the UI consumes. The server action, RPC, and validation libs are dev
> concerns (Stage 4); this spec defines the props/contract the UI needs from them
> and the `CheckoutFormState` union the UI renders.
>
> **Taste authority applied:** `.claude/skills/emil-design-eng` +
> `.claude/skills/apple-design`. Motion terms use `.claude/skills/animation-vocabulary`.
> Every animation reuses an EXISTING globals.css class — this spec invents **no new
> motion CSS** (the cart/PDP motion layer already covers every case here).

---

## Design Principles for This Feature

1. **Reassurance over flourish.** Checkout is a trust moment (Apple: safety /
   responsibility). The visual language is calm, dense, and legible — no bounce,
   no confetti, no celebratory motion. Motion is confined to feedback (press),
   comprehension (crossfade of changing totals, field-error fade-in), and
   preventing jarring swaps (skeleton→content). Everything ≤ 300ms, `ease-out`.
2. **The order summary is the anchor.** The number the user is about to commit to
   is always visible: sticky right column at `lg+`, a collapsible summary + sticky
   bottom bar on mobile. It mirrors the cart's `OrderSummary` math EXACTLY
   (`computeShipping` / `totalCents` / `formatMXN`) so the total never changes
   between cart and checkout except by adding a valid discount.
3. **Single-page, sectioned flow — not a wizard.** Justified below (§Page Layout).
   All fields on one route; the summary + submit live in the anchor.
4. **Match the house system verbatim.** Cards = `rounded-lg border border-border
   bg-card p-4 md:p-5`. Inputs reuse the `fieldClasses` string from the Q&A form.
   The `Select` is the vendored shadcn one. `formatMXN` is the ONLY money boundary;
   all numbers `tabular-nums`. Icons are `@hugeicons/react` + core-free-icons only.
5. **The server is the boundary; the client is UX.** Every client validation is a
   convenience that mirrors the pure server guard (Q&A precedent). The form never
   claims a code is valid, a price is current, or stock exists — it renders what
   the action returns. No `$NaN`, ever (shipping `unavailable` → neutral label +
   blocked submit).
6. **Mobile-first, ≥44px tap targets, correct keyboards.** `h-11`/`min-h-11` on
   every primary control; `inputMode="numeric"` on CP & phone; `type="email"` on
   email. No horizontal scroll at 375px.

---

## Design Tokens Used

| Category | Tokens (Tailwind utility → CSS var) |
| --- | --- |
| Surfaces | `bg-background`, `bg-card`, `bg-muted`, `bg-input/20` (shadcn inputs), `bg-popover` (select) |
| Text | `text-foreground`, `text-muted-foreground`, `text-primary-foreground`, `text-destructive` |
| Accent (positive) | `text-emerald-600 dark:text-emerald-500` (free shipping, applied discount — matches `OrderSummary`) |
| Accent (warn) | `text-amber-600 dark:text-amber-400` (per-line "price changed" — matches Q&A counter-warn tint) |
| Borders / rings | `border-border`, `border-input`, `border-destructive`, `ring-ring/30`, `ring-destructive/20` |
| Radius | `rounded-md` (fields/buttons), `rounded-lg` (cards), from `--radius: 0.625rem` |
| Typography | `text-2xl md:text-3xl font-semibold tracking-tight` (h1), `text-sm font-medium` (section h2 / labels), `text-sm` body, `text-xs text-muted-foreground` (hints/errors), `tabular-nums` all money |
| Motion easing | `--ease-out` (enter/press) only — never `ease-in`. Consumed through existing classes. |
| Container | `mx-auto max-w-(--breakpoint-xl) px-4 py-8 md:px-6 lg:px-8` (identical to cart page + header + footer) |

**Existing motion classes reused (NO new CSS):**
`.enter-fade` (banners, empty state, success note, field errors), `.stagger`
(summary line items), `.price-value` (crossfade of subtotal/discount/total on
change), `.cart-press` (primary CTAs `scale(0.98)` on `:active`),
`.cart-step-press` (small icon buttons), `.select-content-motion` (state select
dropdown — already wired inside `SelectContent`), `.grid-pending`/`.grid-idle`
(dim the form region while `pending`).

---

## shadcn / Component Inventory Status (verified in `src/components/ui/`)

| Component | Exists? | Use in checkout |
| --- | --- | --- |
| `Button` + `buttonVariants` | ✅ | primary submit, empty CTA, banner recovery, discount "Aplicar" |
| `Input` | ✅ | (shadcn h-7) — NOTE: checkout uses the Q&A `fieldClasses` raw inputs, not `<Input>`, for visual parity (see below) |
| `Label` | ✅ | (renders `text-xs`) — checkout uses raw `<label class="text-sm font-medium">` for Q&A parity |
| `Select` + Trigger/Content/Item/Value | ✅ | the 32-state picker (Radix, keyboard/SR accessible, motion already wired) |
| `Badge` (variants: default/secondary/destructive/outline/ghost/link) | ✅ | applied-discount pill, "sin pago aún" pill on confirmation |
| Textarea | ❌ none | delivery notes → **raw `<textarea>` + `fieldClasses` + `min-h-24 resize-y`** (exactly how Q&A does it; do NOT add a ui component) |
| Card / Separator / Alert / Skeleton | ❌ none | cards = `rounded-lg border border-border bg-card p-4 md:p-5`; dividers = `border-t border-border`; alerts = `<p role="alert" class="enter-fade text-destructive">`; skeleton = inline `animate-pulse bg-muted`. **House convention — introduce no new primitives.** |

> **Field & label parity decision.** The Q&A form (the nearest form sibling) uses
> raw `<input>/<textarea>` with the `fieldClasses` string and raw
> `<label className="text-sm font-medium">`. The shadcn `Input`/`Label` render at
> smaller `h-7`/`text-xs` sizes tuned for dense admin UIs. For a comfortable,
> touch-friendly public checkout, **checkout mirrors the Q&A form**: `fieldClasses`
> inputs bumped to `min-h-11`, raw `text-sm` labels. Consistency with the nearest
> form beats reaching for the denser primitive.

**Shared field class (single-source it — copy from Q&A `qa-form.tsx`):**
```
"w-full min-h-11 rounded-md border border-border bg-background px-3 py-2 text-sm
 text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring
 focus-visible:ring-2 focus-visible:ring-ring/30 aria-invalid:border-destructive
 aria-invalid:ring-2 aria-invalid:ring-destructive/20"
```
(`min-h-11` added vs. the Q&A original so tap targets are ≥44px on mobile.)

**Icons (existing inventory — reuse, never mix sets):**
`ArrowRight01Icon` (submit / continue shopping), `ArrowLeft01Icon` (back to cart),
`Alert02Icon` (error banner + field/line errors, matches Q&A), `CheckmarkCircle02Icon`
(confirmation success + applied-discount), `Tick02Icon` (discount applied inline),
`Cancel01Icon` (dismiss banner / remove discount), `ShoppingCart01Icon` (empty state,
matches `CartEmptyState`), `Image01Icon` (summary line thumb fallback). Submitting
indicator = the Q&A **text swap** ("Realizar pedido" → "Procesando…") on a disabled
button — the established precedent; no spinner glyph.

---

## Page Layout

### Decision: single-page sectioned form (NOT a multi-step wizard)

The ticket says "multi-step or single-page — decide and justify."

**Chosen: one route (`/checkout`) with three stacked, titled sections** —
Contact → Shipping → Delivery notes — plus the discount field and the order
summary. **Reasons:**

- **Apple Simplicity + fewest steps.** Guest checkout has ~9 fields. A wizard adds
  navigation overhead (next/back, per-step validation, lost context) for no gain
  at this field count. Stripe/Shopify express checkouts are single-page for exactly
  this reason.
- **The `useActionState` precedent is one form, one action.** The Q&A form is a
  single `<form action={formAction}>`. A wizard fights that contract (holding
  partial state across steps). One form → one `placeOrder` submit is the natural,
  lower-risk shape and matches the codebase.
- **The summary must stay visible while filling.** A single page lets the sticky
  summary anchor the flow (Apple wayfinding — "where am I / what's the total").
- **Server re-validation returns per-field AND per-line errors at once.** On one
  page we can scroll/focus the first field error and highlight offending summary
  lines simultaneously — impossible cleanly across wizard steps.

"Sectioned" (grouped cards with `<h2>` headings) gives the *structure* of a
wizard's clarity without its navigation cost.

### Desktop (> 1024px, `lg`)

```
┌──────────────────────────────── max-w-(--breakpoint-xl) ─────────────────────────────────┐
│  [← Volver al carrito]                                                                      │
│  Finalizar compra                                                (h1, text-3xl)             │
│                                                                                            │
│  ┌────────────── FORM (2fr) ──────────────┐   ┌──────── SUMMARY (1fr, sticky top-20) ────┐ │
│  │ ┌─ Contacto ────────────────────────┐  │   │  Resumen del pedido                       │ │
│  │ │ Correo *      [ email          ]  │  │   │  ┌──────────────────────────────────────┐ │ │
│  │ │ Teléfono      [ tel            ]  │  │   │  │ [img] Silla Ergo ×2       $3,000.00  │ │ │
│  │ └───────────────────────────────────┘  │   │  │ [img] Cojín lumbar ×1       $450.00  │ │ │
│  │ ┌─ Envío ───────────────────────────┐  │   │  └──────────────────────────────────────┘ │ │
│  │ │ Nombre completo *  [ text       ]  │  │   │  ─────────────────────────────────────────│ │
│  │ │ Calle y número *   [ text       ]  │  │   │  Código de descuento                      │ │
│  │ │ Interior/Ref.      [ text       ]  │  │   │  [ code            ] [ Aplicar ]          │ │
│  │ │ Colonia/Ciudad *[text] CP *[5-dig] │  │   │  ✓ AHORRA10 aplicado      −$300.00       │ │
│  │ │ Estado *   [ Select 32 estados ▾ ] │  │   │  ─────────────────────────────────────────│ │
│  │ └───────────────────────────────────┘  │   │  Subtotal                  $3,450.00      │ │
│  │ ┌─ Notas de entrega (opcional) ─────┐  │   │  Descuento                 −$300.00       │ │
│  │ │ [ textarea min-h-24 resize-y    ]  │  │   │  Envío                     Gratis         │ │
│  │ │ RFC (opcional)     [ text       ]  │  │   │  ─────────────────────────────────────────│ │
│  │ └───────────────────────────────────┘  │   │  Total                     $3,150.00      │ │
│  │                                          │   │  [     Realizar pedido    →     ]        │ │
│  │  (global error banner renders here)      │   │  🔒 Sin pago todavía. El pago es el paso │ │
│  └──────────────────────────────────────────┘   │     siguiente.                            │ │
│                                                    └──────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```
Grid: `grid grid-cols-1 gap-8 lg:grid-cols-[2fr_1fr] lg:gap-10` (identical to
cart). Summary column wrapper: `lg:sticky lg:top-20 lg:self-start` (identical).

### Tablet (640–1024px, `md`)

Single-column form (field pairs may sit side-by-side at `sm+`, e.g. Colonia|CP).
The summary card sits **below** the form for full detail, and a **sticky bottom
action bar** (Total + submit) is shown for anything `< lg` so the total + submit
are always reachable. One responsive rule (bar visible below `lg`), no fragile
mid-width two-column.

### Mobile (375px, base)

```
┌───────────── 375px ─────────────┐
│ [← Volver al carrito]           │
│ Finalizar compra   (text-2xl)   │
│ ┌─ Resumen (colapsable) ─────┐ │  ← collapsed by default; tap header to expand
│ │ 2 artículos     $3,150.00 ▾│ │     (native <details>): item list + rows + discount
│ └────────────────────────────┘ │
│ ┌─ Contacto ─────────────────┐ │
│ │ Correo   [ full-width      ]│ │
│ │ Teléfono [ full-width      ]│ │
│ └────────────────────────────┘ │
│ ┌─ Envío ────────────────────┐ │
│ │ Nombre   [ full-width      ]│ │
│ │ Calle    [ full-width      ]│ │
│ │ Interior [ full-width      ]│ │
│ │ Colonia  [ full-width      ]│ │
│ │ Ciudad   [ full-width      ]│ │
│ │ CP       [ full-width num  ]│ │
│ │ Estado   [ Select ▾        ]│ │
│ └────────────────────────────┘ │
│ ┌─ Notas + RFC ──────────────┐ │
│ │ [ textarea                 ]│ │
│ │ RFC      [ full-width      ]│ │
│ └────────────────────────────┘ │
│ ┌─ Descuento ────────────────┐ │
│ │ [ code ] [ Aplicar ]        │ │
│ └────────────────────────────┘ │
│            ...scroll...          │
├─────────────────────────────────┤ ← sticky bottom bar (translucent, safe-area)
│ Total $3,150.00 [ Realizar → ] │
└─────────────────────────────────┘
```
- All fields stack full-width (`grid-cols-1`). Desktop side-by-side pairs
  (Colonia|CP) collapse to full-width rows.
- **Sticky bottom action bar** (`sticky bottom-0` / `fixed inset-x-0 bottom-0`):
  translucent per Apple §12 (`bg-background/85 backdrop-blur border-t border-border`),
  content scrolls under. Left `Total $X` (`tabular-nums`, `.price-value` keyed);
  right the submit `<button type="submit" class="h-11">`. `pb-[env(safe-area-inset-bottom)]`.
- Full itemized summary + discount reachable via the **top collapsible summary**
  so nothing is hidden. The in-card summary submit is `hidden lg:flex` (the sticky
  bar button is the single canonical submit `< lg` — one submit per form).

---

## Component Inventory

### 1. `CheckoutPage` (server component)

**Purpose:** Route entry — fetch settings, resolve metadata, render the client flow.
**Location:** `src/app/[locale]/checkout/page.tsx`
**shadcn base:** none.

Mirrors `carrito/page.tsx` exactly:
- `generateStaticParams()` (both locales), `setRequestLocale(locale)`.
- `generateMetadata` → `getTranslations({ namespace: "checkout" })` → `t("metadata.title")`.
- `const settings = await getStoreSettingsStatic();`
- `<CheckoutFlowClient flatRateCents={settings?.shipping_flat_rate_cents ?? null}
   freeThresholdCents={settings?.free_shipping_threshold_cents ?? null} />`.

No UI states of its own; the client island owns the container wrapper (as
`CartPageClient` does) and all states.

---

### 2. `CheckoutFlowClient` (`"use client"`)

**Purpose:** The whole checkout body — reads `useCart()`, drives
`useActionState(placeOrder, initialCheckoutFormState)`, renders skeleton / empty /
form+summary and every error/success state; clears the cart on success.
**Location:** `src/components/checkout/checkout-flow-client.tsx`
**shadcn base:** composes `Button`, `Select`, `Badge`; raw `<input>/<textarea>/<label>`.

**Props:**
```typescript
interface CheckoutFlowClientProps {
  /** From getStoreSettingsStatic() on the server; null when unavailable (edge 5). */
  flatRateCents: number | null;
  freeThresholdCents: number | null;
}
```

**Consumes from `useCart()`:** `{ lines, hydrated, subtotalCents }` (all confirmed
on the provider) + a cart-clear on success.
> **Cart-clear note for dev.** `useCart()` exposes `addItem/setQuantity/removeItem/
> keyFor` (no `clear()` per ticket). The confirmation page clears via a one-shot
> effect (empty localStorage through the provider, or loop `removeItem(keyFor(...))`).
> UI contract: after `status:"success"` + redirect, the header cart badge shows 0.

**Top-level render decision (mirrors `CartPageClient`):**
```
!hydrated                                          → <CheckoutSkeleton/>   (never flash empty / $NaN)
hydrated && lines.length === 0 && status!=="success" → <CheckoutEmptyState/> (AC-2)
otherwise                                          → <CheckoutBody/> (form + summary + states)
```
On `status:"success"` → `redirect(confirmationPath(orderNumber))` (locale-aware).

**One page-level `aria-live="polite"` region** (`sr-only`, `aria-atomic`) announces
the discount result, global submit errors, and "Procesando pedido…" — modeled on
`CartPageClient`'s region; no per-component duplicates.

**States:**

| State | Visual | Behavior |
| --- | --- | --- |
| Loading (pre-hydration) | `<CheckoutSkeleton>` sized to the real 2-col layout, `animate-pulse bg-muted`, `aria-hidden`; opacity crossfade to content (no reflow — mirror `CartSkeleton`) | No interaction; no submit; never `$NaN` |
| Empty | `<CheckoutEmptyState>` (§9) | No form; primary CTA → `CATALOG_PATH` |
| Ready (idle) | Form cards + summary; submit enabled | Client validation on submit (UX only) |
| Submitting (`pending`) | Form region dimmed via `.grid-pending` + `aria-busy`; every input `disabled`; submit "Procesando…" `disabled`; live region "Procesando pedido…" | `<form>` non-interactive; action not re-callable (AC-14 client half) |
| Field-invalid (`status:"invalid"`) | `.enter-fade` errors under each bad field; `aria-invalid`+`aria-describedby`; values preserved; focus → first invalid field | No DB write; user corrects & resubmits |
| Price-changed (`status:"price-changed"`) | Global amber banner + per-line amber "Precio actualizado: $X" in summary; summary re-renders to LIVE totals (`.price-value` crossfade) | No order written; user reviews & resubmits |
| Out-of-stock (`status:"out-of-stock"`) | Global destructive banner "un artículo se agotó" + affected summary line ringed `ring-destructive/40` + "Agotado" note | No order / no partial decrement (RPC rolled back) |
| Shipping-unavailable (`status:"shipping-unavailable"`) | Global banner "No podemos calcular el envío ahora"; summary shipping row neutral "Se calcula al pagar"; **submit disabled** | Never writes `shipping=0` (edge 5); retry CTA |
| Discount-invalid (inline, non-blocking) | `.enter-fade` note under discount field "Código no válido"; discount row hidden; totals at full price | Order still submittable (AC-7) |
| Error / retryable (`status:"error"`) | Global banner "No pudimos realizar tu pedido, inténtalo de nuevo" + retry; values preserved | Raw PG never echoed; logged server-side |
| Success (`status:"success"`) | Interim `role="status"` "Pedido recibido, redirigiendo…" before navigation | `redirect(confirmationPath(orderNumber))`; cart cleared |

---

### 3. `ContactSection`

**Purpose:** Email + phone.
**Location:** `src/components/checkout/contact-section.tsx` (or inline in the flow).
**shadcn base:** `fieldClasses` inputs.

```
┌─ Contacto ──────────────────────────────┐
│ Correo electrónico *                     │
│ [ type=email inputMode=email          ]  │
│ (error) ⚠ Ingresa un correo válido       │
│ Teléfono (opcional)                      │
│ [ type=tel inputMode=numeric          ]  │
└──────────────────────────────────────────┘
```

| Field | `name` | type / attrs | required | client mirror of server pure guard |
| --- | --- | --- | --- | --- |
| Email | `email` | `type="email" inputMode="email" autoComplete="email"` | ✅ | non-blank trimmed, basic email shape |
| Phone | `contact_phone` | `type="tel" inputMode="numeric" autoComplete="tel"` | ✗ | optional; bounded length if present |

Card: `rounded-lg border border-border bg-card p-4 md:p-5`; `<h2 class="text-sm
font-medium text-foreground">Contacto</h2>`; fields `flex flex-col gap-4`.

---

### 4. `ShippingAddressSection`

**Purpose:** Full Mexican shipping address incl. 5-digit CP + state Select.
**Location:** `src/components/checkout/shipping-address-section.tsx`
**shadcn base:** `fieldClasses` inputs + `Select`.

```
┌─ Envío ──────────────────────────────────────────┐
│ Nombre completo *      [ text                    ] │
│ Calle y número *       [ text                    ] │
│ Interior / Referencia  [ text                    ] │  (address_line2, optional)
│ ┌──────────────────────┐ ┌───────────────────────┐ │
│ │ Colonia / Ciudad *   │ │ Código postal *       │ │  (sm+: two columns)
│ │ [ text             ] │ │ [ 5-dig numeric      ]│ │
│ └──────────────────────┘ └───────────────────────┘ │
│ Estado *               [ Select ▾  32 estados    ] │
└────────────────────────────────────────────────────┘
```

| Field | `name` | type / attrs | required | validation |
| --- | --- | --- | --- | --- |
| Full name | `shipping_full_name` | text, `autoComplete="name"` | ✅ | non-blank trimmed (mirrors `customers_full_name_nonblank`) |
| Address line 1 | `address_line1` | text, `autoComplete="address-line1"` | ✅ | non-blank |
| Address line 2 | `address_line2` | text, `autoComplete="address-line2"` | ✗ | optional |
| City | `city` | text, `autoComplete="address-level2"` | ✅ | non-blank |
| Postal code | `postal_code` | text, `inputMode="numeric" maxLength={5} autoComplete="postal-code"` | ✅ | `MEXICAN_CP_PATTERN` = `/^\d{5}$/` |
| State | `state` | **`Select`** | ✅ | ∈ `MEXICAN_STATES` (32) |

**CP note:** text (not `type="number"` — number inputs allow `e/+/.` and strip
leading zeros, wrong for postal codes). `inputMode="numeric"` gives the numeric
keypad. Client may strip non-digits on input; the server regex is the boundary.

**State Select markup:**
```tsx
<Select name="state" defaultValue={values?.state}>
  <SelectTrigger className="h-11 w-full" aria-invalid={stateError || undefined}
    aria-describedby={stateError ? stateErrorId : undefined} data-testid="checkout-state">
    <SelectValue placeholder={t("shipping.statePlaceholder")} />
  </SelectTrigger>
  <SelectContent>
    {MEXICAN_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
  </SelectContent>
</Select>
```
> **Dev note — Radix Select + FormData.** Radix `Select` does not auto-submit in a
> plain `<form>`. Control the value and add a hidden `<input type="hidden"
> name="state" value={state}>`, or use Radix form integration. UI contract: the
> trigger shows the choice, the dropdown scales from the trigger
> (`.select-content-motion`, already wired), and `state` reaches `FormData`. 32
> items → the Select scrolls (max-height + scroll buttons already in `SelectContent`).
> Trigger overridden to `h-11 w-full` (default is `h-7 w-fit`).

---

### 5. `DeliveryNotesSection`

**Purpose:** Free-text delivery notes + optional RFC.
**Location:** `src/components/checkout/delivery-notes-section.tsx`
**shadcn base:** raw `<textarea>` (no ui component) + `fieldClasses` input.

```
┌─ Notas de entrega (opcional) ────────────┐
│ [ textarea min-h-24 resize-y            ] │
│ RFC (opcional, para factura)              │
│ [ text uppercase                        ] │
│ Solo si necesitas factura (Fase 3).       │  (text-xs muted hint)
└────────────────────────────────────────────┘
```

- Textarea: `name="delivery_notes"`, `className={cn(fieldClasses,"min-h-24 resize-y")}`
  (exact Q&A treatment); `maxLength` bounded by `DELIVERY_NOTES_MAX`; optional live
  counter can reuse the Q&A `CharacterCounter` if capped.
- RFC: `name="rfc"`, optional, `autoCapitalize="characters"`, bounded length. No
  RFC-shape validation in Phase 1 (CFDI is Phase 3) — captured/stored only.

---

### 6. `DiscountCodeField`

**Purpose:** Enter + apply a discount code; render idle / checking / applied /
invalid / degraded.
**Location:** `src/components/checkout/discount-code-field.tsx` (in the summary
column at `lg`; own card section on mobile).
**shadcn base:** `fieldClasses` input, `Button`, `Badge`.

**Interaction model.** Validated **server-side** (AC-6/AC-7). Two viable
implementations — dev picks; this spec designs BOTH:
- **(A) Async pre-check (recommended):** a `checkDiscount` server action (or the
  main action with an `intent` field) via `useTransition`, so the user sees
  applied/invalid **before** placing the order; the applied code is carried in a
  hidden input into the main submit and **re-validated there** (never trust the
  client's "applied" claim).
- **(B) Validate-on-submit only:** the code is just a field; its result returns with
  `placeOrder`. Simpler but later feedback. **(A) is the better UX**; the states
  below cover the async check.

**States:**

| State | Visual | Behavior |
| --- | --- | --- |
| Idle | `[ input "Código de descuento" ] [ Aplicar ]` (button `variant="outline"`, `h-11 shrink-0`) | Empty allowed (field optional) |
| Checking | Button "Verificando…" `disabled`; input `disabled`; `.grid-pending` on the field group; live region "Verificando código" | Async check in flight; interruptible |
| Applied (valid) | Input row replaced by `Badge` `✓ AHORRA10` (uppercased) + muted `−$300.00` + `Cancel01Icon` "Quitar" button; emerald tint; discount row appears in summary (`.price-value`) | Hidden input carries the normalized code into submit; "Quitar" clears → full price |
| Invalid/expired/below-min/exhausted/unknown | `.enter-fade` inline note under field, `text-destructive`, `Alert02Icon`, reason-specific copy; field keeps its value | Order proceeds at full price (AC-7); NEVER blocks submit |
| Degraded (lookup errored) | Neutral note "No pudimos verificar el código ahora — puedes continuar sin él." | Non-blocking; treat as no discount; retry or proceed |

Layout (`lg`, in summary): `flex gap-2`, button `shrink-0`. Mobile: own card,
same row, both `h-11`.

**Applied wireframe:**
```
Código de descuento
┌──────────────────────────────┐
│ ✓  AHORRA10        −$300.00  ✕│   (emerald, Badge + amount + remove)
└──────────────────────────────┘
```

---

### 7. `CheckoutSummary`

**Purpose:** Itemized review + discount + three-state shipping + total; hosts the
discount field and (at `lg`) the submit. Visual + math twin of the cart
`OrderSummary`, extended with line items and a discount row.
**Location:** `src/components/checkout/checkout-summary.tsx`
**shadcn base:** card pattern; `formatMXN` / `computeShipping` / `totalCents` reused verbatim.

```
┌─ Resumen del pedido ─────────────────────┐
│  ┌──────────────────────────────────────┐│
│  │ [img] Silla Ergonómica Pro           ││   ← line items (.stagger entrance)
│  │       Negro · ×2          $3,000.00   ││      thumb + name + variant + qty + line total
│  │ [img] Cojín Lumbar        ×1  $450.00 ││
│  └──────────────────────────────────────┘│
│  ─────────────────────────────────────────│
│  Subtotal                    $3,450.00    │   ← tabular-nums, .price-value keyed
│  Descuento                   −$300.00     │   ← emerald; only when discountCents>0
│  Envío                       Gratis       │   ← ShippingValue (flat/free/unavailable)
│  ─────────────────────────────────────────│
│  Total                       $3,150.00    │   ← font-semibold text-base, .price-value keyed
│  [       Realizar pedido      →       ]   │   ← h-11 w-full .cart-press; disabled when blocked
│  🔒 Sin pago todavía. El pago es el       │   ← text-xs muted reassurance
│     siguiente paso.                        │
└────────────────────────────────────────────┘
```

**Props:**
```typescript
interface CheckoutSummaryLine {
  key: string;                       // cartLineKey (productId::variantId)
  name: string;
  variantLabel: string | null;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  coverImageUrl: string | null;
}

interface CheckoutSummaryProps {
  lines: CheckoutSummaryLine[];      // display snapshot; server re-validates
  subtotalCents: number;
  shipping: ShippingResult;          // { kind:"flat";cents } | { kind:"free" } | { kind:"unavailable" }
  discountCents: number;             // 0 when no valid code
  totalCents: number;                // subtotal + shipping - discount
  submitDisabled: boolean;           // shipping unavailable OR pending
  pending: boolean;
  lineIssues?: Record<string, "price-changed" | "out-of-stock">; // keyed by cartLineKey
  labels: CheckoutSummaryLabels;
}
```

**Row rendering (mirror `OrderSummary`):**
- Money via `formatMXN`; wrap the changing value in `<span key={value}
  className="price-value" data-testid=...>` so it crossfades on change.
- **Discount row** only when `discountCents > 0`: `text-emerald-600 dark:text-emerald-500`,
  value prefixed `−`.
- **Shipping row** = the exact `ShippingValue` switch from `OrderSummary`
  (`free`→emerald "Gratis", `flat`→`formatMXN`, `unavailable`→muted "Se calcula al pagar").
- Total: `border-t border-border pt-3`, `text-base font-semibold tabular-nums`.
- **Submit:** `<Button type="submit" className="cart-press h-11 w-full gap-1.5 text-sm"
  disabled={submitDisabled}>` + `ArrowRight01Icon`; text swaps to "Procesando…" when
  `pending`. Lives INSIDE the single `<form>`. Hidden `hidden lg:flex` at `< lg`
  (sticky-bar button is canonical there — one submit per form).
- **Reassurance line:** `text-xs text-muted-foreground` from `summary.noPaymentYet`.

**Per-line issue treatment:** when `lineIssues[key]` is set, wrap that line in
`rounded-md ring-1` — `ring-destructive/40` (out-of-stock) or `ring-amber-500/40`
(price-changed) — with a small `.enter-fade` note under it ("Agotado" /
"Precio actualizado: $X"), `text-destructive` / `text-amber-600`.

**Mobile:** the summary is the top collapsible accordion; collapsed header shows
"{N} artículos · Total $X".

---

### 8. `CheckoutSkeleton`

**Purpose:** Pre-hydration placeholder; no empty-flash / `$NaN`.
**Location:** inside `checkout-flow-client.tsx`. **shadcn base:** none.

Sized to the real 2-col layout (title, three form cards with `h-4/h-3` label bars +
`h-11` field bars, and a `h-80` summary block) so the swap is a pure opacity
crossfade (mirror `CartSkeleton`). `data-testid="checkout-skeleton"`, `aria-hidden`.

```
┌ ▁▁▁▁▁▁ (title) ┐
│ ┌ card ─────┐  ┌ summary ┐ │
│ │ ▁▁  ▂▂▂▂▂ │  │ ▂▂▂▂▂▂  │ │   (animate-pulse bg-muted)
│ │ ▁▁  ▂▂▂▂▂ │  │ ▂▂▂▂▂▂  │ │
│ └───────────┘  │ ▂▂▂▂▂▂  │ │
│ ┌ card ─────┐  └─────────┘ │
└────────────────────────────┘
```

---

### 9. `CheckoutEmptyState` (or reuse `CartEmptyState`)

**Purpose:** Cart empty (or became empty) → block ordering, offer catalog CTA (AC-2).
**Location:** `src/components/checkout/checkout-empty-state.tsx` OR reuse `CartEmptyState`.
**shadcn base:** `buttonVariants` Link.

> **Reuse note.** `CartEmptyState` already renders exactly this (icon + title +
> subtitle + catalog CTA, `.enter-fade`, `cart-press`, `ShoppingCart01Icon size=40`).
> **Prefer reusing it** with `checkout.empty.*` labels; fork only if copy diverges.

```
        ┌──────────────────────┐
        │        🛒            │   ShoppingCart01Icon size 40, muted
        │  Tu carrito está     │
        │      vacío           │
        │  Agrega artículos    │
        │  antes de finalizar  │
        │  la compra.          │
        │  [   Ver sillas   ]  │   → CATALOG_PATH
        └──────────────────────┘
```
`.enter-fade` entrance. No form, no summary, no submit anywhere in this state.

---

### 10. `ConfirmationPage` + `OrderConfirmation`

**Purpose:** Post-order confirmation by order number (AC-13). Server reads the
order via the admin client; renders order number, summary, shipping address, and
the "no payment yet" note; the client child clears the cart.
**Location:** `src/app/[locale]/checkout/confirmacion/[orderNumber]/page.tsx`
(server) + `src/components/checkout/order-confirmation.tsx` (client cart-clear).
**shadcn base:** card pattern, `Badge`, `buttonVariants` Link.

```
┌──────────────────────── max-w-2xl centered ────────────────────────┐
│                        ✓  (CheckmarkCircle02Icon, emerald, size 48) │
│              ¡Gracias! Recibimos tu pedido        (h1, text-2xl)     │
│              Pedido  #PP-2026-000123              (tabular-nums)      │
│  ┌─ Sin pago todavía ─────────────────────────────────────────────┐│
│  │ 🔒 Aún no procesamos ningún pago. El pago es el siguiente paso  ││  (muted card)
│  │    y te contactaremos para completarlo.                         ││
│  └─────────────────────────────────────────────────────────────────┘│
│  ┌─ Resumen ──────────────┐   ┌─ Envío ─────────────────────────┐ │
│  │ [img] Silla ×2 $3,000  │   │ Juan Pérez                       │ │
│  │ [img] Cojín ×1  $450   │   │ Av. Reforma 123, Int 4           │ │
│  │ ─────────────────────  │   │ Roma Norte                       │ │
│  │ Subtotal    $3,450     │   │ Ciudad de México, CDMX  06700    │ │
│  │ Descuento   −$300      │   │ Tel: 55 1234 5678                │ │
│  │ Envío       Gratis     │   │ Notas: dejar con el portero      │ │
│  │ Total       $3,150     │   └──────────────────────────────────┘ │
│  └────────────────────────┘                                        │
│              [   Seguir comprando   →   ]      → CATALOG_PATH         │
└──────────────────────────────────────────────────────────────────────┘
```

- Layout: centered `mx-auto max-w-2xl px-4 py-12`; two cards `grid gap-6
  md:grid-cols-2`, stack on mobile; `.enter-fade` on the header block.
- Order number: `text-lg font-semibold tabular-nums`, selectable; uses
  `formatOrderNumber` output verbatim.
- "No payment yet" note **required** (AC-13): muted card / `Badge` with a lock/
  `Alert02Icon`, copy `confirmation.noPaymentYet`.
- Cart clear: `OrderConfirmation` (tiny `"use client"`) runs a one-shot mount
  effect that clears the cart via the provider (guarded to run once).

**Confirmation route states:**

| State | Visual | Behavior |
| --- | --- | --- |
| Valid order number | Full confirmation | Cart cleared on mount |
| Unknown / malformed number | `notFound()` → existing 404 (`.enter-fade`) | No data leak |
| Loading | Server-rendered → Next route loading handles it | — |

> **Privacy note (Security stage).** The route reads an order by `order_number` via
> the admin client; `order_number` is guessable-ish and Phase 1 has no accounts, so
> anyone with the URL sees the confirmation. Flag for Security — an opaque token id
> is a known follow-up (out of scope here). The UI renders only the order's own
> snapshot (no cross-order data).

---

## `CheckoutFormState` (the union the UI renders)

**Location:** `src/app/[locale]/checkout/checkout-form-state.ts` (sibling to the
`"use server"` action — Q&A `qa-form-state.ts` rule: a `"use server"` file may only
export async functions).

```typescript
import type { AddressFieldErrorKey } from "@/lib/checkout/address";

export type CheckoutStatus =
  | "idle"
  | "success"
  | "invalid"              // field-level address/contact errors
  | "price-changed"        // ≥1 line's live price ≠ snapshot
  | "out-of-stock"         // ≥1 line lacks live stock / lost last-unit race
  | "shipping-unavailable" // store_settings unreadable (edge 5)
  | "error";              // generic retryable (DB/CHECK/network; never echo PG)

export type CheckoutField =
  | "email" | "contact_phone"
  | "shipping_full_name" | "address_line1" | "address_line2"
  | "city" | "postal_code" | "state"
  | "delivery_notes" | "rfc";

export type DiscountResult =
  | { kind: "none" }
  | { kind: "applied"; code: string; discountCents: number }
  | { kind: "invalid"; reason: "unknown" | "expired" | "inactive" | "below-min" | "exhausted" }
  | { kind: "degraded" };

export interface CheckoutFormValues {
  email: string; contact_phone: string;
  shipping_full_name: string; address_line1: string; address_line2: string;
  city: string; postal_code: string; state: string;
  delivery_notes: string; rfc: string;
  discountCode: string;
}

export interface CheckoutFormState {
  status: CheckoutStatus;
  /** Address/contact field → error key (localized in the form). */
  fieldErrors?: Partial<Record<CheckoutField, AddressFieldErrorKey>>;
  /** Per-line issues keyed by cartLineKey. */
  lineErrors?: Record<string, "price-changed" | "out-of-stock">;
  /** Discount outcome to render inline (never blocks submit). */
  discount?: DiscountResult;
  /** Preserved input so the form stays filled on failure (absent on success). */
  values?: CheckoutFormValues;
  /** Present only on success — drives the redirect. */
  orderNumber?: string;
  /** Increments on every action call (Q&A submissionId pattern). */
  submissionId: number;
}

export const initialCheckoutFormState: CheckoutFormState = {
  status: "idle",
  submissionId: 0,
};
```

**Form-message resolver** (mirror Q&A `resolveFormMessage`): non-field status →
global banner copy — `price-changed`→`banner.priceChanged`,
`out-of-stock`→`banner.outOfStock`, `shipping-unavailable`→`banner.shippingUnavailable`,
`error`→`banner.error`; `invalid`/`success`/`idle` → no banner.

---

## Interaction Flows

### Flow A — Happy path (place order)
1. Arrive from cart CTA → `/checkout`. Skeleton until `hydrated` (opacity crossfade, no reflow).
2. Form + sticky summary render; summary total == cart total (same math).
3. Fill contact + shipping. On submit, client convenience validation flags obvious
   errors (`.enter-fade`) but does not block typing.
4. (Optional) Enter discount → "Aplicar" → **Checking** → **Applied**: badge +
   `−$X` in summary (`.price-value`), live region announces the saving; total updates.
5. Tap **Realizar pedido** → button "Procesando…" + `disabled`; form region
   `.grid-pending` + `aria-busy`; live region "Procesando pedido…".
6. Success → `status:"success"` + `orderNumber` → interim `role="status"` → `redirect(confirmationPath)`.
7. Confirmation renders; `OrderConfirmation` clears cart on mount → header badge 0.

### Flow B — Field validation failure
1. Submit with a missing required field / bad CP / no state.
2. Action → `status:"invalid"` + `fieldErrors` + preserved `values` + incremented `submissionId`.
3. Values intact; `.enter-fade` errors; `aria-invalid`+`aria-describedby` wired;
   **focus → first invalid field** (effect keyed on `submissionId`, Q&A pattern).

### Flow C — Price drift / out of stock (server re-validation)
1. Address passes; server re-reads live product/variant rows.
2. Mismatch → `price-changed` / `out-of-stock` + `lineErrors` (+ refreshed live totals).
3. Global amber/destructive banner (`.enter-fade`, `Alert02Icon`, dismissible via
   `Cancel01Icon`, "Revisar" affordance); affected lines ringed + inline note;
   summary totals crossfade to live values. **No order written.** Resubmit.

### Flow D — Shipping unavailable (edge 5)
1. `store_settings` unreadable → shipping `unavailable`.
2. Summary shipping row neutral "Se calcula al pagar" (never `$NaN`); global banner;
   **submit disabled**; retry re-runs the action.

### Flow E — Double submit (AC-14, edge 7)
1. Double-click/retry → button `disabled` while `pending` + `aria-busy` form (client
   guard); server idempotency key is the real backstop; an idempotent retry shows
   the SAME confirmation.

---

## Responsive Summary

| Breakpoint | Layout |
| --- | --- |
| **< 640px (375px)** | Single column, all fields full-width (Colonia/CP/State each own row). Summary = top collapsible accordion + **sticky bottom action bar** (Total + submit, translucent, safe-area). Fields `min-h-11`; numeric keypads. No horizontal scroll. In-card summary submit `hidden lg:flex`; sticky-bar button canonical. |
| **640–1024px (768px)** | Single-column form (pairs may sit `sm+`, e.g. Colonia|CP). Summary card below the form; sticky bottom bar still shown (`< lg`) so Total + submit stay reachable. |
| **> 1024px (desktop)** | `grid-cols-[2fr_1fr] gap-10`: form left, summary right `sticky top-20 self-start`. Bottom bar `lg:hidden`; in-card summary submit shown. |

---

## Motion Spec (all reuse existing globals.css classes — NO new CSS)

| # | Element | Effect (vocabulary) | Trigger | Property | Easing | Duration | Class | Reduced-motion |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M1 | Skeleton → content | Crossfade | `hydrated` flips | `opacity` | ease-out | 200ms | `.enter-fade` on content; skeleton `animate-pulse` | opacity only (class gates) |
| M2 | Summary line items | Stagger (rise + fade) | mount | `opacity`+`transform` | ease-out | 200ms, ≤40ms/item cap 240ms | `.stagger` (inline `transitionDelay`) | opacity only, no delay (class gates) |
| M3 | Subtotal / discount / total | Crossfade (number change) | value change | `opacity` | ease-out | 150ms | `.price-value` keyed on value | instant (class gates) |
| M4 | Primary submit / CTAs | Press feedback | `:active` | `scale(0.98)` | ease-out | 100ms | `.cart-press` | none (class gates) |
| M5 | Discount "Aplicar" / small icon btns | Press feedback | `:active` | `scale(0.97)` | ease-out | 90ms | `.cart-step-press` | none |
| M6 | State Select dropdown | Origin-aware Scale in ("Pop in", no bounce) | open/close | `opacity`+`transform` | ease-out | 200/150ms | `.select-content-motion` (already in `SelectContent`) | opacity only |
| M7 | Field errors / banners / success note | Fade + slight rise | render | `opacity`+`transform` | ease-out | 200ms | `.enter-fade` | opacity only |
| M8 | Form region while submitting | Pending dim | `pending` | `opacity → 0.6` | ease | 200ms | `.grid-pending` / `.grid-idle` | keeps dim, drops transition (class gates) |
| M9 | Discount field while checking | Pending dim | checking | `opacity → 0.6` | ease | 200ms | `.grid-pending` | as M8 |
| M10 | Mobile summary accordion | Accordion / Collapse | tap header | height/opacity | ease-out | ≤250ms | native `<details>` (or crossfade the panel opacity) | opacity only |
| M11 | Mobile sticky bar | Translucent chrome (static) | — | `backdrop-blur` (no motion) | — | — | `bg-background/85 backdrop-blur border-t` | frostier under `prefers-reduced-transparency` |

> **No animation on:** typing, focus (only the built-in `focus-visible:ring`), or
> the Select's per-item hover (Radix default). No bounce/celebratory motion — a
> professional high-trust surface (Emil: match motion to mood). Enter animations
> are `ease-out`; nothing uses `ease-in`.

---

## Accessibility Checklist

- [ ] Every input has a visible `<label>` bound via `htmlFor`/`useId` (Q&A pattern).
- [ ] State picker is Radix `Select` (keyboard + SR accessible); value reaches
      `FormData` via hidden input or Radix form integration.
- [ ] `aria-invalid` + `aria-describedby` on every field with an error; error text `role="alert"`.
- [ ] Focus → first invalid field on `status:"invalid"` (effect keyed on `submissionId`).
- [ ] One page-level `aria-live="polite"` region for discount result, global errors,
      "Procesando pedido…" — no per-component duplicates.
- [ ] Color is never the only signal: free ship / applied discount pair emerald with
      text ("Gratis"/"aplicado"/`✓`); out-of-stock pairs the ring with "Agotado";
      price-changed pairs amber with "Precio actualizado".
- [ ] Logical tab order: back link → email → phone → name → address → city → CP →
      state → notes → RFC → discount → submit.
- [ ] Submit: `type="submit"`, `disabled` while `pending`/blocked; text swap not
      spinner-only (announced via disabled + live-region).
- [ ] `type="email"`, `inputMode="numeric"` (CP, phone) for correct mobile keyboards.
- [ ] `prefers-reduced-motion` honored — every motion class already gates it.
- [ ] Confirmation success uses `role="status"`; order number is selectable text.
- [ ] ≥44px tap targets: `h-11`/`min-h-11` on primary controls; sticky bar `h-11` +
      `pb-[env(safe-area-inset-bottom)]`.
- [ ] No horizontal scroll at 375px (full-width fields; no fixed-width rows).

---

## i18n — new `checkout` namespace (BOTH `es-MX.json` default + `en.json`)

Add a top-level `"checkout"` key alongside the existing 11 namespaces (`metadata`,
`nav`, `toggle`, `footer`, `whatsapp`, `home`, `notFound`, `error`, `catalog`,
`product`, `cart`). All copy here — **no hardcoded strings**. Money via `formatMXN`
only. Interpolation uses the existing `interpolate` (`{amount}`/`{count}` via
`t.raw`) and ICU plural patterns (the `cart` namespace uses both).

```jsonc
"checkout": {
  "metadata": { "title": "Finalizar compra" },
  "title": "Finalizar compra",
  "backToCart": "Volver al carrito",

  "empty": {
    "title": "Tu carrito está vacío",
    "subtitle": "Agrega artículos antes de finalizar la compra.",
    "cta": "Ver sillas"
  },

  "contact": {
    "heading": "Contacto",
    "email": "Correo electrónico",
    "emailPlaceholder": "tucorreo@ejemplo.com",
    "phone": "Teléfono (opcional)",
    "phonePlaceholder": "55 1234 5678"
  },

  "shipping": {
    "heading": "Envío",
    "fullName": "Nombre completo",
    "addressLine1": "Calle y número",
    "addressLine2": "Interior / Referencia (opcional)",
    "city": "Colonia / Ciudad",
    "postalCode": "Código postal",
    "postalCodePlaceholder": "00000",
    "state": "Estado",
    "statePlaceholder": "Selecciona un estado"
  },

  "notes": {
    "heading": "Notas de entrega (opcional)",
    "placeholder": "Instrucciones para la entrega…",
    "rfc": "RFC (opcional, para factura)",
    "rfcHint": "Solo si necesitas factura (Fase 3)."
  },

  "discount": {
    "label": "Código de descuento",
    "placeholder": "Código de descuento",
    "apply": "Aplicar",
    "checking": "Verificando…",
    "remove": "Quitar código",
    "appliedLabel": "Código {code} aplicado",
    "savings": "Ahorras {amount}",
    "invalid": {
      "unknown": "Código no válido.",
      "expired": "Este código ya expiró.",
      "inactive": "Este código no está disponible.",
      "belowMin": "No alcanzas la compra mínima para este código.",
      "exhausted": "Este código ya no está disponible."
    },
    "degraded": "No pudimos verificar el código ahora — puedes continuar sin él."
  },

  "summary": {
    "heading": "Resumen del pedido",
    "itemQuantity": "×{count}",
    "subtotal": "Subtotal",
    "discount": "Descuento",
    "shipping": "Envío",
    "shippingFree": "Gratis",
    "shippingUnavailable": "Se calcula al pagar",
    "total": "Total",
    "itemsCount": "{count, plural, one {# artículo} other {# artículos}}",
    "noPaymentYet": "Sin pago todavía. El pago es el siguiente paso.",
    "lineOutOfStock": "Agotado",
    "linePriceChanged": "Precio actualizado: {amount}"
  },

  "submit": "Realizar pedido",
  "submitting": "Procesando…",

  "validation": {
    "emailRequired": "Ingresa tu correo electrónico.",
    "emailInvalid": "Ingresa un correo válido.",
    "fullNameRequired": "Ingresa tu nombre completo.",
    "addressRequired": "Ingresa tu calle y número.",
    "cityRequired": "Ingresa tu colonia o ciudad.",
    "postalCodeRequired": "Ingresa tu código postal.",
    "postalCodeInvalid": "El código postal debe tener 5 dígitos.",
    "stateRequired": "Selecciona un estado."
  },

  "banner": {
    "priceChanged": "El precio de un artículo cambió. Revisa tu pedido e inténtalo de nuevo.",
    "outOfStock": "Un artículo se agotó. Revisa tu pedido e inténtalo de nuevo.",
    "shippingUnavailable": "No podemos calcular el envío ahora. Inténtalo de nuevo.",
    "error": "No pudimos realizar tu pedido. Inténtalo de nuevo.",
    "dismiss": "Cerrar",
    "review": "Revisar pedido",
    "retry": "Reintentar"
  },

  "processing": "Procesando pedido…",

  "confirmation": {
    "metadata": { "title": "Pedido confirmado" },
    "title": "¡Gracias! Recibimos tu pedido",
    "orderNumberLabel": "Pedido",
    "noPaymentTitle": "Sin pago todavía",
    "noPaymentYet": "Aún no procesamos ningún pago. El pago es el siguiente paso y te contactaremos para completarlo.",
    "summaryHeading": "Resumen",
    "shippingHeading": "Envío",
    "keepShopping": "Seguir comprando",
    "notesLabel": "Notas",
    "phoneLabel": "Tel"
  },

  "liveRegion": {
    "discountApplied": "Código aplicado. Ahorras {amount}.",
    "discountInvalid": "El código no es válido.",
    "processing": "Procesando pedido.",
    "orderReceived": "Pedido recibido, redirigiendo."
  }
}
```
> `MEXICAN_STATES` are proper nouns (Aguascalientes … Ciudad de México … Zacatecas)
> — identical in both locales, so they are a **config constant, not i18n keys**
> (only the placeholder/label are translated).

---

## Config constants the UI depends on (added in `src/lib/config.ts`, dev stage)

The UI consumes (dev creates with the "HOW TO SWAP" docstring style):
`MEXICAN_STATES` (32, single-source for the Select), `MEXICAN_CP_PATTERN`
(`/^\d{5}$/`), `CHECKOUT_CONFIRMATION_PATH` / `confirmationPath(orderNumber)`
(locale-aware base for redirect + links), `ORDER_NUMBER_PREFIX` +
`formatOrderNumber` (confirmation display), `TAX_RATE = 0`, and `DELIVERY_NOTES_MAX`
if the notes textarea is capped. Already exist: `CHECKOUT_PATH`, `CATALOG_PATH`,
`MAX_CART_ITEM_QUANTITY`, `UUID_PATTERN`.

---

## Files this design implies (for the dev stage)

**Create (UI):**
- `src/app/[locale]/checkout/page.tsx`
- `src/app/[locale]/checkout/checkout-form-state.ts`
- `src/components/checkout/checkout-flow-client.tsx`
- `src/components/checkout/contact-section.tsx`
- `src/components/checkout/shipping-address-section.tsx`
- `src/components/checkout/delivery-notes-section.tsx`
- `src/components/checkout/discount-code-field.tsx`
- `src/components/checkout/checkout-summary.tsx`
- `src/components/checkout/checkout-empty-state.tsx` (or reuse `CartEmptyState`)
- `src/app/[locale]/checkout/confirmacion/[orderNumber]/page.tsx`
- `src/components/checkout/order-confirmation.tsx` (client cart-clear)
- component tests under `src/components/checkout/*.test.tsx`

**Modify (UI-adjacent):**
- `src/messages/es-MX.json` + `src/messages/en.json` — the `checkout` namespace above.
- `src/lib/config.ts` — the constants listed above.

**No new shadcn ui components, no new globals.css, no new npm deps.**
