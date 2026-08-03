# UI Design: T18 — Admin customer detail page

> **Scope note.** This is a LIGHTWEIGHT design pass for a **low**-complexity, full-stack
> (logic-heavy) ticket. The visible surface is a **straight composition of already-shipped
> T12 admin primitives** — `AdminPage` shell, the `Panel` card grammar, `OrderStatusBadge` /
> `PaymentStatusBadge` / `paymentBadgeIsRedundant`, `formatMXN`, `formatRelativeDate`,
> `isMailableAddress`, and the `order-table.tsx` row-link recipe. **No new component is
> introduced.** The only styling decisions are (a) how the four page sections stack, (b) the
> exact list-row link affordance for `customer-table.tsx`, and (c) a loading skeleton. All
> motion is reuse-only (`.enter-fade`); no new keyframes, no client island.

---

## Design Principles for This Feature

- **Copy the shipped grammar verbatim.** This page must be indistinguishable in look from the
  order detail page. Same `Panel`, same header shape (`ArrowLeft02Icon` + label back-link,
  `text-lg font-semibold tracking-tight` `<h1>`), same `dl`/`dt`/`dd` field layout, same
  `formatMXN`/`formatRelativeDate` rendering. Consistency over novelty.
- **Read-only, information-dense, calm.** No actions, no forms, no client interactivity beyond
  navigation. The page answers one question ("who is this person and what did they buy?") and
  gets out of the way. Density over whitespace — an operator tool, not marketing.
- **Never let a long email/address break the layout.** The T12 mobile-overflow critical fix is
  law here: `min-w-0` + `break-words` on every free-text field (name, email, address).
- **Every unhappy path degrades to a visible, in-shell state** — never a 500, never a blank
  region. Top-level failure → alert with Reintentar; section failure → scoped banner; zero
  orders → empty panel; bad id → `notFound()`.
- **Neutral admin theme, es-MX, hardcoded copy.** No `.theme-storefront`, no i18n catalogs.

---

## Component Inventory (reuse vs. new)

| Component / primitive | Source | Action |
| --- | --- | --- |
| `AdminPage` shell (title + description + divider) | `src/components/admin/admin-page.tsx` | **Reuse** |
| `Panel` (bordered card + `<h2>` header) | inline in order detail `[id]/page.tsx:120-128` | **Reuse** — copy the identical private `Panel` helper into the customer page (it is a local, non-exported helper; a verbatim 7-line copy is consistent with how the order page defines it locally). Do NOT invent a shared component for a low ticket. |
| `TotalRow` (label ↔ value flex row) | inline in order detail `[id]/page.tsx:217-224` | **Reuse** — copy the identical local helper for the Lifetime-totals rows. |
| Back-link (`ArrowLeft02Icon` + text) | order detail `[id]/page.tsx:60-67` | **Reuse pattern** — same markup, `href={ADMIN_CUSTOMERS_PATH}`, label "Clientes", `data-testid="customer-back-link"`. |
| `OrderStatusBadge` | `src/components/admin/orders/order-status-badge.tsx` | **Reuse** (order-history rows) |
| `PaymentStatusBadge` + `paymentBadgeIsRedundant` | `payment-status-badge.tsx` / `order-status-meta.ts` | **Reuse** (order-history rows; redundancy suppression exactly as `order-table`) |
| `formatMXN`, `formatRelativeDate` | `src/lib/money.ts`, `src/lib/admin/format.ts` | **Reuse** |
| `isMailableAddress` | `src/lib/email/recipient.ts` | **Reuse** (email sentinel → "Sin correo") |
| Order-history table/cards | pattern from `order-table.tsx` DesktopTable + MobileCards | **New markup, zero new component** — inlined as an `OrderHistoryPanel` local section (a trimmed clone of `order-table`: no `⋮` actions column, no pagination). |
| Empty state (dashed panel + glyph) | pattern from `order-empty-state.tsx` / list `CustomerEmptyState` | **New markup, inline** — a dashed panel with `ShoppingCart01Icon` and the zero-orders copy. No shared component. |
| Loading skeleton | pattern from `[id]/loading.tsx` | **New file** `customers/[id]/loading.tsx` — opacity-only pulse skeleton, cloned shape. |
| `.enter-fade` | `src/app/globals.css:414` | **Reuse** (top-level error branch only, mirroring the 404/error pages) |
| `Link`, `notFound`, `HugeiconsIcon` | next / hugeicons | **Reuse** |

**Tally: 0 net-new reusable components.** 1 new route file (`page.tsx`), 1 new `loading.tsx`,
and two page-local section helpers (`OrderHistoryPanel`, empty state) inlined in `page.tsx` the
same way the order detail inlines `ContactPanel`/`ItemsPanel`/`PaymentPanel`. Plus the
`customer-table.tsx` link edit (see §"Customer-table linking change").

---

## Page Section Order (top → bottom, single scroll column)

1. **Back-link** — `← Clientes`
2. **Identity header** — customer name `<h1>`, email (mailable or "Sin correo"), phone
3. **Lifetime totals** — `Panel`, compact labeled rows (order count, total spent, first, last)
4. **Order history** — `Panel`, desktop table / mobile cards, linked rows (or empty state)
5. **Contact & addresses** — `Panel`, contact block + de-duplicated shipping addresses

> **Layout rationale for the order.** Unlike the order detail (a two-column `md:grid-cols-2`
> working surface), the customer detail has low content volume and a natural reading order:
> *who → how much → what they bought → where to reach/ship them*. A **single readable column**
> (`flex flex-col gap-6`, matching the order-detail outer wrapper) is the spec at all
> breakpoints — the ticket explicitly permits this. Order history is the tallest section and
> benefits from full width for its table. This keeps the design trivially responsive, no grid.

---

### Component: Customer detail page (`customers/[id]/page.tsx`)

**Purpose**: Server-rendered read view of one `customers.id` — identity, lifetime totals,
order history, contact + addresses.
**Location**: `/admin/orders/customers/[id]`, inside the `(app)` admin shell.
**shadcn base**: none directly — composed from admin primitives (which sit on the
shadcn/Tailwind token layer). No new shadcn component needed.

**Layout — desktop (≥1024px) & tablet (768px), single column:**
```
┌────────────────────────────────────────────────────────────┐
│ ← Clientes                                                   │  back-link (xs, muted)
│                                                              │
│ María González Hernández                                     │  h1 text-lg font-semibold
│ maria.gonzalez@example.com                                   │  email (or italic "Sin correo")
│ 55 1234 5678                                                 │  phone (muted) — omitted if null
│                                                              │
│ ┌── Totales del cliente ─────────────────────────────────┐  │  Panel
│ │ Pedidos                                            3    │  │  TotalRow
│ │ Total gastado                              $4,290.00    │  │  TotalRow (emphasis)
│ │ Primer pedido                       hace 3 meses       │  │  TotalRow
│ │ Último pedido                       hace 6 días        │  │  TotalRow
│ └────────────────────────────────────────────────────────┘  │
│                                                              │
│ ┌── Historial de pedidos (3) ────────────────────────────┐  │  Panel
│ │ Nº pedido    Fecha         Total     Estado    Pago     │  │  table thead
│ │ ─────────────────────────────────────────────────────  │  │
│ │ PP-1042  hace 6 días   $1,890.00  [✓ Pagado] [—]       │  │  linked row
│ │ PP-0999  hace 1 mes    $1,200.00  [◷ Pend.]  [Pend.]   │  │
│ │ PP-0871  hace 3 meses  $1,200.00  [✕ Cancel.] [—]      │  │
│ └────────────────────────────────────────────────────────┘  │
│                                                              │
│ ┌── Datos de contacto y envío ───────────────────────────┐  │  Panel
│ │ Contacto                                                │  │
│ │   maria.gonzalez@example.com                            │  │
│ │   55 1234 5678                                          │  │
│ │ Direcciones de envío (2)                                │  │
│ │   María González · Av. Reforma 123, Int 4              │  │
│ │   Col. Juárez · CP 06600 · CDMX                         │  │
│ │   ────────────                                          │  │
│ │   María G. · Calle Pino 8                               │  │
│ │   Col. Del Valle · CP 03100 · CDMX                      │  │
│ └────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

**Layout — mobile (375px), same single column, history as cards:**
```
┌──────────────────────────────┐
│ ← Clientes                    │
│                               │
│ María González Hernández      │  break-words
│ maria.gonzalez@example.com    │  break-words (never overflows)
│ 55 1234 5678                  │
│                               │
│ ┌ Totales del cliente ──────┐ │
│ │ Pedidos              3     │ │
│ │ Total gastado  $4,290.00   │ │
│ │ Primer pedido  hace 3 mes. │ │
│ │ Último pedido  hace 6 días │ │
│ └────────────────────────────┘ │
│                               │
│ ┌ Historial de pedidos (3) ─┐ │
│ │ ┌────────────────────────┐│ │  card (mirror order MobileCards)
│ │ │ PP-1042      $1,890.00 ││ │  number link + total
│ │ │ hace 6 días            ││ │
│ │ │ [✓ Pagado]             ││ │  badges wrap
│ │ └────────────────────────┘│ │
│ │ ┌────────────────────────┐│ │
│ │ │ PP-0999      $1,200.00 ││ │
│ │ │ hace 1 mes             ││ │
│ │ │ [◷ Pendiente] [Pend.]  ││ │
│ │ └────────────────────────┘│ │
│ └────────────────────────────┘ │
│                               │
│ ┌ Datos de contacto y envío ┐ │
│ │ Contacto                   │ │
│ │  maria.gonzalez@examp...   │ │  break-words, wraps
│ │  55 1234 5678              │ │
│ │ Direcciones de envío (2)   │ │
│ │  María González            │ │
│ │  Av. Reforma 123, Int 4    │ │
│ │  Col. Juárez · CP 06600    │ │
│ │  · CDMX                    │ │
│ └────────────────────────────┘ │
└──────────────────────────────┘
```

**Props** (the page reads `params`; the shape it consumes from `getAdminCustomer`):
```typescript
// Consumed shape (defined in customer-read.ts, referenced here for the UI contract).
// The UI must render exactly these fields — no more, no fewer.
interface AdminCustomerDetail {
  id: string;                    // customers.id UUID
  fullName: string;              // customers.full_name
  email: string;                 // raw; render via isMailableAddress()
  phone: string | null;          // "—" when null
  totals: {
    orderCount: number;          // == list count by construction (AC-9)
    totalCents: number;          // integer cents; formatMXN at the edge (AC-8)
    firstOrderAt: string | null; // ISO; "—" when null (zero orders)
    lastOrderAt: string | null;  // ISO; "—" when null
  };
  // Bounded to CUSTOMER_ORDER_HISTORY_LIMIT, created_at DESC.
  orders: Array<{
    id: string;                  // links to ${ADMIN_ORDERS_PATH}/{id}
    orderNumber: string;
    createdAt: string;           // ISO → formatRelativeDate
    totalCents: number;
    orderStatus: OrderStatus;
    paymentStatus: PaymentStatus;
  }>;
  ordersTruncated: boolean;      // true when totals.orderCount > orders.length
  // De-duplicated on the full tuple, most-recent-first (AC-6, edge 4).
  addresses: Array<{
    shippingFullName: string;
    line1: string;
    line2: string | null;        // omitted from render when null
    city: string;
    state: string;
    postalCode: string;
    country: string;
  }>;
  historyFailed: boolean;        // section-isolation flag (AC-13): history read failed, core OK
}
```
> The `page.tsx` itself takes only `{ params: Promise<{ id: string }> }` — no `searchParams`
> (unlike the order page, no `created`/`paidFailed` banners here).

**States**:

| State | Visual | Behavior |
| --- | --- | --- |
| **Loading** | `customers/[id]/loading.tsx`: back-link bar + h1 bar + email bar, then 3 `animate-pulse rounded-lg border bg-muted/40` skeleton panels of decreasing height. Opacity-only pulse. | Covers the navigation gap; server-rendered, replaced when data arrives. No spinner inside sections. |
| **Success** | The full composition above. | Order rows are links (hover/focus underline). |
| **Empty (zero orders)** | Identity + contact still render. Totals panel shows `Pedidos 0`, `Total gastado $0.00`, `Primer/Último pedido —`. Order-history panel body = dashed-border block: `ShoppingCart01Icon` (40px, `text-muted-foreground/50`) + "Este cliente no tiene pedidos." Addresses section shows "Sin direcciones registradas." when none. | No error, no 500. Aggregate returns zeros; the empty branch renders (edge 5). |
| **Section error (history read failed, core OK)** | Identity, totals, contact render normally. Order-history panel body shows a `role="alert"` scoped destructive-tinted banner: "No se pudo cargar el historial de pedidos." | `getAdminCustomer` returns `historyFailed: true`, `orders: []`; page renders the scoped banner instead of the table (mirror `order-read` history isolation, AC-13). Totals still reflect all orders (computed separately). |
| **Top-level error (core read threw)** | `AdminPage title="Cliente"` wrapping a `role="alert"` destructive panel: "No se pudieron cargar los datos del cliente." + "Reintentar" link (`.enter-fade`) to the same URL. | Page `try/catch` around `getAdminCustomer`; logs `[admin-customer-detail] ...`; renders alert, not a 500 (verbatim the Customers-list error branch shape). |
| **404 (bad/unknown id)** | In-shell admin 404 ("no encontrado"). | `getAdminCustomer` returns `null` (UUID guard fail, or no matching row) → page calls `notFound()`. No DB call for a non-UUID id. |
| **Long history (> limit)** | Table/cards render the N most recent; a muted footer line below the table: "Mostrando los N más recientes de M." | `ordersTruncated === true`; totals still reflect **all** M orders (computed by aggregate, not the page). No pagination control at Phase-1 volume — see note. |

> **Pagination note (edge 3):** at Phase-1 volume the one-row-per-order reality means almost
> every customer has exactly 1 order; N>1 is rare and small. The history read is bounded by
> `CUSTOMER_ORDER_HISTORY_LIMIT` and the section simply grows/scrolls — **no `ListPagination`
> is added**. If a customer ever exceeds the limit, the "Mostrando los N más recientes de M"
> footer is the honest signal. A future ticket can add pagination if real volume demands it.

**Responsive**:

| Breakpoint | Layout Change |
| --- | --- |
| **< 640px (mobile, 375px target)** | Single column. Order history renders the **mobile card list** (`sm:hidden`, mirror `order-table` MobileCards): number-link + total on one baseline-aligned row, `formatRelativeDate` below, badges wrap. Address entries stack; every free-text field `min-w-0 break-words`. Totals rows stay label↔value flex. |
| **640–1023px (tablet, 768px target)** | Single column still. Order history switches to the **desktop `<table>`** (`hidden sm:block`, wrapper `overflow-x-auto`). Everything else unchanged. |
| **≥ 1024px (desktop)** | Identical single column. The `Fecha` column in the history table is always visible here (unlike the order list it is NOT `lg:table-cell`-gated — this page has fewer columns and room to spare). |

**Animations**:
- **Mount**: none for the composed success view (server-rendered, navigation-frequency — per
  emil-design-eng "list navigation → remove or drastically reduce"; the order detail has no
  mount animation either — match it). The only motion is the **top-level error branch**, which
  reuses `.enter-fade` exactly as the shipped 404/error pages do (low-frequency surface).
  - Trigger: mount of the error panel. Property: `opacity` + `transform: translateY` (existing
    class). Easing: `--ease-out`. Duration: 200ms. Reduced-motion: `.enter-fade` already drops
    the translate (opacity-only) under `prefers-reduced-motion`.
- **Hover (order-history row link)**: `nav-hover` + `hover:bg-muted/40` on the `<tr>`,
  `hover:underline` on the order-number link — property `background-color`/`text-decoration`,
  the existing `nav-hover` timing (already tuned in globals.css). No new easing/duration.
- **Focus (order-number link)**: `focus-visible:underline outline-none` — identical to
  `order-table`.
- **Click**: native navigation; no custom press animation (matches `order-table`).
- **Exit**: none.

---

## Customer-table linking change (`customer-table.tsx`) — AC-1

**The exact affordance:** mirror `order-table.tsx`, which links **only the identifier cell**
(the order-number), keeping the other cells' text selectable. For the customer table the
identifier cell is the **name** (`row.fullName`).

- **Desktop `<table>`**: wrap `row.fullName` in the *Cliente* cell in a `Link` to
  `${ADMIN_CUSTOMERS_PATH}/${row.id}`. The email stays plain selectable text (it is already
  `select-text` — preserve that). Apply the order-table link classes:
  `className="text-foreground outline-none hover:underline focus-visible:underline"`. Add
  `nav-hover hover:bg-muted/40` to the `<tr>` (it currently has none) so the whole row gives
  hover feedback like the order rows. Keep the `<tr>`'s existing `align-top`. Add
  `data-testid={`admin-customer-row-${row.id}`}` on the `Link`.
  ```
  Before:  <td class="… font-medium">{row.fullName}</td>
  After:   <td class="… font-medium">
             <Link href={`${ADMIN_CUSTOMERS_PATH}/${row.id}`}
                   class="text-foreground outline-none hover:underline focus-visible:underline"
                   data-testid={`admin-customer-row-${row.id}`}>
               {row.fullName}
             </Link>
           </td>
  ```
- **Mobile card `<li>`**: wrap the **name `<p>`** (the `truncate font-medium` line) in the same
  `Link` — NOT the whole card, so the `select-text` email stays selectable (matches how
  `order-table` MobileCards links only the number, not the whole card). Same `data-testid`.
  Keep the order-count pill outside the link.
- **Docstring**: update the current "Rows do NOT link (customer accounts are out of scope)"
  line to reflect that the name now links to the customer detail (T18).
- **Import add**: `Link` from `next/link` (`ADMIN_CUSTOMERS_PATH` is already imported here).

**Why name, not a whole-row `<Link>`:** a `<Link>` cannot wrap `<tr>`/`<td>` validly, and the
order table already established "link the identifier, keep other cells selectable" — consistency
demands the same. The email is operationally useful to select/copy, so it must not be swallowed
by a link. Exact `order-table` precedent (`order-table.tsx:68-97`).

**Keyboard/a11y:** the `Link` is natively focusable with the shared `focus-visible:underline`
treatment (visible focus style, AC-1). Tab order: name-link → next row's name-link
(email is text, not focusable). Logical top-to-bottom.

---

## Interaction Flows

### Flow: Drill into a customer
1. Operator on the Customers list clicks a customer **name** (or taps it on mobile) → native
   `Link` navigation to `/admin/orders/customers/{id}`.
2. `loading.tsx` skeleton covers the navigation gap (server render).
3. Detail renders: back-link → identity → totals → history → contact.
4. Operator clicks an **order-number** in the history table → navigates to
   `/admin/orders/{orderId}`.
5. Operator clicks **← Clientes** → back to the list.

### Flow: Zero-order customer
1. Navigate to a customer whose only order was orphaned (`customer_id` set null) or that has
   none.
2. Identity + contact render; totals show `0` / `$0.00` / `—`; history panel shows the dashed
   empty block "Este cliente no tiene pedidos." No error.

---

## Accessibility Checklist
- [ ] Order-history desktop table has `<caption className="sr-only">Historial de pedidos</caption>`
      (mirror `order-table`'s "Lista de pedidos").
- [ ] `<th scope="col">` on every history header cell.
- [ ] Order-number links keyboard-focusable with visible `focus-visible:underline`; customer
      name-links on the list likewise.
- [ ] Status/payment badges carry glyph **and** text (shipped badges already do — color is
      never the only indicator).
- [ ] Back-link icon `aria-hidden`; the link text "Clientes" is the accessible name.
- [ ] Empty-state / section-error glyphs `aria-hidden`; the text carries meaning.
- [ ] Section-error banner and top-level error use `role="alert"`.
- [ ] Every free-text field (`fullName`, `email`, address lines) uses `break-words` + a
      `min-w-0` container so magnification / narrow viewports never trigger horizontal overflow.
- [ ] Lifetime totals use a `<dl>`/`<dt>`/`<dd>` structure (semantic label↔value), reusing the
      order detail's `TotalRow`.
- [ ] Tab order is logical: back-link → order-number links top-to-bottom. No focus traps.

---

## es-MX Copy (all hardcoded, neutral admin voice)

| Surface | Copy |
| --- | --- |
| Back-link | `Clientes` (with `←` icon) |
| Identity `<h1>` | customer's `full_name` (no separate page title) |
| Email sentinel/blank | `Sin correo` (italic, muted — verbatim order detail) |
| Phone null | `—` |
| Totals panel header | `Totales del cliente` |
| Totals rows | `Pedidos` · `Total gastado` · `Primer pedido` · `Último pedido` |
| Totals empty dates | `—` |
| History panel header | `Historial de pedidos ({orderCount})` |
| History table headers | `Nº pedido` · `Fecha` · `Total` · `Estado` · `Pago` |
| History empty | `Este cliente no tiene pedidos.` |
| History truncated footer | `Mostrando los {N} más recientes de {M}.` |
| History section error | `No se pudo cargar el historial de pedidos.` |
| Contact panel header | `Datos de contacto y envío` |
| Contact sub-labels | `Contacto` · `Direcciones de envío ({count})` |
| Address line format | `{shippingFullName}` / `{line1}{, line2}` / `Col. {city} · CP {postalCode} · {state}` (verbatim order-detail address grammar) |
| Addresses empty | `Sin direcciones registradas.` |
| Top-level error | `No se pudieron cargar los datos del cliente.` + `Reintentar` |
| Error page title | `AdminPage title="Cliente"` |

**Copy decisions:**
- **"Totales del cliente"** (not "Valor de por vida" / "Lifetime value") — plainer es-MX,
  matches the calm operator voice; avoids the marketing-flavored LTV language the ticket rules
  out of scope.
- **"Total gastado"** = sum of **all** the customer's order totals (not paid-only), per edge 1,
  so the number always reconciles with the visible history and the list count. No separate
  "pagado" line in this lightweight pass (ticket allows it as a future separate labeled line).
- **"Direcciones de envío ({n})"** with a count — signals de-dup happened when n < order count.
- Counts in the panel headers use parentheses (`Historial de pedidos (3)`), matching the order
  detail's `Artículos ({n})` pattern — no singular/plural branching (reads fine for 0/1/N).

---

## Design Tokens Used
- **Colors**: `border-border`, `bg-muted/40`, `text-muted-foreground`, `text-foreground`,
  `border-destructive/30` + `bg-destructive/5` + `text-destructive` (error/section-error),
  `border-dashed border-border` + `text-muted-foreground/50` (empty state). All existing
  semantic tokens — none invented.
- **Typography**: `text-lg font-semibold tracking-tight` (h1), `text-sm font-medium` (Panel
  `<h2>`), `text-sm` (body), `text-xs text-muted-foreground` (labels, back-link),
  `font-mono text-xs` (order numbers), `tabular-nums` (money + dates + counts).
- **Spacing**: outer `flex flex-col gap-6` (matches order detail), `Panel` `p-4`, panel gap
  `gap-4`, table cells `px-3 py-2`, mobile card `p-3 gap-2` — all copied from the shipped
  tables/panels.
- **Radius/border**: `rounded-lg border border-border` (panels + table wrapper), verbatim.
- **Shadows**: none (admin surfaces are flat/bordered — matches T12).
- **Motion**: `.enter-fade` (error branch only) + existing `nav-hover` timing; `--ease-out` is
  the token behind `.enter-fade`. No new tokens.
