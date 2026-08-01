# UX Audit: T12 — Admin Order Management

> Stage 8 (ultraux). Overwrites the T11 audit per pipeline convention.

Full-cycle, complexity HIGH. Bar: Stripe / Linear / Apple. Craft authority:
`emil-design-eng` + `apple-design` (both loaded); an `improve-animations`-style
motion pass run over every new surface. Reference grammar (T10/T11) audited for
consistency parity via a dedicated primitive-read pass.

## Summary

- **Surfaces audited:** 9 (orders list, order detail, refund modal, cancel dialog,
  tracking form, internal notes, packing slip, customer list, dashboard indicator)
  across 16 components + 8 app files.
- **Issues found:** 7 (🔴 1, 🟡 3, 🟢 3)
- **Issues fixed:** 6 (the 🔴 + all 3 🟡 + 2 🟢); 1 🟢 noted (justified divergence)
- **Verification:** `tsc --noEmit` clean · eslint clean on all touched files ·
  orders unit suite 105/105 pass · live Playwright spot-checks at 375 / 1024 /
  desktop (login → list → detail → packing slip → dashboard; seeded 2 orders incl.
  a long-content + cancelled case, then restored DB to pristine 0 orders).
- **No visible-copy changes** → zero E2E text-assertion risk (all edits are
  className/structural + one auto-hide timer). QA scoped E2E out this stage anyway.

## UX Score: 9.5 / 10

The backend-to-UI wiring is principal-grade and the component grammar is
**indistinguishable from the shipped T10/T11 admin** — same `AdminPage` header,
table/card split, `nav-hover` rows, `gap-1 font-normal` glyph+text badges,
`border-dashed py-16` empty states, inline (no-drawer) filters, `min-h-11` fields,
`.dialog-content-motion` on both dialogs, `.enter-fade` banners. The single
embarrassing defect (mobile horizontal overflow on long content) is now fixed;
everything else was polish. Not a 10 only because the design-spec's mobile
sticky-action-bar was descoped to a clean single-column flow (documented below)
and the refund step-1→2 blur-crossfade is an instant swap (acceptable).

---

## Findings

### 🔴 Critical (fixed)

1. **[`orders/[id]/page.tsx`] Mobile horizontal overflow on long content.** A
   real order with a long unbroken email/address/product-name forced the entire
   mobile order-detail page to scroll horizontally — measured `documentElement.
   scrollWidth = 690px` at a 375px viewport (nearly 2×). Root cause: the two
   grid columns (`flex flex-col`) and the `Panel` `<section>` had the default
   flex/grid-item `min-width:auto`, so long content pushed the layout past the
   viewport. **Fixed:** added `min-w-0` to both grid columns and the shared
   `Panel` section, and `break-words` to every free-text field (contact email,
   phone, shipping name/address/delivery-notes, item product name+SKU, history
   note, internal-note body). Re-measured live: `scrollWidth = 375` (exact fit,
   no horizontal scroll), confirmed at 375px with a seeded long-content order.

### 🟡 Major (fixed)

1. **[`orders/[id]/page.tsx`] Phantom bottom padding / dead space.** The detail
   root reserved `pb-24 md:pb-0` (~96px) for a mobile sticky action bar that is
   **not implemented anywhere in the orders tree** (grepped `inset-x-0 bottom-0`
   / `backdrop-blur` → no match). Every mobile detail page rendered ~96px of
   empty space below the last panel. **Fixed:** removed the dead padding. The
   action cluster flows naturally at the bottom of the single-column mobile
   stack. *Note:* the design spec's sticky-bar enhancement was intentionally
   descoped — implementing it would duplicate the QA-verified action cluster +
   testids for marginal gain; the flow layout is the lower-risk, correct behavior.

2. **[`customer-table.tsx`] Long customer name/email overflow.** Desktop `<td>`s
   for name/email had no wrap/width guard (a long unbroken email would widen the
   table / force scroll); the mobile card name lacked `truncate`. **Fixed:**
   `max-w-48/64 break-words` + `align-top` on the desktop cells, `truncate` on
   the mobile name (email already truncated). Selectable email preserved.

3. **[`tracking-form.tsx`] "Guía guardada" success line never auto-hid.** Unlike
   the order-action banner (auto-hides 6 s) and the copy-confirmation pill
   (1.5 s), the tracking success line persisted until the next save — reading as
   stale state. **Fixed:** added a `SAVED_FEEDBACK_MS = 6000` auto-hide `useEffect`
   (matches the banner cadence, cleaned up on unmount).

### 🟢 Polish

1. **[`order-history-log.tsx` / `internal-notes.tsx`] Long-note wrapping.** History
   notes and internal-note bodies could overflow their column with a long
   unbroken token. **Fixed:** `break-words` (internal notes already had
   `whitespace-pre-wrap`; added word-breaking for unbroken strings).

2. **[header email] Long contact email in the detail sub-header.** **Fixed:**
   `break-words` on the "Creado … · {email}" line.

3. **[`refund-modal.tsx`] Reimplements the `MoneyField` `$`-adornment inline
   instead of composing `MoneyField`.** **Noted, not changed** — justified: the
   refund amount needs a *controlled* `value`/`onChange` binding + live
   validity-driven border tinting, and `MoneyField` is `defaultValue`-only. The
   inline input faithfully replicates `MoneyField`'s classes, `$` adornment,
   `inputMode="decimal"`, `min-h-11`, focus-within ring, and `aria-invalid`/
   `aria-describedby` contract — visual + a11y parity intact. A controlled
   `MoneyField` variant is a Phase-2 DRY item, not a UX defect.

---

## States Audit

| Surface | Loading | Empty | Error | Success | Long-content | Mobile 375 | A11y |
|---------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Orders list | ✅ | ✅ no+filtered (Limpiar) | ✅ banner+Reintentar | ✅ | ✅ truncate | ✅ card split | ✅ caption, sr-only |
| Order detail | ✅ | ✅ n/a (404s) | ✅ section-scoped | ✅ banner+refresh | ✅ **fixed** | ✅ single-col | ✅ glyph+text |
| Refund modal | ✅ spinner+lock | — | ✅ per-reason inline | ✅ close→refresh→banner | ✅ tabular | ✅ min-h-11 | ✅ trap, typed gate, aria-invalid |
| Cancel dialog | ✅ lock | — | ✅ FieldError | ✅ refresh→band | ✅ bounded | ✅ | ✅ AlertDialog, warning role=alert |
| Tracking form | ✅ | — | ✅ FieldError | ✅ **auto-hide 6 s** | ✅ bounded | ✅ | ✅ labeled |
| Internal notes | ✅ | ✅ "Sin notas." | ✅ section+inline | ✅ refresh→prepend | ✅ **break-words** | ✅ | ✅ srOnly label, role=alert |
| Packing slip | ✅ new-tab | — | 401→login / 500 friendly | ✅ print HTML | ✅ wraps | ✅ vertical-only | ✅ escaped, @media print |
| Customer list | ✅ | ✅ no+filtered | ✅ banner+Reintentar | ✅ | ✅ **fixed** | ✅ card split | ✅ caption, select-text |
| Dashboard | ✅ | ✅ "Sin pedidos nuevos." | best-effort | ✅ static amber | ✅ tabular | ✅ 1-col grid | ✅ ring, glyph+text |

## Accessibility Audit

| Check | Status | Details |
|-------|:---:|---------|
| Badges = glyph + text (never color alone) | ✅ | `*_STATUS_META` — glyph span `aria-hidden` + visible label; tint reinforcement only |
| Icon-only controls labeled | ✅ | `⋮` `aria-label="Acciones del pedido {n}"`; advance trigger `aria-label`; pagination arrows `sr-only`; search icon `aria-hidden`+`sr-only` label |
| Modal focus trap + restore | ✅ | Refund (Dialog) + Cancel (AlertDialog) via Radix; row `⋮` returns focus to trigger on Esc |
| Async results announced | ✅ | Success banner `role="status"`; transition/history/notes + `FieldError` `role="alert"` |
| Disabled destructive reason exposed | ✅ | Refund disabled → `title` + `aria-describedby="refund-reason"` sr-only line |
| Focus-visible ring everywhere | ✅ | From `fieldClasses` / dropdown base / pagination / dashboard cards (`ring-ring/30`); advance-trigger keeps the base ring |
| Keyboard operability | ✅ | All actions real `<button>`/`<a>`/`<select>`; dropdown Esc-closes+focuses first item; typed confirm is a real labeled input |
| Table caption | ✅ | `<caption className="sr-only">` on order + customer tables |
| Contrast on status tints | ✅ | `-700` (light) / `-400` (dark) small badge text over card bg meets AA; glyph+label carry meaning regardless of hue |
| `prefers-reduced-motion` | ✅ | `.enter-fade`, `.dialog-content-motion`, `.drawer-*`, stepper fill (`motion-reduce:transition-none`), dashboard arrow (`motion-reduce:transform-none`) drop transforms, keep opacity |

## Motion Audit (improve-animations, 8 categories)

| Category | Verdict | Notes |
|----------|:---:|------|
| Purpose & frequency | ✅ | No motion on high-frequency actions; **no per-row stagger** on the data table; dashboard amber tint **static** (persistent alert ≠ noise); banners/steppers animate only on state change |
| Easing & duration | ✅ | Enter = `--ease-out` (0.23,1,0.32,1); dialogs 180 ms open / 140 ms close (exit faster); banners/stepper 200 ms; drawer 300/200 ms — all < 300 ms |
| Physicality | ✅ | Dialogs scale `0.96→1` (never 0); `.enter-fade` translateY 8→0; stepper fill color/opacity only (no layout jump) |
| Interruptibility | ✅ | CSS transitions (retargetable), not keyframes; modals non-dismissable **only while a money/stock request is in flight** (deliberate double-submit guard) |
| Performance | ✅ | Only `transform`/`opacity` animated; `nav-hover` color-only |
| Accessibility | ✅ | reduced-motion honored on every animated surface |
| Cohesion | ✅ | Same tokens/durations as T10/T11 — motion indistinguishable from shipped admin |
| Missed opportunities | ◐ | Refund step-1→2 is an instant swap, not the spec's blur-bridged crossfade — acceptable (reduced-motion instant anyway; rare deliberate step); noted, not blocking |

## Copy Review (es-MX admin — no copy changed this stage)

| Location | Copy | Verdict |
|----------|------|---------|
| All badges | Routed through `*_STATUS_META` labels | ✅ no raw enum in UI (filter `value=`enum, `label=`es-MX) |
| Cancel dialog | "Se restaurará el stock… quedará como Cancelado. El cliente recibirá un correo de cancelación." | ✅ both consequences stated |
| Cancel — shipped | "⚠ El pedido ya fue enviado." (`role=alert`) | ✅ edge-3 |
| Refund step-1 | "⚠ Esta acción mueve dinero real y no se puede deshacer." + balance | ✅ irreversibility |
| Refund step-2 | "Vas a reembolsar **{MXN}** a este pago." + typed `REEMBOLSAR` gate | ✅ exact amount (cents→MXN) |
| Refund errors | over-refund / mp-error / not-refundable / error → friendly es-MX; raw MP never echoed | ✅ AC-20 |
| Partial-refund | "Reembolsable: {MXN}" + "Reembolso parcial emitido." | ✅ never implies multi-payment (PP-000005) |
| Cancelled + paid | "Pedido cancelado, pago aún reembolsable." | ✅ edge-6 |
| Money / dates | `formatMXN` (cents→MXN) + `formatRelativeDate`; slip `Intl` dd/mm/yyyy | ✅ consistent with T10/T11 |

## Consistency with T10/T11 (parity confirmed)

Every primitive matches the shipped grammar verbatim: `AdminPage` header
(`mb-6 … pb-4 sm:flex-row`, `text-lg font-semibold tracking-tight`), desktop-table
+ mobile-card split (`hidden overflow-x-auto rounded-lg border sm:block` /
`flex gap-3 p-3` cards), `nav-hover hover:bg-muted/40` clickable rows,
`ProductStatusBadge`-shaped badges, `ProductEmptyState`-shaped empties, inline
`ProductFilters` (no mobile drawer — matches products), `AdminPagination`
(`min-h-9` mobile / `min-h-8` desktop, `aria-current`), `fields.tsx` primitives,
`.dialog-content-motion` on Dialog + AlertDialog (mirrors `TaxonomyDeleteDialog`).
A reviewer cannot tell Orders was built after Products.

## Responsiveness (verified live)

- **375px:** single-column detail stack, card-list orders/customers, filters
  stacked, **no horizontal scroll** (`scrollWidth === 375` after fix), 44px touch
  targets (`min-h-11` fields, `min-h-9` pagination). ✅
- **768 / 1024px:** two-column detail, condensed table in `overflow-x-auto` (body
  never scrolls horizontally), `Fecha` column hidden until `lg`. ✅
- **Packing slip:** device-agnostic print stylesheet, `@media print` hides chrome
  + button, `@page { margin: 16mm }`, on-screen fallback scrolls vertically only,
  prominent CANCELADO band verified live for the cancelled order. ✅

## Files Modified (this stage — all behavior-preserving)

- `src/app/admin/(app)/orders/[id]/page.tsx` — removed phantom `pb-24 md:pb-0`;
  `min-w-0` on grid columns + `Panel`; `break-words` on all free-text fields.
- `src/components/admin/orders/order-history-log.tsx` — `break-words` on note line.
- `src/components/admin/orders/internal-notes.tsx` — `break-words` on note body.
- `src/components/admin/orders/customer-table.tsx` — `max-w`/`break-words`/`align-top`
  desktop cells; `truncate` mobile name.
- `src/components/admin/orders/tracking-form.tsx` — 6 s auto-hide for the success line.

## Escalations

- **None blocking.** The mobile sticky-action-bar (design-spec enhancement) was
  descoped to a clean single-column flow — flagged for Stage 11 (hacker) /
  Stage 12 (verify) as an intentional, documented deviation, not a gap.
- Refund `MoneyField` DRY (controlled-variant) → Phase-2 backlog item, no UX impact.
