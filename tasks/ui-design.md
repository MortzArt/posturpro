# UI Design: T10 — Admin foundation (login · shell · dashboard · Store Settings)

> Stage 3 artifact — **overwrites the T8 checkout spec.** Single-locale **es-MX**.
> Desktop-first, must not break at 375px.
> Taste authority: `.claude/skills/emil-design-eng` + `.claude/skills/apple-design`.
> Motion terms from `animation-vocabulary`.

---

## Design Principles for This Feature

1. **Operator tool, not a marketing surface.** Calm, restrained, information-dense — this is where the Owner does work, repeatedly. Follow the storefront's design language but lean **slightly denser and more utilitarian**: admin page titles are `text-lg`/`text-xl` (not the storefront's `text-2xl md:text-3xl` hero titles), no hero imagery, no illustration, no decorative motion.
2. **Reuse the storefront design language verbatim.** Same tokens (`bg-background`, `text-foreground`, `border-border`, `bg-muted/50`, `text-destructive`, `bg-card`), same shadcn primitives, same `@hugeicons/core-free-icons` set, same form patterns. `src/components/product/qa-form.tsx` and `src/components/checkout/checkout-flow-client.tsx` are the canonical references — do not invent new form styles. The admin reads as the same product family, authenticated.
3. **Restraint in motion (Emil "frequency of use").** Login + settings-save are occasional → a gentle `enter-fade`/crossfade is warranted. Nav clicks and logout are near-daily → color/opacity only, no movement. Nothing animates from `scale(0)`. Everything respects `prefers-reduced-motion`.
4. **The trust boundary must *feel* trustworthy (Apple "Craft").** Instant press feedback, no layout shift on error, generic-but-clear auth copy, no jargon, no leaked internals. Every error recovery is "correct and resubmit."
5. **Scale to T11/T12 without a redesign.** Nav lists Products + Orders as disabled "próximamente" items now; enabling them later is a data change, not a layout change. The content area is a generic `AdminPage` shell (title + description + body) any future section drops into.

---

## Design Tokens Used

- **Colors (semantic only, never raw):** `bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-card`, `bg-muted/50` (info/success panels), `text-destructive` + `border-destructive/30` + `bg-destructive/5` (error banner), `bg-primary`/`text-primary-foreground` (primary button), `ring-ring/30` (focus).
- **Typography scale** (de-facto storefront scale, admin-tightened where noted):
  - Admin page title `h1`: **`text-lg font-semibold tracking-tight`** (admin-dense; storefront pages use `text-2xl md:text-3xl` — deliberate divergence for an operator tool)
  - Login title `h1`: `text-xl font-semibold tracking-tight` (the one "front door" that earns a touch more presence)
  - Section heading `h2`: `text-sm font-medium tracking-tight`
  - Body / field values: `text-sm`
  - Labels: `text-sm font-medium`
  - Helper / errors / meta: `text-xs`
  - Money fields: add `tabular-nums`
  - "próximamente" badge: `text-[0.625rem] font-medium` (matches `Badge`)
- **Spacing:** field stack `gap-1.5`; form stack `gap-4`; section stack `gap-6`; card padding `p-6`; content page padding `px-4 py-6` mobile → `px-6 py-8` desktop.
- **Radius:** `rounded-md` (fields, buttons, error banner), `rounded-lg` (login card, section panels).
- **Shadows:** none by default (flat like the storefront; elevation = `border` + `bg-card`). Only the login card gets `shadow-sm`.
- **Motion easing:** `var(--ease-out)` for enters (defined in `globals.css`); `var(--ease-drawer)` for the mobile nav drawer.

---

## shadcn / primitive inventory (what exists, what to use)

Confirmed present in `src/components/ui/`: `button`, `input`, `label`, `badge`, `select`, `checkbox`, `slider`.

| Primitive | Use in T10 |
| --------- | ---------- |
| `Button` | All buttons. `variant="default"` primary CTA; `variant="ghost"` nav items + logout; `variant="outline"` any secondary. Form CTAs use `size="lg"` + `min-h-11` add-on (tap target, matches storefront `cart-press` buttons). Built-in `active:translate-y-px` press feedback + `disabled:opacity-50`. |
| `Input` | Available (dense `h-7 text-sm`). For login + settings **data-entry** fields, use the comfortable field style the storefront forms use (below), not the raw dense `Input`. |
| `Label` | Field labels (`text-sm font-medium`). |
| `Badge` | "próximamente" pill on disabled nav items (`text-[0.625rem]`). |
| `Select`, `Checkbox`, `Slider` | **Not needed** in T10. Currency is fixed MXN, not user-editable. |

**No new shadcn component added.** Panels/banners are plain token `div`s (storefront idiom), no Dialog/Sheet/Card component introduced. The mobile nav drawer reuses the existing `.drawer-panel`/`.drawer-scrim` CSS (Radix Dialog optional for focus-trap; if used, it is the already-vendored `radix-ui` Dialog, no new dep).

**Canonical field style** (verbatim from `checkout-field.tsx` / `qa-form.tsx` `fieldClasses`):
```
w-full min-h-11 rounded-md border border-border bg-background px-3 py-2 text-sm
text-foreground outline-none placeholder:text-muted-foreground
focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30
aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20
disabled:opacity-60
```

**Icons** — `@hugeicons/react` + `@hugeicons/core-free-icons` only. Pattern: `<HugeiconsIcon icon={X} size={N} strokeWidth={2} aria-hidden className="…" />`.

| Icon | Use | size |
| ---- | --- | ---- |
| `Alert02Icon` | error banners / field errors | 13 (field) / 16 (banner) |
| `CheckmarkCircle02Icon` | success banner | 16–18 |
| `Logout01Icon` | logout control | 16 |
| `Settings01Icon` | Configuración nav | 16 |
| `Package01Icon` (or `ShoppingBag01Icon`) | Productos nav (disabled) | 16 |
| `ShoppingCart01Icon` | Pedidos nav (disabled) | 16 |
| `InformationCircleIcon` | row-missing info state | 16 |
| `Menu01Icon` / `Cancel01Icon` | mobile nav toggle open/close | 18 |

> Dev must confirm each name exists in `@hugeicons/core-free-icons`; substitute the closest free-set equivalent if a name differs — never mix icon sets.

---

## Route / component map (mirrors the ticket file plan)

```
src/app/admin/
├── layout.tsx              ← RootAdminLayout: own <html lang="es-MX">, session guard (defense-in-depth),
│                             renders AdminShell around {children}. No NextIntlClientProvider/CartProvider/
│                             SiteHeader/SiteFooter (parallel root layout).
├── page.tsx                ← redirect("/admin/settings")  (single landing decision)
├── login/page.tsx          ← LoginScreen (server; if authed → redirect("/admin"), AC-7) → <LoginForm/>
└── settings/page.tsx       ← SettingsScreen (server; reads live store_settings, seeds the form) → <StoreSettingsForm/>

src/components/admin/
├── admin-nav.tsx           ← nav item list + logout (active state, disabled future links) — data-driven
├── store-settings-form.tsx ← "use client"  useActionState(saveStoreSettings)
└── login-form.tsx          ← "use client"  useActionState(login)
```
`AdminShell` (sidebar/topbar chrome) can live in `layout.tsx` or a small `admin-shell.tsx`; it composes `AdminNav`. `AdminPage` (title/description wrapper) is a tiny presentational helper reused by every section.

---

## Component Inventory

### 1. AdminShell (chrome + navigation)

**Purpose:** Persistent admin frame — store name, section nav, logout, active-section indication. Wraps every authenticated page. Scales to T11/T12 by data, not layout.
**Location:** rendered by `src/app/admin/layout.tsx`.
**shadcn base:** none (layout `div`s + `Button` for nav/logout + `Badge`).

**Decision — persistent left sidebar on ≥ md; collapsible top bar + slide-in drawer on < md.**
Justification:
- An operator dashboard with a **growing section list** (Settings → +Products → +Orders → future overview) is the canonical left-sidebar case: a vertical list scales to N items without crowding, the active item is unambiguous, and it matches the Shopify/Linear/Vercel admin mental model. A top-bar tab row runs out of horizontal room and reads as "site nav," not "app nav."
- The storefront already ships an interruptible mobile drawer (`.drawer-panel`/`.drawer-scrim`, `--ease-drawer`, reduced-motion handled). Reusing it for the mobile admin nav gives **spatial consistency** with the rest of the product (Apple §7) and zero new motion code.

**Layout (desktop ≥ 768px):**
```
┌──────────────────┬──────────────────────────────────────────────┐
│  PosturPro        │   Configuración de la tienda                  │  ← AdminPage header
│  Administración   │   Edita el nombre, contacto y envío.          │
│                   │  ──────────────────────────────────────       │
│ ⚙ Configuración   │  ┌────────────────────────────────────────┐  │
│ 📦 Productos  próx │  │  StoreSettingsForm (max-w-md)          │  │
│ 🛒 Pedidos    próx │  │                                        │  │
│                   │  └────────────────────────────────────────┘  │
│  ─────────────    │                                               │
│ ⎋ Cerrar sesión   │                                               │
└──────────────────┴──────────────────────────────────────────────┘
 sidebar: w-60 (md: w-56), border-r bg-card, sticky h-dvh, flex-col; logout pinned bottom (mt-auto)
 content: flex-1, inner max-w-2xl, px-6 py-8
```

**Layout (mobile < 768px):**
```
┌───────────────────────────────────────┐
│ ☰  PosturPro            Cerrar sesión │  ← sticky top bar, h-14, border-b, bg-background/80 backdrop-blur
├───────────────────────────────────────┤
│  Configuración de la tienda           │
│  Edita el nombre, contacto y envío.   │
│  ┌─────────────────────────────────┐  │
│  │  StoreSettingsForm (1 col)      │  │
│  └─────────────────────────────────┘  │
└───────────────────────────────────────┘
  ☰ opens the left drawer (reuses .drawer-panel/.drawer-scrim) with the same AdminNav list.
```

**Props:**
```typescript
interface AdminShellProps {
  storeName: string;              // from live store_settings (fallback SEED_STORE_NAME)
  activeSection: AdminSectionId;  // "settings" | "products" | "orders"
  children: React.ReactNode;      // AdminPage body
}
```

**States:**
| State | Visual | Behavior |
|-------|--------|----------|
| Default | Sidebar, 3 nav items, one active | Active `bg-muted text-foreground font-medium` + `aria-current="page"`; others `text-muted-foreground` |
| Nav hover (desktop) | `hover:bg-muted/60` color only | Gated `@media (hover:hover)`; reuse `.nav-hover` |
| Disabled item | `text-muted-foreground/60`, `cursor-not-allowed`, `Badge` "próximamente" | `aria-disabled`, non-link `<span>`, `tabIndex={-1}` |
| Mobile drawer closed | Top bar only | `☰` `aria-expanded={false}` |
| Mobile drawer open | Slide in from left (300ms `--ease-drawer`), scrim fades | Focus trapped, `Esc`/scrim/nav-click closes, interruptible |

**Responsive:**
| Breakpoint | Layout |
|------------|--------|
| < 768px | Sticky top bar + slide-in drawer nav; content single-column `px-4 py-6` |
| 768–1023px | Persistent sidebar `w-56`; content `max-w-2xl px-6 py-8` |
| ≥ 1024px | Persistent sidebar `w-60`; content `max-w-2xl` |

**Motion:**
- Mobile drawer: **Slide in** (`translateX(-100%→0)`, 300ms `--ease-drawer`) / **exit** 200ms (faster). Reuse `.drawer-panel`/`.drawer-scrim` — no new CSS. Reduced-motion → opacity fade only (already handled).
- Nav item: **Hover effect** — `background-color`/`color` 120ms `ease`, gated to hover-capable pointers. No enter animation on the list (seen constantly → Emil "remove/reduce").
- Logout: built-in `Button` press feedback only.

---

### 2. AdminNav (nav list, shared by sidebar + drawer)

**Purpose:** Single source of the nav definition so sidebar and drawer never diverge.
**shadcn base:** `Button` (`variant="ghost"`, `asChild` for the link items), `Badge`.

**Nav definition lives in `src/lib/admin/constants.ts`** (no magic strings in JSX):
```typescript
interface AdminNavItem {
  id: AdminSectionId;        // "settings" | "products" | "orders"
  label: string;             // es-MX: "Configuración" | "Productos" | "Pedidos"
  href: string;              // "/admin/settings" (soon items: href ignored)
  icon: IconSvgElement;      // hugeicons
  status: "live" | "soon";   // "soon" → disabled + "próximamente" badge
}
```

**Layout:**
```
┌────────────────────────┐
│ ⚙  Configuración        │  ← live+active → bg-muted, aria-current, next/link
│ 📦 Productos   [próx.]  │  ← soon → muted, non-interactive, Badge
│ 🛒 Pedidos     [próx.]  │  ← soon
├────────────────────────┤
│ ⎋  Cerrar sesión        │  ← <form action={logout}><Button type=submit ghost/></form>
└────────────────────────┘
```

**Item states:**
| State | Visual | Behavior |
|-------|--------|----------|
| Live + active | `bg-muted text-foreground font-medium`, icon `text-foreground` | `aria-current="page"`; `next/link` |
| Live + inactive | `text-muted-foreground hover:bg-muted/60 hover:text-foreground` | link |
| Soon (disabled) | `text-muted-foreground/60 cursor-not-allowed` + `Badge "próximamente"` | non-interactive `<span>`, `aria-disabled="true"`, out of tab order |
| Logout | ghost button, `Logout01Icon`, `text-muted-foreground hover:text-foreground` | Submits `logout()` action via a real `<form>` POST (works without JS) |

**Accessibility:** `<nav aria-label="Administración">`; active `aria-current="page"`; disabled items `aria-disabled` + not focusable; logout is a `<button type="submit">` (state change, not navigation).

---

### 3. LoginScreen + LoginForm

**Purpose:** Authenticate the Owner. Locale-free `/admin/login`, es-MX copy.
**Location:** `src/app/admin/login/page.tsx` (server; already-authed → `redirect("/admin")`, AC-7) → client `LoginForm`.
**shadcn base:** `Button`, `Label` + canonical field style.

**Layout (centered card — all breakpoints):**
```
                ┌─────────────────────────────────┐
                │  PosturPro                       │  ← store name, text-sm text-muted-foreground
                │  Acceso de administrador          │  ← h1 text-xl font-semibold tracking-tight
                │                                   │
                │  ┌ ⚠ Correo o contraseña ───────┐ │  ← generic error banner (error only)
                │  │   incorrectos.               │ │     role=alert, aria-live=assertive, .enter-fade
                │  └──────────────────────────────┘ │     border-destructive/30 bg-destructive/5
                │                                   │
                │  Correo electrónico               │  ← Label
                │  ┌─────────────────────────────┐  │
                │  │ correo@ejemplo.com          │  │  ← type=email, inputmode=email, autoComplete=username
                │  └─────────────────────────────┘  │
                │  Contraseña                       │
                │  ┌─────────────────────────────┐  │
                │  │ ••••••••                    │  │  ← type=password, autoComplete=current-password
                │  └─────────────────────────────┘  │
                │  ┌─────────────────────────────┐  │
                │  │        Iniciar sesión        │  │  ← Button size=lg full-width, pending state
                │  └─────────────────────────────┘  │
                └─────────────────────────────────┘
  outer: min-h-dvh grid place-items-center bg-background px-4
  card:  w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm flex flex-col gap-4
```

**Props / state contract** (`src/app/admin/admin-form-state.ts`):
```typescript
interface LoginFormProps { storeName: string; } // NO secret ever crosses to the client

type AdminLoginStatus = "idle" | "error" | "rate-limited" | "unavailable";
interface AdminLoginState {
  status: AdminLoginStatus;
  values?: { email: string };   // preserve email on failure; NEVER echo the password
  submissionId: number;         // increments per attempt (qa/checkout pattern)
}
const initialAdminLoginState: AdminLoginState = { status: "idle", submissionId: 0 };
// success is never a rendered state — the action redirect()s to /admin
```

**States:**
| State | Visual | Behavior |
|-------|--------|----------|
| Idle | Prefilled email (if returning from error) / empty; enabled "Iniciar sesión" | Standard form |
| Pending | Button disabled, label → "Iniciando sesión…"; both fields `disabled` | `isPending`; blocks double-submit; no spinner (single, fast) |
| Error (bad creds) | **Single generic banner** above form: "Correo o contraseña incorrectos." No per-field `aria-invalid`. Email preserved, password cleared. | `status:"error"`; focus/announce via `role="alert" aria-live="assertive"` — **no field blame, no enumeration** (AC-3) |
| Rate-limited | Banner: "Demasiados intentos. Intenta de nuevo en unos minutos." | `status:"rate-limited"`; button re-enabled (user waits, retries) |
| Unavailable (missing env, edge 4) | Banner: "El acceso de administrador no está disponible." | `status:"unavailable"`; generic, no stack trace |

**Responsive:** identical centered `max-w-sm` card at all sizes; fields + button full-width; `min-h-11` tap targets.

**Interaction / a11y:**
- `<form action={formAction} noValidate>`; email `type="email" inputmode="email" autoComplete="username"`; password `autoComplete="current-password"`.
- Autofocus email on mount (single-purpose screen).
- Enter submits.
- Generic error uses `role="alert" aria-live="assertive"` and does **not** move focus into a field, preserving the "which field?" ambiguity (AC-3). No shake/wiggle — a professional tool; a jitter would read as alarmist and repeat on every typo.

**Motion:**
| Element | Term | Trigger | Property | Easing | Duration | RM fallback |
|---------|------|---------|----------|--------|----------|-------------|
| Card | Fade in (+ rise) | mount | `opacity`,`translateY(8→0)` | `--ease-out` | 200ms | opacity only |
| Error banner | Fade in | error | `opacity`,`translateY` | `--ease-out` | 200ms | opacity only |
| Button | Press | `:active` | built-in `translate-y-px` | — | instant | keep |

Reuse `.enter-fade` for both card and banner (already defined, RM-safe). No new CSS.

---

### 4. AdminDashboard landing (`/admin`)

**Decision:** `/admin` **redirects to `/admin/settings`** (server `redirect()`) — consistent single landing.
Rationale: in Phase 1 there is exactly one working section; a separate empty dashboard would be **dead UI** (Emil/hacker anti-pattern). An operator opening `/admin` wants to act, and the only action is editing settings.
**T11/T12 seam (documented in `dev-done.md`):** replace the redirect with an `AdminPage` overview (product count, pending-order count, quick links). The nav already lists all sections, so this is a one-file change — no shell/nav rewrite.
No wireframe (it renders nothing; it redirects).

---

### 5. AdminPage (generic content wrapper)

Tiny presentational wrapper giving every section a consistent header. Reused by Settings now, Products/Orders later.
```typescript
interface AdminPageProps {
  title: string;             // h1 text-lg font-semibold tracking-tight
  description?: string;      // p text-sm text-muted-foreground
  children: React.ReactNode; // section body
}
```
```
Configuración de la tienda            ← h1
Edita el nombre, el contacto y las    ← p muted
tarifas de envío.
──────────────────────────────────    ← border-b border-border, mb-6 pb-4
{children}
```

---

### 6. StoreSettingsForm  *(the core surface)*

**Purpose:** Edit the four `store_settings` fields; validate; save via server action; confirm success.
**Location:** `src/components/admin/store-settings-form.tsx` (`"use client"`), rendered by `settings/page.tsx`.
**shadcn base:** `Button`, `Label`, canonical field style.

**Layout (single column, max-w-md):**
```
┌──────────────────────────────────────────────┐
│ ┌ ✓ Configuración guardada. ────────────────┐ │  ← success banner (after save), bg-muted/50, role=status
│ └────────────────────────────────────────────┘ │
│ ┌ ⓘ No se encontró la configuración… ───────┐ │  ← info banner (row missing), bg-muted/50, role=status
│ └────────────────────────────────────────────┘ │
│                                                │
│ Nombre de la tienda                            │  ← Label
│ ┌────────────────────────────────────────┐    │
│ │ PosturPro                              │    │  ← text, maxLength 200
│ └────────────────────────────────────────┘    │
│ El nombre no puede estar vacío.   (error only) │  ← FieldError text-xs text-destructive + Alert02Icon
│                                                │
│ Correo de contacto                             │
│ ┌────────────────────────────────────────┐    │
│ │ hola@posturpro.mx                      │    │  ← type=email
│ └────────────────────────────────────────┘    │
│                                                │
│ Tarifa de envío (MXN)                          │
│ ┌───┬────────────────────────────────────┐    │
│ │ $ │ 500.00                            │    │  ← peso field: $ adornment, inputmode=decimal, tabular-nums
│ └───┴────────────────────────────────────┘    │
│ Se cobra por pedido. Usa 0 para envío gratis.  │  ← helper text-xs text-muted-foreground
│                                                │
│ Envío gratis a partir de (MXN)                 │
│ ┌───┬────────────────────────────────────┐    │
│ │ $ │ 1500.00                           │    │  ← peso field
│ └───┴────────────────────────────────────┘    │
│ Usa 0 para ofrecer envío gratis siempre.       │  ← helper (clarifies 0 is valid, edge 6)
│                                                │
│ ┌ ⚠ No se pudo guardar. Intenta de nuevo. ──┐ │  ← non-field error banner (error only), border-destructive/30
│ └────────────────────────────────────────────┘ │
│                        ┌──────────────────┐    │
│                        │  Guardar cambios │    │  ← Button size=lg self-end, pending
│                        └──────────────────┘    │
└──────────────────────────────────────────────┘
  form: flex flex-col gap-6; each field group: flex flex-col gap-1.5
```

**Props / state contract** (`src/app/admin/admin-form-state.ts`):
```typescript
type AdminSettingsField =
  | "store_name" | "contact_email" | "shipping_flat_rate" | "free_shipping_threshold";

type AdminSettingsFieldError =
  | "name-required" | "name-too-long"
  | "email-invalid"
  | "money-required" | "money-invalid" | "money-negative"
  | "money-too-many-decimals" | "money-overflow";

type AdminSettingsStatus =
  | "idle" | "success"
  | "invalid"          // field-level validation errors
  | "row-missing"      // store_settings absent → seeded from SEED_* (edge 8, informational; not an error)
  | "unauthenticated"  // direct POST without session (edge 9)
  | "error";           // DB/PG write failure (mapped enum, never echoed)

interface AdminSettingsValues {
  store_name: string;
  contact_email: string;
  shipping_flat_rate: string;       // PESO string as typed, e.g. "500.00"
  free_shipping_threshold: string;  // PESO string as typed
}

interface AdminSettingsState {
  status: AdminSettingsStatus;
  fieldErrors?: Partial<Record<AdminSettingsField, AdminSettingsFieldError>>;
  values?: AdminSettingsValues;     // preserved so the form stays filled on failure
  submissionId: number;
}
const initialAdminSettingsState: AdminSettingsState = { status: "idle", submissionId: 0 };

interface StoreSettingsFormProps {
  initialValues: AdminSettingsValues; // money seeded via centsToPesos(cents).toFixed(2)
  rowMissing: boolean;                // true → info banner + "save to create" affordance
}
```

**Money field — exact input behavior (AC-8, AC-10, edges 6/7; pure parser in `src/lib/admin/settings-input.ts`):**
- Display/edit in **pesos** (2 decimals); store integer **cents**. Seed = `centsToPesos(cents).toFixed(2)`.
- `<input inputmode="decimal">` (mobile numeric keypad), **NOT `type="number"`** — avoids browser locale coercion, spinners, and silent rounding. Add `tabular-nums`. `$` is a static `<span>` adornment inside a bordered flex wrapper, not part of the value.
- **Client validation is convenience-only; the server parser is the boundary** (like `qa-form`). Parser rules (Spanish messages; form stays filled):
  | Input | Result | Message |
  |-------|--------|---------|
  | `""` (blank) | `money-required` | "Ingresa un monto (usa 0 para gratis)." — blank ≠ 0 |
  | `0` / `0.00` | **valid**, `0` cents | — (flat 0 = always free; threshold 0 = free for all, edge 6) |
  | `$500`, ` 500 ` | strip one leading `$` + whitespace, then valid | — |
  | `1,000.00` / `1.000,00` | `money-invalid` | "Usa punto decimal y sin separadores de miles, p. ej. 1500.00." (no silent coerce, R7) |
  | `500.999` | `money-too-many-decimals` | "Usa máximo 2 decimales." |
  | `-5`, `abc` | `money-negative` / `money-invalid` | "El monto no puede ser negativo." / "Ingresa un monto válido." |
  | huge (`> MAX_SAFE_INTEGER` cents) | `money-overflow` | "El monto es demasiado grande." |
  - Accept only `^\d+(\.\d{1,2})?$` after `$`/space stripping, then `pesosToCents`.

**States:**
| State | Visual | Behavior |
|-------|--------|----------|
| Loading (initial) | **No skeleton** — the page is a server component; the form arrives populated from the SSR read | A skeleton would be dead code (data is available at render) |
| Row missing (edge 8) | `ⓘ` info banner "No se encontró la configuración de la tienda. Se muestran los valores predeterminados; guarda para crearla." Fields prefilled from `SEED_*` | `rowMissing` true; first save UPSERTs the singleton |
| Idle / editing | Populated fields, enabled "Guardar cambios" | Standard |
| Pending | Button disabled, label → "Guardando…"; **all fields disabled** (UX req) | `isPending`; no double-submit |
| Invalid | Inline `FieldError` (`text-xs text-destructive` + `Alert02Icon`, `role="alert"`, `.enter-fade`) under each bad field; input `aria-invalid` + `aria-describedby`; form stays filled; focus → first invalid field | `status:"invalid"`; no DB write |
| Save error (DB) | Top-level banner "No se pudo guardar. Intenta de nuevo." (`border-destructive/30 bg-destructive/5`, `Alert02Icon`, `role="alert"`) | `status:"error"`; PG error mapped, never echoed |
| Unauthenticated (edge 9) | Action re-verifies session first and redirects to `/admin/login`; DB untouched | server boundary; not normally rendered |
| Success | Non-blocking `✓` banner "Configuración guardada." above form (`bg-muted/50`, `CheckmarkCircle02Icon`, `role="status"`); fields show saved values; **form stays editable** | `status:"success"`; `revalidateTag(STORE_SETTINGS_CACHE_TAG)`; focus → banner |

**Responsive:**
| Breakpoint | Layout |
|------------|--------|
| < 640px | Single column, full-width fields, `min-h-11`, money `inputmode="decimal"`; button full-width |
| 640–767px | Single column `max-w-md`; button `self-end w-auto` |
| ≥ 768px | Single column `max-w-md` inside the `max-w-2xl` content column; no horizontal scroll |

**Motion:**
| Element | Term | Trigger | Property | Easing | Duration | RM fallback |
|---------|------|---------|----------|--------|----------|-------------|
| Fields | — (none) | — | — | — | — | server-populated; motion would be purposeless |
| Success banner | Fade in | save success (keyed on `submissionId`, replays each save) | `opacity`,`translateY(8→0)` | `--ease-out` | 200ms | opacity only |
| Field errors | Fade in | invalid | `opacity`,`translateY` | `--ease-out` | 200ms | opacity only |
| Save error banner | Fade in | error | `opacity`,`translateY` | `--ease-out` | 200ms | opacity only |
| Button | Press | `:active` | built-in `translate-y-px` | — | instant | keep |

All reuse `.enter-fade`. Errors sit in reserved flow below each field (small expected reflow, consistent with `qa-form`) — no `layout animation` on insert.

---

## Page Layouts (composed)

### `/admin/login` (unauthenticated)
```
DESKTOP + MOBILE (identical, centered):
┌───────────────────── viewport (min-h-dvh, grid place-items-center, px-4) ─────────────────────┐
│                              [ LoginScreen card, max-w-sm ]                                    │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
No admin chrome — login is outside the shell.
```

### `/admin/settings` (authenticated)
```
DESKTOP (≥768):                                MOBILE (<768):
┌────────┬───────────────────────────┐         ┌───────────────────────────┐
│sidebar │ AdminPage header          │         │ ☰ topbar        Cerrar ses│
│(w-60)  │  ─────────────            │         ├───────────────────────────┤
│nav     │ StoreSettingsForm(max-w-md)│         │ AdminPage header          │
│logout⎋ │                           │         │  ─────────                │
└────────┴───────────────────────────┘         │ StoreSettingsForm (1 col) │
                                                └───────────────────────────┘
```

---

## Interaction Flows

### Flow A — Login
1. Owner visits `/admin` unauthenticated → middleware **redirects (307)** to `/admin/login` (AC-1). No admin markup sent.
2. `LoginScreen` mounts → card **fades in** (`.enter-fade`, 200ms ease-out); email autofocused.
3. Owner enters credentials, Enter or "Iniciar sesión".
4. Button → **pending**: disabled, "Iniciando sesión…", fields disabled — no double-submit.
5a. **Success** → action sets `Path=/admin` HttpOnly session cookie → `redirect("/admin")` → `/admin` redirects to `/admin/settings`. (Redirect is the confirmation.)
5b. **Failure** → generic banner fades in, email preserved, password cleared, `role="alert" aria-live="assertive"` announces it; button re-enables; correct + resubmit.

### Flow B — Navigate + Logout
1. Authenticated Owner on `/admin/settings`; "Configuración" active (`aria-current`, `bg-muted`).
2. Products/Orders visibly disabled + "próximamente" badges — not clickable, not focusable; communicate the roadmap.
3. "Cerrar sesión" → `logout()` clears the cookie (maxAge=0) → `redirect("/admin/login")`. AC-1 holds again.
4. (Mobile) `☰` → drawer slides in (300ms `--ease-drawer`); nav-click/scrim/`Esc` → slides out (200ms). Interruptible.

### Flow C — Edit Store Settings (core loop)
1. `/admin/settings` server-reads the live row → form arrives populated (money as peso strings). Row missing → info banner + `SEED_*` seed.
2. Owner edits; money fields `inputmode="decimal"`, `$` static adornment.
3. "Guardar cambios" → **pending** ("Guardando…"), all fields disabled.
4a. **Invalid** → `status:"invalid"` + `fieldErrors`; inline errors fade in, `aria-invalid` set, focus → first invalid field, form stays filled; correct + resubmit.
4b. **DB error** → top-level banner "No se pudo guardar. Intenta de nuevo."; retry.
4c. **Success** → `✓ "Configuración guardada."` banner fades in (keyed on `submissionId`, replays on repeat saves), fields show saved values, form stays editable. Action `revalidateTag("store-settings")` → storefront footer/checkout reflect new shipping on next render (AC-9). Focus → success banner (`role="status"`).

---

## Accessibility Checklist
- [ ] Visible focus ring on every interactive element (`focus-visible:ring-2 focus-visible:ring-ring/30`, inherited from `Button`/field classes).
- [ ] Icon-only controls labelled: mobile toggle `aria-label="Abrir menú"`/`"Cerrar menú"`; decorative icons `aria-hidden`.
- [ ] Color never the sole indicator: errors carry icon + text; active nav carries `aria-current` + weight (not just bg); disabled nav carries a text Badge.
- [ ] Logical tab order: login = email → password → submit; settings = fields top-to-bottom → submit; sidebar nav precedes content; logout reachable.
- [ ] Dynamic announcements: login error `role="alert" aria-live="assertive"`; field errors `role="alert"`; success `role="status"`; focus moves to the relevant banner/field per state.
- [ ] Generic auth copy never reveals which field was wrong (AC-3) — single banner, no per-field `aria-invalid` on login.
- [ ] `<html lang="es-MX">` on the admin root layout (Spanish SR pronunciation).
- [ ] `<nav aria-label="Administración">`; content in `<main>`; skip-link "Saltar al contenido" (matches storefront).
- [ ] Tap targets ≥ 44px on mobile (`min-h-11`).
- [ ] No bespoke keyboard shortcuts (Enter submits; `Esc` closes the drawer via Radix).

---

## Motion Spec Summary

All motion uses **existing** `globals.css` classes (`.enter-fade`, `.nav-hover`, `.drawer-panel`, `.drawer-scrim`) + `Button`'s built-in `active:translate-y-px`. **T10 introduces no new motion CSS.** Everything animates `transform`/`opacity` only, enters use `--ease-out`, and reduced-motion is handled by those classes. Nothing animates from `scale(0)`. No motion on high-frequency nav/keyboard actions beyond color.

| Element | Term | Easing | Duration | RM fallback |
|---------|------|--------|----------|-------------|
| Login card | Fade in (+ rise) | `--ease-out` | 200ms | opacity only |
| Login / settings error banner | Fade in | `--ease-out` | 200ms | opacity only |
| Settings success banner | Fade in (keyed, replays) | `--ease-out` | 200ms | opacity only |
| Field errors | Fade in | `--ease-out` | 200ms | opacity only |
| Nav item | Hover effect | `ease` | 120ms | color-only (RM-safe) |
| Buttons | Press feedback | built-in | instant | keep |
| Mobile nav drawer | Slide in / spatial-consistent exit | `--ease-drawer` | 300 / 200ms | slide dropped, opacity fade |

---

## Notes for Dev (design → implementation seams)
- Follow `src/components/product/qa-form.tsx` + `src/components/checkout/checkout-flow-client.tsx` as the **canonical forms**: field triplet (`flex flex-col gap-1.5`, `Label`, field, `FieldError`), success note, pending button (label swap), `aria-invalid`/`aria-describedby` wiring via `useId()`, focus management, `role="alert"`/`"status"`.
- Use the comfortable field style (`min-h-11 … px-3 py-2 text-sm … disabled:opacity-60`) — not the dense `ui/input.tsx` `h-7` (fine for future T11 inline/table use, cramped for a settings form).
- State-type files (`admin-form-state.ts`) hold `interface`/`type` + `initial*` const exports; the `"use server"` `actions.ts` may export only async fns (established `checkout-form-state.ts` rule).
- Money display `centsToPesos(cents).toFixed(2)`; parse via the pure `settings-input.ts` (`pesosToCents`). Never store a float; never `type="number"`.
- Nav items are data (`AdminNavItem[]` in `constants.ts`): T11/T12 flip `status:"soon"→"live"` + set `href` — no JSX rewrite.
- `/admin` → `redirect("/admin/settings")`; document the T11/T12 overview seam in `dev-done.md`.
- Admin copy is authored **inline in Spanish** — do NOT add it to the next-intl catalogs (keeps storefront symmetry tests green).
- Global error banner treatment = `rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive` (checkout convention); success/info panels = `rounded-md bg-muted/50 p-3` (qa-form convention).
```
