# Architecture Review: T14 — SEO, Analytics & Launch Hardening

> Stage 10 (Arch). READ-ONLY on source (Stage 9 Security runs in parallel and
> owns source edits + `security-audit.md` + `deploy-readiness-checklist.md`).
> No source code changed here; no git commit. This file only.

## Summary

The T14 SEO layer is a clean, well-factored subsystem: a single pure metadata
seam (`buildAlternates`/`buildOpenGraph`), typed JSON-LD builders isolated from
i18n, and a security-load-bearing serializer that is correctly scoped. Every new
file is small, single-responsibility, and consistent with existing `src/lib/`
conventions. The one genuine architectural smell is a **three-way divergence in
the storefront's rendering strategy** (SSG PDP vs auto-dynamic `/sillas` vs
`force-dynamic` taxonomy) that is now locally justified but not documented as a
coherent whole — it reads as accidental complexity to the next developer. The
deployment architecture (env surface, build-time DB degrade, migrate+seed path)
is sound and turnkey-documented. **Verdict: APPROVE.**

## Pattern Compliance

| Pattern | Status | Notes |
|---------|--------|-------|
| Separation of concerns | ✅ | `json-ld.ts` = pure builders (no DB/i18n); `breadcrumb.ts` = i18n bridge (deliberately separated from pure builders); `metadata.ts` = URL/alternates; `site-url.ts` = origin resolver; `json-ld.tsx` = render+escape. Each owns one concern. |
| Boundary validation | ✅ | `getSiteUrl` never trusts env — `new URL()` in try/catch, degrades to localhost. `buildProductLd` guards null/zero price + trims. Sitemap `safeRead` isolates every catalog read. |
| Typed contracts | ✅ | All public signatures fully typed. `JsonLdValue`/`JsonLdObject` recursive union models the tree precisely. `LocaleAgnosticHref` derived from `getPathname`'s own param type — no drift. |
| Service layer | ✅ | Pages → `src/lib/seo/*` (pure) + `src/lib/catalog/*` / `src/lib/content/*` (server-only DB). SEO helpers correctly do NOT import server-only DB code, so they compose into ~10 pages without fanning `server-only` into client trees. |
| Type safety | ✅ | No `any`, no non-null `!` in the T14 additions. m-3 (OG `type:"product"`) was correctly SKIPPED rather than reach for an `as`-cast — the right call under CLAUDE.md. |
| shadcn patterns | N/A | T14 ships essentially no visible UI (JSON-LD is `<script>`-only; the one visible delta is the contact counter's `t.raw` fix). Cookie banner deferred (cookieless analytics). |
| Small files (≤400 / hard-cap 1000) | ✅ | Largest new file `json-ld.ts` = 161 lines. All SEO files ≤ 161. |
| DRY | ✅ | `buildLanguages` in `sitemap.ts` duplicates the hreflang loop in `metadata.buildAlternates` (see Tech-Debt m-A) but this is a *justified* seam split (Metadata-object vs Sitemap-entry shape), not copy-paste rot. |
| server-only imports | ✅ | `static-pages.ts` carries `import "server-only"`; SEO pure helpers correctly omit it (they must stay client-importable). |

## Rendering-Strategy Map (the one architectural finding)

T14 touched every storefront route's render mode. The resulting map — which the
codebase does NOT document in one place — is:

| Route | Mode | Mechanism | Why |
|-------|------|-----------|-----|
| `/` (home) | SSG/ISR | `generateStaticParams` (locales) | Static content + cached reads |
| `/producto/[slug]` (PDP) | **SSG/ISR** | `generateStaticParams`, no searchParams | Prerendered; ISR via `unstable_cache` on `getProduct` |
| `/sillas` | **Auto-dynamic** | reads `searchParams` at top level → Next demotes it | Filters/sort/search; unfiltered path served via cached reads |
| `/categorias/[slug]` | **`force-dynamic`** | explicit export | searchParams passed DOWN into `<Suspense>`; without force → SSG → `DYNAMIC_SERVER_USAGE` 500 |
| `/marcas/[slug]` | **`force-dynamic`** | explicit export | same |
| `/estilos/[slug]` | **`force-dynamic`** | explicit export | same |
| `/[pageSlug]` (static content) | SSG | `generateStaticParams` (known slugs) | ISR via `unstable_cache` |
| `/carrito`, `/checkout` | SSG shell | `generateStaticParams` | client-driven; disallowed in robots |
| `sitemap.ts` / `robots.ts` | dynamic / static | App-Router special files | sitemap reads DB (degrades); robots has no DB |

**Assessment.** There are now **three distinct mechanisms for the same
"paginated product listing" concept**: `/sillas` awaits searchParams at the page
top (auto-dynamic), the 3 taxonomy pages force-dynamic to legalize a deep
`await searchParams` under Suspense, and PDP stays fully SSG. Each is *locally*
correct and each carries a good inline comment. But the **system-level story is
implicit** — a new developer adding a 4th listing surface has no single place
telling them "top-level await searchParams OR force-dynamic; never pass it into
Suspense on an SSG route." This is drift, not a defect.

- `force-dynamic` was the **right call for now** vs. refactoring
  `PaginatedProductListing` to hoist the `searchParams` await to each page top
  (the `/sillas` posture). The 1-line fix is proven, matches `/sillas`'s
  *effective* posture, and the read is one bounded cached query so per-request
  cost is unchanged. Refactoring the shared component to hoist the await would
  touch 3 pages + the component and risk re-introducing the QA-BUG-1
  Suspense-streaming/no-JS regression that `/sillas` was specifically shaped to
  avoid. Correct trade-off.
- **Recommendation (phase-2, opportunistic):** add a short "Storefront rendering
  strategy" section to CLAUDE.md or a `src/app/[locale]/RENDERING.md` capturing
  this map + the one rule. Cheap insurance against the next listing surface
  silently 500-ing in prod (exactly the T14 blocker #1 class).

## Data Model Review

**No schema changes** (read-only against 0001..0014, confirmed in ticket + diff).
The migrate+seed *apply path* is the only data-layer concern:

- **Migration promotion to hosted Supabase is sound.** Checklist §2 documents
  `link → db push (0001..0014) → seed`, with the seed pointed at the hosted URL +
  secret via env override. Migrations are ordered, idempotent-by-convention, and
  seed is deliberately separated from reset (fast reset) — a defensible split
  that is now documented (AC-A7/A8).
- **Post-migrate RLS assertion is the standout.** Checklist §2 mandates a
  `has_function_privilege('anon', …)` sweep after `db push` to catch the stray
  `pg_default_acl` EXECUTE grant that has bitten other envs. This is exactly the
  right belt-and-suspenders for promoting privileged RPCs to a fresh hosted DB.
- `listPublishedStaticPageSlugs` (new) reads through the RLS-enforced public
  client (anon sees only `is_published=true`), ordered, cached, degrades to `[]`.
  Correct scoping — no PII/unpublished leak into the sitemap.

No indexes needed (new reads are slug lists over already-indexed columns). No FK
or relationship changes.

## API / Route Review

New surfaces are the two App-Router special files — both correctly modeled:

- **`sitemap.ts`** — single root sitemap enumerating both locales itself (App
  Router honors one `sitemap` per app; a `[locale]`-nested one would be wrong).
  Absolute `<loc>` from `metadataBase`, per-URL hreflang alternates, faceted URLs
  excluded, `Set` de-dupe keyed locale-agnostic with STATIC_HREFS winning.
  RESTful-equivalent (canonical XML), degrades to static-only on DB outage.
- **`robots.ts`** — no DB (can't 500), disallows `/admin` `/api/` cart/checkout
  (both locales) + faceted `/sillas?`, absolute `Sitemap:` pointer. Correct.

**Scalability of the single-file sitemap (explicitly assessed):** Phase 1 emits
~118 unique `<loc>` (well under the 1000-URL / 50k-entry / 50MB single-file
limits). The single-file approach is **correct for Phase 1** and has generous
headroom. There is **no documented growth path to a sitemap index** — see
Scalability + Tech-Debt.

## Scalability Assessment

| Concern | Severity | Recommendation |
|---------|----------|----------------|
| Single-file sitemap has no index-file growth path | Low | Fine to ~50k URLs. When catalog + locales grow (more products, a 3rd locale), split into a sitemap index (`sitemap/[id].xml`). Document the trigger. **phase-2**. |
| `sitemap()` awaits 5 catalog reads on every request (dynamic route) | Low | Reads are individually `unstable_cache`-tagged (`catalog`/`static-pages`), so DB load is bounded even under crawler bursts. Acceptable. Monitor crawl-rate post-launch. **never** (unless load shows up). |
| `generateStaticParams` (PDP + taxonomy) hits DB at Vercel build with hosted Supabase | Low | Degrades safely (empty params → on-demand render) and checklist §5 mandates build-time reachability for richest prerender. Architecture is right; documented per AC-A14. **now-satisfied**. |
| `cachedReaders` Map in `static-pages.ts` grows one entry per (locale,slug) | Low | Bounded by locales×published-pages (≈18). Not unbounded. **never**. |
| `force-dynamic` taxonomy pages lose ISR/CDN caching for the shell | Low | The listing read is still cached; only the render is per-request. Trade-off accepted to fix the 500. **never** (unless taxonomy becomes hot; then hoist searchParams to top-level like `/sillas`). |

No unbounded fetches, no N+1, no expensive hot-path work introduced.

## Deployment-Readiness Assessment (Vercel + hosted Supabase)

**Verdict: READY** (architecture-wise). The three deployment-architecture axes:

**1. Env-var surface — single source of truth exists.** Checklist §1 enumerates
every var, split Public vs Secret:

- Public: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SITE_ORIGIN`.
- Secret: `SUPABASE_SECRET_KEY`, `MERCADOPAGO_ACCESS_TOKEN`,
  `MERCADOPAGO_WEBHOOK_SECRET`, `EMAIL_API_KEY`, `EMAIL_FROM_ADDRESS`,
  `EMAIL_OWNER_ADDRESS`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`,
  `ADMIN_SESSION_SECRET`.
- Rate flags (`*_RATE_LIMIT_DISABLED`) correctly flagged **must-not-set in prod**.
- Group B: Sentry DSN / Vercel Analytics documented as owner-gated.

  This is a clean, complete inventory. **The one dangerous default worth calling
  out explicitly:** `NEXT_PUBLIC_SITE_URL` unset → `getSiteUrl` silently degrades
  to `http://localhost:3000`, which would ship a sitemap/robots/canonical/JSON-LD
  full of `localhost` URLs to Google — a **silent SEO-poisoning failure mode, not
  a crash.** The degrade-not-throw behavior is architecturally correct (build
  determinism, AC-A14) and the checklist DOES call it out (§1, §5). Residual
  risk: it depends on a human reading the checklist. **Recommendation
  (phase-2, opportunistic):** a build-time `console.error` / non-fatal warning
  when `NODE_ENV==='production'` and no site-URL env is set would surface the
  mistake in Vercel build logs without breaking determinism. Not a blocker.

**2. Build-time vs request-time DB access — correct and documented.** `sitemap`
+ `generateStaticParams` read the DB at build. On Vercel with a cold/empty/
unreachable hosted Supabase: `safeRead` → `[]` (reduced sitemap), empty static
params (on-demand render), no throw — build stays green (QA-verified the degrade;
architecture confirmed right). `force-dynamic`/dynamic listing routes never
prerender, so an empty build-time DB never bakes stale/empty pages. Checklist §5
documents the build-time-DB recommendation + the self-heal-on-revalidate path.
Architecturally right.

**3. Migrate+seed promotion — sound** (see Data Model Review). Documented,
repeatable, with the post-migrate anon-denial assertion.

**One deployment gap (owned by Stage 9, not me):** no security-headers/CSP layer
(B6). It is correctly scoped to the parallel Security stage and is a prerequisite
before any third-party analytics/monitoring script — noted here for the ledger,
not actioned.

## Tech-Debt Ledger

| Item | Type | Impact | Effort | Phase-2 rating |
|------|------|--------|--------|----------------|
| Rendering-strategy map undocumented (3 mechanisms for "listing") | Introduced (latent) | Med — next listing surface can silently prod-500 | S (a doc) | **opportunistic** |
| Single-file sitemap, no sitemap-index growth path documented | Introduced (latent) | Low — fine to ~50k URLs | M when triggered | **opportunistic** |
| `NEXT_PUBLIC_SITE_URL`-unset degrades to localhost silently (no prod build warning) | Introduced (latent) | Med — silent SEO poisoning if checklist missed | S | **opportunistic** |
| Stale `admin.spec.ts` post-login expectation (8 e2e fails, app is correct) | Existing (carried) | Low — test-only, non-T14, app proven correct | S | **opportunistic** (fix in admin ticket) |
| PDP `/producto/<unknown-slug>` returns SSG 200, not 404 | Existing (carried) | Low — SEO/UX minor; taxonomy correctly 404s | M (needs SSG notFound strategy) | **opportunistic** |
| `sendOwnerRelay` — third copy would trigger extraction | Existing (carried) | Low | S | **opportunistic** when 3rd consumer lands |
| Panel/TotalRow — third consumer triggers extraction | Existing (carried) | Low | S | **opportunistic** when 3rd consumer lands |
| CSP / security-headers owner decision (B6) | Existing (open) | Med — the one real security gap | M | **blocker for any 3rd-party script**, else opportunistic (owned by Stage 9) |
| m-A: `buildLanguages` (sitemap) ≈ hreflang loop in `buildAlternates` (metadata) | Introduced (minor) | Low — justified shape split, not rot | S if ever unified | **never** (don't force a false abstraction) |
| m-1/m-2/m-3 review minors (XML `&` escape, JSON-LD image-abs assumption, OG `type`) | Existing | Cosmetic | — | **never** / cosmetic (all justified-skips) |

Nothing in this ledger is a **blocker for the Phase-1 client-QA deploy.** The
CSP item is the only one that becomes a hard prerequisite — and only if/when a
third-party script is introduced.

## System Boundaries

- **Clean domain separation:** SEO helpers (pure) ⟂ catalog/content data layer
  (server-only) ⟂ pages (compose). No circular deps introduced (`json-ld.ts` pure;
  `breadcrumb.ts` depends on `metadata.ts` + `json-ld.ts` one-directionally;
  `metadata.ts` → `site-url.ts` → nothing). Verified acyclic.
- **Frontend/backend interface stays clean:** JSON-LD is server-rendered markup;
  no client component imports server-only code via the SEO seam.
- **Error propagation across boundaries is correct:** every new DB read degrades
  in-layer (returns `[]`/`null`, logs with context) rather than throwing across
  the render boundary — no empty `catch {}`, consistent with the store-settings
  precedent and CLAUDE.md's "errors are never silenced" rule.

## Refactors Applied

None. This stage is READ-ONLY on source (Stage 9 owns parallel source edits).
All findings are recommendations, tagged now / phase-2 / never below.

## Recommendations

- **[phase-2, opportunistic]** Document the storefront rendering-strategy map +
  the "top-level-await-searchParams OR force-dynamic; never pass searchParams into
  Suspense on an SSG route" rule in CLAUDE.md. Prevents a repeat of blocker #1.
- **[phase-2, opportunistic]** Emit a non-fatal build warning when
  `NODE_ENV==='production'` and no `NEXT_PUBLIC_SITE_URL`/`SITE_ORIGIN` is set, so
  a localhost-poisoned sitemap surfaces in Vercel logs. Keep the degrade behavior.
- **[phase-2, opportunistic]** Document the sitemap-index split trigger (approach
  50k URLs / add a 3rd locale) next to `sitemap.ts`.
- **[phase-2]** Fix the stale `admin.spec.ts` post-login expectation in a future
  admin-scoped ticket (app is correct; test asserts pre-T12 behavior).
- **[phase-2]** Decide the PDP unknown-slug 200→404 strategy (catalog-scoped).
- **[now, owned by Stage 9]** CSP / security-headers layer (B6) — the one real
  gap; hard prerequisite before any third-party script.
- **[never]** Do not unify `buildLanguages`/`buildAlternates` — the Sitemap-entry
  vs Metadata-object shape split is a real boundary, not duplication.

## Dimension Scores

| Dimension | Score |
|-----------|-------|
| Pattern compliance | 9.5/10 |
| Data model / migration path | 9/10 |
| API / route design | 9/10 |
| Scalability | 8.5/10 |
| Deployment readiness | 9/10 |
| Tech-debt hygiene | 8.5/10 |
| System boundaries | 9.5/10 |

## Architecture Score: 9/10

Will this make sense in 6 months with 2× the team? **Mostly yes.** The SEO seam
is textbook — a new page adds metadata via one `buildAlternates` call and drops a
`<JsonLd>`; adding a page does NOT require touching N places. The pure/impure
split, typed contracts, and in-layer error degradation are all things the next
developer will thank this code for. The single point that will confuse a future
developer is the rendering-strategy divergence — three mechanisms for one
concept, correct individually but undocumented as a system. That is a
one-paragraph doc away from a 10, and it is the reason for the withheld point.
The deployment story is genuinely turnkey.

## Recommendation: APPROVE

No source changes required from architecture. Ship T14 to the client-QA deploy.
The only true prerequisite gating a hardened launch (CSP / security headers, B6)
is correctly owned by the parallel Stage 9. All other findings are phase-2 /
opportunistic and none block the Phase-1 deploy.
