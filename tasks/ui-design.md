# UI Design: T12 — Admin Order Management

> Stage 3 (ultradesign). Feature type: `full-feature` / `full-stack`. es-MX only, no i18n plumbing (admin copy inline, per T10/T11). shadcn/ui first, Tailwind only, `@hugeicons` only. This spec extends the T10/T11 admin grammar verbatim — nothing new is invented where an existing primitive fits.
>
> Craft authority: `.claude/skills/emil-design-eng`, `.claude/skills/apple-design`; motion terms from `.claude/skills/animation-vocabulary`.

---

## Design Principles for This Feature

1. **Grammar continuity over novelty.** Every surface reuses the exact T10/T11 primitives: `AdminPage` header, the desktop-`<table>` + mobile-card list split (`ProductTable`), debounced search + `FilterSelect` (`ProductFilters`), `AdminPagination`, `dialog-content-motion` modals, the `⋮` `DropdownMenu` row menu, and inline `FieldError`/`.enter-fade` blocks. A reviewer must not be able to tell Orders was built after Products.
2. **Destructive money/stock actions earn friction.** Refund and Cancel are irreversible. Cancel uses `AlertDialog` (mirrors `TaxonomyDeleteDialog`); Refund uses a **two-step** `Dialog` (compose → typed-confirmation gate). Both expose **disabled → loading → success → error** with no ambiguous middle: submit disabled in-flight, dialog non-dismissable while the request runs.
3. **Status is never color alone.** The palette is grayscale-forward. Every status badge carries **glyph + text** (mirrors `ProductStatusBadge`), so `order_status × payment_status` is legible without hue. Color is secondary reinforcement only.
4. **The core order always renders.** Detail is section-composed; history/notes fetch failures degrade to a section-scoped error banner while the summary, line items, and actions still render — never a detail-page 500.
5. **No toast library — inline feedback + refresh.** The codebase has **no Sonner/toast**. Success follows the shipped pattern (`InventoryAdjustDialog`, `TaxonomyDeleteDialog`): close the dialog → `router.refresh()` → surface new state inline (updated badge + fresh history/ledger row). Where the UX ticket says "toast", render a top-of-body **inline success banner** (`role="status"`, `.enter-fade`, auto-hide 6 s).

---

## Reused Primitives (existing — do NOT rebuild)

| Primitive | Path | Reuse in T12 |
| --- | --- | --- |
| `AdminPage` (title/description/actions/children) | `src/components/admin/admin-page.tsx` | Every list + detail page header |
| Desktop `<table>` + mobile `<ul>` card split | `src/components/admin/products/product-table.tsx` | `OrderTable`, `CustomerTable` structure verbatim |
| `ProductFilters` (debounced search + `FilterSelect`, URL-synced, `router.replace(scroll:false)`, resets `?page`) | `src/components/admin/products/product-filters.tsx` | `OrderFilters` |
| `AdminPagination` (windowed, filter-preserving) | `src/components/admin/products/admin-pagination.tsx` | list + customer pagination (parameterize base path) |
| `ProductEmptyState` (dashed border, icon, filtered vs not) | `src/components/admin/products/product-empty-state.tsx` | `OrderEmptyState`, customer empty |
| `Badge` (default/secondary/destructive/outline/ghost/link) | `src/components/ui/badge.tsx` | status + payment badges |
| `Dialog` (`max-w-sm`, `zoom-in-95`) + `dialog-content-motion` | `src/components/ui/dialog.tsx`, `globals.css:781` | `RefundModal` |
| `AlertDialog` | `src/components/ui/alert-dialog.tsx` | Cancel confirm |
| `DropdownMenu` (content already carries `dialog-content-motion`) | `src/components/admin/products/dropdown.tsx` | order-row `⋮` menu |
| `TextField` / `SelectField` / `TextareaField` / `MoneyField` / `FieldError` | `src/components/admin/form/fields.tsx` | tracking, notes, refund amount (`MoneyField` = `$` adornment + `inputmode="decimal"`) |
| `Button` (sizes `sm`=h-6 / `default`=h-7 / `lg`=h-8; `active:translate-y-px` press) | `src/components/ui/button.tsx` | all actions |
| `formatMXN` / `pesosToCents` | `src/lib/money.ts` | money display + refund amount parse |
| `formatRelativeDate` | `src/lib/admin/format.ts` | list dates, history, notes timestamps |
| `displayRangeFor` / `paginationWindow` | `src/lib/catalog/pagination.ts` | list ranges |
| Motion tokens `--ease-out` (0.23,1,0.32,1), `--ease-in-out`, `--ease-drawer`; helpers `.nav-hover`, `.enter-fade`, `.dialog-content-motion`, `.drawer-panel`/`.drawer-scrim` | `globals.css` | all animation |

**Motion baseline (every animation below):** enter uses `--ease-out`; exit faster than enter; only `transform`/`opacity` animate; `@media (prefers-reduced-motion: reduce)` drops transforms, keeps a short opacity fade; hover motion gated behind `@media (hover: hover) and (pointer: fine)`. `Button` already gives press feedback via `active:translate-y-px`; do not re-add scale.

---

## Status-Badge Mapping (single-sourced — new `src/lib/admin/orders/order-status-meta.ts`)

Grounded in the DB enums (`0001`): `order_status` ranks 0–5 — `pending_payment`(0)→`paid`(1)→`preparing`(2)→`shipped`(3)→`delivered`(4)→`cancelled`(5), forward-only, `cancelled` highest. `payment_status` = `pending|authorized|paid|failed|refunded`. `transition_kind` is derived in SQL (`email_transition_kind`, 0010) — the UI reads it, never re-derives or string-matches the note. **Glyph + label carry meaning; Badge variant/tint is reinforcement only.**

### Order status (`OrderStatusBadge`) — glyph metaphor: fill grows as the order advances

| `order_status` | Glyph | es-MX label | `variant` | Tint (reinforcement) |
| --- | --- | --- | --- | --- |
| `pending_payment` | `○` | Pago pendiente | `outline` | `text-amber-700 dark:text-amber-400` |
| `paid` | `◔` | Pagado | `secondary` | default foreground |
| `preparing` | `◑` | Preparando | `secondary` | `text-blue-700 dark:text-blue-400` |
| `shipped` | `◕` | Enviado | `secondary` | `text-indigo-700 dark:text-indigo-400` |
| `delivered` | `●` | Entregado | `secondary` | `text-emerald-700 dark:text-emerald-400` |
| `cancelled` | `▢` | Cancelado | `outline` | `text-muted-foreground` |

Render exactly like `ProductStatusBadge`: `<Badge variant={...} className="gap-1 font-normal"><span aria-hidden className="text-[0.7em] leading-none">{glyph}</span>{label}</Badge>`.

### Payment status (`PaymentStatusBadge`)

| `payment_status` | Glyph | es-MX label | `variant` | Tint |
| --- | --- | --- | --- | --- |
| `pending` | `○` | Pago pendiente | `outline` | `text-amber-700` |
| `authorized` | `◐` | Autorizado | `outline` | `text-amber-700` |
| `paid` | `●` | Pagado | `secondary` | `text-emerald-700` |
| `failed` | `✕` | Fallido | `destructive` | destructive |
| `refunded` | `↩` | Reembolsado | `outline` | `text-muted-foreground` |

### Combined-state rules (the two badges always render as a pair — order left, payment right)

- `cancelled` + `paid` → **still refundable** (refund path keys on `payment_status`, not order status — edge 6). Refund action stays enabled; helper line "Pedido cancelado, pago aún reembolsable."
- `cancelled` + `refunded` → fully closed. Only Packing slip remains.
- `shipped`/`delivered` + any → Cancel still allowed (rank 5 never regresses) but the confirm warns "El pedido ya fue enviado" (edge 3).
- A **partial** refund leaves `payment_status='paid'` (AC-17) — partial state is conveyed by the **refundable-balance line + ledger**, never a payment-badge change. A payment badge of `refunded` means a FULL refund happened.

### Partial-refund clarity (PP-000005 caveat, edge 2)

Payment panel always shows: `Reembolsable: {formatMXN(total − refunded_total)}`. It NEVER implies more than the single `orders.mp_payment_id` payment was touched. If `0 < refunded_total < total`, show a subtle "Reembolso parcial emitido" note above the ledger.

---

## SURFACE 1 — Orders List (`/admin/orders`)  · AC-1..4

**Purpose:** paginated (25/page, `created_at DESC`), searchable, filterable index. **shadcn base:** none new — clones `ProductTable`/`ProductFilters`/`AdminPagination`.

### Layout — desktop (≥ 1024px)

```
┌───────────────────────────────────────────────────────────────────────┐
│  Pedidos                                                               │  ← AdminPage title
│  128 pedidos · 3 nuevos                          [ Nuevos pedidos → ]  │     description + actions slot
│───────────────────────────────────────────────────────────────────────│
│  [🔍 Buscar nº, correo o nombre…]  [Estado ▾] [Pago ▾]      [Limpiar] │  ← OrderFilters (URL-synced)
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │ Nº pedido  Cliente        Fecha     Total    Estado    Pago     │  │  ← thead bg-muted/40
│  │─────────────────────────────────────────────────────────────────│  │
│  │ PP-000012  María López    hace 2 h  $6,999  ◔ Pagado  ● Pagado ⋮│  │  ← hover:bg-muted/40
│  │ PP-000011  Juan Pérez     hace 5 h  $2,499  ○ Pend.   ○ Pend.  ⋮│  │
│  └─────────────────────────────────────────────────────────────────┘  │
│  Mostrando 1–25 de 128                          ‹ 1 2 3 … 6 ›          │  ← count + AdminPagination
└───────────────────────────────────────────────────────────────────────┘
```

Columns: `Nº pedido` (`font-mono`, links to detail, `data-testid`) · `Cliente` (`shipping_full_name`, truncate) · `Fecha` (`formatRelativeDate`, `hidden … lg:table-cell`) · `Total` (`text-right tabular-nums formatMXN`) · `Estado` (`OrderStatusBadge`) · `Pago` (`PaymentStatusBadge`) · `⋮` (`w-12`). Wrapper: `hidden overflow-x-auto rounded-lg border border-border sm:block`; row: `nav-hover border-b border-border last:border-0 hover:bg-muted/40`. Search meta-chars stripped (mirrors `list-query` m-3); `parseOrderListFilters` bounds search length + constrains enums (AC-4).

**Props**
```typescript
interface OrderTableProps {
  rows: AdminOrderRow[];         // { id, orderNumber, customerName, createdAt, totalCents, orderStatus, paymentStatus }
  totalCount: number;
  page: number;
  lastPage: number;
  filters: OrderListFilters;     // { search, status: OrderStatus|"all", payment: PaymentStatus|"all", page }
}
```

### `OrderFilters` (client) — `Estado` + `Pago` selects
Two `FilterSelect`s ("Todos los estados" / one `order_status`; "Todos los pagos" / one `payment_status`) + debounced search (`ADMIN_SEARCH_DEBOUNCE_MS`), URL-synced, resets `?page`, `Limpiar` ghost button only when active. Verbatim shape of `ProductFilters`.

### Row `⋮` menu (`OrderRowActions`, client, `DropdownMenu`)
`Ver detalle` (→ detail) · `Guía de empaque` (opens packing-slip route new tab) · `Copiar nº de pedido`. **No destructive actions in the list** — those live on detail only. `stopPropagation` on trigger (mirrors `ProductRowActions`).

### Mobile (< 640px) — stacked cards
```
┌──────────────────────────────────┐
│ PP-000012            $6,999       │  ← number + total prominent
│ María López · hace 2 h            │
│ ◔ Pagado   ● Pagado            ⋮ │  ← badge pair wraps
└──────────────────────────────────┘
```
Filters collapse into a "Filtros" trigger opening a bottom **drawer** (`.drawer-panel`/`.drawer-scrim`); search stays inline above the trigger for one-hand reach. Tablet (640–1024px): condensed table in `overflow-x-auto`, `Fecha` hidden until `lg`.

### States

| State | Visual | Behavior |
| --- | --- | --- |
| Loading | 25 skeleton `<tr>` (each cell a `bg-muted rounded h-4` bar sized to its column) via `loading.tsx`; mobile = 6 skeleton cards. Pulse = opacity only under reduced motion. | none |
| Empty (no orders) | `OrderEmptyState filtered={false}` — dashed box, `ShoppingCart01Icon` 40px `text-muted-foreground/50`, "Aún no hay pedidos.", subtext "Los pedidos aparecerán aquí cuando un cliente complete el pago." No CTA (orders originate at checkout). | — |
| Empty (filtered) | `OrderEmptyState filtered={true}` — "Ningún pedido coincide con los filtros." + `Limpiar filtros` secondary Button → `Link href={ADMIN_ORDERS_PATH}`. | clears params |
| Error | Inline banner `rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm` — "No se pudieron cargar los pedidos." + "Reintentar" ghost link re-navigating current URL. | read layer returns an error flag; page renders banner instead of table |
| Success | Table/cards with badge pairs; row → detail. | — |

### Animations
- Mount: rows/cards fade in (opacity 150ms `--ease-out`). **No per-row stagger** on a data table (seen many times/day → Emil frequency rule keeps it crisp).
- Row hover: `hover:bg-muted/40` color-only (`.nav-hover`, gated behind hover pointers).
- Mobile filter drawer: enter 300ms `--ease-drawer`, exit 200ms; reduced-motion → opacity.

---

## SURFACE 2 — Order Detail (`/admin/orders/[id]`)  · AC-5..21

**Purpose:** full inspection + all write actions. Non-UUID/missing id → `notFound()` (AC-7). **shadcn base:** `Dialog`, `AlertDialog`, `Badge`, form fields.

### Layout — desktop (two-column, ≥ 768px)

```
┌───────────────────────────────────────────────────────────────────────────────┐
│  ‹ Pedidos                                                                     │  ← back link
│  Pedido PP-000012                    ◔ Pagado   ● Pagado    [ Guía de empaque ]│  ← AdminPage title + badge pair + actions slot
│  Creado hace 2 h · maria@correo.mx                                            │
│───────────────────────────────────────────────────────────────────────────────│
│  [ success/info banner slot — inline, role=status, auto-hide 6 s ]           │
│  ┌── STATUS PIPELINE (stepper) ────────────────────────────────────────────┐  │
│  │  ○──●──◑──◕──○   Pend · Pagado · Preparando · Enviado · Entregado        │  │  ← current highlighted
│  └──────────────────────────────────────────────────────────────────────────┘  │
│  ┌── LEFT COL (summary) ──────────────┐   ┌── RIGHT COL (actions/pago/hist) ─┐ │
│  │ Datos de contacto                  │   │ Acciones                         │ │
│  │  maria@correo.mx · +52 …           │   │  [ Avanzar a Preparando ▾ ]      │ │
│  │ Envío a                            │   │  [ Reembolsar ]   [ Cancelar ]   │ │
│  │  María López · Calle…, CP 06700    │   │──────────────────────────────────│ │
│  │────────────────────────────────────│   │ Pago                             │ │
│  │ Artículos (2)                      │   │  Total          $6,999.00        │ │
│  │  Corrector postural ×1  $4,500     │   │  Reembolsado    $0.00            │ │
│  │  SKU PP-COR-01 · Talla M           │   │  Reembolsable   $6,999.00  ← emph│ │
│  │  Subtotal · Envío · Total          │   │  [ Reembolsar ]                  │ │
│  │────────────────────────────────────│   │──────────────────────────────────│ │
│  │ Guía de envío (tracking)           │   │ Historial                        │ │
│  │  [ nº ] [ paquetería ] [ url ]     │   │  ● Pagado → Preparando           │ │
│  │  [ Guardar ]                       │   │    manual · hace 1 h             │ │
│  │────────────────────────────────────│   │  ● Creado → Pagado · webhook…    │ │
│  │ Notas internas (privadas)          │   │                                  │ │
│  │  [ + Agregar nota ]  · nota… hace1h│   │                                  │ │
│  └────────────────────────────────────┘   └──────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────────┘
```
Each panel: `rounded-lg border border-border p-4` card with `<h2 className="text-sm font-medium">` header (product-edit grammar).

### `OrderStatusStepper` (server)
- Horizontal desktop / vertical mobile. Steps = the 5 forward statuses; `cancelled` is NOT a step — a cancelled order replaces the stepper with a full-width band `▢ Pedido cancelado · hace X`.
- Current: glyph filled + `text-foreground font-medium`; past: `text-muted-foreground`; future: `text-muted-foreground/40`. Connectors 2px `bg-border`; completed segment `bg-foreground/60`.
- On refresh after an advance, the new current step's fill transitions color/opacity 200ms `--ease-out` (no layout animation). Reduced-motion → instant.

### `OrderHistoryLog` (server, AC-6)
Chronological **newest-first** (one consistent direction). Each entry: `● {fromLabel} → {toLabel}` then `{transitionKindLabel} · {note?} · {formatRelativeDate}`. `transition_kind` → label via `order-status-meta.ts` (`shipped`→"Enviado", `cancelled`→"Cancelado", `refunded`→"Reembolso", `noop`→hidden). The `note` here is the **history note** (customer-derivation context), NOT internal notes. Section-scoped error: "No se pudo cargar el historial." while the rest renders.

### `OrderDetailActions` (client) — enabled per state from the allowed-transition map

| Action | Enabled when | Renders |
| --- | --- | --- |
| Avanzar estado | a valid forward status exists (rank < 5, not cancelled) | `DropdownMenu` of ONLY valid next statuses (AC-8) → `advanceStatus` |
| Tracking (in summary col) | status `preparing` or `shipped` | `TrackingForm`; advancing to `shipped` threads tracking into `sendShipped` (AC-11) |
| Reembolsar | `payment_status==='paid'` AND refundable balance > 0 | opens `RefundModal` (AC-16) |
| Cancelar | status ≠ `cancelled` | opens `CancelOrderDialog` (AC-13) |
| Guía de empaque | always | opens packing-slip route new tab |

Invalid/regressive transitions are **never offered**; if forced (stale tab), the RPC's `regression_blocked` surfaces inline "Esa transición no está permitida." — never a 500 (AC-8, edge 5). A `noop_same_status` double-submit silently no-ops (edge 4). Disabled actions carry a `title`/`aria-describedby` reason (e.g. "El pago no es reembolsable.").

### States (detail-level)

| State | Visual | Behavior |
| --- | --- | --- |
| Loading | Section skeletons (stepper bar, summary, 3 item rows, 3 history rows), `loading.tsx`. | — |
| Error (section) | Per-panel `border-destructive/30 bg-destructive/5` banner while core order renders. | detail never 500s |
| Success (action) | Dialog closes → `router.refresh()` → updated badge pair + new stepper fill + fresh history/ledger row + top-of-body **inline success banner** (`role="status"`, `.enter-fade`) "Estado actualizado" / "Reembolso emitido" / "Pedido cancelado", auto-hide 6 s. | — |
| Email-not-sent | Success path + amber sub-line "· correo no enviado" (edge 7, AC-10). | transition NOT rolled back |
| Disabled action | `disabled` Button + tooltip reason. | — |

### Responsive

| Breakpoint | Layout |
| --- | --- |
| < 768px | Single-column stack: badges under title → stepper (vertical) → summary → items → tracking → notes → payment → history. Action cluster in a **sticky bottom bar** `fixed inset-x-0 bottom-0 border-t border-border bg-background/80 backdrop-blur p-3` (primary: Avanzar, Reembolsar; `⋮` for the rest). Scroll container gets bottom padding so content is never hidden behind the bar. |
| ≥ 768px | Two-column (summary left · actions+payment+history right). |
| ≥ 1024px | Same, wider gutters. |

### Animations
- Success banner: `translateY(-4px)`→`0` + opacity 200ms `--ease-out`; exit opacity 140ms; reduced-motion → opacity only (`.enter-fade`).
- Stepper fill: color/opacity 200ms `--ease-out`.
- Sticky bar buttons: rely on `Button`'s `active:translate-y-px` (no extra motion).

---

## SURFACE 3 — Refund Modal (`RefundModal`, client, `Dialog`)  · AC-16..20

Highest-risk action → two-step confirm inside ONE dialog (a mode switch, not a nested AlertDialog — avoids stacked-scrim legibility issues, apple-design §12). Base: `Dialog` `max-w-sm` + `dialog-content-motion`.

### Step 1 — compose
```
┌── Reembolsar pedido PP-000012 ──────────────┐
│  Total pagado        $6,999.00              │
│  Ya reembolsado      $0.00                  │
│  Saldo reembolsable  $6,999.00   ← emphasis │
│─────────────────────────────────────────────│
│  ( ) Reembolso total  ($6,999.00)           │  ← radio
│  (•) Reembolso parcial                      │
│      Monto  [ 1,500          ] $   ← MoneyField (inputmode=decimal, $ adornment)
│      El monto no puede superar el saldo.    │  ← helper / inline error
│─────────────────────────────────────────────│
│  ⚠ Esta acción mueve dinero real y no se    │
│    puede deshacer.                          │
│                          [Cancelar] [Continuar]│
└─────────────────────────────────────────────┘
```

### Step 2 — confirm (typed gate)
```
┌── Confirmar reembolso ──────────────────────┐
│  Vas a reembolsar  $1,500.00  a este pago.  │  ← big, tabular-nums
│  Escribe REEMBOLSAR para confirmar:         │
│  [ REEMBOLSAR                    ]          │  ← TextField
│                          [Atrás] [Reembolsar]│  ← disabled until exact match
└─────────────────────────────────────────────┘
```
- Amount via `MoneyField` → integer MXN → `pesosToCents` at submit. Reject non-integer / ≤ 0 / > balance locally (fast feedback); DB guard is the race-safe authority (AC-17, edges 1/10).
- The **typed confirmation** (`REEMBOLSAR`, case-insensitive/trimmed) is the two-step affordance for the most dangerous action, exceeding Cancel's plain confirm.
- **Stable idempotency key** minted once per open-and-submit cycle (AC-19); a network retry of the same action is safe at MP, two distinct partials of the same amount do not collide.

**Props**
```typescript
interface RefundModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderNumber: string;
  totalCents: number;
  refundedCents: number;
  onRefunded: () => void;   // caller router.refresh()es
}
// action (imported): refundOrder(orderId, { mode: "full"|"partial"; amountMxn?: number })
//   -> { ok: true; kind: "full"|"partial" }
//    | { ok: false; reason: "over-refund"|"mp-error"|"not-refundable"|"error" }
```

### States

| State | Visual | Behavior |
| --- | --- | --- |
| Idle (step 1) | balance emphasized; radio full/partial; amount shown only for partial. | `Continuar` disabled if partial amount invalid |
| Confirm (step 2) | typed-confirmation gate | `Reembolsar` disabled until match |
| Loading | `Reembolsar` spinner + "Procesando…"; ALL controls disabled; dialog **non-dismissable** (`onOpenChange` no-op, backdrop click ignored) | prevents double-submit |
| Success | close → `onRefunded()` → refresh → banner "Reembolso emitido" | full → payment badge `refunded`; partial → stays `paid`, balance line drops |
| over-refund | step-2 `FieldError` "El monto supera el saldo reembolsable." (modal stays open, amount preserved) | no state change |
| mp-error | inline "No se pudo procesar el reembolso. Intenta de nuevo." | order/payment UNCHANGED; raw MP error never echoed (AC-20) |
| not-refundable | inline "Este pago no es reembolsable." | path returns `not-paid`/`no-payment-id` |
| error (partial-write) | inline "Ocurrió un problema. Revisa el panel de Mercado Pago antes de reintentar." | MP may have moved money; logged reconcile-by-hand (edge 10) |

### Responsive
- < 640px: full-height bottom sheet (`.drawer-panel`/`.drawer-scrim`, enter 300ms `--ease-drawer`, exit 200ms); large tap-target `MoneyField` (`min-h-11`).
- ≥ 640px: centered `Dialog` `max-w-sm`.

### Animations
- Open: `dialog-content-motion` (scale 0.96→1 + opacity 180ms `--ease-out`, **centered origin** — it's a modal). Exit 140ms. Reduced-motion → opacity only.
- Step 1→2: cross-fade inner body with a `filter: blur(2px)` bridge, opacity 160ms `ease` (Emil: blur masks a crossfade); reduced-motion → instant swap.

---

## SURFACE 4 — Cancel Confirm (`CancelOrderDialog`, client, `AlertDialog`)  · AC-13/14, edge 3

Mirrors `TaxonomyDeleteDialog` exactly (same `AlertDialog` + `dialog-content-motion` grammar).
```
┌── ¿Cancelar el pedido PP-000012? ───────────┐
│  Se restaurará el stock de los artículos y  │
│  el pedido quedará como Cancelado. El       │
│  cliente recibirá un correo de cancelación. │
│  [⚠ El pedido ya fue enviado.]  ← only if shipped/delivered (edge 3)
│  Motivo (opcional, se envía al cliente)     │
│  [ …………………………………… ]   ← TextareaField, bounded │
│                          [Volver] [Cancelar pedido]│
└─────────────────────────────────────────────┘
```

| State | Visual | Behavior |
| --- | --- | --- |
| Idle | consequence copy + optional bounded reason; warning line if shipped/delivered | — |
| Loading | action "Cancelando…", disabled; dialog non-dismissable | `cancelOrder(orderId, reason?)` → `cancel_order` RPC (transactional stock restore, idempotent, skips null FKs) |
| Success | close → refresh → stepper → cancelled band; banner "Pedido cancelado" | `sendCancelled` once (edge 7 isolation). If was `paid`, Refund STAYS enabled (edge 6) with helper "Pedido cancelado, pago aún reembolsable." |
| Error | inline "No se pudo cancelar el pedido." | RPC rolled back atomically; stock/status unchanged |

---

## SURFACE 5 — Tracking Form (`TrackingForm`, client)  · AC-11/12

Inline card in the summary column (frequent, low-risk — not a modal).
```
Guía de envío (tracking)
[ Número de guía         ]   ← optional; empty allowed → sendShipped(trackingNumber:null)
[ Paquetería ▾ Estafeta  ]   ← select/free text, bounded
[ URL de rastreo (opc.)  ]
[ Guardar ]                  ← disabled while pending; "Guardando…"
```
Validation: bounded length, trimmed; **empty tracking number valid** (AC-12). URL optional, URL-ish or empty. `Guardar` → `setTracking(orderId, {trackingNumber, carrier, trackingUrl})`. When advanced to `shipped`, values thread into `sendShipped`. States: idle / pending / success (inline "Guía guardada", auto-hide) / error (`FieldError` "No se pudo guardar la guía.").

---

## SURFACE 6 — Internal Notes (`InternalNotes`, client)  · AC-21

Private admin-only, stored in `order_internal_notes` — never `order_status_history.note`, never emailed.
```
Notas internas (privadas)               [privada]  ← muted pill on header
[ + Agregar nota ]                       ← reveals TextareaField + Guardar
· "Cliente pidió factura CFDI"   hace 1 h
· "Verificar dirección"          hace 3 h
```
Newest-first, each with `formatRelativeDate` (AC-21). Add → bounded `TextareaField` + `Guardar` (disabled empty/pending) → `addInternalNote(orderId, body)` → refresh → note prepended. States: idle / composing / pending / success / error (inline "No se pudo guardar la nota."). New note enters opacity + `translateY(4px)`→`0` 200ms `--ease-out` (rare action → delight OK); reduced-motion → opacity.

---

## SURFACE 7 — Packing Slip (`/admin/orders/[id]/packing-slip` route → `packing-slip-view`)  · AC-22/23, edge 8

Print-optimized **HTML**, no PDF dependency (research-confirmed). Route handler self-guards (`hasValidAdminSession()` → 401, mirrors `products/export/route.ts`), `Content-Type: text/html`, `Cache-Control: no-store`, `export const dynamic = "force-dynamic"`.
```
┌──────────────────────────────────────────────┐   ← @media print: no admin chrome
│  POSTURPRO                    GUÍA DE EMPAQUE  │
│  Pedido PP-000012        Fecha 01/08/2026     │
│  ┌──── CANCELADO ────┐  ← only if cancelled: bold band, prominent
│──────────────────────────────────────────────│
│  ENVIAR A                                     │
│  María López · Calle Ejemplo 123, Int 4       │
│  Col. Centro, CP 06700 · CDMX · +52 55 …      │
│──────────────────────────────────────────────│
│  Cant  SKU          Producto        Variante  │
│   1    PP-COR-01    Corrector…      Talla M   │
│   2    PP-BND-03    Banda…          —          │
│──────────────────────────────────────────────│
│  Total de artículos: 3                        │
│  [ Imprimir ]  ← on-screen only (hidden @media print) │
└──────────────────────────────────────────────┘
```
Pure builder `packing-slip.ts` (order number, ship-to snapshot, line items qty/SKU/variant) — trivially testable. `@media print`: hide print button + nav, black-on-white, no shadows, page-break-safe. On-screen fallback scrolls vertically only. Cancelled → prominent "CANCELADO" band (edge 8). Errors: 401 → login (page) / 401 body (route); 500 → "No se pudo generar la guía." (raw error logged not echoed).

---

## SURFACE 8 — Customer List (`/admin/orders/customers`)  · AC-24

Clones the list pattern (`CustomerTable` shaped like `OrderTable` + `AdminPagination` + search).
```
┌───────────────────────────────────────────────────────────┐
│  Clientes                                                 │
│  [🔍 Buscar por correo o nombre…]                [Limpiar]│
│  ┌───────────────────────────────────────────────────┐   │
│  │ Cliente        Correo            Tel.    Pedidos   │   │
│  │───────────────────────────────────────────────────│   │
│  │ María López    maria@correo.mx   +52…      3       │   │  ← count tabular-nums
│  └───────────────────────────────────────────────────┘   │
│  Mostrando 1–25 de 84                     ‹ 1 2 3 … ›      │
└───────────────────────────────────────────────────────────┘
```
Search matches email OR name (meta-char stripped). `Pedidos` = order count per customer (single grouped query, no N+1). States: loading (skeleton) / empty ("Aún no hay clientes." / filtered variant) / error (banner) / success. Mobile → stacked cards (name + email + order-count pill). Rows do NOT link (customer accounts out of scope); email is selectable text.

---

## SURFACE 9 — Dashboard New-Order Indicator (`/admin`)  · AC-25/26

Replaces the `redirect(ADMIN_SETTINGS_PATH)` stub with an `AdminPage`-wrapped overview.
```
┌───────────────────────────────────────────────────────┐
│  Panel · Resumen de la tienda                         │
│───────────────────────────────────────────────────────│
│  ┌── Nuevos pedidos ──┐  ┌── Productos ─┐  ┌── … ──┐  │
│  │        3           │  │     128      │  │       │  │  ← NewOrderIndicator card
│  │  por atender       │  │  en catálogo │  │       │  │
│  │  [ Ver pedidos → ] │  │  [ Ver → ]   │  │       │  │
│  └────────────────────┘  └──────────────┘  └───────┘  │
└───────────────────────────────────────────────────────┘
```
`NewOrderIndicator`: count of orders in `pending_payment`/`paid` not yet advanced (or since-last-viewed, **persisted not per-request** — AC-26). Links to filtered list `href={ADMIN_ORDERS_PATH + "?status=paid"}` (or a `?new=1` seam). Count > 0 → card gets subtle `bg-amber-50 dark:bg-amber-950/20 border-amber-200` tint + `●` glyph + `text-2xl font-semibold tabular-nums` count; 0 → neutral "Sin pedidos nuevos." Nav "Pedidos" item also gains an optional count pill (`Badge variant="secondary"`, `ml-auto tabular-nums` — the nav already supports this slot), data-driven (flip `status:"soon"`→`"live"`). `sendNewOrderOwnerAlert` stays wired at checkout (T9) — dashboard does NOT duplicate it (AC-26). Card mounts opacity 150ms; amber tint is **static** (no pulsing — a persistent alert must not become noise, Emil frequency rule).

---

## Interaction Flows

### Flow A — Advance to Shipped (tracking + email)
1. Fill `TrackingForm` → `Guardar` → `setTracking` persists.
2. Pick "Enviado" from `Avanzar estado` → `advanceStatus(orderId,"shipped")` (button → "Avanzando…"); action `requireSession()` first, calls `advanceOrderStatus` (never raw `.update`).
3. RPC returns `{applied:true, transition_kind:"shipped"}` → `sendShipped(orderId,{trackingNumber,carrier,trackingUrl})` once.
4. `router.refresh()` → stepper fills to Enviado, history row added, banner "Estado actualizado". Email failure → "· correo no enviado" (not rolled back).

### Flow B — Partial refund
1. `Reembolsar` → step 1 → Parcial, `1,500` → `Continuar`.
2. Step 2 → type `REEMBOLSAR` → `Reembolsar`.
3. Controls locked; `refundOrder(orderId,{mode:"partial",amountMxn:1500})` + stable idempotency key → `refundOrderPayment` → `record_refund` guard → `sendRefundIssued` (deduped on MP refund id).
4. Success → close → refresh → payment stays `paid`, balance −$1,500, ledger row, banner "Reembolso emitido".
5. over-refund / mp-error / error → inline message, modal open, no state change.

### Flow C — Cancel already-shipped
1. `Cancelar` → dialog shows "El pedido ya fue enviado" + optional reason.
2. Confirm → `cancelOrder` → `cancel_order` RPC (one transaction: restore stock skipping null FKs, advance to `cancelled`, write history) → `sendCancelled` once.
3. Refresh → cancelled band; if `paid`, Refund REMAINS enabled (edge 6) with helper.

---

## Accessibility Checklist
- [ ] Status/payment badges convey state via **glyph + text**, never color alone.
- [ ] Every icon-only control (`⋮`, pagination arrows, search icon) has `aria-label`/`sr-only`.
- [ ] Refund/Cancel dialogs trap focus; focus returns to the trigger on close.
- [ ] Typed-confirmation input is a real labeled `<input>`; the disabled destructive button's reason is `aria-describedby`.
- [ ] Table has a `<caption className="sr-only">` (mirrors `ProductTable`).
- [ ] Tab order: filters → rows → pagination; detail: back → actions → panels → history.
- [ ] Success banner `role="status"`; error banners `role="alert"`.
- [ ] All interactive elements keep `focus-visible:ring-2 focus-visible:ring-ring/30`.
- [ ] Sticky mobile action bar never overlaps the last content row (scroll-container bottom padding).
- [ ] `prefers-reduced-motion` honored on stepper fill, banners, note-enter, refund step transition, mobile drawer.

---

## Design Tokens Used
- **Colors:** `border-border`, `bg-muted/40`, `text-muted-foreground`, `bg-destructive/5` + `border-destructive/30`, `text-destructive`; status tints `amber/blue/indigo/emerald-700` (dark `-400`) + dashboard `bg-amber-50 dark:bg-amber-950/20`. All semantic — no new palette entries.
- **Typography:** `text-lg font-semibold tracking-tight` (title), `text-sm font-medium` (section headers), `text-sm` (body), `text-xs text-muted-foreground` (meta), `font-mono text-xs` (order number/SKU), `tabular-nums` (money + counts), dashboard count `text-2xl font-semibold`.
- **Spacing:** `p-4` cards, `gap-4` section stacks, `gap-2`/`gap-3` inline, `mb-6 pb-4` header (all from `AdminPage`/`ProductTable`).
- **Radius/border:** `rounded-lg border border-border` cards/table; `rounded-full` badges; `rounded-md` inputs/buttons; `rounded-xl` (Dialog default).
- **Shadows:** none added — admin is flat (borders, not elevation); modals use the shadcn `Dialog` `ring-1 ring-foreground/10` default only.
- **Motion:** `--ease-out` (enter), `--ease-drawer` (sheets), `dialog-content-motion` (modals), `.enter-fade` (banners/errors), `Button active:translate-y-px` (press). Durations: press ~100ms (built-in), banners/stepper 200ms, dropdowns/modals 180ms, sheets 300ms enter / 200ms exit.

---

## Component Inventory Summary (new → `src/components/admin/orders/`)

| Component | Client? | shadcn/base | Surface |
| --- | --- | --- | --- |
| `order-table.tsx` | no | — | List |
| `order-filters.tsx` | yes | — | List |
| `order-empty-state.tsx` | no | Button | List |
| `order-row-actions.tsx` | yes | DropdownMenu | List |
| `order-status-badge.tsx` | no | Badge | List/Detail |
| `payment-status-badge.tsx` | no | Badge | List/Detail |
| `order-status-stepper.tsx` | no | — | Detail |
| `order-history-log.tsx` | no | — | Detail |
| `order-detail-actions.tsx` | yes | Button/DropdownMenu | Detail |
| `refund-modal.tsx` | yes | Dialog + MoneyField | Detail |
| `cancel-order-dialog.tsx` | yes | AlertDialog + TextareaField | Detail |
| `tracking-form.tsx` | yes | form fields | Detail |
| `internal-notes.tsx` | yes | TextareaField | Detail |
| `packing-slip-view.tsx` | no | — | Packing slip |
| `customer-table.tsx` | no | — | Customers |
| `new-order-indicator.tsx` | no | Badge | Dashboard |

Shared meta constants (labels, glyphs, badge variants, allowed-transition map, transition_kind labels) → `src/lib/admin/orders/order-status-meta.ts`. No magic status strings in JSX.
