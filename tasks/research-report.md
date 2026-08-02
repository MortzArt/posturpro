# Research Report: T15 — Premium visual identity & image-rich refresh

> One-pass codebase inventory for S2 (impeccable new-work / ultradesign). S2 owns choosing the visual world; this report maps the terrain that world plugs into: the token seam, every brand-feel surface, the shared-with-admin firewall, the image infrastructure, the font blast radius, the test surface at risk, and the constraints.

## Codebase Analysis

### Existing Patterns

- **Single centralized token seam.** All brand color + radius live in ONE `:root` (+ `.dark`) block — `src/app/globals.css:51-131`. Every value is grayscale `oklch(L 0 0)` (create-next-app neutral). `--radius: 0.625rem` drives a derived radius scale (`--radius-sm..4xl`, globals.css:42-48). This is the swap seam; the world S2 commits replaces these values. Reuse: overwrite the `:root`/`.dark` values, keep the token NAMES so no component edit is needed (AC-4).
- **Token-utility discipline (brand color).** ~95% of storefront components flow brand color through token utilities (`bg-background`, `text-foreground`, `bg-primary`, `border-border`, `text-muted-foreground`, `bg-card`, `ring-ring`, `bg-destructive`). Verified across header (`site-header.tsx`), footer (`site-footer.tsx`), hero (`hero.tsx`), product-card (`product-card.tsx`), 404 (`not-found.tsx`), WhatsApp FAB (`whatsapp-button.tsx:54` = `bg-primary text-primary-foreground`). Reuse: the reskin is mostly a token-value swap, not a per-component color rewrite.
- **Shipped motion layer (KEEP — Emil authority).** ~20 CSS classes in `globals.css:145-838` (`.enter-fade`, `.stagger`, `.card-lift`, `.link-arrow`, `.gallery-image`, `.price-value`, `.cart-*`, `.drawer-*`, `.select-content-motion`, `.dialog-content-motion`, `.reorder-item`, `.fab-pop`, `.toggle-*`, `.nav-hover`), plus easing tokens `--ease-out`/`--ease-in-out`/`--ease-drawer` (globals.css:85-87). All `transform`/`opacity` only, `ease-out` enter, `prefers-reduced-motion`-gated, hover-capability-gated. CLAUDE.md division: **impeccable owns look, Emil owns motion** — preserve this layer verbatim; the reskin restyles color/type/imagery, not motion.
- **Config-driven image slots with graceful degrade.** `HERO_IMAGE`/`SHOWROOM_MAP_IMAGE`/`SHOWROOM_MAP_URL` are `string | null` in `src/lib/config/static-pages.ts:116,139,132`. Consumers render `next/image` when present, else a token-tinted glyph panel (`hero.tsx:77-112` `HeroMedia`; product-card `product-card.tsx:74-90`). This is the EXACT pattern new lifestyle/editorial slots must extend (AC-8).
- **Pre-resolved-labels / server-component discipline.** Presentational components (product-card, stock-badge, hero) take pre-resolved localized strings as props and do no i18n themselves (SRP). New editorial/image components should follow: strings resolved in the `page.tsx`/RSC and passed in.
- **Tailwind v4 CSS-first config.** No `tailwind.config.*` — theme is `@theme inline` in globals.css (lines 7-49) + `postcss.config.mjs` + `components.json`. Tokens are CSS variables consumed by utilities. There is no JS token file to edit.

### Relevant Files

| File | Purpose | Relevance | Action |
| ---- | ------- | --------- | ------ |
| `src/app/globals.css` | Token `:root`/`.dark`, `@theme`, motion layer | THE token seam + motion authority | **Modify** (swap token values, add `--font-heading`, update Brand-Tokens doc block; keep motion verbatim) |
| `src/app/fonts.ts` | `sans = Inter` bound to `--font-sans` | Font seam; SHARED with admin+404 | **Modify** (add premium pairing, es-MX subsets, scope from admin) |
| `src/app/[locale]/layout.tsx` | Storefront root: `<html lang>`, font wire, shell | Firewall boundary; direction-contract host | **Modify** (storefront-scoped theme/font; AC-2 comment) |
| `src/app/admin/layout.tsx` | Admin root: imports `sans`, uses `bg-background`/`font-sans` | SHARED SEAM — must NOT change appearance | **Reference** (firewall target; do not edit) |
| `next.config.ts` | `images.remotePatterns` (picsum + supabase) | Allow-list for new image hosts | **Modify** (if remote placeholders) |
| `src/lib/config/static-pages.ts` | `HERO_IMAGE`/showroom slots, homepage tunables | Image-slot config home | **Modify** (add new lifestyle slots) |
| `src/lib/config/shared.ts` | `SEED_IMAGE_BASE_URL`, `SEED_STORE_NAME` | Product-image placeholder source (picsum) | **Reference** |
| `src/app/[locale]/page.tsx` | Homepage (hero + featured products + brands) | Primary Persuade surface | **Modify** (apply world; add editorial band per DESIGN.md) |
| `src/components/home/{hero,featured-products,featured-brands,section-header}.tsx` | Homepage components | Hero is the first-viewport thesis | **Modify** (+ possibly **Create** editorial band) |
| `src/components/layout/{site-header,site-footer,mobile-nav,language-toggle,whatsapp-button}.tsx` + `nav-items.ts` | Persistent chrome (every page) | Brand-feel; testids to preserve | **Modify** |
| `src/components/catalog/*` (product-card, product-grid, index-tile, brand-logo, filter-*, toolbar, breadcrumbs, stock-badge, no-results, empty-state, pagination, catalog-skeleton) | Catalog + PLP + brand/category/style surfaces | Highest-reuse components | **Modify** |
| `src/components/product/*` (product-gallery, product-purchase-panel, product-specs, product-qa, qa-form, recently-viewed, pdp-skeleton) | PDP | Image-rich; gallery + purchase panel | **Modify** |
| `src/components/cart/*` + `src/app/[locale]/carrito/page.tsx` | Cart shell | Free-shipping progress (emerald), badges | **Modify** |
| `src/components/checkout/*` + checkout routes | Checkout shell + confirmation | Amber/emerald semantic colors concentrated here | **Modify** |
| `src/components/content/static-page-body.tsx` + `[pageSlug]`/`contacto`/`showroom` routes | 9 static pages | Read-mode surfaces | **Modify** |
| `src/app/[locale]/{not-found,error}.tsx` | 404 / error states | Restyle to new world | **Modify** |
| `src/app/global-error.tsx` | Catastrophic root boundary | Hardcoded hex + system-ui BY DESIGN | **Reference** (intentional exception, edge 8) |
| `src/components/ui/{button,badge,alert-dialog,dialog,tabs}.tsx` | shadcn primitives | SHARED with admin (24/8/5/4/2 imports) | **Reference / careful** (token-only; don't bake brand looks in) |
| `src/messages/{es-MX,en}.json` | i18n copy (614 lines each) | New visible copy in lockstep | **Modify** (only if new copy) |
| `e2e/*.spec.ts` (storefront) | e2e assertions | Testids + structural signals to preserve | **Reference / reconcile** |

### Data Flow

This is a presentation-layer task — the data flow is unchanged; what changes is how it's PAINTED.

1. **Token flow:** `globals.css :root` CSS variables → `@theme inline` maps them to Tailwind color utilities → components apply `bg-primary`/`text-foreground`/etc. → rendered. Swapping `:root` values re-paints everything downstream with no component edit. (Blast radius includes admin — see firewall below.)
2. **Font flow:** `next/font(Inter)` in `fonts.ts` → `sans.variable` (`--font-sans`) applied on `<html className={sans.variable}>` in BOTH `[locale]/layout.tsx:73` AND `admin/layout.tsx:28` → `html { font-sans }` (globals.css:141) → every text node. `--font-heading` currently `= var(--font-sans)` (globals.css:12); `dialog.tsx`/`alert-dialog.tsx` consume `font-heading` (shared with admin).
3. **Image flow (products):** DB `product_images` → catalog queries → `coverImageUrl`/gallery URLs (picsum placeholders via `SEED_IMAGE_BASE_URL`) → `next/image` (host allow-listed in `next.config.ts`). Null → glyph placeholder.
4. **Image flow (editorial/lifestyle — NEW):** config `string | null` slot (`src/lib/config/`) → RSC passes to component → `next/image` when set, token panel when null. No DB involvement — these are chrome/marketing assets, correctly config-driven not DB-driven.

### Similar Features (Reference Implementations)

- **`Hero` (`src/components/home/hero.tsx`)** — the canonical image-slot: `imageUrl: string \| null` prop, `HeroMedia` renders `next/image` (fill, `priority`, `sizes`, `object-cover`, reserved `aspect-[4/3]`) or a token glyph panel. New lifestyle bands copy this grammar. Key patterns: reserved aspect box (no CLS), `.enter-fade` mount, `aria-hidden` glyph fallback, `data-testid` on fallback.
- **`ShowroomLocation` / showroom page** — second image-slot instance (`SHOWROOM_MAP_IMAGE`/`SHOWROOM_MAP_URL` null-degrade). Reference for "config slot + graceful omit."
- **`StockBadge` (`stock-badge.tsx`)** — the glyph+text status convention (icon + label, color never the only signal). Reference for how the reskin must keep amber/emerald semantics AA-safe (edge 9, AC-13).
- **`ProductCard` (`product-card.tsx`)** — the most-reused component; token-clean, `.card-lift`/`.stagger` motion, `formatMXN` price + `line-through` compare-at (a structurally-asserted e2e signal). The reskin's card treatment sets the catalog's whole feel.
- **T13 precedent** — the last standard-tier UI task (homepage + static pages). Its dev-done/ui-design notes (pipeline-state) show the discipline: reuse shipped motion classes, no new deps, config-driven placeholders, lockstep i18n, testids preserved.

## Dependency Analysis

### Existing Dependencies to Leverage

- **`next/font/google`** (Inter today) — add the committed premium pairing here; self-hosted, no external request, supports subsetting for es-MX glyphs. Version: bundled with Next.
- **`next/image`** — all imagery; allow-list via `next.config.ts`. Already used in hero, product-card, product-grid, gallery, cart-line, checkout-summary, showroom.
- **`@hugeicons/react` + `@hugeicons/core-free-icons`** — the ONLY icon set (CLAUDE.md: never mix). Glyph placeholders + any new iconography draw from here.
- **`tailwindcss` v4** (`tw-animate-css`, `shadcn/tailwind.css`) — CSS-first theming via `@theme inline`.
- **`cn()` (`@/lib/utils`)** — conditional classes (CLAUDE.md convention).
- **Impeccable scripts** — `concept-seed.mjs`, `serve-question.mjs`, `context.mjs`, `detect.mjs`, and **`generate-image.mjs`** (image generation IS available → AC-9 can generate placeholders; new-work §7 requires visualize/comp step). Located in `.claude/skills/impeccable/scripts/`.

### New Dependencies Needed

- **None expected.** At most a second `next/font` family import (no npm package). If the committed world needs a non-Google face, deliver as a local font file via `next/font/local` (still no external CDN). Any new package must be justified in dev-done and respect the CSP/no-external-request posture.

### Internal Dependencies

- **`@/app/fonts` → `[locale]/layout.tsx` + `admin/layout.tsx` + `not-found.tsx`** — implication: the `sans` export is a SHARED font seam; changing it changes admin. The premium storefront face must NOT flow through the unchanged shared export unless admin is explicitly held to the old face.
- **`globals.css :root` tokens → every surface incl. admin** — implication: admin's `bg-background`/`text-foreground`/`font-sans` resolve from the SAME `:root`. A global token swap re-skins admin. Firewall requires storefront-scoped tokens/wrapper OR admin holding its own token subset.
- **`src/components/ui/*` → storefront AND admin** — implication: restyling a shared primitive changes both surfaces. Keep primitives token-driven; apply brand treatment at the storefront call-site.
- **`--font-heading` → `dialog.tsx`/`alert-dialog.tsx` (shared)** — implication: introducing a real display `--font-heading` changes admin dialog/alert titles too unless scoped.

## External Research

### API Documentation

- N/A — no external APIs. This is a presentation task with no network integrations.

### Library Documentation

- **`next/font`** — use `subsets` covering Latin + Latin-Extended (es-MX needs `á é í ó ú ñ ¿ ¡`, ~160 occurrences in messages). `display: "swap"` (already used). Prefer variable fonts for weight range without extra bundle. Bind to a CSS variable and apply via `className={font.variable}` scoped to the storefront root for the firewall.
- **`next/image`** — new hosts go in `images.remotePatterns` (protocol/hostname/pathname), mirroring the existing picsum + supabase entries in `next.config.ts:43-60`. Local `/public` assets need no allow-list. Reserve aspect boxes (`aspect-[…]` + `fill`) to avoid CLS; `priority` only on the LCP hero.
- **impeccable `new-work.md`** — S2's playbook: name mechanism/audience/scene, list 7 concrete visual systems (≥3 material families), turn into directions, run `concept-seed.mjs --scope direction`, present ONE committed direction + challengers + canon via `serve-question.mjs` (or structured tool if headless), generate comp sketches through the shared frame, build with full commitment, run finish reviewer fresh, write DESIGN.md from the BUILT world. The direction contract (5 blocks + FINISH line) goes in the emitted markup (AC-2).

## Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| **Brand palette/font bleeds into admin via the shared `:root`/`sans`/ui-primitive seam** (THE headline risk) | High | High | Scope the new tokens + display font to the storefront root (`[locale]/layout.tsx` wrapper/selector), not the global `:root` or `sans` export; keep `src/components/ui/*` token-driven; screenshot `/admin` before/after (AC-11/12, edge 1/2) |
| Display face lacks es-MX glyph coverage → broken accents mid-word | Med | High | Select faces with Latin-Extended; correct `next/font` subsets; verify on a "ñ/í/¿…?" heading (edge 4, AC-5) |
| Text-over-image drops below AA (esp. when a real photo later swaps in) | Med | High | Committed overlay/scrim strategy guaranteeing AA regardless of image luminance (edge 5, AC-13) |
| Semantic amber/emerald (~12 files) clash with the new palette or get half-migrated | Med | Med | One consistent decision (keep as status semantics OR promote to `--warning`/`--success`), applied across all files, glyph+text + AA preserved (edge 9) |
| Stale `.dark` neutral values leave a broken dark experience | Med | Med | Re-commit `.dark` to the new world OR decommission it intentionally; document in DESIGN.md (edge 7) |
| e2e breaks on a renamed testid or dropped structural signal (line-through / grid / honeypot) | Low | Med | Preserve asserted testids + structural signals; reconcile+justify any rename (edge 6, AC-19). NOTE: e2e asserts NO colors/fonts → visual reskin is otherwise e2e-safe |
| New font/asset regresses LCP/CLS | Low | Med | `next/font` self-hosted + subset; reserve aspect boxes; `priority` only on LCP hero (AC-15) |
| Fabricated proof creeps in (testimonials, review counts) via "image-rich" enthusiasm | Low | High | Hard rule (AC-9, PRODUCT.md): synthetic imagery labeled/structural; zero invented claims |

### Performance Considerations

- **Fonts:** adding a display + body pairing risks bundle growth. Mitigate with `next/font` subsetting (Latin + Latin-Extended only), variable fonts, `display: "swap"`. No runtime web-font CDN.
- **Imagery:** image-rich = more/larger images. Enforce `next/image` `sizes`, `priority` on LCP hero only, reserved aspect boxes (no CLS), and modern formats via `next/image` defaults. T14 owns the deeper image-perf pass, but T15 must not regress.
- **Motion:** the existing layer is compositor-friendly (`transform`/`opacity`) and RM-gated — no perf risk if preserved; do not introduce layout-animating motion.

### Security Considerations

- **CSP / external requests:** prefer `/public` local assets or `next/font` self-hosting over external CDNs (matches the repo's no-external-request posture — the showroom map deliberately uses a plain `<img>`/deep-link, no SDK). Any new remote image host is explicitly allow-listed in `next.config.ts` (AC-10).
- **No new attack surface:** zero new inputs, endpoints, or data paths. `global-error.tsx` already never leaks error/stack. `StaticPageBody` renders escaped children (no `dangerouslySetInnerHTML`) — the reskin must not introduce raw HTML injection.
- **No secrets:** no `NEXT_PUBLIC_`-prefixed secret, no secret in tokens/assets.

## Implementation Recommendations

### Suggested Order of Implementation

1. **Run the impeccable new-work flow (S2)** — decide the world first; nothing paints before the direction is dealt and committed (new-work §3-4 is a hard gate). Generate comp sketches, get the direction, then build.
2. **Establish the storefront firewall FIRST** — before swapping any token/font, decide and wire the scope mechanism (storefront-scoped tokens/font wrapper vs global `:root` with admin opt-out). Everything downstream depends on this being right, and it's the highest-impact risk. Screenshot admin as the baseline.
3. **Swap the token world** in `globals.css` (or the storefront-scoped layer) — palette, radius, `--font-heading` binding; update the Brand-Tokens doc block. Verify storefront re-paints and admin is untouched.
4. **Wire the typography** (`fonts.ts` + storefront root) with es-MX subsets; verify accented headings.
5. **Apply per-surface, shell-first** — header/footer/mobile-nav/WhatsApp (every page), then homepage (hero + editorial band), then catalog/PLP, PDP, cart, checkout shell, static pages, 404/error. Reconcile the ~12 semantic-color files consistently in this pass.
6. **Build the image-slot system** — extend config slots, add `/public` (or allow-listed host) placeholders (generated via `generate-image.mjs` or licensed stock), verify null-degrade on every slot.
7. **a11y/perf/parity sweep** — AA on every surface incl. text-over-image, RM honored, mobile 320-1280 no-overflow, i18n lockstep, money display intact.
8. **Test-suite green + admin-firewall verification** — `tsc`/eslint/unit/integration/e2e; before/after admin screenshots; write DESIGN.md from the built world (impeccable documenter).

### Key Decisions (for S2/dev — NOT pre-empting the visual world)

- **Firewall mechanism** (recommended: storefront-scoped brand tokens + display font applied under `[locale]/layout.tsx`, admin keeps the neutral/own token+font world). This is the cleanest way to guarantee AC-11 without touching a single admin file.
- **Semantic colors** — recommend keeping amber/emerald as orthogonal, glyph+text status semantics (they encode meaning, not brand) OR promoting to `--warning`/`--success` tokens; decide once, apply everywhere.
- **Dark mode** — recommend an explicit decision (commit a real dark theme or decommission `.dark`); do not ship half-migrated neutral dark values.
- **WhatsApp FAB color** — if the brand primary is no longer green, give the FAB a dedicated recognizable-WhatsApp token rather than leaving it `bg-primary`.

### Anti-Patterns to Avoid

- **Don't** swap the global `:root` tokens or the shared `sans` export and call it done — that bleeds into admin (AC-11 FAIL). Scope to the storefront.
- **Don't** bake brand looks into `src/components/ui/*` primitives — admin imports them; keep them token-driven.
- **Don't** prescribe/lock the palette or typeface in planning — the new-work roll (S2) must run; writing artifact code before `concept-seed.mjs` is dealt is a contract violation per new-work §3.
- **Don't** fabricate proof — no invented testimonials, review counts, sales figures, or press; synthetic imagery is labeled/structural (PRODUCT.md, AC-9).
- **Don't** touch the motion layer — impeccable owns look, Emil owns motion; the shipped classes stay.
- **Don't** render `next/image` from a non-allow-listed host — build/runtime error (AC-10).
- **Don't** drop the compare-at `line-through`, change the catalog grid structure, move the honeypot, or rename asserted testids — those are the only reskin-fragile e2e signals (AC-19, edge 6).
- **Don't** introduce layout-animating motion or an external font/asset CDN — perf + CSP posture.
