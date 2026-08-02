# Task: T15 — Premium visual identity & image-rich refresh

## Priority

**High** — PosturPro's brand name is final but NO visual identity exists yet (PRODUCT.md Brand Commitments); the storefront currently ships the neutral create-next-app grayscale token world (`oklch(… 0 0)` everywhere). The owner volunteered a binding direction: the site must feel **premium** and **image-rich**. Every downstream launch task depends on this landing first — T16 (B2B landing) is explicitly "follows the T15 visual world," and T14 (SEO/perf/launch hardening) must run LAST so its metadata/sitemap/image-perf pass covers the final reskinned surfaces. Shipping launch on the neutral world would undercut all three positioning pillars (ergonomics authority, curated multi-brand, value-for-money) the store is built to sell.

## Complexity

**medium** — justified against the criteria:

- **Not low:** far more than a pattern-copy or bug fix. Touches every storefront surface (11 routes, ~40 storefront components), replaces the entire design-token world, introduces a new font pairing and a new config-driven image-slot system. That is architectural surface, not a <5-file change.
- **Not high:** despite the breadth, this is a **token + asset + per-surface-application** reskin, NOT a new subsystem or data model. There are ZERO new database models, ZERO new migrations, ZERO new API endpoints, ZERO backend/business-logic changes, ZERO new dependencies beyond possibly a second `next/font` family. The token-swap seam already exists and is centralized (one `:root`/`.dark` block in `globals.css` + one `--font-sans` binding in `src/app/fonts.ts`), the image-slot pattern already exists (`HERO_IMAGE`/`SHOWROOM_MAP_IMAGE` config nulls degrading to token panels), the motion layer is already shipped and reused, and every surface already flows brand color/radius/font through token utilities. The work is broad but bounded, follows existing patterns, and adds new visual language + assets rather than new logic. That is textbook **medium** (new feature/visual system, follows existing patterns, adds new UI). The standard tier (PlanResearch → UI Design → Dev → ReviewFix → QA) is the right depth; auto-classify keeps it on the standard flow.

The file count leans toward the top of medium; the mitigating factor that keeps it out of high is that the changes are homogeneous (token/class/asset application), reversible-by-token, and add no logic paths to test.

## Feature Type

**`ui-only`** — a pure visual/token/asset/typography reskin plus image-slot scaffolding. No hooks, no data-fetching, no state, no utils, no server actions change behavior. Per the CLAUDE.md Feature-Type rules, the UI Design stage (S2) runs at FULL depth (it is the heart of this task — the impeccable new-work flow), and Dev/ReviewFix/QA focus on visual application, regression-safety, a11y/perf floors, and the no-admin-regression boundary. QA is scoped to "the reskin broke nothing," not "new logic is correct" (there is none).

## User Story

As a **mobile-heavy Mexican shopper evaluating a quality chair**, I want **a storefront that looks and feels genuinely premium and image-rich the moment it loads**, so that **I trust PosturPro's ergonomics authority, curated multi-brand breadth, and value promise enough to buy online without a phone call** — while the owner keeps a single-token brand-swap seam and an asset-swap-ready image system so real photography and any future rebrand drop in without layout rework.

## Background

**What exists today (the neutral world = the anti-reference to replace):**

- All color/radius live in ONE `:root` (+ `.dark`) block in `src/app/globals.css` (lines 51–131). Every value is grayscale `oklch(L 0 0)` — the literal create-next-app neutral default. `--radius: 0.625rem`. There is NO brand hue anywhere.
- The single storefront font is `Inter` bound to `--font-sans` in `src/app/fonts.ts`. `--font-heading` currently *aliases* `--font-sans` (globals.css:12) — there is no real display face.
- A rich, shipped motion layer (~20 CSS classes: `.enter-fade`, `.stagger`, `.card-lift`, `.link-arrow`, `.gallery-image`, `.cart-*`, `.drawer-*`, `.dialog-content-motion`, etc.) with `--ease-out`/`--ease-in-out`/`--ease-drawer` tokens, all `prefers-reduced-motion`-gated and hover-capability-gated. **This is the Emil motion authority and is NOT brand — it stays.**
- Image-slot pattern already established: `HERO_IMAGE`, `SHOWROOM_MAP_IMAGE`, `SHOWROOM_MAP_URL` in `src/lib/config/static-pages.ts` are `string | null`, and every consumer degrades a `null` to a token-tinted glyph panel (never a broken `<img>`). Product images flow from the DB (picsum placeholders via `SEED_IMAGE_BASE_URL`) through `next/image`; `next.config.ts` allow-lists picsum + the Supabase Storage host.
- There is **no `public/` directory yet** — new lifestyle/editorial image assets have nowhere to live and must be scaffolded.
- The storefront is ~95% token-clean for BRAND color, but ~12 files hardcode SEMANTIC status colors (amber for warning/OXXO-SPEI-pending/low-stock, emerald for success/discount/free-shipping) — always paired with glyph+text (colorblind-safe). See Research Report §1.

**What's missing:** a committed premium visual world (palette, type pairing, spatial system, material language, signature composition) and image-rich art direction on every page. Creating this identity is IN SCOPE per PRODUCT.md — it is not a waiting-on-client gap.

**Why the visual world is decided in S2, not here:** this ticket SCOPES the work. The impeccable skill's new-work flow (`.claude/skills/impeccable/reference/new-work.md`) owns choosing the world: it runs `concept-seed.mjs` to deal a direction, may serve a decision page, generates comp sketches, builds with full commitment, runs the finish reviewer, and writes `DESIGN.md` from the built world. **This ticket MUST NOT prescribe a palette, typeface, aesthetic, or "premium look" — doing so pre-empts the roll that keeps the design out of the category default.** The ticket's job is boundaries, image-slot architecture, the admin firewall, and the a11y/perf/test floors the chosen world must satisfy.

**The load-bearing constraint (biggest risk, see Edge Cases + Research Report):** the brand tokens AND the font AND 5 shadcn ui primitives are physically SHARED between storefront and admin. The `:root` token block, the `sans` font export (`@/app/fonts`, imported by both `[locale]/layout.tsx` and `admin/layout.tsx` and `not-found.tsx`), and `src/components/ui/{button,badge,alert-dialog,dialog,tabs}.tsx` all feed admin. A naive "swap `:root` for the brand" or "swap the `sans` export" flows straight into the admin dashboard — which the ticket requires to stay UNTOUCHED. The reskin must be scoped to the storefront subtree, not applied at a seam admin also drinks from.

## Acceptance Criteria

Each criterion is binary — PASS or FAIL.

**Design authority & documentation**

- [ ] AC-1: The impeccable new-work flow was run for the storefront (concept-seed direction dealt/acknowledged; commitment recorded), and `DESIGN.md` exists at the repo root, written from the BUILT world (not before the build), documenting the committed palette, type system, spacing/radius system, material language, and image art-direction rules.
- [ ] AC-2: The direction contract (5-block THESIS/OWN-WORLD/STORY/FIRST VIEWPORT/FORM + FINISH line) is present in the emitted markup as an HTML comment in the storefront root layout body, and survives the production build (greppable in built output).

**Token replacement (the brand-swap seam stays centralized & swappable)**

- [ ] AC-3: The neutral grayscale token world is replaced with the committed premium palette. All brand color/radius values still live centrally in `src/app/globals.css` `:root` (+ `.dark` if a dark theme is committed) — no storefront component hardcodes a raw hex/oklch/rgb brand color or a raw radius; every brand value flows through a token utility (`bg-primary`, `text-foreground`, `border-border`, `rounded-md`, etc.).
- [ ] AC-4: A single-token brand-swap remains true: editing only the `:root`/`.dark` values (and the font binding) re-skins the storefront, with no component-level color edits required. The "Brand Tokens" documentation block in `globals.css` is updated to reflect the new world and the (possibly expanded) token set.
- [ ] AC-5: The typography system is upgraded to the committed premium pairing. If a display/heading face is introduced, it is wired via a real `--font-heading` binding (no longer aliasing `--font-sans`) and consumed by headings across storefront surfaces; body/heading faces load via `next/font` with `display: "swap"` and subsets sufficient for full es-MX glyph coverage (á é í ó ú ñ ¿ ¡ — ~160 accented chars in messages, Latin Extended-A required).

**Per-surface application (every storefront surface reflects the new world)**

- [ ] AC-6: The premium world is applied to ALL storefront surfaces, each visibly reflecting the committed identity (not the residual neutral look): homepage (hero + featured), catalog surfaces (`/sillas`, `/marcas`, `/categorias`, `/estilos` + their `[slug]` pages, product grid/cards, filters/toolbar), PDP (`/producto/[slug]` — gallery, purchase panel, specs, Q&A, recently-viewed), cart (`/carrito`), checkout shell (`/checkout` + confirmation `/checkout/confirmacion/[token]`), all 9 static pages incl. contact & showroom, and the persistent shell (header, footer, mobile nav, WhatsApp FAB) + the localized 404 and `error.tsx`.
- [ ] AC-7: The persistent chrome (header wordmark/nav, footer, mobile drawer, language toggle, WhatsApp FAB) reflects the new identity while preserving every existing structural affordance and `data-testid`. The WhatsApp FAB stays a recognizable WhatsApp affordance (currently `bg-primary` — if the brand primary is no longer WhatsApp-green, S2 decides whether the FAB gets a dedicated brand/green token so it reads as WhatsApp).

**Image-slot system (image-rich, asset-swap-ready, no fabricated proof)**

- [ ] AC-8: An image-slot system exists for lifestyle/editorial imagery on the image-rich surfaces (at minimum: homepage hero + at least one homepage editorial/lifestyle band, and art-directed image slots defined for catalog/category and static/showroom surfaces per DESIGN.md). Every slot is config-driven (extends the existing `HERO_IMAGE`-style `string | null` config pattern under `src/lib/config/`), and every slot degrades gracefully to a token-styled placeholder when its asset is `null` — never a broken `<img>`, never layout collapse (the slot reserves its aspect box).
- [ ] AC-9: Placeholder imagery is either high-quality licensed stock with verified-resolving URLs, or generated via the impeccable `generate-image.mjs` script, and is stored so a real-asset swap needs no layout rework (config path or `/public` asset swap only). Any synthetic imagery that a visitor could mistake for real proof is labeled/structured as placeholder. NO fabricated testimonials, customer names, review counts, sales figures, or press appear on any surface (PRODUCT.md Evidence posture — hard rule).
- [ ] AC-10: `next.config.ts` `images.remotePatterns` allow-lists any new external image host used by placeholder assets (or assets are local under `/public`); no `next/image` renders from a non-allow-listed host (build/runtime would error).

**No-admin-regression (the firewall — binding)**

- [ ] AC-11: The `/admin` subtree is visually UNCHANGED by this task. The admin dashboard does not inherit the storefront's new brand palette or new display font. Verified by: (a) admin renders with its own (or the neutral) token/font world, and (b) the reskin does not edit any file under `src/components/admin/` or `src/app/admin/`, and does not change the shared `src/components/ui/*` primitives in a way that alters admin's appearance.
- [ ] AC-12: The scope-boundary mechanism is explicit and documented: the new brand palette and display font are applied via the storefront root (`src/app/[locale]/layout.tsx`) / a storefront-scoped selector, NOT via the shared `sans` export or a shared seam that admin also consumes — OR admin explicitly opts out. Whichever mechanism is chosen, `DESIGN.md`/dev-done documents it so a future rebrand keeps the firewall.

**Accessibility & performance floors**

- [ ] AC-13: WCAG AA contrast holds on every storefront surface in the new world — body text, headings, muted text, buttons, links, badges, form fields, and all text over imagery (hero/lifestyle overlays included) meet AA (4.5:1 normal, 3:1 large). Status semantics remain glyph+text (never color-only). Focus rings remain visible against the new backgrounds.
- [ ] AC-14: `prefers-reduced-motion` is honored on every surface (the existing gated motion layer is preserved; any new motion added by the reskin is `ease-out` on enter, `transform`/`opacity` only, interruptible, and RM-gated per the Emil rules in CLAUDE.md — impeccable owns look, Emil owns motion).
- [ ] AC-15: The reskin does not regress performance: images use `next/image` with correct `sizes`/`priority` (LCP hero `priority`), no layout shift is introduced (image slots reserve aspect boxes, `min-h` reservations preserved), and no render-blocking font/asset is added that measurably worsens load. Font subsetting keeps the added type bundle bounded.

**Bilingual parity, money, responsiveness, test-suite green**

- [ ] AC-16: Bilingual parity is preserved — es-MX and en storefront message files stay symmetric (equal key sets, currently 614 lines each); any NEW visible copy the reskin introduces (e.g. an editorial-band headline, image alt text) is added to BOTH `src/messages/es-MX.json` and `src/messages/en.json` in lockstep, with no hardcoded visible strings.
- [ ] AC-17: Integer-MXN-cents money display is unchanged — prices still render via `formatMXN`, `tabular-nums` alignment preserved, compare-at line-through preserved.
- [ ] AC-18: Mobile-first responsiveness holds: no horizontal overflow at 320/375/768/1024/1280px on any storefront surface; the new world is designed mobile-first with desktop as the enhancement (PRODUCT.md principle "the phone is the store").
- [ ] AC-19: The full test suite stays green after the reskin: `tsc --noEmit` clean, `eslint` clean on all touched files, unit + integration suites pass, and the storefront e2e suite passes. The storefront e2e suite asserts NO colors/fonts/computed-styles (confirmed — Research Report §2), so a visual reskin should not break e2e; the only reskin-fragile e2e assertions are STRUCTURAL (grid columns, compare-at `line-through`, honeypot off-screen `left`) — those structural signals MUST be preserved. Every `data-testid` asserted by the storefront e2e suite is preserved (or its rename is reconciled in the spec and justified). NO product behavior regresses.

## Edge Cases

1. **Shared-seam bleed into admin (the headline risk).** The dev swaps the `:root` tokens or the `sans` font export and the admin dashboard silently inherits the storefront brand color/display font → AC-11/AC-12 FAIL. Expected: the reskin is scoped so admin renders exactly as before; verify by screenshotting `/admin/login` and an authed admin page before/after and confirming no palette/font change.
2. **Shared ui-primitive drift.** `src/components/ui/{button,badge,alert-dialog,dialog,tabs}.tsx` are imported by admin (24× button, 8× badge, 5× alert-dialog, 4× dialog, 2× tabs). If the reskin restyles these primitives directly, admin's buttons/badges/dialog titles change too (note `dialog.tsx`/`alert-dialog.tsx` consume `font-heading`). Expected: primitives keep flowing through tokens; any storefront-specific treatment is applied at the storefront call-site or via storefront-scoped tokens, not baked into the shared primitive.
3. **Null image slot (no real photography exists).** Every new image slot must render its token placeholder when the asset is `null` (the Phase-1 default) — no broken image, no collapsed layout, aspect box reserved so zero CLS whether the asset is present or absent. Expected: hero and every new lifestyle band look intentional and premium even with all assets `null`.
4. **es-MX accented glyphs in a display face.** The committed premium heading face may lack full Latin-Extended coverage; Spanish copy is accent-heavy (¿ ¡ ñ á é í ó ú appear ~160× in es-MX messages). A face missing glyphs falls back mid-word and looks broken. Expected: the chosen faces cover es-MX glyphs (correct `next/font` subsets), verified on a Spanish-heavy heading (e.g. a category title with "ñ"/"í" / a "¿…?" question).
5. **Text-over-image contrast failure.** An image-rich hero/lifestyle band places text over a photo; a light-on-light or dark-on-dark region drops below AA. Expected: overlays/scrims/text-shadows or a committed contrast strategy guarantee AA on every text-over-image region, including when a real photo (unknown luminance) later swaps into a slot.
6. **e2e testid/text/structural-assertion breakage.** The storefront e2e suite asserts many `data-testid`s and a few STRUCTURAL computed styles (grid `gridTemplateColumns` in catalog, compare-at `textDecorationLine: line-through` in PDP, honeypot off-screen `left` in contact/mobile-filter). A reskin that renames a testid, drops the `line-through`, changes the grid structure, or moves the honeypot breaks e2e. Expected: preserve all asserted testids and those structural signals; if a rename is warranted, update the spec in lockstep and justify it.
7. **Dark mode divergence.** A `.dark` block exists (globals.css:99–131). If the committed world is light-only, the reskin must decide what `.dark` does (drop it, or make it a real committed dark theme) — leaving stale neutral `.dark` values half-applied yields a broken dark experience if any surface triggers it. Expected: `.dark` is either fully re-committed to the new world or intentionally decommissioned, documented in DESIGN.md.
8. **`global-error.tsx` hardcoded inline styles.** The catastrophic root error boundary uses hardcoded hex (`#666`/`#111`/`#ccc`/`#fff`) + `system-ui` by design (it replaces the whole document and cannot rely on tokens/providers). Expected: this remains an intentional, documented exception — the reskin does NOT need to token-ify it, but should confirm the bilingual fallback message still reads acceptably and note the exception so a reviewer does not flag it as a token violation.
9. **Semantic status colors (amber/emerald) in the new palette.** ~12 storefront files hardcode `text-amber-*`/`text-emerald-*` for warning/success semantics (OXXO-SPEI pending, low-stock, discount applied, free-shipping achieved). Expected: S2/dev decides one consistent treatment — either keep them as orthogonal status semantics (they are always glyph+text, AA-safe) or promote them to `--warning`/`--success` tokens; either way, apply it consistently across all ~12 files and keep AA + glyph+text. Do NOT leave a mix of the old neutral world's amber next to the new brand's other colors clashing.

## Error States Table

| Trigger | User Sees | System Does |
| ------- | --------- | ----------- |
| Image slot asset is `null` (Phase-1 default) | Token-styled placeholder panel with a glyph in the slot's reserved aspect box — premium, intentional, never broken | Config value `null` → component renders fallback branch; no network request, no CLS |
| Real image URL 404s / fails at runtime | `next/image` empty box within the reserved aspect ratio (no layout jump); alt text present | Slot reserves aspect box; error logged if applicable |
| New image host not allow-listed in `next.config.ts` | Build fails (or `next/image` throws at runtime) | Caught in dev/CI before ship; host added to `remotePatterns` or asset moved to `/public` |
| Display font glyph missing for a Spanish accent | Fallback-font glyph mid-word (visible defect) | Prevented at build by correct `next/font` subset selection — a selection-time guarantee, not runtime recovery |
| `store_settings` read fails (footer/header) | Store name falls back to `SEED_STORE_NAME`; free-shipping line omitted (existing degrade, unchanged) | Existing `getStoreSettingsStatic` null-degrade preserved by the reskin |
| Catastrophic root-layout error | Neutral bilingual "Algo salió mal / Something went wrong" screen (system-ui, hardcoded styles) | `global-error.tsx` replaces the document; intentional token-free exception (edge 8) |

## UX Requirements

For every state a storefront surface can be in, in the new world (the reskin must not lose any existing state treatment):

- **Loading:** existing skeletons (`catalog-skeleton`, `pdp-skeleton`, `checkout-skeleton`, `cart-skeleton`) are restyled to the new token world (they must read as the premium brand, not neutral gray) while preserving their layout-reservation role (no CLS). Hero LCP image (if present) is `priority`.
- **Empty:** catalog no-results, empty cart, empty checkout, empty featured-sections keep their existing empty-state components and CTAs, restyled to the new world with the same wayfinding.
- **Error:** localized 404 and `[locale]/error.tsx` reflect the new world (restyled, testids preserved); `global-error.tsx` stays the neutral bilingual exception.
- **Success:** order confirmation, add-to-cart feedback, discount-applied, free-shipping-achieved keep their success semantics legibly in the new palette — AA preserved, glyph+text preserved.
- **Mobile (375px):** every surface designed mobile-first; no horizontal overflow; hero/lifestyle images stack sensibly; nav collapses to the drawer; touch targets ≥ 44px preserved.
- **Tablet (768px):** grids and split layouts (hero copy/image, PDP gallery/purchase, checkout summary) reflow at their existing breakpoints, restyled; no dead space or overflow.

## Technical Approach

> The specific palette, faces, radius scale, spacing rhythm, image compositions, and signature interaction are decided by S2 (impeccable new-work) and recorded in DESIGN.md — NOT prescribed here. Below is the structural approach the chosen world plugs into.

### Files to Create

- `DESIGN.md` (repo root) — written by the impeccable documenter at finish, from the built world (AC-1).
- `public/` (directory) + placeholder image assets — the asset home that does not exist yet; lifestyle/editorial/hero placeholders live here (or on an allow-listed host).
- New storefront-scoped homepage editorial/lifestyle section component(s) under `src/components/home/` (e.g. an editorial band) as the committed direction requires — reusing the existing `Hero`/`section-header` grammar where possible.
- (If the world uses a storefront-scoped font/theme wrapper rather than global `:root`) a thin storefront theme wrapper/class — see Files to Modify, AC-12.

### Files to Modify

- `src/app/globals.css` — replace the neutral `:root` (+ `.dark`) token values with the committed palette/radius; update the "Brand Tokens" doc block; add a real `--font-heading` binding if a display face is introduced; preserve the entire motion layer and the `.static-heading:target`/status conventions verbatim.
- `src/app/fonts.ts` — introduce the committed body/heading `next/font` families with es-MX-covering subsets. **Scope carefully:** this export is shared with admin + `not-found.tsx` (AC-12) — the new brand font must reach storefront without changing admin's font (e.g. a separate storefront font binding, or the display face applied only under the storefront layout).
- `src/app/[locale]/layout.tsx` — apply the storefront-scoped brand theme/font wrapper; add the direction-contract HTML comment as the first body child (AC-2). This is the storefront firewall boundary.
- `src/lib/config/static-pages.ts` (and/or a new `src/lib/config/` image-slot module) — add config-driven `string | null` slots for any new lifestyle/editorial imagery, mirroring the `HERO_IMAGE` pattern.
- `next.config.ts` — add any new image host to `images.remotePatterns` (AC-10), if placeholders are not local.
- Storefront surface files as needed to APPLY the world (homepage `page.tsx`, `Hero`, product-card, catalog toolbar/filters, PDP components, cart/checkout shells, static-page body, header/footer/mobile-nav/whatsapp-button, 404/error) — primarily className/token/asset-slot edits, plus the ~12 semantic-color files (Research Report §1) reconciled consistently.
- `src/messages/es-MX.json` + `src/messages/en.json` — any new visible copy the reskin introduces, in lockstep (AC-16).
- Storefront e2e specs — ONLY where an intended structural/testid change requires reconciliation (AC-19).

### Data Model Changes

- **None.** Zero migrations, zero schema changes, zero DB writes. (Migrations remain at 0013; next is 0014, untouched by T15.)

### API Endpoints

- **None.** No new or changed routes/handlers/server actions. Pure presentation-layer task.

### Dependencies

- **Likely none new.** At most a second `next/font/google` (or `next/font/local`) family import — no new npm package. If the committed world genuinely needs a new package (e.g. a font not on Google Fonts, delivered as a local font file), it is added minimally, justified in dev-done, must not bloat the client bundle or violate the CSP posture. Prefer `next/font` (self-hosted, no external request) over any runtime web-font CDN.

## Out of Scope

- Any change to the `/admin` subtree (`src/app/admin/*`, `src/components/admin/*`) or to shared `src/components/ui/*` primitives in a way that alters admin's appearance (AC-11 forbids it).
- Backend, business logic, data model, migrations, API routes, server actions, payment/checkout/order logic, email templates, packing slips.
- T16's B2B landing page (separate task; follows this world).
- T14's SEO/analytics/sitemap/structured-data/cookie-consent/error-monitoring work (runs LAST, after this).
- Real photography, real testimonials, real showroom address/map, real legal copy — all remain owner-provided placeholders; the reskin structures slots for them but does NOT fabricate them.
- Rich-text page editing, customer accounts, discount-code management UI, or any Phase 2 feature.
- Re-architecting the motion layer — the shipped Emil motion classes are the motion authority and are preserved.
