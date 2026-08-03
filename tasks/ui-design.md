# UI Design: T17 — Admin manual / phone order entry

> Surface: `/admin/orders/new` (a new create-order form) + the "Nuevo pedido" entry point on the orders list.
> **Theme world:** ADMIN NEUTRAL only. es-MX only. NO storefront cobalt / Libre-Caslon / `.theme-storefront`. Every token, class, and motion utility below is lifted verbatim from the shipped T10/T11/T12 admin grammar. This stage introduces **zero new visual language** — it composes existing primitives.

---

## Design Principles for This Feature

1. **Reuse, don't reinvent.** The form is a composition of `fields.tsx` primitives inside `fieldset` Sections, driven by the exact `useActionState` island grammar of `product-form.tsx`. The only genuinely-new UI is the product/variant **picker** (no shadcn Command/Combobox/Popover exists in this repo — it is built from the same native `<input type="search">` + rendered-list grammar as `product-filters.tsx`).
2. **The server is the source of truth.** The picker shows live stock and the **server-recalculated** price. The client never owns a price. On submit, `revalidateLines` re-verifies; the UI's job is to make a rejection *actionable per line*, never to pre-empt the server.
3. **Forgiving for a non-technical owner.** Optional email is genuinely optional and never blocks. Every error says which line/field and what to do. Defaults are safe: payment defaults to "pendiente", confirmation email defaults OFF.
4. **Information over decoration.** Restrained admin motion — reuse `.enter-fade` and existing focus rings only. No new springs, no keyframes. Badges are glyph+text, never color alone.
5. **Mobile-first, overflow-safe.** Line items are stacked cards on mobile, a compact table ≥ `sm`. `min-w-0` + `break-words` on every product name/SKU (T12 overflow fix).

---

## Component Inventory

Legend: **[REUSE]** = shipped, import as-is · **[REUSE-VARIANT]** = shipped module needs a small email-optional sibling · **[NEW]** = build in this ticket.

| Component | Status | Source / Note |
| --- | --- | --- |
| `AdminPage` | [REUSE] | `src/components/admin/admin-page.tsx` — page shell (`title`/`description`/`actions`) |
| `TextField` `SelectField` `TextareaField` `MoneyField` `SwitchField` `Banner` `FieldError` | [REUSE] | `src/components/admin/form/fields.tsx` |
| `Button` (`asChild`, `variant`, `size`) | [REUSE] | `src/components/ui/button.tsx` |
| `Badge` | [REUSE] | `src/components/ui/badge.tsx` — source badge is built on it |
| `formatMXN(cents)` | [REUSE] | `src/lib/money.ts` — all peso display |
| `MEXICAN_STATES` | [REUSE] | `src/lib/config/checkout.ts` — the state `<select>` options |
| `validateAddress` | [REUSE-VARIANT] | `src/lib/checkout/address.ts` makes **email required**; T17 needs a manual variant where email is optional but CP/state rules are identical (dev/logic stage — flagged for `manual-order-input.ts`) |
| Source badge (`isManualOrder` + `SOURCE_BADGE_META`) | [NEW-meta] | `order-status-meta.ts` grammar; rendered on detail |
| **"Nuevo pedido" CTA** | [NEW] | orders-list `actions` slot (mirrors `admin-products-new`) |
| **`ManualOrderForm`** (client island) | [NEW] | `useActionState` form; mirrors `ProductForm` structure |
| **`OrderLineEditor`** | [NEW] | line-items list + totals; per-line stacked card / compact table |
| **`ProductPicker`** | [NEW] | searchable catalog lookup → add line; the core new interaction |
| **`PaymentChoice`** | [NEW] | 2-option segmented radio ("pendiente" / "pago recibido") |
| **`OrderSummaryPanel`** | [NEW-compose] | subtotal/envío/total using detail's `TotalRow` grammar |

Referenced only for pattern (not imported): `variant-selector.tsx` (radiogroup + roving-tabindex + out-of-stock strike), `product-filters.tsx` (300 ms debounced search), order detail `Panel`/`TotalRow`, `order-status-badge.tsx`.

---

### 1. Entry affordance — "Nuevo pedido" CTA

**Purpose**: Primary create action on the orders list header — the list has none today.
**Location**: `AdminPage` `actions` slot on `/admin/orders` (`src/app/admin/(app)/orders/page.tsx`), placed **before** the existing "Clientes" link (primary action leads).
**shadcn base**: `Button asChild` + `Link` + `PlusSignIcon` (mirrors `admin-products-new` exactly).

**Layout**:
```
Pedidos                         [+ Nuevo pedido] [ Clientes ]
14 pedidos                       └ primary        └ secondary
──────────────────────────────────────────────────────────────
```

**Markup shape** (matches `admin-products-new`, differs only in href/testid/copy):
```
<Button asChild size="sm" data-testid="admin-orders-new">
  <Link href={`${ADMIN_ORDERS_PATH}/new`}>
    <HugeiconsIcon icon={PlusSignIcon} size={16} strokeWidth={2} aria-hidden />
    Nuevo pedido
  </Link>
</Button>
```
- CTA = `default` (primary) variant, `size="sm"`. Existing "Clientes" stays `variant="secondary" size="sm"`. Both live in the same `flex flex-wrap items-center gap-2` slot, so they wrap below the title on narrow screens automatically.

**States**: static link — no loading/empty/error. Hover/focus inherit `Button` CVA (focus ring `focus-visible:ring-2 ring-ring/30`). No custom animation.

---

### 2. Page shell — `/admin/orders/new`

**Purpose**: RSC shell that guards the session, resolves the default shipping charge from Store Settings, and renders the client form island.
**Location**: `src/app/admin/(app)/orders/new/page.tsx` (mirrors `products/new/page.tsx`).
**shadcn base**: `AdminPage`.

**Layout** (desktop ≥ 1024px — two-column: form left, sticky summary right):
```
┌────────────────────────────────────────────────────────────────────┐
│ ← Pedidos                                                            │
│ Nuevo pedido                                                         │
│ Registra un pedido tomado por teléfono o en tienda.                  │
│ ──────────────────────────────────────────────────────────────────  │
│  ┌──────────────────────────────────┐  ┌────────────────────────┐  │
│  │ ▸ Cliente          (fieldset)     │  │  Resumen        (sticky)│  │
│  │ ▸ Envío            (fieldset)     │  │  Subtotal     $0.00     │  │
│  │ ▸ Artículos + picker (fieldset)   │  │  Envío        $500.00   │  │
│  │ ▸ Pedido (envío override + nota)  │  │  Total        $500.00   │  │
│  │ ▸ Pago (choice + confirm switch)  │  │  ─────────────────────  │  │
│  │                                    │  │  [   Crear pedido   ]   │  │
│  └──────────────────────────────────┘  └────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```
- The RSC renders the back-link (`← Pedidos`, `ArrowLeft02Icon`, `text-xs text-muted-foreground`), the `AdminPage` header, then `<ManualOrderForm defaultShippingCents={…} idempotencyKey={…} stateOptions={…} />`.
- `idempotencyKey` is minted **once** on the server per page render (a `crypto.randomUUID()`), threaded as a hidden input — the double-submit guard (edge 3).
- `defaultShippingCents` is `computeShipping(0, settings)` seed; the form recomputes the *default* live as the subtotal changes but never overwrites an admin override (see §6).
- Copy — title: `Nuevo pedido` · description: `Registra un pedido tomado por teléfono o en tienda.`

---

### 3. `ManualOrderForm` (client island)

**Purpose**: The whole form; owns `useActionState`, in-flight disable, field-error surfacing, per-line issue surfacing, and the redirect-on-success.
**Location**: `src/app/admin/(app)/orders/new/manual-order-form.tsx`.
**shadcn base**: none — composes `fields.tsx` primitives inside `fieldset` Sections (the `ProductForm` grammar).

**Form-state union** (mirrors `ProductFormState`):
```typescript
interface ManualOrderFormState {
  status: "idle" | "invalid" | "lineIssues" | "error" | "success";
  submissionId: string;              // reseeds banners + `key` on each response
  values?: ManualOrderFormValues;    // server-echoed, re-seeds every defaultValue on invalid
  fieldErrors?: Partial<Record<ManualOrderField, string>>;  // localized message per field
  lineIssues?: ManualOrderLineIssue[]; // per-line out-of-stock / price-changed
  orderId?: string;                  // on success → redirect target
  orderNumber?: string;              // on success → "PP-000123 creado"
  markedPaid?: boolean;              // success sub-outcome
  paidStepFailed?: boolean;          // created but paid step failed (Error-States table)
  emailSent?: boolean | null;        // confirmation opt-in outcome (null = not attempted)
}

interface ManualOrderLineIssue {
  lineKey: string;                    // client line id echoed back
  kind: "out-of-stock" | "price-changed" | "unavailable";
  liveStock?: number;
  liveUnitPriceCents?: number;
}
```

**Structure** (verbatim `product-form.tsx` grammar):
```
<form action={formAction} noValidate data-testid="admin-manual-order-form"
      className="flex flex-col gap-6 pb-24 md:pb-0">
  <input type="hidden" name="idempotency_key" value={idempotencyKey} />

  {/* form-level banners — keyed on submissionId so they re-animate */}
  {status==="error"      → <Banner role="alert" tone="error" …/>}         // whole-form failure
  {status==="invalid"    → <Banner role="alert" tone="error" …/>}         // "Corrige N campos."
  {status==="lineIssues" → <Banner role="alert" tone="error" …/>}         // "Revisa los artículos marcados."
  {paidStepFailed        → <Banner role="alert" tone="error" …/>}         // created-but-not-paid notice
  {emailSent===false && opted-in → <Banner role="status" tone="info" …/>} // "correo no pudo enviarse"

  <Section title="Cliente">        …TextFields…            </Section>
  <Section title="Envío">          …address grammar…       </Section>
  <Section title="Artículos">      <OrderLineEditor/>      </Section>
  <Section title="Pedido">         envío override + nota   </Section>
  <Section title="Pago">           <PaymentChoice/> + Switch</Section>

  {/* sticky action bar — identical to ProductForm */}
  <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-end gap-2
                  border-t border-border bg-background/80 px-4 py-3 backdrop-blur
                  md:sticky md:bottom-auto md:top-0 md:-mx-6 md:border-t-0 md:border-b md:px-6">
    <Button type="button" variant="ghost" disabled={pending}
            onClick={() => router.push("/admin/orders")}>Cancelar</Button>
    <Button type="submit" size="lg" disabled={pending} data-testid="admin-manual-order-submit">
      {pending ? "Creando…" : "Crear pedido"}
    </Button>
  </div>
</form>
```

**`Section` primitive** (reused from `product-form.tsx`):
```
<fieldset className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 sm:p-6">
  <legend className="px-1 text-sm font-semibold tracking-tight">{title}</legend>
  …
</fieldset>
```

#### (a) Section "Cliente"
```
┌ Cliente ─────────────────────────────────────────────┐
│ Nombre de contacto *   [_______________________]      │
│ Correo electrónico     [_______________________]      │
│   Opcional. Se usa para enviarle la confirmación y     │
│   avisos; puedes dejarlo vacío en pedidos por teléfono.│
│ Teléfono               [_______________________]      │
└───────────────────────────────────────────────────────┘
```
- `TextField name="contact_name" label="Nombre de contacto" required testid="manual-order-contact-name"`
- `TextField name="contact_email" type="email" label="Correo electrónico" testid="manual-order-contact-email"` — **no `required`**; `helper="Opcional. Se usa para enviarle la confirmación y avisos; puedes dejarlo vacío en pedidos por teléfono."`
- `TextField name="contact_phone" label="Teléfono" testid="manual-order-contact-phone" autoComplete="tel"`

#### (b) Section "Envío" — reuse checkout address grammar
```
┌ Envío ───────────────────────────────────────────────┐
│ Nombre de quien recibe *  [__________________________] │
│ Calle y número *          [__________________________] │
│ Interior / referencia     [__________________________] │
│ Ciudad *      [____________]   CP *   [_____]           │
│ Estado *      [ Selecciona… ▾ ]                        │
│ Notas de entrega          [__________________________] │
│ RFC (facturación)         [__________________________] │
└───────────────────────────────────────────────────────┘
```
- Field names **match the checkout `AddressField` keys** so `create_order` persists identical columns: `shipping_full_name`*, `address_line1`*, `address_line2`, `city`*, `postal_code`* (5-digit CP), `state`* (`SelectField` options = `MEXICAN_STATES` + a `{value:"", label:"Selecciona…"}` placeholder), `delivery_notes`, `rfc`.
- CP + state validated by the **same** rules as checkout (`MEXICAN_CP_PATTERN`, `isMexicanState`) — the manual input module calls the shared validators; invalid → field-level `FieldError`, no order created (AC-4).
- `≥ sm`: Ciudad/CP on one row (`grid-cols-2`), Estado full-width. Mobile: all stacked.

#### (d) Section "Pedido" — shipping override + internal note
```
┌ Pedido ──────────────────────────────────────────────┐
│ Costo de envío        [ $ ][ 500.00 ]                  │
│   Sugerido por la tienda: $500.00. Ajústalo si aplica. │
│ Nota interna          [_____________________________]  │
│   Solo visible para el equipo; no se envía al cliente. │
└───────────────────────────────────────────────────────┘
```
- `MoneyField name="shipping_override" label="Costo de envío" defaultValue={pesos(defaultShippingCents)} helper="Sugerido por la tienda: $X. Ajústalo si aplica." testid="manual-order-shipping"`. The helper's `$X` reflects the **current** store-derived default for the live subtotal (recomputed client-side as lines change); the input value is the admin's confirmed number and is never silently overwritten once touched. Server re-derives + `assembleOrder` snapshots totals (AC-8).
- `TextareaField name="internal_note" label="Nota interna" rows={3} helper="Solo visible para el equipo; no se envía al cliente." testid="manual-order-note"`.

#### (e) Section "Pago"
See §5 (`PaymentChoice`) + the confirmation `SwitchField`.

**Success handling** (mirrors `ProductForm`): on `status==="success"`, `useEffect` calls `router.push('/admin/orders/'+orderId)` (the T12 create→detail landing, UX "Success"). The detail renders its own inline `role="status"` success banner "Pedido PP-000123 creado" (`.enter-fade`, auto-hide ~6s) — carried via the redirect (query flag or router state) so it lands on the detail, not the form.

**Invalid handling** (mirrors `ProductForm`): `focusFirstInvalid(formRef, fieldErrors)` walks a FIELD_ORDER and focuses the first invalid input; `values` re-seed every `defaultValue`; error-summary `Banner role="alert"` message `Corrige N ${N===1?"campo":"campos"}.`

---

### 4. `ProductPicker` (the core new interaction) + `OrderLineEditor`

**Purpose**: Search the catalog by name/SKU, choose a product → (if variants) choose a variant → see live stock + server-recalculated unit price → add a bounded-qty line.
**Location**: `src/components/admin/orders/manual-order-line-editor.tsx` (+ picker subcomponent).
**shadcn base**: **none available** — there is no `Command`/`Combobox`/`Popover` in `src/components/ui`. Built from the shipped **`product-filters` search grammar** (native `<input type="search">` + a rendered results list) and the **`variant-selector` radiogroup** pattern. This is the deliberate decision: match the existing admin search idiom rather than introduce a new dependency.

**Data source**: a new server action `searchManualOrderCatalog(term)` returning, per matched product, `{ productId, name, sku, coverUrl, variants: [{variantId, label, stock, unitPriceCents}] | null, stock, unitPriceCents }`. `unitPriceCents` is the **live** `variant.price_override_cents ?? product.price_cents` (the `revalidateLines` price rule) — the client NEVER computes price. Reuses the products `name.ilike|sku.ilike` search filter.

**Picker layout**:
```
┌ Artículos ───────────────────────────────────────────┐
│ [🔍 Buscar producto por nombre o SKU…            ]     │  ← debounced 300 ms
│ ┌───────────────────────────────────────────────────┐ │  ← results, .enter-fade
│ │ [img] Silla Ergonómica Aria      SKU-AR-01         │ │
│ │       Azul · 12 disponibles · $4,999               │ │  ← per-variant row
│ │       Negro · agotado                    (disabled)│ │
│ │ ─────────────────────────────────────────────────  │ │
│ │ [img] Escritorio Nube            SKU-NB-09         │ │
│ │       Sin variantes · 3 disponibles · $8,500       │ │
│ └───────────────────────────────────────────────────┘ │
│                                                        │
│ (empty)  Agrega productos al pedido.                   │  ← before any line
└───────────────────────────────────────────────────────┘
```

**Search interaction** (matches `product-filters.tsx`):
- `<input type="search" placeholder="Buscar producto por nombre o SKU…">` styled with `fieldClasses`, `pl-9` + leading `Search01Icon` (`absolute` inside a `relative` wrapper).
- **Debounced 300 ms** via `ADMIN_SEARCH_DEBOUNCE_MS` (existing constant) — a `useRef` timer, exactly the filters pattern. On fire → the search action.
- **While querying**: a small inline spinner in the input's trailing slot + a 3-row skeleton (`animate-pulse` bars) in the results container. Never a full-form block.
- Results appear in an origin-neutral panel *inline below the input* (not a portal — it lives in flow so it never clips on mobile), `.enter-fade` on open, `role="listbox"`.

**Result-row anatomy** (a product with variants renders one product header + a variant sub-row per variant; a no-variant product renders a single selectable row):
```
<li role="option" (per selectable target)>
  cover thumb (size-9 rounded-md) · <name, break-words, min-w-0> · <sku, font-mono text-xs muted>
  stock+price line:  "{variantLabel} · {stockText} · {formatMXN(unitPriceCents)}"
</li>
```
- **Stock display**: `N disponibles` (or `1 disponible`); zero → **`agotado`** and the row is **`aria-disabled` / non-selectable**, `opacity-60`, no price shown, cursor `not-allowed`. Mirrors the variant-selector out-of-stock treatment (word/glyph, not color).
- **Variant requirement (AC-5)**: a variant product's *product header row* is NOT selectable; only its variant sub-rows are. Choosing a variant is the only path to add that product. If somehow no variant chosen, add is blocked with an inline "Elige una variante".
- **Add**: selecting an in-stock row appends a line to the editor with qty defaulting to 1, then clears the search term + closes the panel (keeps flow fast for multi-line phone orders). The just-added line `.enter-fade`s in.

**Picker keyboard operability (a11y)**:
- Input focused → typing filters. `ArrowDown` moves focus into the results `listbox`; `ArrowUp`/`ArrowDown` roves options (roving `tabIndex`, `aria-activedescendant` on the input), `Home`/`End` jump; `Enter`/`Space` adds the active option; `Escape` closes the panel and returns focus to the input. Disabled (agotado) options are skipped by arrow navigation. This is the `variant-selector` roving-tabindex model applied to a listbox.

**`OrderLineEditor` — the line list**:

Mobile (< 640px) — **stacked cards** (never a wide table):
```
┌───────────────────────────────────────────┐
│ [img] Silla Ergonómica Aria            [✕] │  ← remove, IconButton aria-label
│       Azul · SKU-AR-01                      │  (break-words, min-w-0)
│       $4,999 c/u                            │
│       Cantidad  [ − ] [ 2 ] [ + ]   $9,998  │  ← qty stepper + line total
│  ⚠ Sin stock — quedan 1                     │  ← per-line issue banner (when present)
└───────────────────────────────────────────┘
```

Tablet/desktop (≥ 640px) — **compact table**:
```
Producto                     Precio    Cant.        Total
─────────────────────────────────────────────────────────
[img] Silla Aria · Azul      $4,999    [−][2][+]   $9,998   [✕]
      SKU-AR-01
      ⚠ El precio cambió a $5,499                              (per-line issue row)
```
- **Qty control**: a bounded integer stepper. `−`/`+` buttons (min 1, max = the row's live stock) + a center `<input inputmode="numeric">`. Names submitted per line: hidden `line_product_id`, `line_variant_id`, `line_qty`, `line_key`. Out-of-bounds qty → input-layer field error (edge 6); `+` disables at live stock ceiling.
- **Line total** = `formatMXN(unitPriceCents * qty)`, `tabular-nums`, recomputed client-side for display only (server re-derives).
- **Remove**: `✕` icon button, `aria-label="Quitar {product} del pedido"`, `Cancel01Icon`. Removing the last line returns the editor to its **empty** state.
- **Per-line issue** (out-of-stock / price-changed from `state.lineIssues`): rendered *attached to the offending line* as a compact `text-destructive` row with `Alert02Icon` and the **live value**:
  - out-of-stock → `Sin stock — quedan {liveStock}` (or `Sin stock disponible`).
  - price-changed → `El precio cambió a {formatMXN(liveUnitPriceCents)}` — plus the line's displayed unit price updates to the live value so a resubmit uses it (edge 5).
  - The affected line gets `aria-invalid` + a `border-destructive/40` ring so it's findable; all other line values are preserved.

**Empty state**: no lines → a muted centered row inside the Section: `Agrega productos al pedido.` with the search input prominent above it. Totals show `$0.00`. (UX Requirements "Empty".)

---

### 5. `PaymentChoice` + confirmation switch (Section "Pago")

**Purpose**: Choose pending vs offline-paid, and opt into a confirmation email.
**Location**: within `manual-order-form.tsx`.
**shadcn base**: none — a native `radiogroup` styled as a 2-option segmented control (accessible, no-JS-submittable), + the existing `SwitchField`.

**Layout**:
```
┌ Pago ────────────────────────────────────────────────┐
│  ( • ) Marcar pendiente de pago                        │
│        Cobra después o al entregar.                    │
│  ( ○ ) Registrar pago recibido (offline)               │
│        Se marca como pagado ahora mismo.               │
│ ─────────────────────────────────────────────────────  │
│  [ Enviar correo de confirmación al cliente      ▢ ]   │  ← SwitchField, default OFF
│    Se enviará solo si capturaste un correo válido.     │  ← helper
└───────────────────────────────────────────────────────┘
```

**Payment radiogroup**:
- `role="radiogroup" aria-label="Estado de pago"`, two `<label>`-wrapped `<input type="radio" name="payment_choice">` with values `pending` (default `checked`) and `paid`.
- Each option is a full-width row styled like `SwitchField` (min-h-11, `rounded-md border border-border bg-background px-3 py-2`), with a bold label + muted helper. Selected row gets `border-ring ring-2 ring-ring/30` and its radio dot filled (`accent-primary`).
- Copy: `Marcar pendiente de pago` / helper `Cobra después o al entregar.` · `Registrar pago recibido (offline)` / helper `Se marca como pagado ahora mismo.`
- testids: `manual-order-payment-pending`, `manual-order-payment-paid`.

**Confirmation `SwitchField`** (AC-12):
- `SwitchField name="send_confirmation" label="Enviar correo de confirmación al cliente" testid="manual-order-confirm-email"`, `defaultChecked={false}`.
- **Disabled-when-no-email**: because `SwitchField` has no built-in disabled+reason affordance, the form watches the `contact_email` input's live value; when blank OR failing `EMAIL_PATTERN`, the switch renders `disabled` (its wrapper is already `disabled:opacity-60`-capable via the label) and its `helper` swaps to the explanatory hint: `Agrega un correo válido para poder enviarlo.` When a valid email is present, `helper="Se enviará solo si capturaste un correo válido."` and the switch is enabled. This satisfies "disabled/greyed when email blank with an explanatory hint."
- The switch never *forces* a send: it's opt-in AND gated on a valid email server-side too (AC-12).

---

### 6. `OrderSummaryPanel` (live totals + submit)

**Purpose**: Persistent order math + the primary submit, so the owner always sees the total.
**Location**: within `manual-order-form.tsx`; composes the detail's `TotalRow` grammar.
**shadcn base**: none — reuses `Panel`-style card + `TotalRow`.

**Layout** — desktop: a sticky right-column card; mobile/tablet: the same card rendered inline **above** the sticky action bar (so totals are visible before submit without a wide layout).
```
┌ Resumen ─────────────────┐
│ Subtotal        $9,998    │  tabular-nums
│ Envío             $500    │
│ Total          $10,498    │  emphasis (font-semibold)
└──────────────────────────┘
```
- `TotalRow label value [emphasis]` — `flex items-center justify-between`, `dt text-muted-foreground`, `dd tabular-nums` (emphasis → `font-semibold text-foreground`). Discount/tax rows are **not** shown (Out of Scope for v1 — no discount/manual price).
- All amounts are client-computed for display from the live-priced lines + the shipping-override input; the DB total is whatever `assembleOrder` snapshots server-side (the display and the snapshot agree because both use the same live unit prices).
- On desktop the summary card is `md:sticky md:top-16` so it follows scroll alongside the form.

---

### 7. Source badge — "Pedido manual / telefónico"

**Purpose**: Mark manual orders visibly on the detail (required) and optionally the list.
**Location**: order detail header (`orders/[id]/page.tsx`), beside the status badges; optional list badge.
**shadcn base**: `Badge` — **identical grammar to `OrderStatusBadge`** (glyph + text + variant + tint, never color alone).

**Meta** (add to `order-status-meta.ts`):
```typescript
export const MANUAL_ORDER_PAYMENT_METHOD = "manual"; // (order-constants.ts, single-sourced)
export function isManualOrder(paymentMethod: string | null): boolean {
  return paymentMethod === MANUAL_ORDER_PAYMENT_METHOD;
}
export const SOURCE_BADGE_META = {
  manual: { label: "Pedido manual / telefónico", glyph: "☎", variant: "outline", tint: "text-muted-foreground" },
} as const;
```

**Badge markup** (mirrors `order-status-badge.tsx`):
```
<Badge variant="outline" data-testid="order-source-manual" className="gap-1 font-normal text-muted-foreground">
  <span aria-hidden className="text-[0.7em] leading-none">☎</span>
  Pedido manual / telefónico
</Badge>
```
- Rendered in the detail header's `flex flex-wrap items-center gap-3` row, after `PaymentStatusBadge`, **only when** `isManualOrder(order.paymentMethod)`.
- Glyph `☎` (telephone) reads as "phone/manual" independent of color; the `outline` variant + muted tint keep it quiet (it's provenance, not status). Full text label present, so it's meaningful to a screen reader and colorblind users.
- **List (optional, nice-to-have)**: if `payment_method` is added to the list query, render a compact glyph-only `☎` chip in the order-table row with `aria-label="Pedido manual"` + a `title`. May be deferred without failing an AC.

**"Sin correo" detail treatment** (companion to the source badge): the detail `ContactPanel` currently prints `order.contactEmail` verbatim. For a manual order whose email is the store/sentinel placeholder (recipient guard treats it as no-recipient), the `Contacto` `<dd>` must show muted `Sin correo` instead of leaking the placeholder address. Logic lives in read/derivation (dev stage); the **design** is: `<dd className="break-words text-muted-foreground italic">Sin correo</dd>`.

---

## State Matrix — `/admin/orders/new`

| State | Trigger | Visual | Behavior |
| --- | --- | --- | --- |
| **idle** | page load | Empty form; empty line editor ("Agrega productos al pedido."); Envío default in Costo de envío; Pago = "pendiente"; confirm switch OFF+disabled (no email); Resumen `$0.00`; submit enabled | Nothing submitted; idempotency key minted |
| **validating (client)** | typing / blur | Field-level `FieldError` (`.enter-fade`) appear inline as native + light client checks fire; picker search shows spinner+skeleton while querying | Client checks are UX only; server re-validates |
| **submitting** | click "Crear pedido" | Submit → `Creando…` + `disabled`; **all** fields + picker disabled (`disabled={pending}`); Cancelar disabled | One in-flight action; idempotency key guards double-submit |
| **invalid** | server rejects field(s) | Error-summary `Banner role="alert"` "Corrige N campos."; per-field `FieldError`; focus jumps to first invalid; values preserved | No order created; resubmit allowed |
| **lineIssues** | `revalidateLines` finds issues | Form `Banner role="alert"` "Revisa los artículos marcados."; **each** offending line shows its live-value issue row + `border-destructive/40`; price-changed lines adopt the live price | No order created; admin adjusts & resubmits (edges 1 & 5) |
| **error** | whole-form / RPC failure (not line-scoped) | `Banner role="alert" tone="error"` "No se pudo crear el pedido. Intenta de nuevo." | No order (or safe-rolled-back); values preserved |
| **success** | order created | Redirect to `/admin/orders/[id]`; detail shows inline `role="status"` "Pedido PP-000123 creado" (`.enter-fade`, auto-hide ~6s) + source badge | Enters normal pipeline; list revalidated |
| **success + paidStepFailed** | created but `advance_order_status` paid step failed | Still redirects to detail; a `Banner role="alert"` on detail: "Pedido creado, pero no se pudo marcar pagado — hazlo desde el detalle." | Order valid (pending); NOT rolled back |
| **success + email failed** | opted-in, valid email, send `{ok:false}` | On detail: non-blocking `Banner role="status" tone="info"` "Pedido creado. El correo de confirmación no pudo enviarse." | Order created; `emailSent:false`; no rollback |
| **session expired** | submit after logout | Redirect to `/admin/login` | `requireSession()` before any write; no order |

---

## Interaction Flows

### Flow A — Create a pending phone order (email-less, happy path)
1. Orders list → click **[+ Nuevo pedido]** → navigate to `/admin/orders/new` (standard page nav, no animation).
2. Fill Cliente (name + phone, **email left blank** → confirm switch stays disabled with "Agrega un correo válido…").
3. Fill Envío (name, calle, ciudad, CP, estado). Invalid CP → inline `FieldError` under CP; fix.
4. Artículos: type "silla" → 300 ms debounce → results `.enter-fade` in → arrow to "Azul · 12 disponibles · $4,999" → Enter → line added (`.enter-fade`), qty 1. Bump qty to 2 with `+` → line total `$9,998`, Resumen updates.
5. Pedido: shipping default `$500` prefilled; leave or override. Add internal note.
6. Pago: leave "Marcar pendiente de pago". Confirm switch OFF.
7. Click **Crear pedido** → `Creando…`, everything disabled → success → redirect to detail with "Pedido PP-000123 creado" + `☎ Pedido manual / telefónico` badge; Contacto shows `Sin correo`.

### Flow B — Offline-paid + confirmation email
- Same as A but: capture a valid email (switch becomes enabled) → toggle confirm ON → Pago = "Registrar pago recibido (offline)". Submit → order created, marked paid (payment-only `advance_order_status`), confirmation attempted. Detail lands with status/payment reflecting paid; if the email failed, the info banner shows; the paid step is never a "payment received" email (AC-16).

### Flow C — Price changed mid-entry (edge 5)
1. Line added at `$4,999`. Before submit the live price rose to `$5,499`.
2. Submit → `status: lineIssues` → form banner "Revisa los artículos marcados."; the line shows `⚠ El precio cambió a $5,499`, its unit price updates to the live value, Resumen recomputes.
3. Admin reviews, resubmits → order created with the correct live price. Never silently charges the stale price.

---

## Responsive

| Breakpoint | Layout |
| --- | --- |
| **375 (mobile)** | Single column. Sections stack full-width (`p-4`). Line items = **stacked cards**. Picker results = full-width inline panel, tappable (min-h-11 rows). Resumen card renders inline above the fixed bottom action bar. Submit/Cancelar in the `fixed inset-x-0 bottom-0` bar. `min-w-0`+`break-words` on all names/SKUs; no horizontal overflow. |
| **768 (tablet)** | Sections `sm:p-6`. Cliente/Envío sub-fields use `sm:grid-cols-2` where paired (Ciudad+CP). Line items = **compact table**. Resumen still inline (single column) above the action bar. |
| **1024 (desktop)** | Two-column: form (left, ~2/3) + **sticky Resumen** card (right, ~1/3, `md:sticky md:top-16`). Action bar becomes `md:sticky md:top-0` header strip (the `ProductForm` pattern). |

---

## Motion Specs (all reuse shipped tokens — nothing new)

| Element | Trigger | Property | Easing | Duration | Reduced-motion |
| --- | --- | --- | --- | --- | --- |
| Field errors, banners, added line, picker results panel | mount | `opacity` + `translateY(8px→0)` | `--ease-out` | 200ms | `.enter-fade` drops the translate, opacity-only (built-in) |
| Submit / any `Button` press | `:active` | `transform: scale(0.97)` | `--ease-out` | ~120–160ms | button CVA already RM-safe |
| Picker result-row / line-card hover | hover | background/border tint only | `ease` | 120ms | gated `@media (hover:hover) and (pointer:fine)` |
| Success banner on detail | mount, then auto-hide ~6s | `opacity` | `--ease-out` | 200ms in | opacity-only |
| Search spinner | querying | rotation (existing spinner) | `linear` | — | acceptable (informative, not decorative motion) |

Rationale (Emil framework): this form is used *occasionally* by one owner → **standard, restrained** motion only. No entrance choreography on the whole form (it's a work surface, not a showcase). The only motion is *feedback* (`.enter-fade` telling the owner "a line/error appeared") and *press* (`scale(0.97)`). Enter easing is `--ease-out`; nothing uses `ease-in`; everything animates `transform`/`opacity`; all interruptible (CSS transitions, no keyframes); all RM-safe. No `scale(0)`. No keyboard-action animations.

---

## Accessibility Checklist

- [ ] Every field uses a `fields.tsx` primitive → label `htmlFor`/`id` (`useId`), `aria-invalid` + `aria-describedby` for helper + error wired automatically.
- [ ] Required fields marked with the `*` span (visual) AND enforced server-side; email is genuinely optional (no `*`, not enforced).
- [ ] Form-level failures use `Banner role="alert" aria-live="assertive"`; success uses `role="status" aria-live="polite"`.
- [ ] `focusFirstInvalid` moves focus to the first invalid field on an invalid submit (the `ProductForm` helper).
- [ ] Picker is fully keyboard-operable: input `aria-activedescendant`, results `role="listbox"`/`role="option"`, arrow/Home/End roving, Enter/Space to add, Escape to close+return focus; agotado options `aria-disabled` and skipped by arrows.
- [ ] Payment choice is a real `role="radiogroup"` with keyboard-navigable radios; the choice is never color-only (selected row has ring + filled dot + is the checked radio).
- [ ] Source & status badges are glyph + text (never color alone); the `☎` glyph is `aria-hidden`, the text label carries meaning.
- [ ] Remove-line buttons have `aria-label="Quitar {product} del pedido"`; qty steppers are labeled; the qty input has an accessible name.
- [ ] Per-line issues set `aria-invalid` on the line and describe the live value in text (not just a color ring).
- [ ] "Sin correo" shown instead of the sentinel placeholder — no confusing/leaked address for screen-reader or sighted users.
- [ ] Tab order is logical top-to-bottom: Cliente → Envío → picker → lines → Pedido → Pago → Cancelar → Crear pedido.
- [ ] All disabled states (`pending`, agotado, qty ceiling, disabled confirm switch) use `opacity-60`/`disabled:` + an explanatory hint, never silent.
- [ ] `prefers-reduced-motion` honored everywhere (all motion via `.enter-fade`/CVA which are already RM-safe).

---

## es-MX Copy Inventory

| Key | Copy |
| --- | --- |
| List CTA | `Nuevo pedido` |
| Page title | `Nuevo pedido` |
| Page description | `Registra un pedido tomado por teléfono o en tienda.` |
| Back link | `Pedidos` |
| Section Cliente | `Cliente` |
| Contact name | `Nombre de contacto` |
| Contact email | `Correo electrónico` · helper `Opcional. Se usa para enviarle la confirmación y avisos; puedes dejarlo vacío en pedidos por teléfono.` |
| Contact phone | `Teléfono` |
| Section Envío | `Envío` |
| Ship full name | `Nombre de quien recibe` |
| Address line1 | `Calle y número` |
| Address line2 | `Interior / referencia` |
| City | `Ciudad` |
| Postal code | `CP` |
| State | `Estado` · placeholder `Selecciona…` |
| Delivery notes | `Notas de entrega` |
| RFC | `RFC (facturación)` |
| Section Artículos | `Artículos` |
| Search placeholder | `Buscar producto por nombre o SKU…` |
| Stock available | `{N} disponibles` / `1 disponible` |
| Stock zero | `agotado` |
| No variants label | `Sin variantes` |
| Choose variant hint | `Elige una variante` |
| Empty lines | `Agrega productos al pedido.` |
| Qty label | `Cantidad` |
| Unit price suffix | `c/u` |
| Remove line | `Quitar {producto} del pedido` |
| Section Pedido | `Pedido` |
| Shipping field | `Costo de envío` · helper `Sugerido por la tienda: {$X}. Ajústalo si aplica.` |
| Internal note | `Nota interna` · helper `Solo visible para el equipo; no se envía al cliente.` |
| Section Pago | `Pago` |
| Payment pending | `Marcar pendiente de pago` · helper `Cobra después o al entregar.` |
| Payment paid | `Registrar pago recibido (offline)` · helper `Se marca como pagado ahora mismo.` |
| Confirm switch | `Enviar correo de confirmación al cliente` · helper (valid email) `Se enviará solo si capturaste un correo válido.` / (no email) `Agrega un correo válido para poder enviarlo.` |
| Summary | `Resumen` · `Subtotal` · `Envío` · `Total` |
| Submit idle | `Crear pedido` |
| Submit in-flight | `Creando…` |
| Cancel | `Cancelar` |
| Invalid summary | `Corrige {N} campo` / `Corrige {N} campos` |
| Line-issues summary | `Revisa los artículos marcados.` |
| Zero items | `Agrega al menos un producto.` |
| Out-of-stock line | `Sin stock — quedan {N}` / `Sin stock disponible` |
| Price-changed line | `El precio cambió a {$X}` |
| Whole-form error | `No se pudo crear el pedido. Intenta de nuevo.` |
| Success (on detail) | `Pedido {PP-000123} creado` |
| Paid-step failed | `Pedido creado, pero no se pudo marcar pagado — hazlo desde el detalle.` |
| Confirmation email failed | `Pedido creado. El correo de confirmación no pudo enviarse.` |
| Field: CP invalid | `Ingresa un código postal de 5 dígitos.` |
| Field: state required | `Selecciona un estado.` |
| Field: name required | `Ingresa el nombre de contacto.` |
| Field: qty invalid | `Cantidad inválida.` |
| Field: email invalid | `Correo electrónico inválido.` |
| Source badge | `Pedido manual / telefónico` |
| Detail no-email | `Sin correo` |

---

## Design Tokens Used

- **Colors** (neutral admin, semantic only): `border`, `background`, `card`, `foreground`, `muted-foreground`, `muted`, `ring`, `destructive` (+ `/5`, `/20`, `/30`, `/40` alphas), `primary` (checkbox/radio accent). Badge tints reuse `order-status-meta` (`text-muted-foreground` for source). No hardcoded hex.
- **Typography**: `text-lg font-semibold tracking-tight` (page/detail h1), `text-sm font-semibold tracking-tight` (fieldset legend), `text-sm font-medium` (field labels / panel h2), `text-sm` (values), `text-xs text-muted-foreground` (helpers/hints), `font-mono text-xs` (SKU), `tabular-nums` (all money & qty).
- **Spacing**: field container `gap-1.5`; section internal `gap-4`; form `gap-6`; header `mb-6 pb-4`; section padding `p-4 sm:p-6`; badge row `gap-3`; action bar `px-4 py-3` / `md:px-6`.
- **Radius / borders**: `rounded-md` (fields/buttons/rows), `rounded-lg` (sections/panels/cards), `border border-border`.
- **Elevation**: results panel + dropdown `shadow-lg`; action bar `bg-background/80 backdrop-blur`. No new shadow tokens.
- **Motion**: `--ease-out` / `--ease-in-out` / `--ease-drawer` (existing), `.enter-fade` utility, button CVA `scale(0.97)` press.
- **Sizing**: `min-h-11` (touch target on inputs/rows/switch), `size-9` (thumbnails/swatches), icon `size={16}` (`strokeWidth={2}`), badge glyph `text-[0.7em]`.

---

## Handoff Notes for Dev (Stage 4)

- **No shadcn Command/Combobox/Popover exists** — build the picker from `<input type="search">` + an in-flow `role="listbox"` panel using the `product-filters.tsx` debounce (`ADMIN_SEARCH_DEBOUNCE_MS = 300`) and the `variant-selector.tsx` roving-tabindex model. Do not add a new dependency.
- **`validateAddress` is email-required** — the manual variant must NOT require email but MUST keep the identical CP (`MEXICAN_CP_PATTERN`) + state (`isMexicanState`) rules. Factor the shared field validators so both callers use them (belongs in `manual-order-input.ts`).
- **`Banner` supports only `tone: "info" | "error"`** and a single `message` string — use `info` for the non-blocking email-failed notice and `error` for all rejections; do not invent a `warning`/`success` tone.
- **Price is never client-authoritative** — the picker's `unitPriceCents` comes from the search action (live `variant.price_override_cents ?? product.price_cents`); line totals in the UI are display-only; `assembleOrder` snapshots the DB totals.
- **Success banner lands on the detail**, not the form — thread the created `orderNumber` through the redirect so the T12 detail shows "Pedido PP-000123 creado".
