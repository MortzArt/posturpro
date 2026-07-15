# UI Design: T11 — Admin Product Management

> **Stage 3 artifact — overwrites the T10 admin-foundation spec.** Single-locale **es-MX**. Desktop-first, must stay usable at 375px.
> **Consumes:** `tasks/next-ticket.md` (7 slices, 35 ACs, 10 edges), `tasks/research-report.md`, the shipped T10 admin design system.
> **Craft authority:** `.claude/skills/emil-design-eng`, `.claude/skills/apple-design`; motion terms from `.claude/skills/animation-vocabulary`.
> **Organized by the 7 build slices** so Dev consumes it incrementally. Slice 0 has no UI surface beyond nav; its design content is the nav + read-convention decisions.

---

## 0. Design Principles for This Feature

1. **Extend the T10 admin, do not redesign it.** Reuse `AdminPage`, `AdminShell`, the field primitives (`TextField`/`MoneyField`/`FieldError`/`Banner`), the `useActionState` + `submissionId`-keyed-banner + focus-first-invalid contract, the OKLCH grayscale tokens, and the `.enter-fade` / `--ease-*` motion vocabulary — verbatim. This must feel like the same product T10 shipped.
2. **Information density over whitespace.** An operator's daily tool, not a marketing surface. Compact rows (`h-7`/`h-8` controls, `text-xs`/`text-sm`), tight tables, `tabular-nums` on every number. Match the T10 density (`text-xs/relaxed` buttons, `min-h-11` touch targets).
3. **Motion is nearly invisible here** (emil "frequency of use"). The owner opens the list dozens of times a day: **no page/route enter animation, no list-mount animation on navigation.** Reserve motion for occasional surfaces (dialogs, banners, drag) and never for keyboard-repeated actions. `.enter-fade` stays banner/error-only, exactly as T10 uses it.
4. **The DB is the authority; the UI is prevention + a friendly translator.** Every constraint (unique slug/SKU, category cycle, `on delete restrict`, `stock >= 0`, hex pattern, length bounds) is enforced in Postgres. The UI prevents the obvious cases and *catches + translates* the violation into es-MX — it never reimplements the guard as the only defense.
5. **Destructive actions are forgiving and explicit** (apple-design Agency). Delete → confirm dialog naming the exact consequence. Unsaved edits → navigation guard. CSV import → mandatory dry-run before any write. Confirm only genuinely irreversible actions; don't over-confirm.
6. **State which stock you're editing** (edge 7). Product-vs-variant stock ambiguity is surfaced everywhere it matters — list column, adjust dialog, CSV — never silently edits the wrong field.

---

## 1. Design Tokens Used (audited from `globals.css`)

| Group | Values | T11 usage |
| --- | --- | --- |
| Color | `--background --foreground --card --muted --muted-foreground --primary --secondary --destructive --border --input --ring --accent` | Semantic only. Status badges map to these; no new colors. |
| Radius | `--radius` 10px → `rounded-md` 8px, `rounded-lg` 10px, `rounded-sm` 6px, `rounded-full` | Cards/dialogs `rounded-lg`; controls `rounded-md`; badges `rounded-full`. |
| Easing | `--ease-out` `cubic-bezier(0.23,1,0.32,1)`, `--ease-in-out`, `--ease-drawer` `cubic-bezier(0.32,0.72,0,1)` | Enters `--ease-out`; mobile filter sheet reuses `.drawer-*` (`--ease-drawer`). |
| Motion classes | `.enter-fade` (200ms, ty 8px), `.drawer-scrim`/`.drawer-panel` (300/200ms), `.select-content-motion`, `.nav-hover` (120ms) | Reuse. **Add exactly two** (§Motion Appendix): `.dialog-content-motion` (Radix dialog pop) and `.reorder-item` (drag transition). Both RM-guarded. |
| Density | `min-h-11` (44px touch), controls `h-7`/`h-8`, `text-xs/relaxed` & `text-sm`, `gap-1.5` field stack, `gap-6` sections | Match T10 exactly. |
| Numerics | `tabular-nums` | All prices, stock, dims, counts, ledger deltas. |
| Icons | `@hugeicons/react` + `core-free-icons`, `HugeiconsIcon`, size 13 (errors)/16 (nav+banners)/20 (page actions), `strokeWidth={2}` | Never mix icon sets. See §Icon Appendix. |

**Reused primitives (extract to `src/components/admin/form/` before Slice 2 — research R5/DRY):** `TextField`, `MoneyField`, `FieldError`, `Banner`, plus new siblings this spec defines: `SelectField`, `TextareaField`, `NumberUnitField` (cm/kg), `SwitchField`, `MultiSelectField`, `TagInputField`. All follow the audited `flex flex-col gap-1.5` + `<label className="text-sm font-medium">` + `fieldClasses` + `FieldError` structure.

`fieldClasses` (verbatim):
```
w-full min-h-11 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 disabled:opacity-60
```

---

## 2. New shadcn/ui components to vendor (via CLI)

Ticket plans `table`, `textarea`, `dialog`, `tabs`. Confirmed + additions:

| Component | Why | Slice |
| --- | --- | --- |
| `table` | Product list, variant table, ledger, CSV preview | 1,4,6,7 |
| `textarea` | Description, Q&A answer | 2,6 |
| `dialog` | Inventory adjust, CSV import stepper, variant-image assoc | 3–7 |
| `tabs` | Taxonomy manager (4 entity types); product-form section nav | 2,5 |
| **`alert-dialog`** *(new)* | Destructive confirms (delete product/image/variant/category, unpublish, discard unsaved). Correct semantics: role, focus-trap, default-focus on Cancel — vs a plain dialog. | 2,3,4,5,6 |
| **`progress`** *(new)* | Per-file upload bar (Slice 3), CSV import progress (Slice 7). Correct `role="progressbar"`/`aria-valuenow`. | 3,7 |

**`alert-dialog` and `progress` are the only two additions beyond the ticket's four.** Both are standard shadcn registry components (vendored source, not runtime deps).

**Hand-rolled, zero new runtime deps** (per ticket): drag reorder (native Pointer Events + keyboard buttons), dropzone (native DnD + file input), category tree (recursive component), CSV parse/generate, import stepper (state machine). **`@dnd-kit` is NOT introduced** — justified in §Slice 3.

---

## 3. Navigation & Sub-navigation (Slice 0 UI decision)

### 3.1 Nav flip (AC-3)
`ADMIN_NAV_ITEMS`: `products` flips `status:"soon"` → `"live"` (badge gone, becomes a real `<Link>` — zero JSX change in `admin-nav.tsx`, it's data-driven).

### 3.2 Sub-navigation decision: **nested sidebar items, NOT in-page tabs**
Products spans four surfaces: **catalog**, **taxonomy**, **Q&A**, **import/export**.

- Add three sibling nav items grouped under a "Catálogo" label: `products` ("Productos"), `taxonomy` ("Taxonomía"), `qa` ("Preguntas"). CSV lives **in the products list header** (not a nav item). `AdminSectionId` → `"settings" | "products" | "taxonomy" | "qa" | "orders"`.

**Why sidebar items over tabs:**
1. **Wayfinding** (apple-design §16): each is a distinct, deep-linkable destination (`/admin/taxonomy`, `/admin/qa`). Sidebar gives a persistent "where can I go" map; tabs hide siblings until you're already there.
2. **Consistency:** T10 established the sidebar as *the* nav model. An in-page section-switching tab bar would create two competing paradigms. Tabs *within* taxonomy (the 4 entity types) are genuinely within one destination — the right place for tabs.
3. **Q&A needs a persistent unanswered-count badge** — only works as a nav item.
4. **Specific labels** beat a vague "Catálogo" umbrella with hidden tabs.

**CSV placement:** two buttons ("Exportar CSV", "Importar CSV") in the product-list action row — it operates on the catalog and is occasional, so it belongs where its object lives (apple-design mapping), not in the nav.

### 3.3 Sidebar presentation
Add optional `group?: string` to `AdminNavItem`; render a group label (`text-[0.625rem] font-medium uppercase tracking-wide text-muted-foreground/70 px-3 pt-3 pb-1`) before the first item of each group.

```
┌─ Sidebar (w-56 / lg:w-60) ────┐
│  PosturPro                     │
│  Administración                │
│                                │
│  ⚙  Configuración              │
│                                │
│  CATÁLOGO                      │
│  📦 Productos          (active)│
│  🏷  Taxonomía                 │
│  💬 Preguntas            [3]   │  ← unanswered count
│                                │
│  🛒 Pedidos      próximamente  │
│  ────────────────────────     │
│  ⎋  Cerrar sesión              │
└────────────────────────────────┘
```

**Q&A count badge:** `<Badge variant="secondary" className="ml-auto tabular-nums">{count}</Badge>` when `count > 0`; nothing at 0 (never a "0" badge). Count from a lightweight server read.

**Icons (hugeicons):** Productos `Package01Icon`, Taxonomía `FolderLibraryIcon`, Preguntas `Message01Icon`, Configuración `Settings01Icon`, Pedidos `ShoppingCart01Icon`.

**a11y/motion:** unchanged from T10 — `nav-hover` (120ms desktop-only), `aria-current="page"`, focus ring, mobile drawer via `.drawer-panel`. No new motion.

---

## SLICE 0 — Foundation (nav + read convention, no other UI)

Beyond §3, Slice 0 is data/infra (migration, storage, admin read). One UI-relevant decision:

**Admin list read convention (AC-4):** the list page is a **server component** reading `listAdminProducts(filters)` via `createAdminClient()` against the **base `products` table** (sees draft/archived), paginated with the pure `pagination.ts` math (`parsePageParam` → `lastPageFor` → `rangeFor`), **never `unstable_cache`**. Filters are URL search-params (shareable, back-safe). This is the read the whole list UI (Slice 1) renders from.

---

## SLICE 1 — Product List + Filters

### 1.1 `ProductListPage` (`/admin/products`)

**Purpose:** the operator's landing surface — find, scan, and jump into any product of any status.
**shadcn base:** `table`, `select`, `input`, `badge`, `button` + `AdminPage` wrapper.

**Layout (desktop ≥1024px):**
```
┌─ AdminPage title="Productos" desc="N productos en el catálogo" ────────────┐
│                                                        [Exportar CSV] [Importar CSV] [+ Nuevo producto] │
├────────────────────────────────────────────────────────────────────────────┤
│  [🔎 Buscar por nombre o SKU…        ]  [Marca ▾][Categoría ▾][Estado ▾][Stock ▾]  [Limpiar] │
├────────────────────────────────────────────────────────────────────────────┤
│  ▢ Img │ Nombre / SKU        │ Marca    │ Precio   │ Stock │ Estado   │ Actualizado │ ⋯ │
│  [img] │ Silla Ergo Pro      │ ErgoVita │ $4,999.00│  12   │ ● Activo │ hace 2 días │ ⋮ │
│        │ SKU-ERG-001         │          │          │ (var) │          │             │   │
│  [img] │ Silla Ejecutiva     │ ErgoVita │ $6,499.00│   0   │ ○ Borr.  │ hace 1 sem  │ ⋮ │
│  …                                                                             │
├────────────────────────────────────────────────────────────────────────────┤
│  Mostrando 1–20 de 143            « ‹ 1 2 [3] … 8 › »                           │
└────────────────────────────────────────────────────────────────────────────┘
```

**Row anatomy (AC-5):** cover thumbnail (`size-10 rounded-md object-cover bg-muted`, `next/image`; placeholder icon `Image01Icon` in a muted box if none) · name (`font-medium text-foreground`) + SKU below (`text-xs text-muted-foreground tabular-nums`) · brand (or `—` muted if null) · price `formatMXN` (`tabular-nums`) · stock (`tabular-nums`; badge `(var)` `text-[0.625rem] text-muted-foreground` when variant-summed — edge 7) · status badge (§1.3) · updated date (relative es-MX "hace 2 días") · row-actions menu `⋮`.

**Row action menu (`⋮`, AC-8, AC-27):** an `icon-sm` ghost button opening a small popover/menu (reuse `select`-style content or a minimal custom menu; if a `dropdown-menu` primitive is desired, it's optional — a plain `<div>` menu suffices): **Editar** (→ `/admin/products/[id]/edit`), **Duplicar** (server action → creates `-copia`, redirects to its edit page), **Ajustar inventario** (opens dialog §6.1), **Archivar / Restaurar** (status toggle). The whole row is also clickable → edit (with the `⋮` menu `stopPropagation`).

**Filters (AC-6):** search `input` (debounced 300ms client → updates `?search=`), plus four `select`s: **Marca** (brands list, "Todas"), **Categoría** (categories, "Todas"), **Estado** ("Todos"/"Borrador"/"Activo"/"Archivado"), **Stock** ("Todos"/"En existencia"/"Agotado"). All combine AND, all reflected in URL. "Limpiar filtros" button appears only when any filter is active.

**Props:**
```typescript
interface ProductListPageProps {
  products: AdminProductRow[];      // current page rows (any status)
  totalCount: number;
  page: number;                     // clamped
  lastPage: number;
  filters: ProductListFilters;      // parsed, echoed into controls + URL
  brands: TaxonomyOption[];         // for the Marca select
  categories: TaxonomyOption[];     // for the Categoría select
}
interface AdminProductRow {
  id: string; slug: string; name: string; sku: string;
  coverUrl: string | null;
  brandName: string | null;
  priceCents: number;
  stock: number;                    // product stock OR summed variant stock
  stockIsVariantSummed: boolean;    // drives the "(var)" hint (edge 7)
  status: "draft" | "active" | "archived";
  updatedAt: string;                // ISO
}
```

**States:**
| State | Visual | Behavior |
| --- | --- | --- |
| Loading | Table skeleton: 8 rows of `animate-pulse` `bg-muted/60 rounded` bars matching column widths; header + filter bar render immediately (SSR streams the table body). | `.stagger` NOT used (frequency-of-use); skeleton is static shimmer. |
| Empty (no products) | Centered `ProductEmptyState`: `Package01Icon` (size 40, `text-muted-foreground/50`) + "Aún no hay productos" (`text-sm font-medium`) + "Crea tu primer producto o impórtalo por CSV." (`text-xs text-muted-foreground`) + `[+ Nuevo producto]` + `[Importar CSV]`. | CTAs route/open dialog. |
| Empty (filtered) | Same block, copy: "No hay resultados con estos filtros." + `[Limpiar filtros]`. | Clears all `?` params. |
| Error | `Banner` tone="error" `role="alert"`: "No se pudieron cargar los productos. Recarga la página." | Server component error boundary. |
| Success | Table with data; hover row `hover:bg-muted/40`; row focus-visible ring. | — |

**Responsive:**
| Breakpoint | Change |
| --- | --- |
| <640px | **Card list, not a table** (justification below). Each product = a card: thumbnail left (`size-14`), name+SKU+brand stacked, price + stock + status badge row, `⋮` top-right. Filters collapse into a **filter sheet** (button "Filtros (n)" → opens `.drawer-panel` bottom/left sheet with the four selects + apply/clear). Search stays inline full-width. |
| 640–1023px | Table inside `overflow-x-auto` container (`-mx-4 px-4` bleed); columns: hide "Actualizado", keep the rest. Never breaks page layout. |
| ≥1024px | Full table as drawn. |

> **Mobile decision — card collapse, not horizontal scroll (justified):** the product table has 8 columns of mixed-width content (thumbnail, two-line name/SKU, badges). Horizontal scroll at 375px would hide the two most-scanned facts (name, status) off-screen and force a scrub to read one row. A stacked card keeps name + price + stock + status all visible in the thumb's reach and gives a 44px+ tap target for edit. Tablet (640px) *can* afford horizontal scroll because ~6 columns fit with a small overflow; mobile cannot. This matches the ticket's explicit UX requirement ("mobile list becomes a stacked card list").

**Pagination (AC-7):** reuse `paginationWindow(page, lastPage)` → render first/last + current±1 + `PAGINATION_ELLIPSIS`. Each page link is `<Link href={?page=N + preserved filters}>`. `?page` out of range clamps via `parsePageParam` (server). Controls: `‹`/`›` prev/next `icon-sm` ghost buttons (disabled at ends via `aria-disabled` + no href), number links `size="sm"` (active = `bg-muted font-medium`).

**a11y:** table has `<caption className="sr-only">Lista de productos</caption>`; sortable columns (if sort added) use `aria-sort`; status conveyed by **badge text + dot shape**, never color alone (§1.3); search input `<label className="sr-only">Buscar productos</label>` + visible placeholder; row `⋮` menu button `aria-label="Acciones de {name}"`; filter selects each have a `<label>`.

**Motion:** none on mount/navigation (frequency-of-use). Filter sheet (mobile) uses the existing `.drawer-panel`/`.drawer-scrim`. Row hover is a 120ms `bg` transition (reuse `nav-hover`-style, desktop-gated). No row stagger.

### 1.2 `ProductFilters`
Client component owning the debounced search + selects; pushes to the router (`router.replace` with merged searchParams, `scroll:false`). Debounce 300ms on search only; selects update immediately. Exposes "Limpiar" when `hasActiveFilters`.

### 1.3 Status badge mapping (color-is-not-the-only-signal)
| status | Badge | dot glyph | copy |
| --- | --- | --- | --- |
| `active` | `variant="secondary"` + `bg-muted` | ● filled | "Activo" |
| `draft` | `variant="outline"` | ○ hollow | "Borrador" |
| `archived` | `variant="secondary"` `text-muted-foreground` | ▢ square | "Archivado" |

Shape + text distinguish them; grayscale palette means we cannot rely on hue. Use a leading `<span aria-hidden>` glyph.

---

## SLICE 2 — Add / Edit Product Form

### 2.1 Layout decision: **single long form with a sticky section rail, NOT tabs** (justified)

The product model is large (name/slug/desc, pricing×3, SKU, status, brand/style, dimensions×4, weight, materials×3, flags×2, categories, tags — plus images & variants on edit). Decision: **one scrollable form, sections as stacked `<fieldset>` cards, with a sticky left section-nav rail (desktop) that scroll-spies.**

**Why single form over tabs, for an operator who edits daily:**
1. **One save, one mental model.** Tabs fragment a single entity into pages and invite the "did I save the other tab?" anxiety. A daily operator wants to change a price and save — not hunt which tab it's on. One `<form>` = one submit, all fields posted together (matches the T10 settings form contract exactly).
2. **Validation surfacing.** Focus-first-invalid (the T10 contract) is trivial in one form; across tabs it means jumping the user to a hidden tab, which is disorienting. Errors from any section show inline and the page scrolls to the first.
3. **Ctrl/Cmd-F and scan.** Power users find fields by scrolling/searching a single page faster than clicking through tabs.
4. **apple-design Simplicity ("show the common path first"):** the section rail gives the *navigability* benefit of tabs (jump to Precios) without the *fragmentation* cost. Sticky rail = wayfinding; single form = coherence.

Images and Variants (Slices 3–4) are **sections within this same page** on edit (not separate routes), so the whole product is edited in one place.

**Layout (desktop):**
```
┌─ AdminPage title="Editar producto" | "Nuevo producto" ─────────────────────┐
│                                              [status pill]  [Cancelar] [Guardar] │  ← sticky action bar
├──────────────┬──────────────────────────────────────────────────────────────┤
│ SECCIONES     │  ┌─ General ───────────────────────────────────────────────┐ │
│ • General     │  │ Nombre           [___________________________]           │ │
│ • Precios     │  │ Slug             [silla-ergo-pro]  [🔗 auto]  postur.../  │ │
│ • Inventario  │  │ Descripción      [textarea ....................]          │ │
│ • Organización│  │ Estado           (Borrador ▾)                             │ │
│ • Dimensiones │  └──────────────────────────────────────────────────────────┘ │
│ • Materiales  │  ┌─ Precios ───────────────────────────────────────────────┐ │
│ • Imágenes    │  │ Precio      [$ 4999.00]   Precio comparado [$ ______]     │ │
│ • Variantes   │  │ Costo (no visible para clientes) [$ ______]               │ │
│ • Preguntas   │  └──────────────────────────────────────────────────────────┘ │
│               │  … (Inventario, Organización=brand/style/cat/tags, Dims, Mats,│ │
│  (scroll-spy) │     Imágenes §3, Variantes §4) …                              │ │
└──────────────┴──────────────────────────────────────────────────────────────┘
```

**Section cards:** each is `<fieldset className="rounded-lg border border-border bg-card p-4 sm:p-6">` with `<legend className="text-sm font-semibold tracking-tight px-1">`. `id` on each for the rail anchors.

**Sticky action bar:** `sticky top-0 z-30 -mx-... backdrop-blur bg-background/80 border-b` (reuse the mobile-header material recipe) holding a right-aligned status pill + "Cancelar" (ghost) + "Guardar" (primary, `size="lg"`). On mobile it stays sticky at bottom instead (thumb reach): `fixed bottom-0 inset-x-0`.

**Section rail (desktop only, `hidden lg:block`):** sticky `<nav>` of anchor links; active section (scroll-spy via `IntersectionObserver`) gets `bg-muted font-medium`. On mobile the rail is hidden; a compact "jump to section" `select` can sit under the title (optional). Rail links are keyboard-focusable and scroll to the anchor.

### 2.2 Fields (AC-9, AC-10) — exact spec

**General**
- **Nombre** — `TextField`, `maxLength=300` (DB `1..300`), required. On blur, if slug untouched, auto-suggest slug.
- **Slug** — `TextField` + a small `[🔗]` toggle "auto/manual". Prefix adornment `postur.../producto/` (`text-muted-foreground`, like the `$` adornment). Pattern hint `text-xs`: "Minúsculas, sin espacios (se genera del nombre)." Server-validated unique + format (`^[a-z0-9]+(-[a-z0-9]+)*$`).
- **Descripción** — `TextareaField` (new), `maxLength=20000`, `rows=6`, plain text (Phase 1, no rich text). Char counter `text-xs text-muted-foreground tabular-nums` bottom-right when >90% of limit.
- **Estado** — `SelectField`: Borrador / Activo / Archivado.

**Precios** (all `MoneyField`, `inputmode="decimal"`, `$` adornment, strict `parseMoneyToCents`)
- **Precio** — required, ≥0.
- **Precio comparado** — optional (blank = null); if set, must be ≥ precio (soft warn, not block — some stores set lower).
- **Costo** — optional. Label suffix pill: `<span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[0.625rem] text-muted-foreground">no visible para clientes</span>`. Helper: "Uso interno para tus márgenes."

**Inventario**
- **SKU** — `TextField`, required, unique-validated. Mono-ish (`tabular-nums` not ideal for alpha; use `font-mono text-sm`).
- **Stock del producto** — `NumberUnitField` (integer, no unit), ≥0. Helper (edge 7): "Se usa cuando el producto **no** tiene variantes. Con variantes, el stock se administra por variante." When the product HAS variants, this field is shown **disabled** with the helper "Este producto usa stock por variante (ver sección Variantes)."

**Organización**
- **Marca** — `SelectField` (brands, "Sin marca" = null). Inline `[+ Nueva marca]` link → opens a small create dialog (reuses taxonomy create, §5) without leaving the form; on create, selects it.
- **Estilo** — `SelectField` (styles, "Sin estilo" = null). Same inline-create affordance.
- **Categorías** — `MultiSelectField` (new): a `select`-triggered checklist popover of the category tree (indented by depth), selected shown as removable chips below. M2M.
- **Etiquetas** — `TagInputField` (new): free-text chip input; type + Enter adds a chip; existing tags autocomplete; a new tag is created on save (slugified). Chips removable with `×` (`aria-label="Quitar {tag}"`).

**Dimensiones** (2-col grid on ≥640px) — `NumberUnitField` each, edited in **cm** → stored **mm** (×10), strict parser (reject junk/negative/overflow), unit suffix adornment "cm":
- Ancho, Profundidad, Alto, Altura del asiento. All optional, ≥0.

**Materiales** (2-col grid) — `TextField` each, `maxLength=300`, optional:
- Material del armazón, Material de tapicería, Acabado.

**Destacados** — two `SwitchField` (new, checkbox-based toggle reusing the `checkbox` primitive styled as a labeled switch row):
- "Producto destacado" (`is_featured`), "Más vendido" (`is_best_seller`).

**Flags** feed booleans; **Imágenes/Variantes/Preguntas** sections only render on **edit** (need a product id).

### 2.3 `NumberUnitField` (new primitive)
Structure mirrors `MoneyField` but adornment on the **right** (unit) and no `$`:
```
<div className="flex min-h-11 items-stretch rounded-md border … focus-within:… aria-invalid…">
  <input type="text" inputMode="decimal" className="w-full bg-transparent px-3 py-2 text-sm tabular-nums …" />
  <span aria-hidden className="flex items-center border-l border-border px-3 text-sm text-muted-foreground">cm</span>
</div>
```
Parser: `parseCmToMm` / `parseKgToG` in `units.ts` — same strict discipline as `parseMoneyToCents` (strip whitespace, `^\d+(\.\d{1,2})?$` for cm, `×10`→mm integer; kg `×1000`→g; reject thousand separators, 3+ decimals, negative, overflow). Error keys parallel the money ones: `dim-invalid` "Usa punto decimal, sin separadores de miles." / `dim-negative` / `dim-too-many-decimals` / `dim-overflow`.

### 2.4 States & the T10 form contract (AC-11/12/13)

| State | Visual | Behavior |
| --- | --- | --- |
| Loading | **None** — edit form is SSR-populated (data present at render, T10 pattern). New form renders instantly. | — |
| Pending (`useActionState`) | All inputs `disabled`; save button → "Guardando…"; whole form `aria-busy`. | Prevents double-submit. |
| Field error | Inline `FieldError` (`role="alert"`, `Alert02Icon` size 13, `.enter-fade`, destructive) under the field; input `aria-invalid`; **all** errors shown in one pass (collect-all parser). An **error summary Banner** (`role="alert"`) at the top of the form lists count + links to each bad field: "Corrige N campos." Focus moves to the first invalid field. | Form stays filled. |
| Duplicate slug/SKU (AC-12, edge 1) | Field-level error on that exact field: "Ya existe un producto con ese SKU." / "…con ese slug." | Catches PG `23505`, maps to field; no 500; no partial write. |
| Write failure | `Banner` tone="error": "No se pudo guardar. Intenta de nuevo." | Logs raw PG error server-side; returns `error` enum; never echoes. |
| Session expired (edge 8) | Redirect to `/admin/login`. | `requireSession()` first; DB untouched. |
| Success (edit) | `Banner` tone="info" `role="status"` keyed by `submissionId`: "Producto guardado."; form stays editable. | T10 keyed-replay pattern. |
| Success (create/duplicate) | Redirect to `/admin/products/[id]/edit` + success banner "Producto creado." / "Producto duplicado. Revisa y publícalo." | New id needed for images/variants. |

**Unsaved-changes guard (edge, principle 5):** track dirty state (any field changed since load). On "Cancelar" or route change with dirty state → `alert-dialog`: title "¿Descartar cambios?", body "Tienes cambios sin guardar. Si sales, se perderán.", actions **[Seguir editando]** (default focus) / **[Descartar]** (destructive). Also guard `beforeunload` for hard navigation. No autosave in Phase 1 (documented).

**Motion:** `FieldError`/`Banner` use `.enter-fade` (existing). The error-summary banner uses `.enter-fade`. Section rail active-state is a 120ms `bg` transition. **No form-level enter animation.** Sticky action-bar uses the existing `backdrop-blur` material (apple-design translucent chrome; scroll edge fades content under it).

**Slug auto-suggest interaction flow:**
1. User types Nombre. 2. On each Nombre change, if slug field is in "auto" mode (untouched), slug updates live (slugified, debounced 200ms — this is on-screen text morph, but subtle; no animation). 3. If user edits slug manually, mode flips to "manual" (the `🔗` toggle shows unlinked) and Nombre no longer drives it. 4. `🔗` toggle re-links → regenerates from current Nombre.

---

## SLICE 3 — Image Manager (multi-upload · drag-order · cover)

### 3.1 `ImageManager` (section in the edit form)

**Purpose:** upload, order, designate cover, delete product images.
**shadcn base:** `progress` (new), `alert-dialog` (new) + hand-rolled dropzone + drag list.

**Layout:**
```
┌─ Imágenes ───────────────────────────────────────────────────────────────┐
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │   ⬆  Arrastra imágenes aquí o  [Selecciona archivos]                  │ │  ← dropzone
│  │      JPG, PNG o WebP · máx 5 MB c/u                                   │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
│  Portada  (radio-group: una sola portada)                                  │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                              │
│  │⠿ [img] │ │⠿ [img] │ │⠿ [img] │ │⠿ ▓▓▓ 62%│  ← uploading (progress)      │
│  │◉ Portada│ │○ Portada│ │○ Portada│ │        │                             │
│  │ ↑ ↓  🗑 │ │ ↑ ↓  🗑 │ │ ↑ ↓  🗑 │ │  ✕     │                             │
│  └────────┘ └────────┘ └────────┘ └────────┘                              │
└────────────────────────────────────────────────────────────────────────────┘
```

**Card anatomy:** `size-28 sm:size-32` thumbnail (`next/image`, `object-cover rounded-md`); a drag handle `⠿` (`DragDropVerticalIcon`) top-left; a cover **radio** (`◉/○` + "Portada" label) — the set of cards is a `role="radiogroup" aria-label="Imagen de portada"`; per-card **move-up / move-down** `icon-xs` buttons (keyboard drag alternative); a **delete** `icon-xs` destructive ghost `🗑`.

**Upload interaction (AC-14):**
1. Drop files on the dropzone OR click "Selecciona archivos" (`<input type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only">`).
2. Client validates each: type ∈ {jpeg,png,webp}, size ≤ `IMAGE_MAX_BYTES` (5 MB). Rejects show an inline error chip on a placeholder card: "Formato no permitido (usa JPG/PNG/WebP)." / "La imagen supera 5 MB." (`role="alert"`).
3. Valid files upload one-by-one via a server action (`FormData`); each shows a `progress` bar + `%` over a dimmed placeholder card. Server **re-validates** type/size (never trusts client) and uploads to `product-images` bucket, inserts the `product_images` row, returns the public URL + row.
4. On success the placeholder becomes the real thumbnail (crossfade, `.enter-fade`). Submit/save is disabled while any upload is `pending`.

**Dropzone states:**
| State | Visual |
| --- | --- |
| Idle | Dashed border `border-2 border-dashed border-border rounded-lg`, `UploadCircle02Icon` + copy, `bg-muted/20`. |
| Drag-over | `border-ring bg-muted/50` (120ms `bg`/`border` transition); copy "Suelta para subir". |
| Uploading | Dropzone stays usable; the uploading *cards* carry the progress. |
| Storage error (AC/edge 4) | `Banner` tone="error": "No se pudo subir la imagen. Intenta de nuevo." The failed placeholder card shows a retry `↻` button. |
| No images | Only the dropzone (no card grid); dropzone doubles as the empty state. |

### 3.2 Drag reorder — precise interaction spec (AC-15)

**Decision: native Pointer Events + a mandatory keyboard/button alternative. No `@dnd-kit`.** Justification:
- The list is small (typically 3–8 images), single-axis, single-container (no cross-list drag). Native Pointer Events cover this cleanly.
- Zero new runtime deps (ticket constraint). `@dnd-kit` would add ~30KB for a reorder we can do in a focused hook.
- The a11y bar is met by the **move-up/move-down buttons** (the real keyboard path), which are simpler and more discoverable than `@dnd-kit`'s keyboard sensor for a non-technical owner.

**Pointer drag (apple-design direct-manipulation):**
- **Trigger:** `pointerdown` on the drag handle `⠿` (not the whole card — avoids fighting the radio/buttons). `setPointerCapture(pointerId)` so tracking survives leaving the card. `touch-action: none` on the handle.
- **Threshold/hysteresis:** commit to dragging after ~6px movement (avoid stealing taps on the handle).
- **During drag:** the grabbed card lifts — `scale(1.03)`, `shadow-lg`, `opacity 0.95`, `z-10`, and follows the pointer **1:1** via `transform: translate(x,y)` (respect the grab offset — don't snap to center). Other cards **shift to make room** using a spring-ish CSS transition on `transform` (see `.reorder-item`, 200ms `--ease-out`) as the insertion index changes. `will-change: transform` on the dragged card only.
- **Insertion indicator:** a `2px` `bg-ring` vertical bar between cards at the drop index (clear target).
- **Release:** the card animates from its lifted transform to the resting slot (200ms `--ease-out`) — a **layout animation**, interruptible (CSS transition, retargetable if the user grabs again). New `sort_order` persists via server action; optimistic UI (`useOptimistic`) updates order immediately, reconciled on response; on failure, revert + error banner.
- **Multi-touch protection:** ignore additional pointers once a drag is active (`if (isDragging) return`).
- **Performance:** animate `transform`/`opacity` only (never layout props).

**Keyboard / button path (the accessible primary path):**
- Each card has **↑ / ↓** `icon-xs` buttons ("Subir imagen" / "Bajar imagen"), disabled at the ends (`aria-disabled`).
- Activating moves the image one slot; focus stays on the moved card's button; an `aria-live="polite"` region announces "Imagen movida a la posición 2 de 5."
- The drag handle is also focusable with `role="button" aria-roledescription="Reordenable"` and supports Space/Arrow (pick-up / move / drop) as an enhancement, but the ↑/↓ buttons are the guaranteed path.

**`.reorder-item` motion (new class, §Appendix):** `transition: transform 200ms var(--ease-out)`; RM → `transition: none` (items snap; still functional). The dragged card's lift is applied inline (JS-driven transform), not via the class.

### 3.3 Cover designation (AC-15)
Radio-group semantics: exactly one `is_primary`. Selecting a new cover clears the old (server enforces at-most-one; UI reflects optimistically). The cover card gets a subtle `ring-2 ring-ring` + a small `StarIcon` badge corner. Copy under the group: "Una sola portada. Se muestra primero en la tienda."

### 3.4 Delete (AC-16)
`🗑` → `alert-dialog`: title "¿Eliminar imagen?", body "Se quitará de este producto. No se puede deshacer.", actions [Cancelar] (default focus) / [Eliminar] (destructive). On confirm: removes `product_images` row + storage object; a failed storage delete still removes the row and logs (never blocks). If the deleted image was the cover, the next image auto-promotes to cover (UI reflects). Optimistic removal (card fades out via `.enter-fade` reverse / opacity) reconciled on response.

**Cache (AC-17):** any image change busts `catalog` + `product:<slug>` via the shared `cache-tags.ts` helper. `next/image` renders the Supabase public URL (host already allow-listed).

**Responsive:** cards wrap in a `flex flex-wrap gap-3` (desktop) → single column stack on mobile with **large** drag handles + ↑/↓ buttons (≥44px, thumb-friendly). On mobile, drag is still available but the buttons are the emphasized path.

---

## SLICE 4 — Variant Management

### 4.1 `VariantEditor` (section in the edit form)

**Purpose:** per-product color variants (SKU, color, price override, stock, order).
**shadcn base:** `table` + inline-edit inputs; `alert-dialog` for delete.

**Decision: inline-editable table rows, NOT a per-variant dialog** (justified):
- Variants are few (a handful of colors) and their fields are short (color name, hex, SKU, price, stock). An inline table lets the owner edit several at once and see them side-by-side — faster for the daily operator than opening a dialog per variant.
- A dialog would hide sibling variants and add a click per edit. Inline matches the "information density" principle.
- New variants are added as a fresh editable row at the bottom (`[+ Agregar variante]`), removed with a per-row delete.

**Layout:**
```
┌─ Variantes ───────────────────────────────────────────────────────────────┐
│  Cuando hay variantes, el stock se administra aquí (no en el producto).     │
│  ┌────────┬──────────────┬──────────┬────────────┬───────┬──────┬────┐      │
│  │ Orden  │ Color        │ Hex      │ SKU        │Precio*│ Stock│    │      │
│  │  ⠿ 1   │[Negro      ] │[■ #111111]│[SKU-ERG-N] │[$____]│[ 12 ]│ 🗑 │      │
│  │  ⠿ 2   │[Gris       ] │[■ #9AA0A6]│[SKU-ERG-G] │[$____]│[  0 ]│ 🗑 │      │
│  └────────┴──────────────┴──────────┴────────────┴───────┴──────┴────┘      │
│  [+ Agregar variante]                                                        │
│  * Precio en blanco = usa el precio base del producto.                       │
└────────────────────────────────────────────────────────────────────────────┘
```

**Row fields (AC-18):**
- **Orden** — drag handle `⠿` + ↑/↓ (same reorder pattern as images, §3.2) → `sort_order`.
- **Color** — `TextField` inline, `maxLength=120`, required.
- **Hex** — text input `pattern=^#[0-9A-Fa-f]{6}$` with a **swatch preview** `<span className="size-4 rounded-sm border" style={{background:hex}}>` left-adornment. Invalid hex → field error "Usa un color hex de 6 dígitos, p. ej. #111111." **Text alternative:** the swatch has `aria-hidden`; the hex value in the input is the accessible label; add `aria-describedby` reading "Color {hex}".
- **SKU** — inline `TextField`, `font-mono`, required, unique-validated.
- **Precio** — inline `MoneyField` (compact), blank = inherit (placeholder shows the base price greyed: "hereda $4,999.00").
- **Stock** — inline integer, ≥0.

**Variant images (AC-19):** in the Image Manager (§3), each image card gains a small **"Variante"** `select` ("Producto (todas)" = null, or a specific variant by color name). This associates `product_images.variant_id`. When a variant is deleted, its images are handled per FK cascade — but the owner is **warned first** (delete dialog body: "Se eliminarán también N imágenes asociadas a esta variante." when count>0).

**States (AC-20):**
| State | Visual | Behavior |
| --- | --- | --- |
| Empty | No rows + "[+ Agregar variante]" + helper "Sin variantes, se usa el stock y precio del producto." | Adding the first variant flips product-stock field to disabled (§2.2). |
| Editing | Inline inputs; dirty rows contribute to the form's dirty state. | Saved with the product form (one submit) OR per-row save — **decision: saved with the product form** for coherence (one save button). |
| Field error | Inline under the specific cell (`FieldError`), row `aria-invalid` cell. | Collect-all; focus first invalid. |
| Duplicate SKU (edge 1) | Cell error "Ya existe una variante/producto con ese SKU." | Catches `23505`; no 500. |
| Delete | `alert-dialog` naming image count if any (AC-19). | Cascade; optimistic row removal. |
| Removing last variant | Confirm; product-stock field re-enables. | — |

**Responsive:** on mobile the variant table becomes **stacked cards** (one card per variant, fields in a 1-col stack, large handles), same rationale as the product list.

**Motion:** row add/remove use `.enter-fade` (subtle); reorder uses `.reorder-item`. No other motion.

**a11y:** table `<caption className="sr-only">Variantes del producto</caption>`; each inline input has an `aria-label` (visible column header is the label via `headers`/`scope`); swatch text alternative as above; ↑/↓ reorder announced via `aria-live`.

---

## SLICE 5 — Taxonomy Management (brands · categories · styles · tags)

### 5.1 `TaxonomyPage` (`/admin/taxonomy`)

**Purpose:** CRUD the facets products reference.
**shadcn base:** `tabs`, `table`, `dialog`, `alert-dialog`, `select` + `AdminPage`.

**This is the one place tabs are correct** — four entity types within a single destination:
```
┌─ AdminPage title="Taxonomía" ─────────────────────────────────────────────┐
│  [ Marcas ] [ Categorías ] [ Estilos ] [ Etiquetas ]      [+ Nueva marca]   │  ← tabs + context CTA
├────────────────────────────────────────────────────────────────────────────┤
│  (tab panel — a table for brands/styles/tags; a tree for categories)         │
└────────────────────────────────────────────────────────────────────────────┘
```

Tabs use the shadcn `tabs`; active tab reflected in `?tab=` (deep-link + back-safe). The CTA label changes per tab ("Nueva marca" / "Nueva categoría" / …). Tab motion: shadcn default (opacity crossfade, keep short); reduced-motion → instant.

### 5.2 Brands / Styles / Tags tables
Simple `table`: name · slug · (brand: logo thumbnail + description snippet + active toggle) · (style: description + active) · (tag: just name/slug) · row actions [Editar] [Eliminar].

**Create/edit** open a `dialog` with the entity fields:
- **Brand:** slug (auto from name, unique), name (`1..200`), description (`≤5000`, textarea), logo_url (`TextField` URL), is_active (`SwitchField`).
- **Style:** slug, name, description, is_active.
- **Tag:** slug, name (`1..200`). (Tags have no description/active per schema.)

**Active toggle (AC-24):** flipping `is_active=false` immediately hides its products/facet on the storefront after cache bust (`catalog` + entity slug tag). Toggle is an inline `SwitchField` in the row with an `aria-live` confirm; optimistic.

**States:** empty ("Aún no hay marcas." + CTA), loading (table skeleton), field errors inline in the dialog, duplicate slug → field error "Ya existe una marca con ese slug." (AC-21), delete confirm via `alert-dialog`.

**Delete semantics (AC-23):**
- **Brand/Style delete** → succeeds (`on delete set null`); confirm body: "Los productos con esta marca quedarán sin marca. Continuar?" Products still render (storefront tolerates null brand).
- **Tag delete** → detaches from products (`on delete cascade` on the M2M); confirm body: "Se quitará de N productos."

### 5.3 `CategoryTree` (nestable — the hard one, AC-22/23, edge 2/3)

**Purpose:** view/create/rename/delete/**re-parent** nested categories; prevent cycles; block deleting a parent with children.

**Tree UI:**
```
▾ Sillas de oficina                      [Editar] [Eliminar]  ⠿
   ▾ Ergonómicas                         [Editar] [Eliminar]  ⠿
        Malla                            [Editar] [Eliminar]  ⠿
        Piel                             [Editar] [Eliminar]  ⠿
   ▸ Ejecutivas                          [Editar] [Eliminar]  ⠿   ← collapsed
  Accesorios                             [Editar] [Eliminar]  ⠿
[+ Nueva categoría]
```

**Component:** recursive `CategoryTreeNode`. Each node row: expand/collapse chevron (`▾/▸`, `ArrowDown01Icon`/`ArrowRight01Icon`) when it has children; name (indented by depth `pl-{depth*4}` via inline `paddingLeft`); row actions [Editar][Eliminar]; a drag handle `⠿` for re-parenting.

**Expand/collapse:** `Accordion / Collapse` motion — height animate is a layout prop (avoid), so instead use a `grid-template-rows: 0fr → 1fr` trick OR simply toggle `hidden` for children with a light `.enter-fade` on the revealed subtree (justified: expanding a tree node is occasional, and correctness > flourish; a fade is enough). Chevron rotates 90° (`transition: transform 150ms ease`). Expansion state is client-only (not persisted). RM → instant toggle.

**Re-parenting (AC-22, edge 2) — two paths:**
1. **Edit dialog "Categoría padre" select** — a `SelectField` listing all categories **except** the node itself and its descendants (client-computed to prevent the obvious cycle) + "Sin padre (raíz)". This is the primary, keyboard-accessible path.
2. **Drag a node onto another** (enhancement) — drop-as-child. Same native Pointer Events pattern; the drop target highlights `bg-muted ring-1 ring-ring`; dropping onto a descendant is **rejected** with a shake (`Shake / Wiggle` — 3 small `translateX` oscillations, 200ms, RM → no shake, just a toast). The drag path is an enhancement; the select in the edit dialog is the guaranteed path.

**Cycle guard (edge 2):** UI hides invalid parents in the select and rejects invalid drops. If the DB `categories_no_cycle` trigger fires anyway (race), the action catches `check_violation` → field error "Una categoría no puede ser su propio ancestro." — never a 500.

**Delete (AC-23, edge 3):**
- Deleting a **leaf** → `alert-dialog` "¿Eliminar categoría? Se quitará de N productos." (M2M cascade).
- Deleting a category **with children** → the DB is `on delete restrict`. UI *tries* and catches the FK error → `Banner`/dialog message: "Reasigna o elimina las subcategorías primero." (Do not orphan.) Better: pre-check children client-side and, if any, the Eliminar button opens an explanatory dialog immediately (no round-trip) — but the caught error remains the safety net.

**States:** empty ("Aún no hay categorías." + CTA), loading (indented skeleton rows), create/edit dialog with parent select, cycle/restrict errors as above.

**Fields (create/edit dialog):** slug (auto/unique/format), name (`1..200`), description (`≤5000`), parent (select), is_active (switch), sort_order (number, optional — controls sibling order).

**a11y (tree):** `role="tree"`, each node `role="treeitem"` with `aria-expanded` (when it has children), `aria-level={depth}`, `aria-setsize`/`aria-posinset`. Arrow keys navigate (↑/↓ move, →/← expand/collapse), Enter edits. The re-parent select in the dialog is the accessible re-parent path (drag is an enhancement). Drop rejection announced via `aria-live` ("No se puede mover una categoría dentro de sí misma.").

**Responsive:** tree indentation caps on mobile (`min` of depth×3 and a max); row actions collapse into a `⋮` menu on <640px to fit width; drag handles enlarge.

---

## SLICE 6 — Inventory Adjustment · Duplicate · Q&A

### 6.1 `InventoryAdjustDialog` (AC-25/26, edge 6/7)

**Purpose:** manual stock change with a required reason + audit ledger.
**shadcn base:** `dialog` + form primitives.

**Trigger:** from the product list row `⋮` menu ("Ajustar inventario") or an "Ajustar" button in the edit form's Inventario section. If the product has variants, the dialog first asks **which target** (a `select` of "Producto" — disabled/hidden if variants exist — or each variant by color); edge 7: it must be explicit which stock is edited.

**Layout:**
```
┌─ Ajustar inventario ──────────────────────────────┐
│  Silla Ergo Pro — Variante: Negro                  │  ← target, explicit
│                                                    │
│  Stock actual:  12                                 │
│                                                    │
│  ( ) Ajuste (±)      (•) Nuevo total               │  ← mode radio
│  Cantidad   [   3  ]                               │
│  Motivo *   [ Recuento físico de almacén        ] │  ← required
│                                                    │
│  Resultado:  12 → 3   (−9)                         │  ← live preview
│                                       [Cancelar][Guardar] │
└────────────────────────────────────────────────────┘
```

**Fields:**
- **Modo** — radio: "Ajuste (±)" (delta, e.g. `-9` or `+5`) or "Nuevo total" (absolute).
- **Cantidad** — integer input (`inputMode` numeric with sign for delta mode).
- **Motivo** — required `TextField`, `maxLength` = adjustment-reason bound (documented constant, e.g. 500; DB `1..500`). Helper: "Queda registrado en el historial."
- **Resultado (live preview)** — computes `currentStock + delta` or `absolute`; shows `actual → nuevo (Δ)` with `tabular-nums`. If result < 0, preview turns destructive and Guardar disables with inline error "El inventario no puede quedar negativo." (AC-26; DB CHECK is backstop).

**Submit:** calls `record_inventory_adjustment` RPC (atomic: updates stock + inserts ledger row). Success → dialog closes, an `aria-live` toast/banner "Inventario actualizado.", list/edit stock refreshes. Busts `catalog` + `product:<slug>`.

**States:** pending (Guardar → "Guardando…", inputs disabled), reason-empty error inline "Ingresa un motivo.", negative-result blocked, RPC failure → banner "No se pudo ajustar. Intenta de nuevo."

### 6.2 `InventoryLedger` (history view, AC-25)
In the edit form's Inventario section, a collapsible "Historial de ajustes" table (most recent first): date · target (Producto / Variante color) · delta (`+/-`, color-neutral, `tabular-nums`) · resulting stock · reason. Read-only. Empty: "Sin ajustes registrados." Paginated if long (reuse pagination math). Loading skeleton rows.

### 6.3 Duplicate (AC-27)
Triggered from list `⋮` ("Duplicar") or an edit-form "Duplicar" action. No dialog needed (non-destructive): server action deep-copies (new unique slug `-copia`, variants with new SKUs, image rows referencing same URLs, M2M links, `status='draft'`), then **redirects to the copy's edit page** with a success banner: "Producto duplicado. Revisa y publícalo." (`status` pill shows "Borrador"). If slug/SKU suffixing collides repeatedly, it increments (`-copia-2`) — invisible to the user.

### 6.4 `QAInbox` (`/admin/qa`, AC-28, edge 9)

**Purpose:** answer/publish/unpublish/delete customer questions.
**shadcn base:** `textarea`, `alert-dialog` + `AdminPage`.

**Layout (unanswered-first):**
```
┌─ AdminPage title="Preguntas" desc="N sin responder" ──────────────────────┐
│  [ Sin responder (3) ]  [ Respondidas ]                                     │  ← simple segmented (tabs)
├────────────────────────────────────────────────────────────────────────────┤
│  ┌─ Silla Ergo Pro ─────────────────────────────────────── hace 2 días ─┐  │
│  │  María G.:  ¿La altura del asiento es ajustable?                       │  │
│  │  ┌──────────────────────────────────────────────────────────────────┐ │  │
│  │  │ Escribe tu respuesta…                                            │ │  │
│  │  └──────────────────────────────────────────────────────────────────┘ │  │
│  │  0 / 5000                              [Eliminar]   [Publicar respuesta]│  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│  … more unanswered cards …                                                    │
└────────────────────────────────────────────────────────────────────────────┘
```

**Unanswered card:** product name (links to its edit page) + asked date · author + question (read-only) · answer `textarea` (`maxLength=5000`, char counter, DB `1..5000`) · [Eliminar] (spam, destructive) · [Publicar respuesta] (primary — sets `answer`, `answered_at=now()`, `is_published=true` in one write; busts `product:<slug>`).

**Answered card:** shows question + answer (read-only) + published badge · actions [Editar respuesta] (re-opens the textarea) · [Ocultar] (unpublish — sets `is_published=false`; busts `product:<slug>`; the question drops off the PDP after revalidation, edge 9) · [Eliminar].

**States:**
| State | Visual |
| --- | --- |
| Loading | Card skeletons. |
| Empty (unanswered) | Centered `Message01Icon` + "No hay preguntas por responder." |
| Empty (answered) | "Aún no has respondido preguntas." |
| Answer too long (AC-28) | Inline "La respuesta no puede superar 5000 caracteres."; Publicar disabled. |
| Empty answer | "Escribe una respuesta antes de publicar." |
| Pending | Publicar → "Publicando…"; textarea disabled. |
| Success | Card animates from "sin responder" list to "respondidas" (moves tab); success banner "Respuesta publicada." |
| Delete (spam) | `alert-dialog`: "¿Eliminar pregunta? No se puede deshacer." |
| Write failure | Banner "No se pudo publicar. Intenta de nuevo." |

**Motion:** publishing moves a card between segments — a subtle `.enter-fade` on arrival + fade-out on the source (occasional action, warranted). RM → instant.

**Segments:** the two-segment switch reuses `tabs` (or a small segmented control). `?filter=unanswered|answered`.

**a11y:** each answer textarea has a `<label className="sr-only">Respuesta a la pregunta de {author}</label>`; char counter `aria-live="polite"` near the limit; publish/unpublish state announced.

---

## SLICE 7 — CSV Import / Export

### 7.1 `CsvExportButton` (AC-29)
In the product-list action row. A `button` "Exportar CSV" (`Download01Icon`). States:
| State | Visual | Behavior |
| --- | --- | --- |
| Idle | "Exportar CSV" | Click → triggers download. |
| Generating | "Generando…" spinner (`icon` size, `animate-spin`); disabled | Fast-spinning spinner (perceived performance). |
| Done | Reverts to idle | Browser download of `productos-YYYY-MM-DD.csv` (`text/csv`, `Content-Disposition`). |
| Error | Banner "No se pudo exportar. Intenta de nuevo." | Logs cause. |

Export = a **guarded route handler** `/admin/(app)/products/export/route.ts` that calls the session check at entry (AC-34), or a server action returning a `Response`. Columns per AC-29 (slug, sku, name, brand slug, category slugs, style slug, prices in pesos, stock, status, dims cm, weight kg, materials, tags), RFC-4180 quoted, formula-injection prefix-escape on cells starting `= + - @` (security note).

### 7.2 `CsvImportDialog` — a stepper (AC-30/31/32, edge 5)

**Purpose:** safely bulk-load the real catalog with a mandatory dry-run.
**shadcn base:** `dialog` (large), `table`, `progress`, `button`.

**Stepper header (custom, 4 steps):**
```
①Seleccionar → ②Vista previa → ③Confirmar → ④Resultado
```
A horizontal step indicator: completed steps `text-foreground` + check, current `font-medium` + `bg-muted` pill, upcoming `text-muted-foreground`. `aria-current="step"` on the active one. No animated transitions between steps beyond a `.enter-fade` on the new panel (occasional; warranted). This is **not** `tabs` — steps are sequential and gated.

**Step 1 — Seleccionar archivo:**
```
┌─ Importar productos (CSV) ─────────────────────────────────┐
│  ①Seleccionar ─ ②Vista previa ─ ③Confirmar ─ ④Resultado     │
│                                                            │
│   ⬆  Arrastra un archivo .csv o [Selecciona archivo]       │
│      Máx N filas · UTF-8 · encabezados requeridos          │
│   [Descargar plantilla CSV]                                 │
│                                              [Cancelar]     │
└────────────────────────────────────────────────────────────┘
```
Dropzone (single `.csv`). "Descargar plantilla" gives a header-only CSV (matches export columns) so the owner knows the shape. On select → auto-advance to parsing.

**Step 2 — Vista previa (dry-run, ZERO writes, AC-30):**
- While parsing: "Analizando archivo…" with a spinner.
- Then a **summary bar** (`tabular-nums`): "Crear: N · Actualizar: M · Con errores: K" (chips: create `bg-muted`, update `bg-muted`, errors `bg-destructive/10 text-destructive`).
- A `table` of rows: `#` · SKU · Nombre · Acción (Crear / Actualizar / **Error**) · Detalle. Error rows highlighted `bg-destructive/5`, Detalle names the column + reason ("Fila 12 · precio: usa punto decimal sin separadores de miles", "Fila 5 · marca 'xyz' no existe", "SKU duplicado en el archivo", "faltan columnas"). The list is scrollable (`max-h-[50vh] overflow-y-auto`), `role="region" aria-label="Vista previa de importación"`.
- Actions: [Atrás] / [Continuar] (disabled if 0 valid rows). Note under the button: "No se escribirá nada hasta que confirmes."

**Step 3 — Confirmar:**
- Recap: "Se crearán N y se actualizarán M productos. K filas con errores se omitirán." + [Atrás] / [Importar N+M productos] (primary).
- On click → Step 4.

**Step 4 — Resultado (AC-31):**
- `progress` bar during the batched write ("Importando… 40 / 120").
- Result **summary card**: "Creados: N · Actualizados: M · Con errores: K" + (if K>0) a collapsible list of the rows that still failed at write time. [Cerrar] (refreshes the product list). Caches busted once at the end.

**Rejection (Step 1/2, AC-32, edge 5):** malformed file (missing required header, non-UTF-8, empty, > `CSV_MAX_ROWS`) → the stepper stays on Step 1/2 with a `Banner` tone="error" naming the exact problem ("Falta la columna 'sku'." / "El archivo excede N filas." / "El archivo está vacío." / "El archivo no es UTF-8 válido.") and **zero writes**.

**Error taxonomy for rows (surfaced in the Detalle column):**
| Row error | Message (es-MX) |
| --- | --- |
| Missing required cell | "Falta {columna}." |
| Bad money (thousand sep / 3+ dec / negative) | "{columna}: usa punto decimal, sin separadores de miles." |
| Bad dimension/weight | "{columna}: número inválido." |
| Unknown brand/category/style slug | "{tipo} '{slug}' no existe." (never auto-created) |
| Duplicate SKU within file | "SKU repetido en el archivo (fila {n})." |
| Bad status value | "estado inválido (usa borrador/activo/archivado)." |
| Bad slug format | "slug inválido (minúsculas, sin espacios)." |
| Too few/many columns | "número de columnas incorrecto." |

Import is resilient: one bad row never aborts the batch; bad rows reported, good rows commit (AC-31).

**Motion:** step panels `.enter-fade`; `progress` bar `transition: transform` (scaleX) linear (constant motion → linear per emil). Spinner fast (perceived performance). RM → panels instant, progress bar still updates (opacity/width jumps are fine).

**a11y:** stepper `aria-current="step"`; the preview table has a caption; progress `role="progressbar"` `aria-valuenow`; the mandatory-confirm note is `role="note"`; focus moves to each new step's heading on advance.

---

## Interaction Flows (cross-slice)

### Flow: Create a product
1. List → [+ Nuevo producto] → `/admin/products/new`.
2. Fill General/Precios/Inventario/Organización (Dims/Materiales optional). No images/variants yet (need an id).
3. [Guardar] → pending → server `requireSession()` → parse (collect-all) → insert + M2M → bust tags.
4. Field errors → inline + summary + focus-first-invalid, form stays filled. Duplicate slug/SKU → field error.
5. Success → redirect to `/[id]/edit` + banner "Producto creado." Now Imágenes/Variantes/Preguntas sections appear.

### Flow: Upload + reorder + set cover
1. Edit page → Imágenes → drop 3 files → each validates → uploads with progress → thumbnails appear.
2. Drag a card by its handle to reorder (or ↑/↓) → optimistic order → persisted.
3. Click a card's "Portada" radio → becomes cover (old cleared) → busts `catalog`+`product:slug`.
4. Delete an image → confirm → row+object removed; cover auto-promotes if needed.

### Flow: CSV import (the guarded one)
1. List → [Importar CSV] → dialog Step 1 → select file.
2. Parse → Step 2 dry-run preview (create/update/error counts + per-row table). **No writes.**
3. [Continuar] → Step 3 recap → [Importar] → Step 4 progress → result summary. Cache busted once.
4. Malformed file → rejected at Step 1/2 with a named error, zero writes.

---

## Accessibility Checklist (feature-wide)
- [ ] All interactive elements have visible `focus-visible:ring-2 ring-ring/30` (inherited from T10 classes).
- [ ] All icon-only buttons have `aria-label` (row `⋮`, delete, move-up/down, drag handle, close).
- [ ] Status/stock never rely on color alone — badge text + dot shape (§1.3); ledger deltas signed text not color.
- [ ] Drag reorder has a guaranteed keyboard path (↑/↓ buttons) + `aria-live` position announcements (images §3.2, variants §4, tree §5.3).
- [ ] Category tree uses `role="tree"`/`treeitem`/`aria-expanded`/`aria-level`; arrow-key nav; re-parent via the dialog select (drag is enhancement only).
- [ ] Color-hex field has a swatch (`aria-hidden`) + a text alternative reading the hex value.
- [ ] Cover selector has `role="radiogroup"`; exactly one selectable.
- [ ] Every input has a `<label htmlFor>` (visible or `sr-only`); tables have `<caption>` + `scope`/`headers`.
- [ ] Dynamic content announced: upload progress, reorder position, adjustment result, import progress, publish/unpublish (`aria-live`).
- [ ] Dialogs (`dialog`/`alert-dialog`) trap focus, restore on close, `Esc` closes, default focus on the safe action (Cancel) for destructive confirms.
- [ ] Unsaved-changes guard + `beforeunload` prevent silent data loss (edge 8).
- [ ] Tab order is logical: title → action bar → sections top-to-bottom → save.
- [ ] Reduced-motion: all new motion (`.dialog-content-motion`, `.reorder-item`, tree expand, step panels, card moves) degrades to opacity/instant per the RM rules.

---

## Motion Appendix (exact specs — animation-vocabulary terms)

Baseline (always): enters use `--ease-out`; animate `transform`/`opacity` only; interruptible (CSS transitions, not keyframes, for anything grabbable); `prefers-reduced-motion` degrades to opacity/instant; no motion on keyboard-repeated actions.

| # | Surface | Effect (term) | Trigger | Property | Easing | Duration | Reduced-motion |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M1 | Banners / field errors / error summary | **Fade in** + slight slide (`.enter-fade`, existing) | mount | opacity + translateY(8px→0) | `--ease-out` | 200ms | opacity only |
| M2 | Dialog / alert-dialog content (**new** `.dialog-content-motion`) | **Scale in** (Pop in, no bounce) | open | opacity 0→1, scale .96→1 (origin center — modals stay centered) | `--ease-out` | enter 180ms / exit 140ms | opacity only, no scale |
| M3 | Dialog scrim (**reuse** `.drawer-scrim` recipe / new scrim) | **Fade in** | open | opacity | `--ease-out` | 180/140ms | opacity (same) |
| M4 | Image/variant reorder shift (**new** `.reorder-item`) | **Layout animation** (items shift to make room) | drop index change | transform (translate) | `--ease-out` | 200ms | none (snap) |
| M5 | Dragged card lift | **Drag** (direct manipulation, 1:1) | pointerdown+move | transform (JS inline) + shadow/opacity | linear (1:1 to pointer) | n/a (tracks pointer) | drag still works; no decorative lift |
| M6 | Category tree chevron | **Rotate** | expand/collapse | transform: rotate(90deg) | `ease` | 150ms | instant |
| M7 | Category tree subtree reveal | **Accordion / Collapse** (fade, not height) | expand | opacity via `.enter-fade` | `--ease-out` | 200ms | instant |
| M8 | Invalid re-parent drop | **Shake / Wiggle** | rejected drop | transform: translateX oscillation | `ease-in-out` | 200ms | no shake → error toast |
| M9 | CSV stepper panel | **Fade in** | step advance | opacity via `.enter-fade` | `--ease-out` | 200ms | instant |
| M10 | Progress bars (upload/import) | constant fill | during op | transform: scaleX | `linear` | tracks progress | same (functional) |
| M11 | Export/import spinner | **Loop** (fast — perceived performance) | generating | rotate | `linear` | ~700ms/turn | same |
| M12 | Dropzone drag-over | **Hover effect** (bg/border) | dragenter | background/border-color | `ease` | 120ms | same |
| M13 | Q&A card segment move | **Fade in/out** | publish/unpublish | opacity via `.enter-fade` | `--ease-out` | 200ms | instant |
| M14 | Filter sheet (mobile) | **Slide in** (reuse `.drawer-panel`) | open | transform translateX | `--ease-drawer` | 300/200ms | opacity |
| M15 | Row hover (list/table) | **Hover effect** | hover | background-color | `ease` | 120ms (desktop-gated) | same |

**Two new CSS classes only** (`.dialog-content-motion`, `.reorder-item`) — everything else reuses existing globals.css classes. Both defined with a `@media (prefers-reduced-motion: reduce)` block mirroring the existing pattern:
```css
.dialog-content-motion {
  opacity: 1; transform: scale(1);
  transition: opacity 180ms var(--ease-out), transform 180ms var(--ease-out);
}
.dialog-content-motion[data-state="closed"] { opacity: 0; transform: scale(0.96); transition-duration: 140ms; }
.dialog-content-motion[data-state="open"] { @starting-style { opacity: 0; transform: scale(0.96); } }
@media (prefers-reduced-motion: reduce) {
  .dialog-content-motion, .dialog-content-motion[data-state="open"], .dialog-content-motion[data-state="closed"] {
    transform: none; transition: opacity 140ms ease;
  }
  .dialog-content-motion[data-state="open"] { @starting-style { transform: none; opacity: 0; } }
}
.reorder-item { transition: transform 200ms var(--ease-out); }
@media (prefers-reduced-motion: reduce) { .reorder-item { transition: none; } }
```

---

## Icon Appendix (`@hugeicons/core-free-icons`)
| Use | Icon | Size |
| --- | --- | --- |
| Nav: Productos / Taxonomía / Preguntas | `Package01Icon` / `FolderLibraryIcon` / `Message01Icon` | 16 |
| Nuevo / add | `PlusSignIcon` / `Add01Icon` | 16 |
| Row actions menu | `MoreVerticalIcon` | 16 |
| Edit / Duplicate / Delete | `PencilEdit02Icon` / `Copy01Icon` / `Delete02Icon` | 16 |
| Adjust inventory | `PackageProcessIcon` / `ArrowDataTransferVerticalIcon` | 16 |
| Upload / dropzone | `UploadCircle02Icon` | 20 |
| Drag handle | `DragDropVerticalIcon` | 16 |
| Move up / down | `ArrowUp01Icon` / `ArrowDown01Icon` | 13 |
| Cover / featured | `StarIcon` | 13 |
| Tree expand/collapse | `ArrowRight01Icon` / `ArrowDown01Icon` | 16 |
| Search | `Search01Icon` | 16 |
| Filter | `FilterIcon` | 16 |
| Export / import | `Download01Icon` / `Upload01Icon` | 16 |
| Field error / warning | `Alert02Icon` | 13 |
| Success | `CheckmarkCircle02Icon` | 16 |
| Info | `InformationCircleIcon` | 16 |
| Empty (no image) | `Image01Icon` | 20 (thumb placeholder) |

All `strokeWidth={2}`, `aria-hidden` unless the icon is the sole content of a labeled control.
