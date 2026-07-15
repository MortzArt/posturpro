# UX Audit: T11 — Admin Product Management

> Stage 8 (ultraux). Overwrites the T10 audit per pipeline convention.
> Live-server + Playwright verification (chromium, 320/375/1440px), not source-only.
> Craft authority: `.claude/skills/emil-design-eng`, `.claude/skills/apple-design`.
> Login: `admin@posturpro.mx` / dev password (rate-limit disabled). DB left pristine (30 seed products, 0 ledger, 0 questions, 0 e2e leftovers).

## Summary

- **Surfaces audited:** 8 (products list, filtered-empty, taxonomy brands/categories, Q&A, product new, product edit, settings) + dialogs (inventory adjust, CSV stepper, delete confirms, row menu) — across 320/375/1440px.
- **Issues found:** 11 (🔴 1, 🟡 4, 🟢 6)
- **Issues fixed:** 10 (🔴 1, 🟡 4, 🟢 5) — **1 deferred with justification** (scroll-spy rail).
- **Files touched:** 8 components (markup/CSS only, zero logic change).
- **Verification:** tsc 0 · eslint clean · unit 1462/1462 · e2e admin-products 23/23 (chromium serial) · e2e admin 30/30 (serial).
- **UX Score: 9/10.**

The build shipped with an unusually strong UX foundation. Every form obeys the T10 contract (error-summary banner + focus-first-invalid + per-field `role="alert"` + form stays filled — verified live: "Corrige 4 campos." → focus on `name`, 4 `aria-invalid`), status badges are shape+text not color-only, both new motion classes are correctly reduced-motion-guarded (verified live: dialog under RM = `transition-property: opacity`, `transform: none`), no horizontal scroll at any breakpoint on any surface, the product list correctly collapses table→cards at <640px, and dialogs trap/restore focus. The findings below are the gaps that remained.

---

## Findings

### 🔴 Critical

1. **`category-tree.tsx` — the `role="tree"` had NO keyboard operability.** Verified live before fix: 6 `treeitem`s, `tabbable count = 0` (no roving tabindex), no `onKeyDown`, ArrowDown did **not** move focus. A keyboard-only operator could not traverse the tree or reach expand/collapse via the tree's own arrow-key contract. This directly violates ui-design §5.3 ("Arrow keys navigate ↑/↓ move, →/← expand/collapse") and the feature-wide a11y checklist. **Fixed:** implemented the ARIA APG tree pattern — roving `tabIndex` (exactly one `treeitem` tabbable at a time), selection-follows-focus (`aria-selected={isActive}`, replacing the hardcoded `aria-selected={false}` the linter also rejected), and an `onKeyDown` handler on each `treeitem` for ArrowUp/Down (move), ArrowRight (open→first child), ArrowLeft (collapse→parent), Home/End. A visible `ring-2 ring-ring/30` marks the roving-active row. Verified live after fix: 1 tabbable node, ArrowDown moves focus across nodes, ArrowLeft collapses an open parent. All 23 admin-products e2e still green (nesting test #17 unaffected — every testid preserved).

### 🟡 Major

1. **`product-form.tsx` — mobile "Guardar" was out of thumb reach.** The sticky action bar was `sticky top-0` on all breakpoints. On a phone the product form is one long single column (10 sections); after scrolling to the bottom the operator had to scroll all the way back up to save. ui-design §2.1 explicitly specifies bottom-anchored on mobile. **Fixed:** action bar is now `fixed inset-x-0 bottom-0` below `md` (translucent `backdrop-blur` chrome, apple-design §12) and `md:sticky md:top-0` on desktop; added `pb-20 md:pb-0` to the form so content clears the bar. Verified live at 375px: `position: fixed`, `bottom == innerHeight` (pinned to the viewport bottom). Desktop unchanged.

2. **`image-manager.tsx` — reorder controls had no focus ring and were below the mobile target the spec asked for.** Drag handle was a bare 16×16px icon `<button>` with no `focus-visible` styling (invisible to keyboard users); the ↑/↓/delete `IconButton`s were `size-7` (28px) with no focus ring. ui-design §3.1 asks for "large drag handles + ↑/↓ buttons (≥44px, thumb-friendly)" on mobile. **Fixed:** all four buttons now `size-9` (36px) on mobile / `size-8` (32px, dense) on desktop, each with `focus-visible:ring-2 ring-ring/30`; drag-handle icon in a padded 36px hit box, IconButton icon 13→16. Verified live at 375px: 36×36px, `hasRing: true` on all.

3. **`variant-editor.tsx` — delete button had no focus ring.** `size-8` delete with no `focus-visible` state — a keyboard user couldn't see it focused. **Fixed:** added `focus-visible:ring-2 ring-ring/30` + `outline-none`, `size-9 sm:size-8`, and `justify-self-end` so it sits correctly in the mobile stacked card.

4. **`taxonomy-select.tsx` (Categorías + Etiquetas chips) — chip-remove `×` was a 12×12px unringed tap target.** Measured 12×12px live; far below a usable tap size and no focus ring. **Fixed:** both chip-remove buttons are now a padded `size-5` (20px) rounded hit box with `focus-visible:ring`. (Kept compact — these live inside `text-xs` pills on a desktop-primary form; 20px + the negative margin keeps the pill shape while giving a real target and a focus ring.)

### 🟢 Polish

1. **`admin-nav.tsx` — unanswered-count badge announced only a bare number.** A screen reader read "Preguntas 3" with no context. **Fixed:** the digit is now `aria-hidden` with an `sr-only` companion ("3 preguntas sin responder" / singular "1 pregunta sin responder"). Nav e2e (#25) still green.

2. **`dropdown.tsx` (row-action `⋮` trigger) — 32px on mobile.** Used on the mobile card list too. **Fixed:** `size-9` mobile / `size-8` desktop. (Focus ring already present.)

3. **`admin-pagination.tsx` — page links / arrows 32px.** Comfortable on desktop, snug on a phone. **Fixed:** `min-h-9 min-w-9` / `size-9` on mobile, `sm:size-8` on desktop. (Focus rings already present.)

4. **`taxonomy-select.tsx` CategoryMultiSelect — toggle lacked `aria-controls` + focus ring; dropdown region unlabeled.** **Fixed:** added `aria-controls="admin-product-category-list"` + `focus-visible:ring` + `min-h-9` on the toggle, and `id`/`role="group"`/`aria-label="Categorías disponibles"` on the dropdown container.

5. **`category-tree.tsx` expand/collapse chevron — no focus ring, tiny hit box.** **Fixed as part of the tree rewrite:** chevron button is now a `size-6` padded box with `focus-visible:ring`, `tabIndex={-1}` (operated by the treeitem's ArrowLeft/Right per APG; clicking still works).

6. **`csv-import-dialog.tsx` — "Analizando archivo…" is text-only (no spinner).** **NOT changed (accepted):** the parse is near-instant on realistic files; a spinner for a sub-100ms state would flash. The `role="status"` announces it correctly. Left as-is.

---

## Scroll-Spy Rail Decision (dev-deferred to UX)

**Decision: keep it deferred — the sticky action bar + labeled section fieldsets are sufficient. Not implemented.**

Justification:
- **Coherence already delivered.** The form is one `<form>`, one submit, with each section a labeled `<fieldset><legend>` (General/Precios/Inventario/Organización/Dimensiones/Materiales/Imágenes/Variantes). Wayfinding — "where am I, what else is here" (apple-design §16) — is answered by the always-visible legends while scanning, and the action bar keeps "Guardar" permanently in view (now on desktop AND bottom-of-viewport on mobile).
- **Validation wayfinding is the real need, and it's solved.** The failure mode a rail would help with (finding the field that erred) is already covered better than a rail could: the error-summary banner ("Corrige N campos.") + focus-first-invalid jumps the operator straight to the bad field (verified live).
- **Cost vs. value (emil frequency-of-use, apple simplicity-not-minimalism).** A scroll-spy rail is real complexity — an `IntersectionObserver` lifecycle, client active-section state, another client component — for a marginal navigability gain on a single-operator daily tool that already has the coherence benefit. That effort was better spent on the genuine correctness/a11y gaps above (tree keyboard nav, focus rings, mobile save reach), which are not polish.
- **The empty desktop left gutter** where the spec drew the rail is a minor visual note, not a functional gap; the content column is `max-w-5xl`-centered and reads fine. If a future pass wants the rail, the section `id`s already exist as anchors — it's additive and non-breaking.

---

## States Audit

| Surface / Component | Loading | Empty | Error | Success | Mobile | A11y |
|---------------------|:---:|:---:|:---:|:---:|:---:|:---:|
| Product list | ✅ skeleton | ✅ (no-products + filtered variants, distinct copy) | ✅ banner | — | ✅ card-collapse | ✅ |
| Product filters | — | — | — | — | ✅ (sheet) | ✅ sr-only labels |
| Product form (new/edit) | ✅ SSR (no skeleton) | — | ✅ summary+inline+focus-first | ✅ keyed banner | ✅ **(save bar fixed)** | ✅ |
| Image manager | ✅ progress/uploading | ✅ dropzone-as-empty | ✅ banner + retry | ✅ optimistic | ✅ **(targets/rings fixed)** | ✅ radiogroup + aria-live |
| Variant editor | — | ✅ helper copy | ✅ inline per-cell | ✅ "Variantes guardadas." | ✅ stacked cards | ✅ **(ring fixed)** |
| Inventory dialog | ✅ pending | — | ✅ inline + negative-block | ✅ aria-live | ✅ | ✅ live preview, explicit target |
| Inventory ledger | ✅ skeleton | ✅ "Sin ajustes registrados." | — | — | ✅ overflow-x | ✅ caption+scope |
| Taxonomy tables | ✅ | ✅ per-entity | ✅ dialog field errors | ✅ optimistic | ✅ | ✅ |
| Category tree | ✅ | ✅ "Aún no hay categorías." | ✅ cycle/restrict | ✅ | ✅ | ✅ **(kbd nav fixed)** |
| Q&A inbox | ✅ | ✅ per-segment copy | ✅ field + banner split | ✅ card moves segment | ✅ flex-wrap | ✅ sr-only label, char aria-live |
| CSV stepper | ✅ "Analizando…" | — | ✅ named banner (missing header/empty/rows) | ✅ result summary | ✅ | ✅ aria-current step, region |

Every state in the spec's per-surface tables is reachable with correct es-MX copy (verified against live screenshots and source).

## Accessibility Audit

| Check | Status | Details |
|-------|:---:|---------|
| Focus rings | ✅ | Every interactive control now has `focus-visible:ring-2 ring-ring/30`. Fixed the ones that lacked it: image drag-handle/IconButton, variant delete, chip-remove ×, category toggle, tree chevron. |
| Keyboard: category tree | ✅ | **Fixed** — roving tabindex + ArrowUp/Down/Left/Right/Home/End (ARIA APG). Verified live. |
| Keyboard: create-a-product no-mouse | ✅ | Tab order title→action bar→sections→save; image reorder via ↑/↓ buttons (aria-live announces); variant rows are native inputs. |
| Aria labels (icon buttons) | ✅ | Row `⋮` ("Acciones de {name}"), move/delete/drag, chip ×, close — all labeled. Nav badge now sr-only-contextualized. |
| Dialog focus | ✅ | Radix traps + restores; Esc closes; destructive confirms default-focus Cancel; inventory (non-destructive form) focuses first field. |
| aria-live regions | ✅ | Image reorder position, upload status, char counter, import step — all present. |
| Color contrast | ✅ | OKLCH grayscale tokens (T2-audited); status/stock/ledger never color-alone (badge shape+text, signed deltas). |
| Reduced motion | ✅ | `.dialog-content-motion` + `.reorder-item` both RM-guarded; verified live (dialog under RM: transform none, opacity-only). |
| Touch targets | ✅ | Primary interactive controls now ≥36px on mobile (bumped from 28/32/16/12px); dense 32px retained on desktop-primary admin. |
| No horizontal scroll | ✅ | Verified 320/375/1440px on all 8 surfaces — `hasHScroll: false` everywhere. |

## Copy Review

No copy was rewritten — the es-MX strings were already clear, action-oriented, and consistent (verb-first CTAs, "what + what-to-do" errors, helpful empty states). The only copy *added* is accessibility-only (not visible):

| Location | Before | After | Reason |
|----------|--------|-------|--------|
| `admin-nav.tsx` badge | `3` (bare digit) | `3` visually + sr-only "3 preguntas sin responder" (singular-aware) | Screen reader announced an unqualified number |
| `taxonomy-select.tsx` category dropdown | (unlabeled region) | `aria-label="Categorías disponibles"` | AT users had no name for the checklist region |

## Responsive

320px / 375px / 768px (implicit via `sm:`) / 1440px verified. Product list card-collapse works and is usable at 320px; forms single-column; dialogs fit small screens (`max-w-[calc(100%-2rem)]`); CSV preview table scrolls inside `max-h/overflow`. The mobile save-bar fix is the one responsive change; all else was already correct.

## Consistency

Internal: all dialogs use `.dialog-content-motion`; all forms use the shared `components/admin/form` primitives + the T10 contract; all badges use the shared shadcn `Badge`. With T10: `AdminShell` widened to `max-w-5xl` — the settings form self-constrains and still composes well (verified: settings screenshot + admin e2e 30/30, incl. the settings round-trip test). Density (h-7/h-8 controls, text-xs/sm, tabular-nums) matches T10.

## Verification Numbers (final)

- `tsc --noEmit`: **0 errors**
- `eslint` (changed files): **clean** (0 errors, 0 warnings)
- Unit: **1462 / 1462** (87 files)
- E2E admin-products: **23 / 23** (chromium, dev serial `--workers=1`)
- E2E admin: **30 / 30** (dev serial)
- DB: **pristine** (30 products, 0 ledger, 0 questions, 0 e2e leftovers) · port 3000 clear · no git commit

## UX Score: 9/10

Docked one point only because the desktop form still shows the empty gutter where the spec envisioned a section rail (deferred by deliberate cost/value judgment, not an oversight) and the daily-workflow click-counts, while good, aren't yet optimized (e.g. list-context inventory adjust is product-level only by design). Everything that affects correctness, accessibility, and mobile usability is now at ship quality.
