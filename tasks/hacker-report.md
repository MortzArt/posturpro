# Hacker Report: T11 — Admin Product Management (Stage 11)

Chaos-gremlin pass over the NEW T11 surfaces (product list/filters/pagination, product form, image manager, variant editor, taxonomy tree/dialogs, inventory dialog, Q&A inbox, CSV import stepper + export, nav) and the storefront as downstream victim. Prior-stage findings (dev-done M-1..M-9, m-1..m-9, nits; UX/security/arch residuals) were NOT re-hunted — this pass targets what those stages missed under adversarial input, garbage, and races.

## Summary
- Dead UI found: 0
- Visual bugs: 0 new (viewport chaos held — see coverage log)
- Logic bugs: 3 (1 CRITICAL-class data-corruption gap, 1 MAJOR double-submit, 1 MINOR CSV row-drop)
- Missing states: 0 new
- Items fixed: 3 (all found bugs)
- Investigated-not-a-bug: 2 (CSV file-state-after-error, CSV confirm double-click — both already safe by construction)
- Product improvements suggested: 5 (not implemented — scope discipline)

## Bugs Found

### CRITICAL-class — int4 integer-overflow gap (money / stock / dimensions) — FIXED
The nastiest find. Every catalog quantity column (`stock`, `*_cents` money, `width_mm`…`weight_g`) is Postgres `integer` (int4, max **2,147,483,647**). The strict parsers guarded only `Number.isSafeInteger` (≈9e15), so any value in `(INT4_MAX, MAX_SAFE_INTEGER]` — e.g. stock `3000000000`, price `$99,999,999.99` (= 9,999,999,999 cents), weight `9999999` kg — passed all validation and reached the DB.

- **Root cause:** JS safe-integer guard is ~4M× larger than the int4 column ceiling; no domain cap between them.
- **Impact:**
  - Form path → generic "No se pudo guardar" banner (opaque; operator can't tell why a plausible value failed).
  - **CSV import path** (worse): oversized `stock` showed **green "Crear"/"Actualizar" in the dry-run**, then died at confirm — and `applyImport` **echoes the raw Postgres error** (`value "3000000000" is out of range for type integer`) into the per-row failure list. That violates AC-31/32 ("every bad row surfaced in the dry-run") AND the Error-States contract ("never echoes raw PG error").
- **Fix (DRY, at the shared parser boundary):** new `INT4_MAX = 2_147_483_647` in `config/admin-products.ts`; reject `> INT4_MAX` in `parseMoneyToCents` (settings-input.ts → covers settings/product/variant/CSV money), `parseScaledInteger` (units.ts → dimensions/weight), `parseNonNegativeInt` (product-input.ts → stock), `parseStock` (variant-input.ts → variant stock), and the CSV `stock()` (csv-product-map.ts → dry-run row error "stock: fuera de rango.").
- **Result:** oversized values now fail as friendly per-field / per-row errors BEFORE any DB touch, in both the form and the CSV dry-run. Also closes a latent T10 gap (shipping flat-rate could overflow int4 the same way).
- **Regression-locked:** unit tests in `units.test.ts`, `product-input.test.ts`, `variant-input.test.ts`, `csv-product-map.test.ts` + **live e2e** `e2e/admin-products-chaos.spec.ts` (create with overflowing price/stock → field error, no redirect/write, body does NOT contain "out of range"; chromium + mobile).

### MAJOR — variant editor double-submit (Save button never disabled) — FIXED
`variant-editor.tsx` discarded the transition's pending flag (`const [, startTransition]`) and rendered `<Button onClick={onSave}>` and "Agregar variante" with **no `disabled`**. Double-clicking "Guardar variantes" fired `saveVariantsAction` twice concurrently (last-writer-wins reconcile of the variant set — the second, possibly-stale click clobbers the first). Distinct from M-6 (which fixed error KEYING, not submit gating).

- **Root cause:** pending state unbound; no submit guard on a button that stays on-screen after click (unlike the CSV confirm, which navigates away).
- **Fix:** bind `pending`, `disabled={pending}` on Save + Add, label swaps to "Guardando…", plus a defensive `if (pending) return;` re-entrancy guard in `onSave`.
- **Verified:** admin-products e2e variant test (dup-SKU add/fix/save) still green (46/46).

### MINOR — CSV parser dropped blank rows anywhere, not just trailing — FIXED
`dropTrailingBlankRows` (csv-parse.ts) used `.filter()`, silently removing **every** entirely-blank row — including one in the MIDDLE of the file. A blank data row then vanished instead of surfacing as a "Falta sku" row error, and downstream line numbers no longer matched the operator's file.

- **Root cause:** name/comment said "trailing" but implementation was "all".
- **Fix:** strip only truly-trailing blank rows (slice from the end); a middle blank row is kept and errors honestly in the dry-run.
- **Regression-locked:** `csv-parse.test.ts` (blank middle row preserved) + `csv-product-map.test.ts` (blank middle row → 1 error, 2 creates, honest counts).

## Investigated — NOT a bug (no fix, documented reasoning)
| Claim (from parallel component audit) | Verdict |
|---|---|
| CSV stepper "keeps stale file on Atrás after failed dry-run" | NOT a bug. On dry-run failure it returns to step `select` and shows the error; `onSelect` always overwrites `file` fresh, and `onConfirm` is unreachable from `select`. No wrong-file resubmission possible. |
| CSV confirm "double-click race" | NOT a bug. Confirm button is `disabled={pending}` AND `onConfirm` synchronously sets step→`result` before the transition, so the confirm button unmounts. Second click can't hit confirm. |
| Image reorder/cover "no rollback on server reject" | BY-DESIGN. ui-design + dev-done specify optimistic UI + error-banner recovery ("Recarga e intenta de nuevo"), not full state rollback. Operator always has a path back to a working screen. |
| Variant key `Math.random()` collision | THEORETICAL (~1e-15). Not worth churn. |
| `usePointerReorder` multi-touch on tablets | THEORETICAL; single-owner admin, `activeRef` lock covers the common path. |
| Upload counter "stale after tab close" | Not fixable (tab close kills the JS context) and harmless (server writes are per-request). |

## Dead UI
| # | Element | File:Line | Issue | Fixed? |
|---|---------|-----------|-------|--------|
| — | (none) | — | Every button/link/menu item wired: row ⋮ (edit/duplicate/adjust/archive), filters + "Limpiar filtros", pagination hrefs, taxonomy tabs+dialogs, CSV stepper, Q&A actions all functional (code + e2e 46/46). | n/a |

## Visual Bugs
| # | Issue | File:Line | Viewport | Fixed? |
|---|-------|-----------|----------|--------|
| — | (none new) | — | 320/375/1440 held: dialogs `max-w-[calc(100%-2rem)]`; table `overflow-x-auto`; category tree indent clamps at depth 6; stepper flex stable; mobile bottom save bar (UX S8). Long/10k-char names bounded by `PRODUCT_NAME_MAX_LENGTH=300` server-side. | n/a |

## Logic Bugs
| # | Bug | File:Line | Steps to Reproduce | Fixed? |
|---|-----|-----------|---------------------|--------|
| 1 | int4 overflow passes dry-run → raw PG error at confirm | csv-product-map.ts:110, settings-input.ts:86, units.ts:45, product-input.ts:152, variant-input.ts:117 | CSV with stock `3000000000` (or price `$99,999,999.99`) → dry-run "Crear" → confirm → raw "out of range" | ✅ |
| 2 | Variant Save double-submit | variant-editor.tsx:61,123 | Add variant → click "Guardar variantes" twice fast → two concurrent saves | ✅ |
| 3 | CSV blank middle row silently dropped | csv-parse.ts:90 | Import CSV with an empty line between data rows → row vanishes, line numbers shift | ✅ |

## Missing States
| # | Component | Missing State | File:Line | Added? |
|---|-----------|---------------|-----------|--------|
| — | (none) | Loading (dry-run "Analizando…", import "Importando…"), empty (products/questions/images), error (banners), negative-stock block — all present. | — | n/a |

## Product Improvements (NOT implemented — feed future tickets)
| # | Improvement | Impact | Effort | Priority |
|---|-------------|--------|--------|----------|
| 1 | Undo for destructive actions (archive/delete product, delete image/variant, unpublish Q&A) via a "Deshacer" toast — single-owner store, one fat-finger = lost work | High | M | P2 |
| 2 | Bulk actions on the product list (multi-select → set status / adjust stock / delete) — the operator's most repetitive task (Phase-2 deferred; prioritize) | High | L | P2 |
| 3 | CSV dry-run: inline-editable error rows (fix a bad SKU/price in the preview and re-validate without re-uploading) | High | M | P2 |
| 4 | Slug/SKU live uniqueness check (debounced) on the form before submit, instead of learning "ya existe" only after Guardar | Med | S | P3 |
| 5 | Low-stock threshold + a nav badge (like the Q&A unanswered count) surfacing products at/below it | Med | M | P3 |

## Fixes Applied
- **int4 overflow guard** (JS safe-int guard ≫ int4 column ceiling): `INT4_MAX` in `src/lib/config/admin-products.ts`; reject `> INT4_MAX` in `settings-input.ts:86` (money), `units.ts:45` (dims/weight), `products/product-input.ts:152` (stock), `products/variant-input.ts:117` (variant stock), `csv/csv-product-map.ts:110` (CSV dry-run row error).
- **Variant double-submit** (unbound pending + no submit guard): `products/variant-editor.tsx` — bind `pending`, `disabled={pending}` on Save+Add, "Guardando…" label, re-entrancy guard.
- **CSV blank-row drop** (`.filter()` removed all blanks): `csv/csv-parse.ts:90` — slice trailing blanks only.
- Regression tests: +7 unit + new live e2e `e2e/admin-products-chaos.spec.ts` (4 tests, chromium+mobile).

## Chaos Coverage Log
- **Garbage in:** 10k-char/emoji/RTL names bounded server-side; money/stock `0`/`-1`/`abc`/`1,500.00`/`0.001`/whitespace → friendly errors (existing); **`1e9`+ overflow → NEW fix**; HTML/script stored as text, React-escaped on re-render + storefront (no executing XSS — S9 + code).
- **Duplicate slug/SKU** by case: lowercased in CSV; DB 23505 → field error (existing).
- **Race/double:** variant Save → **FIXED**; CSV confirm → safe by construction; product form submit → `disabled={pending}`; image reorder/cover optimistic + banner = by-design.
- **Sequence abuse:** direct-URL nonexistent/deleted id, malformed `?page`, back/forward filter URL sync → e2e green; CSV stepper refresh/back → safe.
- **Viewport chaos:** 320/375/1440 hold (dialogs, table h-scroll, tree clamp, stepper) — UX S8 live + re-checked.
- **Data edges:** CSV blank middle row → **FIXED**; header-only/empty/missing-header/oversized rejected (existing); category depth-6 clamp intentional.
- **Storefront victim:** admin create/edit/status-flip/Q&A publish → PDP/listing reflect via cache bust; drafts never leak; prices sane (e2e create→storefront + status-flip→removed green).

## Verification Numbers
- **tsc `--noEmit`:** 0 errors.
- **eslint** (changed src incl. `max-lines`): clean.
- **Unit:** **1469/1469** passed (87 files) — 1462 baseline + **7 new**.
- **e2e admin-products:** **46/46** (23 tests × chromium+mobile) dev serial — no regression.
- **e2e admin (core):** **30/30** on a fresh dev server (2 first-run failures were the documented stale-dev-route-cache flake after reseed-without-restart; reproduced-then-cleared; settings thousand-separator + flat-rate-save green — money cap doesn't touch legit values).
- **e2e admin-products-chaos (NEW):** **4/4** (chromium+mobile) — int4-overflow live proof, no 500, no raw "out of range", no DB write.
- **DB:** reset + seed → pristine (30 products, 70 variants, 100 images, 0 ledger rows, 0 questions). Port 3000 clear. tsconfig unchanged.

## Chaos Score: 2/10
Target ≤ 3 met. T11 arrived hardened by five prior stages; this pass found one genuine data-integrity gap (int4 overflow across form + CSV, with a raw-error leak on the CSV path — highest-severity find), one trivially-reachable double-submit, and one silent CSV row-drop. All three fixed and regression-locked; the remainder of the chaos menu held. No git commit performed (per instructions).
