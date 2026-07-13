# Code Review: T4 — Product Detail Page (`/producto/[slug]`)

Reviewer: ultrareview (Stage 5). Scope: all 22 files in commit `9da6e40`, against
`tasks/next-ticket.md` (20 ACs + 10 edge cases), `tasks/ui-design.md` (M1–M9, states,
copy), and `tasks/dev-done.md`. Adversarial, line-by-line.

## Summary

Strong, disciplined implementation that honors the T3 patterns (view-only reads, cache-key
bounding, cookie-free client, pre-resolved server i18n, single selection island). The write
path is correctly anon+RLS with layered guards, message parity is exact, and the motion is
compositor-friendly and reduced-motion-gated. However there is **one correctness bug that
ships wrong data to users** (recently-viewed low-stock label), **two real memory/rate-limit
DoS vectors on the new public write path**, and several minor gaps. No secrets, no XSS, no
cost-data leak.

Counts: **Critical 0 · Major 4 · Minor 6 · Nit 4.**

Recommendation: **REQUEST CHANGES** — M-1 (wrong stock label) and M-2/M-3 (write-path DoS)
should be fixed before ship; the rest are quick.

---

## Major Issues (SHOULD FIX)

### M-1: Recently-viewed tiles show the CURRENT product's low-stock count on every tile
- **ID**: M-1
- **Severity**: MAJOR (visible wrong data)
- **File**: `src/app/[locale]/producto/[slug]/page.tsx:134-144`, consumed in
  `src/components/product/recently-viewed.tsx:72-83`
- **Problem**: `cardLabels.stockByState.low` is resolved **once** on the server using the
  *current* product's effective stock:
  `low: tCatalog("stock.lowStock", { count: effectiveStock(product.stock, product.variants) })`.
  The recently-viewed strip then applies that single frozen string
  (`stock: cardLabels.stockByState[entry.stockState]`) to **every** low-stock tile,
  ignoring each stored entry's own `lowStockN`. A tile for product B with `lowStockN=2`
  will render "Solo quedan 5" if the page you are on (product A) has 5 in stock.
- **Impact**: Every low-stock recently-viewed tile except the current product displays an
  incorrect remaining-count. `RecentlyViewedEntry.lowStockN` is stored specifically to
  avoid this (types + `toRecentlyViewedEntry` populate it) but is never read.
- **Suggested Fix**: In `recently-viewed.tsx`, resolve the low-stock label per-entry from
  `entry.lowStockN`, not from a pre-baked map. Either pass a `lowStockTemplate` string down
  and `interpolate(template, { count: entry.lowStockN ?? 0 })` for `low` entries (mirrors
  the existing `colorsCountTemplate` pattern already in this file), or pass a
  `lowStockLabel(n)` resolver. Drop the `count`-baked `stock.lowStock` from `stockByState`.
- **Status**: FIXED — `recently-viewed.tsx` now resolves each tile's stock label
  per-entry via `resolveStockLabel(entry, labels)`: `low` tiles interpolate
  `lowStockTemplate` with `entry.lowStockN ?? 0` (mirrors the `colorsCountTemplate`
  pattern and `product-grid.tsx`), `in`/`out` use static labels. The frozen
  `stockByState` map (with the current product's baked count) is gone;
  `RecentlyViewedCardLabels` now exposes `inStock`/`outOfStock`/`lowStockTemplate`.
  `page.tsx` passes `lowStockTemplate: tCatalog.raw("stock.lowStock")` (no `count`).

### M-2: Rate-limiter map grows unbounded on attacker-supplied `productId` (memory DoS)
- **ID**: M-2
- **Severity**: MAJOR (first public write path; memory exhaustion)
- **File**: `src/app/[locale]/producto/[slug]/actions.ts:80-114`,
  `src/lib/qa/submit-guard.ts:85-122`
- **Problem**: The action validates only `!productId` (empty check at `actions.ts:94`) — it
  never checks the id is a UUID or a real product. The rate-limit key is
  `${ip}|${productId}` and the map entry is created **before** the DB insert
  (`checkRateLimit` at line 105, insert at 114). An attacker rotating `productId` (arbitrary
  strings) — combined with a spoofable IP (see M-3) — mints an unbounded number of distinct
  `submissionLog` keys, each holding a timestamp array, with no global cap and no key-count
  eviction. Pruning only removes *expired timestamps within a key*, never removes empty/idle
  keys. This is the exact cache-key-cardinality class T3 hardened against (`MAX_PAGE`), left
  unbounded here.
- **Impact**: Sustained requests grow server memory without bound until OOM; per-instance,
  but trivially triggered. The RLS insert failing for a bogus product does not help — the
  map entry already exists.
- **Suggested Fix**: (a) Validate `productId` is a UUID (`/^[0-9a-f-]{36}$/i`) before
  `checkRateLimit`; return `invalid` otherwise. (b) Add a hard ceiling on
  `submissionLog.size` in `checkRateLimit` (evict when a key count cap is exceeded, or prune
  fully-empty keys). (c) Consider keying the limiter on `ip` alone (or `ip|slug` where slug
  is already bounded by `isCacheableSlug`) rather than the raw `productId`.
- **Status**: FIXED — (a) `submit-guard.ts` exports `isValidProductId`
  (`UUID_PATTERN`, anchored/fixed-length, no ReDoS); the action validates
  `productId` as a UUID in step 2 (`!isValidProductId(productId)` → `invalid`)
  BEFORE it keys the limiter or hits the DB, so arbitrary strings can no longer
  mint keys. (b) `checkRateLimit` now deletes empty keys implicitly and enforces
  a hard `QA_RATE_LIMIT_MAX_KEYS = 10_000` ceiling via `evictToCeiling` (prunes
  fully-expired keys, then oldest-inserted keys) before inserting any NEW key —
  map size is bounded regardless of input. Added test-only `rateLimitKeyCount()`.

### M-3: Rate limit is trivially bypassed via `X-Forwarded-For` spoofing
- **ID**: M-3
- **Severity**: MAJOR (rate-limit bypass on public write)
- **File**: `src/app/[locale]/producto/[slug]/actions.ts:58-68`
- **Problem**: `clientIp()` trusts the *first* comma value of the client-supplied
  `x-forwarded-for` header (`headerList.get("x-forwarded-for")` → `split(",")[0]`). That
  header is fully attacker-controlled unless a trusted proxy overwrites it. An attacker sets
  a fresh `X-Forwarded-For` per request and the per-IP limiter never trips — the honeypot is
  then the only spam control. This also feeds M-2 (each spoofed IP is a new map key).
- **Impact**: `QA_MAX_SUBMISSIONS_PER_WINDOW` (3/min) is not enforced against any determined
  client; unlimited RLS-valid inserts into `product_questions` (moderation queue flood) plus
  unbounded map growth. The ticket accepts "best-effort in-memory," but a header a caller can
  freely rewrite is effectively *no* limit, not best-effort.
- **Suggested Fix**: Only trust the forwarded chain when a trusted-proxy contract exists;
  otherwise take the *last* XFF hop appended by your own proxy, or read the platform's
  trusted IP header (e.g. Vercel `x-vercel-forwarded-for` / `request.ip`). At minimum
  document that this limiter assumes a trusted edge that overwrites XFF, and combine with
  M-2's global cap so spoofing cannot amplify memory. (`unknown` already collapses all
  no-IP callers into one bucket — fine.)
- **Status**: FIXED — `clientIp()` rewritten with a documented trust model for
  the Vercel deployment target (README/Geist): prefer `x-vercel-forwarded-for`
  (single value injected by Vercel's trusted edge, not spoofable behind Vercel);
  else the RIGHTMOST hop of `x-forwarded-for` (the address appended by the closest
  trusted proxy — leftmost hops are client-forgeable); else `x-real-ip`; else the
  shared `"unknown"` bucket. No longer trusts `split(",")[0]`. RESIDUAL RISK
  documented in code + dev-done: on a deployment with NO trusted edge overwriting
  XFF the limiter is only best-effort (per the ticket) — the honeypot and M-2's
  hard map cap are the backstops that stop spoofing from amplifying into memory.

### M-4: `defaultVariant` helper is dead; panel duplicates the default-selection logic
- **ID**: M-4
- **Severity**: MAJOR (ticket-mandated helper unused + duplicated logic → drift risk)
- **File**: `src/lib/catalog/variant-selection.ts:78-82` (exported, never imported),
  `src/components/product/product-purchase-panel.tsx:79-86`
- **Problem**: The ticket's Technical Approach explicitly lists
  `variant-selection.ts` … `defaultVariant` as a helper, and dev-done claims it. It is
  exported but never used (`grep` finds no import). The panel instead inlines the default
  (`variants[0]?.id ?? ""`) *and* re-derives the fallback selected variant
  (`variants.find(...) ?? variants[0]`). Two independent copies of "the default variant is
  index 0" — violates DRY and the CLAUDE.md "no dead code" rule.
- **Impact**: If the default-selection strategy ever changes (e.g. first in-stock), the
  helper and the panel can silently diverge; and an exported-but-unused symbol is dead code
  git-should-remember.
- **Suggested Fix**: Have the panel use `defaultVariant(variants)` for both the initial
  `useState` seed and the `selectedVariant` fallback, or delete `defaultVariant` if the
  inline form is preferred. Do not ship both.
- **Status**: FIXED — `product-purchase-panel.tsx` now imports and uses
  `defaultVariant(variants)` for BOTH the initial `useState` seed
  (`defaultVariant(variants)?.id ?? ""`) and the `selectedVariant` fallback
  (`... ?? defaultVariant(variants)`). The two inline `variants[0]` copies are
  gone; "the default variant is index 0" lives in one place. Helper no longer dead.

---

## Minor Issues (NICE TO FIX)

### m-1: `generateMetadata` does not truncate the description (AC-3 says "truncated")
- **File**: `src/app/[locale]/producto/[slug]/page.tsx:74-76`
- **Problem**: AC-3 and the ticket error table specify a *truncated* product description;
  the code passes `product.description?.trim()` in full. (Mitigating: AC-3 also says "mirrors
  the brand page," and `marcas/[slug]/page.tsx:48` also passes the description untruncated,
  so this is a consistent codebase pattern and search engines truncate anyway.)
- **Suggestion**: Either add a `MAX_META_DESCRIPTION` slice (≈155–160 chars, single-sourced
  in `config.ts`) to satisfy the literal AC, or update AC-3 to accept the brand-page pattern.
  Given the design/ticket tension, flag for the fix stage to decide — do not silently ignore.
- **Status**: FIXED — chose to satisfy the literal AC. Added `MAX_META_DESCRIPTION = 160`
  and pure `truncateForMeta(text)` (word-boundary slice + ellipsis) in `config.ts`;
  `generateMetadata` truncates the product description (fallback message untouched).

### m-2: `next/image` in the zoom lightbox hardcodes 1200×1500 for every image
- **File**: `src/components/product/product-gallery.tsx:100-107`
- **Problem**: The full-res lightbox `<Image width={1200} height={1500}>` forces a 4:5 aspect
  on all images; a landscape or square source is letterboxed by `object-contain` but the
  declared intrinsic ratio is wrong. Seed images are square (picsum 800×800), so this is
  currently visible as vertical padding.
- **Suggestion**: If image dimensions aren't in the model, either use `fill` within a
  ratio-agnostic container, or carry width/height in `ProductImageView`. Low urgency (visual
  only), but the 4:5 assumption is a magic pair with no constant.
- **Status**: FIXED (magic-pair removed) — extracted the nominal dimensions to named
  constants `LIGHTBOX_NOMINAL_WIDTH`/`LIGHTBOX_NOMINAL_HEIGHT` in `product-gallery.tsx`
  with a doc block noting they are a nominal upper bound only; the real fit is done by
  `object-contain` inside `max-h-[90vh] max-w-[90vw]`, so any source aspect letterboxes
  correctly. Did NOT carry width/height into `ProductImageView` (out of T4 model scope);
  `fill` would letterbox within the full 90vw×90vh box rather than shrink-wrap, so the
  intrinsic form is kept — the magic literal (the actual finding) is gone.

### m-3: no-variant `aria-live` region announces nothing (confirm intent)
- **File**: `src/components/product/product-purchase-panel.tsx:107-110`, `:170-177`
- **Problem**: For a no-variant product `liveStatus` is `""`, so the `aria-live` region is
  empty. Per design this region is variant-selection feedback and price/stock are statically
  in the DOM at load, so this is acceptable — noted so the fix/QA stage doesn't "fix" it into
  announcing on load (which would be noise). Not a defect.
- **Status**: SKIPPED (not a defect) — the reviewer explicitly flagged this as
  intended behavior; "fixing" it into announcing on load would be a11y noise. Left as-is.

### m-4: no composite index for the published-question read
- **File**: `src/lib/catalog/product-detail.ts:214-234`; index in
  `supabase/migrations/0004_content_qa.sql:21-24`
- **Problem**: Read filters `product_id = ? AND is_published = true` and sorts
  `created_at desc`; no composite `(product_id, is_published, created_at)` index → in-memory
  filter+sort. Bounded per-product (no pagination), fine at seed scale.
- **Suggestion**: Backlog a composite index for T10/T11 volume; no migration in T4 scope.
- **Status**: SKIPPED (backlog) — no migration in T4 scope (reviewer's own call); bounded
  per-product with no pagination, fine at seed scale. Deferred to T10/T11 volume work.

### m-5: `isEntry` shape guard omits several fields it later spreads
- **File**: `src/lib/recently-viewed.ts:38-54`
- **Problem**: The malformed-payload guard validates `id/slug/name/priceCents/coverAlt/
  colorCount/stockState` but not `compareAtPriceCents/coverImageUrl/brandName/lowStockN`. A
  tampered entry can pass the guard and flow into `ProductCard` producing e.g.
  `formatMXN(undefined)` → `$NaN`. Edge 7's "must not crash" is met (no throw), but malformed
  money can render.
- **Suggestion**: Assert `compareAtPriceCents: number|null`, `coverImageUrl: string|null`,
  `lowStockN: number|null`, `brandName: string|null` in `isEntry`. Cheap; closes the `$NaN`
  path from tampered storage.
- **Status**: FIXED — `isEntry` now asserts `compareAtPriceCents` (number|null),
  `coverImageUrl` (string|null), `brandName` (string|null), and `lowStockN`
  (number|null). A tampered entry missing any of these is rejected, closing the
  `formatMXN(undefined)` → `$NaN` render path.

### m-6: published question with `answer === null` renders a bare question
- **File**: `src/components/product/product-qa.tsx:88-93`; `product-detail.ts:214-224`
- **Problem**: `readQuestions` returns any `is_published = true` row; the answer can be null.
  AC-13 describes "author name, question, answer." A published-but-unanswered row shows just
  the question. Only reachable if an admin publishes without answering (T11), since the anon
  insert forces `answer=null`+`is_published=false`.
- **Suggestion**: Filter `answer is not null` in `readQuestions` for strict AC-13 semantics,
  or accept as a T11 admin responsibility and document. Low risk in T4.
- **Status**: FIXED — `readQuestions` now adds `.not("answer", "is", null)`, so a
  published-but-unanswered row is excluded rather than rendered as a bare question
  (strict AC-13 "author name, question, answer" semantics).

---

## Nits

- **n-1**: `product-specs.tsx:22` uses `gap-y-0` while `ui-design.md:340` specced `gap-y-3`;
  row separation now relies only on `border-b`/`py-2`. Cosmetic — verify intended density.
  **FIXED** — aligned to the spec: `gap-y-3` on the `<dl>`.
- **n-2**: `product-gallery.tsx:124-126` combines `flex-wrap` + `overflow-x-auto` — `flex-wrap`
  wins so thumbs wrap at all sizes and never scroll; design wanted a scrollable rail on mobile.
  Harmless; pick one. **FIXED** — dropped `flex-wrap`, kept `overflow-x-auto` (+`pb-1`); the
  `<li>` already has `shrink-0`, so thumbnails now form the intended horizontal scroll rail.
- **n-3**: Container class `mx-auto max-w-(--breakpoint-xl) px-4 py-8 …` and section rhythm
  `mt-10 md:mt-12` are repeated literals across page/skeleton/specs/qa. Matches T3, acceptable;
  candidate for a shared layout primitive later. **SKIPPED** — reviewer marked acceptable
  (matches T3); a shared layout primitive is cross-cutting churn beyond T4 scope, deferred.
- **n-4**: `firstOrSelf`/`EmbeddedBrand` PostgREST to-one normalizer duplicated from the T3
  read layer (`queries.ts`). Minor DRY — hoist to a shared helper. **SKIPPED** — hoisting a
  shared PostgREST normalizer touches the T3 read layer (`queries.ts`, covered by its own
  tests); out of T4 fix scope, backlogged to a DRY pass rather than risk T3 churn here.

---

## Security review (attacker mindset — first public write path)

| Check | Result |
| --- | --- |
| Anon client only, never admin/secret | PASS — `createPublicClient()` (publishable key, RLS) in read + write; no service key import (`actions.ts:125`). |
| Insert sends only safe columns | PASS — `{product_id, author_name, question}`; RLS `WITH CHECK` forces `is_published=false, answer=null, answered_at=null, is_active_product` (`0006:150-160`). |
| Honeypot bypass | PASS — off-screen real input, `trim().length>0` → fake success, no insert. |
| Validation trim-before-length (edge 4) | PASS — `validateQaSubmission` trims first; DB `btrim` CHECK is the floor. |
| Rate-limit IP source | PASS (post-fix, M-3) — platform `x-vercel-forwarded-for` → rightmost XFF hop; leftmost-spoof no longer trusted; trust model + residual risk documented. |
| Rate-limit map cardinality | PASS (post-fix, M-2) — `productId` UUID-validated before it keys anything; hard `QA_RATE_LIMIT_MAX_KEYS` ceiling with idle/oldest eviction. |
| Q&A input reaching a cache key | PASS — only bounded `slug` reaches `updateTag`; no form input touches a tag/key. |
| `cost_price_cents` reachable (AC-16) | PASS — reads the view; column never selected; structurally omitted. |
| Slug → cache key discipline (edge 6) | PASS — `isCacheableSlug` (len ≤128, kebab regex) rejects junk pre-cache. |
| localStorage parse safety (edge 7) | PASS (crash-safe) — `JSON.parse` in try/catch + `Array.isArray` + `isEntry`. Partial-shape gap = **m-5**. |
| XSS via stored data on PDP | PASS — question/answer/author are React text nodes; no `dangerouslySetInnerHTML`; image hosts allowlisted in `next.config.ts`. |
| Error-message leakage | PASS — `fail()` logs server-side, throws generic; action maps errors to enums, never echoes `error.message`. |

---

## Animation review (STANDARDS.md — strict bar)

M1 crossfade (opacity+blur≤2px, 200ms ease-out, keyed=interruptible, reduced-motion drops
blur) · M2 zoom scale(0.95→1)+opacity center-origin 200/150ms · M3 scrim · M4 press
scale(0.97) 120ms · M5 price crossfade 150ms · M6 thumb hover gated `hover:hover` opacity
`ease` · M7 stagger cap `min(i*60,300)` · M8/M9 fade+rise, no shake. All PASS: no `ease-in`,
only `transform`/`opacity`(+capped blur), all <300ms, all interruptible, reduced-motion
honored everywhere. **Animation: APPROVED.**

---

## Clean Code review

Function/file sizes small; SRP clean (pure helpers I/O-free, server display builders isolated,
one client island for selection). No `any`; two guarded boundary `as` casts, no `!`. No empty
catches (logged via `warnOnce`/contextual `console.error`). Constants single-sourced. Dead
code: `defaultVariant` (**M-4**); minor magic values m-2/n-3. Overall PASS with M-4.

---

## i18n review

`product` namespace present in BOTH locales; **key parity exact** (verified programmatically,
0 missing either side). No hardcoded UI copy — all strings pre-resolved props or server
templates filled by pure `interpolate()`. `interpolate` regex is linear (no ReDoS), unknown
tokens left literal. es-MX default. PASS (AC-17).

---

## Acceptance Criteria Verification

| # | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| AC-1 | Renders both locales; unknown/draft/archived → `notFound()` in shell | PASS | `page.tsx:83-86`; view filters `status='active'`; junk → `isCacheableSlug` null. (Next-16 `next start` 200-body-correct is dev-documented, CDN-correct.) |
| AC-2 | `generateStaticParams` slugs × locales; tag-cached + `revalidate` | PASS | `page.tsx:53-58`; cache tags `[catalog, product:<slug>]`, `revalidate: CATALOG_REVALIDATE_SECONDS`. |
| AC-3 | Metadata `"{name} — {store}"`, description, `{}` on miss | PASS (post-fix) | Title + `{}`-on-miss correct; description now truncated via `truncateForMeta` (`MAX_META_DESCRIPTION=160`) — m-1 FIXED. |
| AC-4 | Breadcrumb `Inicio › Sillas › {name}`, last = current | PASS | `page.tsx:98-106` — third item no `href`. |
| AC-5 | Gallery + thumbs; primary first; zero-image placeholder, no broken img | PASS | Order `is_primary,sort_order,id`; `GalleryPlaceholder`; `onError`→placeholder. |
| AC-6 | Zoom lightbox; Escape/backdrop/close; focus trap + return | PASS | Radix `Dialog` (`gallery:65-121`), visible close. |
| AC-7 | ≥1 variant → selector updates gallery/price/stock | PASS | Panel island; `imagesForVariant` fallback, `variantDisplay[id]`, gallery keyed remount. |
| AC-8 | No variants → no selector; product-level | PASS | `hasVariants` gate; `imagesForVariant(all,null)`. |
| AC-9 | `formatMXN`; strike only when compare-at `> effective` | PASS | `shouldStrikeCompareAt` strict `>`; per-variant `compareAtLabel`; enforced in read model too. |
| AC-10 | Specs mm→cm/g→kg, null omitted, all-null hides section | PASS | `buildSpecRows`; page gates `specRows.length>0`. |
| AC-11 | Three-state `StockBadge`, effective stock, legible w/o color | PASS | Reused badge; icon+text; per-variant `variantStockState`. |
| AC-12 | Recently-viewed ≤8 newest-first excl current; localStorage; empty hidden | PASS (post-fix) | Empty SSR shell, dedupe+cap; low-stock label now per-entry (M-1 FIXED). |
| AC-13 | Lists published Q&A newest-first; empty state + form CTA | PASS | `is_published=true`, `created_at desc`; `QaEmptyState`. (null-answer edge = m-6.) |
| AC-14 | Server-action anon insert; success clears+note+focus; trim-validate both | PASS | `actions.ts`+`submit-guard.ts`; client caps + `useActionState` reset+focus. |
| AC-15 | Honeypot silent-accept; per-IP+product rate limit + friendly msg | PASS (post-fix) | Honeypot PASS; rate limit now UUID-gated + map-capped (M-2 FIXED) and sourced from the platform/rightmost-hop IP with a documented trust model (M-3 FIXED). |
| AC-16 | `cost_price_cents` nowhere | PASS | View-only read; never selected. |
| AC-17 | `product` namespace both locales, no hardcoded copy, es default | PASS | Parity verified; components string-free. |
| AC-18 | Non-empty alts; swatch names; keyboard + SR labels | PASS | `altText ?? name`; roving-tabindex radiogroup; aria-live; sr-only compare. |
| AC-19 | Mobile-first single col; two-col from `lg`; no 320px h-scroll | PASS | `lg:grid-cols-2`; correct order; intentional rails only. |
| AC-20 | Motion ease-out, transform/opacity, reduced-motion, <300ms | PASS | See Animation review. |

**18 PASS · 2 PARTIAL (AC-3 truncation, AC-15 rate-limit robustness) · 0 FAIL.**

> **Stage 6 update:** both PARTIALs resolved — AC-3 truncation (m-1) and AC-15
> rate-limit robustness (M-2 + M-3) FIXED. **20 PASS · 0 PARTIAL · 0 FAIL.**

## Edge Case Verification

| # | Edge case | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Zero images → placeholder, no zoom | HANDLED | `gallery:55-57`. |
| 2 | All variants out → "Agotado", selectable, no buy CTA | HANDLED | `effectiveStock` sums; slash overlay; no cart affordance. |
| 3 | Override vs compare-at → strike recomputes per selection | HANDLED | Per-variant server `compareAtLabel`. |
| 4 | Whitespace/empty question → trimmed, field error, no insert | HANDLED | trim-before-length + DB `btrim` CHECK. |
| 5 | Archived mid-flow → RLS denial → "unavailable" | HANDLED | `42501` → `unavailable`. |
| 6 | Malformed/unsafe slug → not-found, no unbounded key | HANDLED | `isCacheableSlug`. |
| 7 | localStorage unavailable/full → silent degrade, one warn | HANDLED (crash-safe) | try/catch + `warnOnce`; robustness nit m-5. |
| 8 | Rapid variant clicks → idempotent, no stuck frame | HANDLED | Gallery keyed remount + `safeIndex` clamp. |
| 9 | Hard read failure → typed throw to `error.tsx`, no raw detail | HANDLED | `fail()` generic throw; `error.tsx` present. |
| 10 | Very long name/question → wraps, no overflow | HANDLED | `break-words`, `max-w-2xl`, `maxLength`. |

**10/10 handled** (edge 7 crash-safe; robustness nit m-5).

## Quality Score: 8/10

Excellent pattern fidelity, security posture, a11y, and motion; loses points for one
user-visible data bug (M-1), two DoS vectors on the brand-new public write path (M-2/M-3)
that undercut the control the ticket calls out as full-depth security, and a ticket-mandated
helper shipped dead (M-4).

## Recommendation: REQUEST CHANGES → RESOLVED (Stage 6)

Fix M-1 (wrong stock label), M-2 + M-3 (write-path DoS: validate `productId`, bound the map,
harden the IP source), and M-4 (dead `defaultVariant`) before Stage 12. Minors/nits can batch
into the fix stage. No critical blockers; the core PDP is production-shaped.

**Stage 6 (ultrafix) outcome:** all 4 majors FIXED; 5/6 minors FIXED (m-3 not-a-defect,
m-4 index backlogged — both SKIPPED with justification); 2/4 nits FIXED (n-3/n-4 SKIPPED as
out-of-T4-scope DRY backlog). Both PARTIAL ACs (AC-3, AC-15) now PASS. Verification: lint
clean, `tsc --noEmit` clean, `next build` succeeds (PDP still SSG, 60 paths, 5m ISR), 297
unit tests pass, message parity intact. Ready for Stage 12.
