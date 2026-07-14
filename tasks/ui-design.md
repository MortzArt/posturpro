# UI Design: T8 — Mercado Pago Payment (Checkout Pro / redirect)

> Stage 3 (UI Design) artifact — **overwrites the T7 checkout spec.** Scope: the
> SHOPPER-FACING payment surfaces that T8 adds to the existing checkout +
> confirmation UI. The webhook route, `advance_order_status` RPC, refund API,
> signature verification, amount reconciliation and MP SDK are **dev/logic
> concerns (Stage 4)** — this spec only defines the props/contract the UI needs
> from them and every visual state the payment UI can be in.
>
> **T8 EXTENDS the confirmation page — it does NOT redesign it.** The success
> hero, order-summary card, shipping card, container, grid, motion classes and
> i18n structure documented for T7 all stay. T8 replaces exactly ONE block (the
> "Sin pago todavía" muted box, `confirmacion/[token]/page.tsx:67-70`) with a
> `<PaymentPanel>` and adds the pay/pending/failed/paid branches.
>
> **Taste authority applied:** `.claude/skills/emil-design-eng` +
> `.claude/skills/apple-design`. Motion terms follow `.claude/skills/animation-vocabulary`.
> Every animation reuses an EXISTING `globals.css` class — this spec invents **no
> new motion CSS** (verified: `.enter-fade`, `.cart-press`, `.cart-step-press`,
> `--ease-out` already cover every case here).
>
> ⚠️ **HUMAN-REVIEW GATE (BUILD_PLAN rule 3).** This is payment code. Every
> pipeline verdict on T8 is ADVISORY. No SHIP verdict authorizes merge — a human
> must review payment code before it ships. Flagged here per ticket instruction.
>
> ⚠️ **LIVE-SANDBOX BLOCKED-ON-USER.** No working MP credentials exist; all
> behavior below is designed against MOCKED MP responses. OXXO/SPEI approval
> cannot be simulated in test. The voucher field paths (§Notes for Dev, ambiguous)
> must be read DEFENSIVELY by dev — see the "build defensively" callouts.

---

## Design Principles for This Feature

1. **Truth lives in the DB, never in the URL.** The confirmation page renders the
   order's LIVE `payment_status` / `status` read by token (webhook is
   authoritative — ticket EC-6). `back_url` query params (`?status=…`) are
   **display hints only, never trusted for state.** Consequence: the same page URL
   shows pay-now / pending / failed / paid purely from DB state, so the
   webhook-before-redirect race resolves itself — a reload always tells the truth.
2. **Reassurance over flourish (Apple: safety / responsibility).** Payment is the
   highest-trust moment in the store. Calm, dense, legible. No celebratory motion,
   no bounce, no confetti. Motion is confined to press feedback (`.cart-press`),
   comprehension (skeleton→content crossfade via `.enter-fade`), and the redirect
   handoff. Everything ≤ 300ms, `ease-out`.
3. **Never dress pending as success.** OXXO/SPEI "awaiting payment" uses a NEUTRAL
   / amber visual language — never the green check. A green check means money
   received. Miscolouring "pending" as "paid" is a trust bug (Apple: familiarity —
   green = done, everywhere).
4. **The order total is always restated next to the action.** The number the
   shopper is about to pay is visible on every state — pay-now, pending, failed —
   so they never redirect to MP unsure what they'll be charged.
5. **Match the house system verbatim.** Cards = `rounded-lg border border-border
   bg-card p-4 md:p-5`. Money = `formatMXN(cents)` only, `tabular-nums`. Error
   banners = the existing `GlobalBanner` shape (`border-destructive/30` +
   `bg-destructive/5` + `Alert02Icon` + `Refresh01Icon` retry). Icons =
   `@hugeicons/react` + core-free-icons only. i18n under `checkout`, Spanish default.
6. **Redirect is a handoff, not a dead end.** When we send the browser to MP we
   keep the order summary visible until the last frame and show a disabled
   "Redirigiendo…" state (text swap — the checkout precedent, no spinner glyph
   invented), so the shopper knows what's happening and there's no layout shift.
7. **Defensive rendering of ambiguous MP fields.** The voucher card renders ONLY
   the fields that are present. If `voucherUrl`/`reference`/`expiresAt` are absent
   (field-path ambiguity, research §5), the card degrades to a plain "we're
   awaiting your payment — check your email for the voucher" message rather than
   showing `undefined` or a broken link. No `$NaN`, no `Invalid Date`, no empty
   `<a href>`, ever.
8. **Mobile-first, ≥44px tap targets.** Pay CTA is full-width `h-11` on mobile.
   Voucher reference is selectable monospace that wraps, never overflows. "View
   voucher" link is a ≥44px tap target. No horizontal scroll at 375px.

---

## Design Tokens Used

| Category | Tokens (Tailwind utility → CSS var) |
| --- | --- |
| Surfaces | `bg-background`, `bg-card`, `bg-muted/40` (info block — existing "Sin pago" tint), `bg-destructive/5` (error banner), pending tint (see note) |
| Text | `text-foreground`, `text-muted-foreground`, `text-primary-foreground`, `text-destructive` |
| Accent (positive / paid) | `text-emerald-600 dark:text-emerald-500` (paid check — reuses the existing confirmation hero colour) |
| Accent (pending / awaiting) | `text-amber-600 dark:text-amber-400`, border `border-amber-500/30` (matches the T7 "price changed" warn tint — already in the palette) |
| Borders / rings | `border-border`, `border-destructive/30`, `border-amber-500/30`, `ring-ring/30`, `focus-visible:ring-2` |
| Radius | `rounded-md` (buttons/banners/fields), `rounded-lg` (cards), from `--radius` |
| Typography | `text-2xl font-semibold tracking-tight` (h1, unchanged), `text-sm font-medium` (card h2 / labels), `text-sm` body, `text-xs text-muted-foreground` (hints), `tabular-nums` all money, `font-mono` (voucher reference / CLABE) |
| Motion easing | `--ease-out` only (enter/press) — never `ease-in`. Consumed through existing classes. |
| Container | `mx-auto max-w-2xl px-4 py-12` (the EXISTING confirmation container — unchanged) |

> **Pending tint note.** The pending card uses the established warn tint already in
> the T7 palette (`text-amber-600 dark:text-amber-400` + `border-amber-500/30`) on
> a NEUTRAL `bg-muted/40` surface — this introduces ZERO new colour tokens and
> guarantees pending reads as NOT-success. (A raw `bg-amber-50 dark:bg-amber-950/30`
> surface is an acceptable alternative if dev prefers a warmer card, but the
> neutral-surface + amber-border + amber-icon combination is the default and needs
> no palette additions.)

**Existing motion classes reused (NO new CSS — verified in `globals.css`):**
- `.enter-fade` — opacity + `translateY(8px)` on mount, 200ms `--ease-out`, has a
  built-in `prefers-reduced-motion` branch (opacity-only). Used by: `<PaymentPanel>`
  on mount, the voucher card, the error banner (already used by `GlobalBanner`),
  the paid confirmation note.
- `.cart-press` — `scale(0.98)` on `:active`, 100ms `--ease-out`. Used by the
  "Pagar ahora" / "Reintentar pago" / "Ver comprobante" primary CTAs.
- `.cart-step-press` — `scale(0.97)` on `:active:not(:disabled)`, 90ms. Used by the
  secondary "pagar de otra forma" link and the copy-reference button.
- **No spinner glyph.** The redirect / creating-preference state reuses the
  checkout precedent: a disabled button with a TEXT SWAP ("Pagar ahora" →
  "Redirigiendo…"). The existing `.animate-pulse bg-muted` (Tailwind, per
  `checkout-skeleton.tsx`) is available if a skeleton is needed while the panel's
  initial state resolves.

---

## shadcn / Component Inventory Status (verified in `src/components/ui/`)

| Component | Exists? | Use in T8 |
| --- | --- | --- |
| `Button` + `buttonVariants` | ✅ | primary "Pagar ahora" / retry (`variant:"default"`), secondary "pagar de otra forma" (`variant:"outline"` or `link`). Existing confirmation builds its CTA as `buttonVariants({variant:"default"})` + `cart-press h-11 gap-1.5 px-6 text-sm` on a `<Link>` — mirror those exact classes on the pay `<button>` for parity (button base size is `h-7`; override to `h-11` like `keepShopping` does). |
| `Badge` (default/secondary/destructive/outline) | ✅ | small status pill if desired ("Esperando pago" via `outline` + amber text). Paid uses an inline emerald span + check, NOT the destructive badge. |
| Card / Alert / Separator / Skeleton | ❌ none | House convention (T7): cards = `rounded-lg border border-border bg-card p-4 md:p-5`; dividers = `border-t border-border`; alert = the `GlobalBanner`-shaped `role="alert"` div; skeleton = inline `animate-pulse bg-muted`. **Introduce no new primitives.** |

**Icons (existing inventory — reuse, never mix sets):**
- `CheckmarkCircle02Icon` — paid confirmation (already the confirmation hero icon).
- `Alert02Icon` — error / declined banner (already in `GlobalBanner`).
- `Refresh01Icon` — retry-payment button (already the `GlobalBanner` retry icon).
- `ArrowRight01Icon` — "Pagar ahora" trailing icon (already the "Seguir comprando" icon).
- `Copy01Icon` — copy the OXXO reference / SPEI CLABE. **Not yet used in repo.**
- `Clock01Icon` (or `Time04Icon`) — "awaiting payment" / "confirming" marker. **Not yet used.**
- `ExternalLink01Icon` (or `LinkSquare01Icon`) — "Ver comprobante" opens `voucherUrl` new tab. **Not yet used.**

> **Icon-name caveat for dev:** the three payment-only icons (`Copy01Icon`,
> `Clock01Icon`, `ExternalLink01Icon`) are NOT yet used in the repo — dev must
> confirm the exact `@hugeicons/core-free-icons` export names and pick the listed
> fallback if the primary name doesn't exist. Never mix in a different icon set.

---

## The Payment State Model (single source the UI renders)

The confirmation page is driven by ONE derived discriminated state, computed from
the order's live DB fields (never from URL params). Dev computes this in the
payment-view read (`order-payment-read.ts`) or in the page from the order row.

```typescript
// The payment-facing view the confirmation page reads by confirmation_token.
// Extends the T7 OrderView (order-read.ts) — same money/shipping/items fields.
interface OrderPaymentView {
  // ...all existing OrderView fields (orderNumber, totals, items, shipping)...
  paymentStatus: "pending" | "authorized" | "paid" | "failed" | "refunded";
  orderStatus: "pending_payment" | "paid" | "preparing" | "shipped" | "delivered" | "cancelled";
  paymentMethod: PaymentMethodKey | null; // "card" | "oxxo" | "spei" | "wallet" | null
  // Voucher fields — ALL OPTIONAL; read defensively (research §5, ambiguous paths).
  voucher: {
    reference: string | null;          // transaction_details.payment_method_reference_id (barcode/CLABE)
    voucherUrl: string | null;         // transaction_details.external_resource_url (printable voucher)
    expiresAt: string | null;          // ISO — top-level date_of_expiration
    verificationCode: string | null;   // transaction_details.verification_code (optional)
  } | null;
}

type PaymentMethodKey = "card" | "oxxo" | "spei" | "wallet";

// The state the <PaymentPanel> switches on (derived, in one place):
type PaymentPanelState =
  | { kind: "unpaid" }                                          // pending_payment + pending, no prior attempt
  | { kind: "creating" }                                        // client: preference being created (transient)
  | { kind: "redirecting" }                                     // client: about to hand off to MP init_point
  | { kind: "pending-voucher"; method: "oxxo" | "spei"; voucher: OrderPaymentView["voucher"] }
  | { kind: "failed" }                                          // payment failed (rejected/cancelled/expired) → retry
  | { kind: "paid"; method: PaymentMethodKey | null }
  | { kind: "unavailable" }                                     // MP env missing / preference-create error (EC-11)
  | { kind: "processing" };                                     // webhook not landed yet — "we're confirming…" (EC-6)
```

**Deriving the kind (dev reference — the exact truth table):**

| order.status | order.payment_status | voucher present? | returnHint | → PaymentPanelState.kind |
| --- | --- | --- | --- | --- |
| `pending_payment` | `pending` | no | none | `unpaid` (first attempt) |
| `pending_payment` | `pending` | yes (oxxo/spei) | — | `pending-voucher` |
| `pending_payment` | `pending` | no | `success` (browser back, webhook pending) | `processing` |
| `pending_payment` | `failed` | — | — | `failed` (retry) |
| `paid` | `paid` | — | — | `paid` |
| `pending_payment` | `authorized` | — | — | `processing` (card in review — rare) |
| any | `refunded` | — | — | `paid` variant + "reembolsado" note (minimal; refund UI is T12) |

> **`processing` ("we're confirming your payment…") — the webhook-race state.**
> Distinct from `unpaid`. Rendered when the shopper has clearly attempted payment
> but the DB isn't `paid`/`failed`/`pending-voucher` yet — i.e. the browser
> returned from MP (a `?status` hint is present) but the authoritative webhook
> hasn't advanced the order. Because we NEVER trust the URL for truth, this is a
> gentle "we're confirming your payment — this can take a moment" note with a
> **manual "Actualizar / Refresh" affordance** (reloads the same URL), NOT
> auto-polling (live-updating is explicitly out of scope, ticket §Out of Scope —
> reload suffices in Phase 1). It ALSO offers the retry path in case the payment
> genuinely failed, so the shopper is never trapped (Apple: wayfinding).

---

## Component Inventory

### 1. `<PaymentPanel>` (new — `src/components/checkout/payment-panel.tsx`)

**Purpose:** The single client component that replaces the "Sin pago todavía"
block on the confirmation page and renders the correct payment state. It owns the
pay-now / retry action call and the redirect handoff.

**Location:** Confirmation page, immediately below the order hero, above the
`grid gap-6 md:grid-cols-2` summary/shipping cards — exactly where the old
`bg-muted/40` info block was (`page.tsx:67-70`).

**shadcn base:** none new — composes `buttonVariants` + house cards. `"use client"`
(needs the form action + `useTransition` for pending/redirect state + the window
redirect to `init_point`).

**Layout (ASCII wireframe — `unpaid` state, desktop):**
```
┌───────────────────────────────────────────────────────────┐
│  Completa tu pago                                           │  ← text-sm font-medium
│  Elige tu método de pago en el siguiente paso.             │  ← text-xs muted
│                                                             │
│  Total a pagar                        $12,345.67 MXN        │  ← restated total, tabular-nums
│  ─────────────────────────────────────────────────────    │  ← border-t border-border
│  ┌───────────────────────────────────────────────────┐    │
│  │           Pagar ahora            →                 │    │  ← h-11 full-width primary, cart-press
│  └───────────────────────────────────────────────────┘    │
│  Pago seguro con Mercado Pago · tarjeta, OXXO, SPEI        │  ← text-xs muted, trust line
└───────────────────────────────────────────────────────────┘
   (card: rounded-lg border border-border bg-card p-4 md:p-5, .enter-fade)
```

**Props:**
```typescript
interface PaymentPanelProps {
  confirmationToken: string;          // addresses the pay action (never order_number)
  initialState: PaymentPanelState;    // derived server-side from live DB (never URL)
  totalCents: number;                 // restated next to the CTA (formatMXN)
  labels: PaymentPanelLabels;         // all i18n strings, resolved by the server page
  returnHint?: "success" | "pending" | "failure" | null; // from back_url ?status — DISPLAY ONLY
}

// createPaymentPreference is a "use server" action, returning:
type PayActionResult =
  | { status: "redirect"; initPoint: string }
  | { status: "unavailable" }         // MP env missing / MP 5xx (EC-11, error-table rows 1-2)
  | { status: "error" };              // generic failure → retry
```

**States:**

| State | Visual | Behavior |
| --- | --- | --- |
| `unpaid` | Card: heading + total restated + full-width "Pagar ahora" primary CTA + trust line. `.enter-fade` on mount. | Click → `useTransition` → `createPaymentPreference(token)`. Button swaps to disabled "Redirigiendo…"; on `{redirect}` → `window.location.assign(initPoint)`. |
| `creating` / `redirecting` | Same card; CTA disabled, text "Redirigiendo…", `aria-busy="true"` on the action region. Order summary stays visible; NO layout shift (button keeps its height). | Short window; on success the browser leaves. On `{unavailable}`/`{error}` → transition to `unavailable`/`failed` in place. |
| `pending-voucher` | `<OxxoSpeiInstructions>` (component 2) — amber/neutral, NOT green. | View voucher opens `voucherUrl`; "pagar de otra forma" → same pay action (new preference, same order). |
| `failed` | `role="alert"` banner (GlobalBanner shape, destructive) "Tu pago fue rechazado. Inténtalo de nuevo." + **"Reintentar pago"** (`Refresh01Icon`). Total restated. | Retry → same `createPaymentPreference(token)` → NEW preference for the SAME order (no re-create, stock unchanged, token unchanged — AC-16). |
| `paid` | Emerald "Pago recibido" note with `CheckmarkCircle02Icon` + method label ("Pagado con tarjeta"). `role="status"`. Replaces the pay CTA. | No action; the existing "Seguir comprando" link below remains the exit. |
| `unavailable` | NEUTRAL banner (not destructive-red — a temporary system issue, not the user's fault): "El pago no está disponible por el momento. Inténtalo más tarde." + "Reintentar". | Retry re-attempts; recovery copy = "try again later". |
| `processing` | Neutral card: `Clock01Icon` + "Estamos confirmando tu pago. Esto puede tardar un momento." + total. "Actualizar" link (reload same URL) + a quiet "¿Problemas? Reintentar el pago" secondary. `role="status"`. | Manual refresh only (no auto-poll — out of scope). Retry escape so the user is never trapped. |

**Responsive:**

| Breakpoint | Layout |
| --- | --- |
| < 640px (375px target) | Card full-width. CTA full-width `h-11` (thumb-reachable). Total row `flex justify-between` (wraps label if needed). |
| 640–1024px (768px) | Panel full-width ABOVE the `md:grid-cols-2` summary/shipping grid (ticket UX req). CTA `sm:w-auto sm:min-w-56` for `unpaid`; full-width in the voucher card. |
| > 1024px (desktop) | Same — container is `max-w-2xl` (single column); CTA `sm:w-auto`, centered/aligned to match the existing centered "Seguir comprando". |

**Animations:**
- Mount: `.enter-fade` (opacity 0→1, `translateY(8px)→0`, 200ms `--ease-out`). Trigger: panel renders. Property: `opacity`/`transform`. Reduced-motion: opacity-only (class handles it).
- Press (CTA): `.cart-press` — `scale(0.98)` on `:active`, 100ms `--ease-out`. Trigger: activation. Property: `transform`. Reduced-motion: kept (press feedback is comprehension).
- Redirect handoff: **no animation** — a text swap on a disabled button (Emil: don't animate an action whose outcome is a full-page navigation; the browser transition is the motion). `aria-busy` conveys state to AT.
- State change (`failed`→`unpaid` on retry, skeleton→content): crossfade via `.enter-fade` re-mount. No new keyframes.

---

### 2. `<OxxoSpeiInstructions>` (new — `src/components/checkout/oxxo-spei-instructions.tsx`)

**Purpose:** The pending-payment voucher/instruction card for OXXO (cash) and SPEI
(bank transfer). Shows the reference/barcode or CLABE, the printable-voucher link,
and the expiry. It is the "esperando tu pago" state — deliberately NOT green.

**Location:** Rendered by `<PaymentPanel>` when `kind==="pending-voucher"`.
Full-width above the summary/shipping grid.

**shadcn base:** none — house card + `Copy01Icon` copy button + `ExternalLink01Icon` link.

**Layout (ASCII wireframe — OXXO, mobile 375px):**
```
┌─────────────────────────────────────────────┐
│ ⏱  Esperando tu pago                         │  ← amber accent, Clock01Icon, text-sm font-medium
│ Paga en efectivo en cualquier OXXO.          │  ← text-xs muted
│                                              │
│ Referencia                                   │  ← text-xs muted label
│ ┌──────────────────────────────┐  ┌───────┐ │
│ │ 9860 1234 5678 9012          │  │ Copiar│ │  ← font-mono select-all + copy btn (≥44px)
│ └──────────────────────────────┘  └───────┘ │
│                                              │
│ Monto            $12,345.67 MXN              │  ← tabular-nums
│ Vence            14 jul 2026, 23:59          │  ← Intl.DateTimeFormat(locale)
│                                              │
│ ┌──────────────────────────────────────┐    │
│ │  Ver comprobante            ↗         │    │  ← primary link, opens voucherUrl new tab, h-11
│ └──────────────────────────────────────┘    │
│                                              │
│ ¿Prefieres pagar de otra forma?              │  ← secondary link → new preference
└─────────────────────────────────────────────┘
   (card: rounded-lg border border-amber-500/30 bg-muted/40 p-4 md:p-5, .enter-fade)
```

SPEI variant: label "CLABE interbancaria" instead of "Referencia"; subtitle
"Transfiere desde tu banca en línea a esta CLABE."; identical structure.

**Props:**
```typescript
interface OxxoSpeiInstructionsProps {
  method: "oxxo" | "spei";
  reference: string | null;      // barcode (OXXO) / CLABE (SPEI) — render only if present
  voucherUrl: string | null;     // printable voucher — render link only if present
  expiresAt: string | null;      // ISO; formatted with Intl.DateTimeFormat(locale)
  amountCents: number;           // restated, formatMXN
  labels: VoucherLabels;
  onPayDifferently: () => void;  // triggers the same pay action (new preference)
}
```

**States:**

| State | Visual | Behavior |
| --- | --- | --- |
| Full data (reference + url + expiry) | The complete card above. | Copy button copies `reference`, swaps label "Copiar"→"Copiado" for ~1.5s (text swap, no toast — no toaster in repo). View voucher opens new tab. |
| No `voucherUrl` (absent — defensive) | Card WITHOUT "Ver comprobante"; adds "Te enviamos el comprobante por correo." (email is T9; honest copy). | Reference + copy still shown if present. |
| No `reference` (absent — defensive) | Degrades to heading + "Estamos generando tu comprobante de pago. Revisa tu correo." — no empty mono box, no broken copy button. | Only "pagar de otra forma" + refresh remain. |
| No `expiresAt` | Omit the "Vence" row (never show "Vence Invalid Date"). | — |
| Copy unsupported (no `navigator.clipboard`) | Copy button hidden; reference stays `select-all`. | Manual selection works. |

**Responsive:**

| Breakpoint | Layout |
| --- | --- |
| < 640px | Reference box + copy button stack/wrap; reference `break-all font-mono`; copy ≥44px. "Ver comprobante" full-width `h-11`. |
| ≥ 640px | Reference + copy inline (`flex items-center gap-2`); "Ver comprobante" `sm:w-auto`. Card full-width above the grid. |

**Animations:**
- Mount: `.enter-fade`.
- Copy button press: `.cart-step-press` (`scale(0.97)`) + label crossfade "Copiar"→"Copiado" (opacity swap ≤150ms `--ease-out`, revert after 1500ms). Trigger: copy success. Property: `opacity`/`transform`. Reduced-motion: label swaps instantly (feedback preserved via text).
- No barcode animation, no pulse — a payment reference is read carefully, not glanced at (Emil: no motion without purpose).

---

### 3. Confirmation page paid vs pending vs unpaid (MODIFY — `confirmacion/[token]/page.tsx`)

**Purpose:** Host `<PaymentPanel>` in place of the removed muted block, and adapt
the hero so it doesn't claim "¡Gracias! Recibimos tu pedido" with a triumphant
green check when the order is merely pending/unpaid. Summary + shipping cards
UNCHANGED.

**Layout (ASCII — the ONLY diff from T7, showing hero+panel variants):**
```
UNPAID / FAILED / PROCESSING (order created, not paid):
┌─────────────────────────────────────────────┐
│        (muted/amber check-outline icon)       │  ← NOT the solid green check
│      Recibimos tu pedido                      │  h1 (softened — see copy note)
│      Pedido  #PP-000123                       │
├─────────────────────────────────────────────┤
│      <PaymentPanel state=unpaid|failed|...>   │  ← replaces the muted "Sin pago" box
├─────────────────────────────────────────────┤
│   [Resumen del pedido]   [Envío]              │  ← existing md:grid-cols-2, UNCHANGED
├─────────────────────────────────────────────┤
│              [Seguir comprando →]             │  ← existing, UNCHANGED
└─────────────────────────────────────────────┘

PAID (webhook confirmed):
┌─────────────────────────────────────────────┐
│        ✓ (solid emerald CheckmarkCircle)      │  ← existing green hero KEPT
│      ¡Gracias! Tu pago fue recibido           │  h1 (paid variant of the title)
│      Pedido  #PP-000123                       │
├─────────────────────────────────────────────┤
│      <PaymentPanel state=paid>                │  → "Pago recibido · Pagado con tarjeta"
├─────────────────────────────────────────────┤
│   [Resumen]   [Envío]        (unchanged)      │
├─────────────────────────────────────────────┤
│              [Seguir comprando →]             │
└─────────────────────────────────────────────┘
```

> **Hero copy adaptation (important, low-risk).** Today the hero unconditionally
> shows the solid emerald `CheckmarkCircle02Icon` + "¡Gracias! Recibimos tu pedido".
> With payment now real, a triumphant green check on an UNPAID order is a trust bug
> (principle 3). Minimal approved change — the layout, the `role="status"`, and the
> `.enter-fade` hero stay exactly; only the icon colour and one title string branch
> on `paymentStatus`:
> - **paid:** keep the solid emerald icon + title `confirmation.paidTitle`
>   ("¡Gracias! Tu pago fue recibido").
> - **unpaid/failed/pending/processing:** SAME icon but muted/outline tone
>   (`text-muted-foreground`, or amber for pending) + softened title
>   `confirmation.receivedTitle` ("Recibimos tu pedido"). Order-number line unchanged.

**Server data contract (dev):** the page already reads `getOrderByToken`. T8 extends
it (or adds `getOrderPaymentByToken`) to also select `status`, `payment_status`,
`payment_method`, and the voucher fields, then derives `PaymentPanelState` + the
locale-formatted labels and passes them to `<PaymentPanel>`. The page stays a
server component; `<PaymentPanel>` is the only new `"use client"` boundary.
`notFound()` on missing order and the `UUID_PATTERN` pre-check are unchanged.

**States (page-level):** loading (Suspense skeleton — reuse `animate-pulse` cards),
not-found (`notFound()`, unchanged), and the five panel states above.

**Animations:** hero `.enter-fade` (unchanged). No new page-level motion.

---

## Interaction Flows

### Flow A — Pay now (order-created → MP redirect handoff)
1. Shopper lands on `confirmacion/[token]` (order `pending_payment`/`pending`) →
   server derives `unpaid` → `<PaymentPanel state=unpaid>` with total + CTA.
2. Tap **"Pagar ahora"** → `.cart-press` feedback → `useTransition` → button
   disabled, text "Redirigiendo…", `aria-busy="true"`.
3. `createPaymentPreference(token)` (server, builds preference, persists
   `mp_preference_id`) → `{status:"redirect", initPoint}`.
4. `window.location.assign(initPoint)` → browser leaves for MP hosted checkout.
5. Shopper picks method (card / OXXO / SPEI / wallet) and pays.
6. MP redirects to the locale `back_url` AND fires the webhook. **Page re-reads
   live DB state on load** (URL `?status` is a hint only) → renders paid /
   pending-voucher / failed / processing.

### Flow B — Card declined → retry (AC-16, EC-4)
1. Payment `rejected` → webhook maps to `payment_status=failed`, order stays
   `pending_payment` → page derives `failed`.
2. `<PaymentPanel state=failed>` shows destructive `role="alert"` banner + total +
   **"Reintentar pago"** (`Refresh01Icon`).
3. Retry → same `createPaymentPreference(token)` → NEW preference, SAME order (no
   re-create, stock unchanged, token unchanged) → redirect to MP again.
4. Successful retry → webhook → `paid` → next load shows the paid hero + panel.

### Flow C — OXXO/SPEI pending (AC-17) → later approved (AC-18)
1. Shopper chose OXXO/SPEI → MP issues a voucher; webhook lands `pending` with
   voucher fields → page derives `pending-voucher`.
2. `<OxxoSpeiInstructions>` shows reference/CLABE (copyable), "Ver comprobante"
   (opens `voucherUrl`), and the expiry — amber/neutral, NOT green.
3. Shopper pays at OXXO / via SPEI out-of-band. Later the approval webhook advances
   the order to `paid`.
4. On the shopper's NEXT load → derives `paid` → paid hero + "Pago recibido". (No
   live update on the open page — reload suffices.)

### Flow D — Webhook-before-redirect race / confirming (EC-6)
1. MP POSTs `approved` before the browser returns → order already `paid` when the
   page loads → shows paid immediately. No special handling (truth is DB).
2. Reverse: browser returns (`?status=success` hint) but webhook hasn't landed →
   DB still `pending`/no-voucher → derive `processing` → "Estamos confirmando tu
   pago…" + manual "Actualizar" + retry escape hatch. A reload once the webhook
   lands flips to paid.

### Flow E — MP unavailable / credentials missing (EC-11)
1. Pay action → `getMercadoPagoEnv()` throws or MP 5xx → `{status:"unavailable"}`
   (never a stack trace).
2. Panel shows the NEUTRAL "El pago no está disponible por el momento. Inténtalo
   más tarde." + "Reintentar". No order mutation.

---

## Error States Table (UI-facing subset of the ticket's table)

| Trigger | User sees (es / en) | Panel state | Recovery |
| --- | --- | --- | --- |
| MP env missing / MP 5xx at pay-now | "El pago no está disponible por el momento. Inténtalo más tarde." / "Payment is temporarily unavailable. Please try again later." | `unavailable` (neutral banner) | "Reintentar" (try later) |
| Preference create network/timeout | same as above | `unavailable` | "Reintentar" |
| Card declined (`rejected`) | "Tu pago fue rechazado. Inténtalo de nuevo." / "Your payment was declined. Try again." | `failed` (destructive `role="alert"`) | "Reintentar pago" (retry now, new preference) |
| OXXO/SPEI voucher issued | "Esperando tu pago." + reference + comprobante + expiry / "Awaiting your payment." | `pending-voucher` (amber, not green) | "Ver comprobante" / "pagar de otra forma" |
| Voucher fields absent (defensive) | "Estamos generando tu comprobante. Revisa tu correo." / "We're generating your voucher. Check your email." | `pending-voucher` degraded | "Actualizar" / "pagar de otra forma" |
| Webhook not yet landed after return | "Estamos confirmando tu pago. Esto puede tardar un momento." / "We're confirming your payment. This can take a moment." | `processing` (neutral, `role="status"`) | "Actualizar" (reload) + retry escape |
| Voucher expired / cancelled | "Tu pago no se completó a tiempo. Puedes intentar de nuevo." / "Your payment wasn't completed in time. You can try again." | `failed` | "Reintentar pago" (new preference) |
| Paid | "Pago recibido · Pagado con {método}" / "Payment received · Paid with {method}" | `paid` (`role="status"`, emerald) | "Seguir comprando" |

---

## Responsive Specs (375px / 768px / desktop)

| Element | 375px (mobile) | 768px (tablet) | Desktop (`max-w-2xl`) |
| --- | --- | --- | --- |
| `<PaymentPanel>` card | full-width, `p-4` | full-width above the `md:grid-cols-2` grid, `p-5` | full-width (single-column container) |
| Pay / retry CTA | full-width `h-11` (thumb-reachable) | `sm:w-auto sm:min-w-56` (unpaid); full-width in voucher card | `sm:w-auto`, aligned to match "Seguir comprando" |
| Voucher reference | `font-mono break-all`, own row; copy btn ≥44px | reference + copy inline | inline |
| "Ver comprobante" | full-width `h-11` | `sm:w-auto` | `sm:w-auto` |
| Total restated | `flex justify-between`, wraps label if needed | inline | inline |
| Hero | unchanged (`max-w-2xl px-4 py-12`) | unchanged | unchanged |

No horizontal scroll at 375px (voucher reference `break-all`; no fixed-width boxes).

---

## Accessibility Checklist

- [ ] Pay/retry CTAs are real `<button>` in a `<form>` (or `buttonVariants` on a button) with visible focus ring (`focus-visible:ring-2 ring-ring/30` — house).
- [ ] Redirect/creating state sets `aria-busy="true"` on the action region and disables the button; the disabled text ("Redirigiendo…") is announced.
- [ ] `failed`/`unavailable` banners use `role="alert"` (existing GlobalBanner pattern) so AT announces them immediately.
- [ ] `paid` and `processing` use `role="status"` (polite live region) — matches the existing confirmation hero.
- [ ] Copy button has an accessible label ("Copiar referencia"); the copy confirmation ("Copiado") is announced (aria-live polite / `role="status"`).
- [ ] "Ver comprobante" opens a new tab with `rel="noopener noreferrer"` + a label indicating it opens externally; ≥44px tap target.
- [ ] Colour is never the only signal: pending pairs amber WITH `Clock01Icon` + "Esperando pago" text; paid pairs emerald WITH the check + "Pago recibido"; failed pairs red WITH `Alert02Icon` + explicit text.
- [ ] Tab order: heading → total → primary CTA → secondary link. Logical top-down.
- [ ] Voucher reference is selectable (`select-all`) even where copy is unavailable, so users can copy manually.
- [ ] `prefers-reduced-motion`: honored by `.enter-fade` (built-in branch); press scale kept minimal; no auto-motion added.
- [ ] All strings via `getTranslations`/`useTranslations` (`checkout` namespace) — no hardcoded copy; both locales.

---

## i18n Key Drafts (both locales — `checkout` namespace, Spanish default)

New keys live under `checkout.payment.*`. The stale `confirmation.noPaymentTitle` /
`confirmation.noPaymentYet` keys are REMOVED (replaced by the panel); a new
`confirmation.paidTitle` + `confirmation.receivedTitle` split the hero title.
`summary.noPaymentYet` (used in the checkout summary) is updated to consistent wording.

### `src/messages/es-MX.json` (add / update)
```json
{
  "checkout": {
    "confirmation": {
      "paidTitle": "¡Gracias! Tu pago fue recibido",
      "receivedTitle": "Recibimos tu pedido"
    },
    "payment": {
      "heading": "Completa tu pago",
      "subheading": "Elige tu método de pago en el siguiente paso.",
      "totalLabel": "Total a pagar",
      "payNow": "Pagar ahora",
      "redirecting": "Redirigiendo…",
      "secureNote": "Pago seguro con Mercado Pago · tarjeta, OXXO, SPEI",
      "payDifferently": "Pagar de otra forma",
      "paid": {
        "title": "Pago recibido",
        "methodCard": "Pagado con tarjeta",
        "methodOxxo": "Pagado en OXXO",
        "methodSpei": "Pagado por transferencia SPEI",
        "methodWallet": "Pagado con Mercado Pago",
        "methodGeneric": "Pago confirmado"
      },
      "failed": {
        "title": "Tu pago fue rechazado",
        "body": "No se completó el cobro. Inténtalo de nuevo.",
        "retry": "Reintentar pago"
      },
      "expired": {
        "body": "Tu pago no se completó a tiempo. Puedes intentar de nuevo."
      },
      "unavailable": {
        "body": "El pago no está disponible por el momento. Inténtalo más tarde.",
        "retry": "Reintentar"
      },
      "processing": {
        "title": "Estamos confirmando tu pago",
        "body": "Esto puede tardar un momento. Actualiza la página en unos segundos.",
        "refresh": "Actualizar",
        "retryHint": "¿Problemas? Reintentar el pago"
      },
      "voucher": {
        "oxxoTitle": "Esperando tu pago",
        "oxxoSubtitle": "Paga en efectivo en cualquier OXXO.",
        "speiTitle": "Esperando tu pago",
        "speiSubtitle": "Transfiere desde tu banca en línea a esta CLABE.",
        "referenceLabel": "Referencia",
        "clabeLabel": "CLABE interbancaria",
        "amountLabel": "Monto",
        "expiresLabel": "Vence",
        "copy": "Copiar",
        "copied": "Copiado",
        "copyAria": "Copiar referencia de pago",
        "viewVoucher": "Ver comprobante",
        "viewVoucherAria": "Ver comprobante (se abre en una pestaña nueva)",
        "noVoucherUrl": "Te enviamos el comprobante por correo.",
        "generating": "Estamos generando tu comprobante de pago. Revisa tu correo."
      },
      "liveRegion": {
        "redirecting": "Redirigiendo a Mercado Pago.",
        "paid": "Pago recibido.",
        "declined": "Tu pago fue rechazado.",
        "copied": "Referencia copiada."
      }
    },
    "summary": {
      "noPaymentYet": "El pago es el siguiente paso."
    }
  }
}
```

### `src/messages/en.json` (add / update)
```json
{
  "checkout": {
    "confirmation": {
      "paidTitle": "Thank you! Your payment was received",
      "receivedTitle": "We received your order"
    },
    "payment": {
      "heading": "Complete your payment",
      "subheading": "Choose your payment method in the next step.",
      "totalLabel": "Total to pay",
      "payNow": "Pay now",
      "redirecting": "Redirecting…",
      "secureNote": "Secure payment with Mercado Pago · card, OXXO, SPEI",
      "payDifferently": "Pay a different way",
      "paid": {
        "title": "Payment received",
        "methodCard": "Paid with card",
        "methodOxxo": "Paid at OXXO",
        "methodSpei": "Paid via SPEI transfer",
        "methodWallet": "Paid with Mercado Pago",
        "methodGeneric": "Payment confirmed"
      },
      "failed": {
        "title": "Your payment was declined",
        "body": "The charge didn't go through. Please try again.",
        "retry": "Retry payment"
      },
      "expired": {
        "body": "Your payment wasn't completed in time. You can try again."
      },
      "unavailable": {
        "body": "Payment is temporarily unavailable. Please try again later.",
        "retry": "Try again"
      },
      "processing": {
        "title": "We're confirming your payment",
        "body": "This can take a moment. Refresh the page in a few seconds.",
        "refresh": "Refresh",
        "retryHint": "Having trouble? Retry the payment"
      },
      "voucher": {
        "oxxoTitle": "Awaiting your payment",
        "oxxoSubtitle": "Pay in cash at any OXXO.",
        "speiTitle": "Awaiting your payment",
        "speiSubtitle": "Transfer from your online banking to this CLABE.",
        "referenceLabel": "Reference",
        "clabeLabel": "Interbank CLABE",
        "amountLabel": "Amount",
        "expiresLabel": "Expires",
        "copy": "Copy",
        "copied": "Copied",
        "copyAria": "Copy payment reference",
        "viewVoucher": "View voucher",
        "viewVoucherAria": "View voucher (opens in a new tab)",
        "noVoucherUrl": "We've emailed you the voucher.",
        "generating": "We're generating your payment voucher. Check your email."
      },
      "liveRegion": {
        "redirecting": "Redirecting to Mercado Pago.",
        "paid": "Payment received.",
        "declined": "Your payment was declined.",
        "copied": "Reference copied."
      }
    },
    "summary": {
      "noPaymentYet": "Payment is the next step."
    }
  }
}
```

> **Removed keys (dev must delete + fix references):**
> `checkout.confirmation.noPaymentTitle`, `checkout.confirmation.noPaymentYet`.
> The `keys-used` message test will fail if any component still references them —
> the confirmation page's muted block is replaced by `<PaymentPanel>`, so those
> refs go away. Keep `confirmation.orderNumberLabel`, `summaryHeading`,
> `shippingHeading`, `keepShopping`, `notesLabel`, `phoneLabel` (still used).

---

## Component / File Manifest for Dev

| File | Action | What it holds (UI) |
| --- | --- | --- |
| `src/components/checkout/payment-panel.tsx` | **create** | `"use client"` `<PaymentPanel>` — switches on `PaymentPanelState`; owns the pay/retry action call, redirect handoff (`window.location.assign(initPoint)`), all five visual states. |
| `src/components/checkout/oxxo-spei-instructions.tsx` | **create** | `<OxxoSpeiInstructions>` — voucher/CLABE card, copy button, view-voucher link, expiry; defensive rendering of absent fields. |
| `src/app/[locale]/checkout/confirmacion/[token]/page.tsx` | **modify** | Replace the `bg-muted/40` "Sin pago todavía" block (lines 67-70) with `<PaymentPanel>`; branch the hero icon/title on `paymentStatus`; pass derived state + labels. Keep summary/shipping cards + container + grid UNCHANGED. |
| `src/lib/checkout/order-payment-read.ts` (or extend `order-read.ts`) | **create/modify** (dev/logic) | Extend the token read to also select `status`, `payment_status`, `payment_method`, voucher fields; expose the `OrderPaymentView` shape above. Noted here so the UI's data contract is unambiguous. |
| `src/app/[locale]/checkout/pay-actions.ts` | **create** (dev/logic) | `"use server"` `createPaymentPreference(token)` returning `PayActionResult`. UI depends on this discriminated result. |
| `src/messages/es-MX.json` + `src/messages/en.json` | **modify** | Add `checkout.payment.*` + `confirmation.paidTitle/receivedTitle`; update `summary.noPaymentYet`; remove `confirmation.noPaymentTitle/noPaymentYet`. |
| `src/lib/config.ts` | **modify** (dev/logic) | Locale `back_urls` builders key off `confirmation_token` (already `confirmationPath`); the `?status` display-hint param name (UI reads it as `returnHint` — DISPLAY ONLY). |

**Reused verbatim (no change):** `formatMXN` (`src/lib/money.ts`), `buttonVariants`
(`ui/button.tsx`), `.enter-fade`/`.cart-press`/`.cart-step-press` (`globals.css`),
`confirmationPath` (`config.ts`), the `GlobalBanner` destructive styling pattern
(match the classes in `<PaymentPanel>`; a shared extraction is optional), the
summary + shipping cards on the confirmation page.

---

## Notes for Dev — build defensively (ambiguous MP response fields)

1. **Voucher field paths are UNVERIFIED (research §5).** Prefer
   `transaction_details.external_resource_url` (voucherUrl),
   `transaction_details.payment_method_reference_id` (reference/CLABE),
   `transaction_details.verification_code`, top-level `date_of_expiration`
   (expiresAt). Treat `point_of_interaction.transaction_data.*` as a FALLBACK only.
   **The UI already assumes every voucher field can be `null`** and degrades
   gracefully (see `<OxxoSpeiInstructions>` state table) — never render `undefined`,
   `Invalid Date`, or an empty `<a href>`. Verify paths against a real sandbox
   response before launch (blocked-on-user).
2. **Never trust the `back_url` `?status` param for state.** The UI passes it only
   as `returnHint` to CHOOSE FRIENDLY COPY when the DB is momentarily behind
   (`processing`) — it must NEVER flip the panel to `paid`/`failed` on its own. The
   panel state is derived from live DB `payment_status`/`status` exclusively.
3. **Method label mapping:** `payment_method` → `payment.paid.method*` key. If
   `payment_method` is null/unknown on a paid order, use `methodGeneric` ("Pago
   confirmado") — never blank.
4. **Expiry formatting:** format `expiresAt` with `Intl.DateTimeFormat(locale, …)`
   (locale from the route), NOT a hardcoded string. Guard `Invalid Date`.
5. **Copy button:** feature-detect `navigator.clipboard`; hide the button (keep
   `select-all` reference) where unavailable. No toast (no toaster in repo) — use
   the in-button "Copiado" text swap + a polite live-region announcement.
6. **No new motion CSS.** If a state needs entrance motion, reuse `.enter-fade`. If
   a skeleton is needed, reuse `animate-pulse bg-muted` (checkout-skeleton pattern).

---

## Quality Bar Self-Check

- Every payment UI state (unpaid, creating/redirecting, pending-voucher, failed, paid, unavailable, processing) has a defined visual + behavior + a11y role. ✅
- Voucher card degrades for every absent field (defensive). ✅
- Both locales drafted for every new string; stale keys flagged for removal. ✅
- Responsive at 375 / 768 / desktop specified per element. ✅
- Every animation names trigger + property + easing + duration + reduced-motion, and reuses an EXISTING globals.css class (no new motion CSS). ✅
- No new shadcn primitive; house card/banner conventions matched. ✅
- Truth-from-DB principle keeps the webhook-race state correct by construction. ✅
- Human-review + live-sandbox gates flagged. ✅
