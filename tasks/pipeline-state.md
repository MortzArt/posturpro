# Pipeline State
Task: T6 — Cart
Tier: standard
Stage: COMPLETE
Agent: — (standard tier: QA is the quality gate; no verify stage)
Last Updated: 2026-07-14
Notes: S5 (QA) COMPLETE — standard-tier QUALITY GATE PASSED. Verdict SHIP, confidence HIGH for T6 cart.

QA summary: wrote 176 cart-owned tests (all green) — 92 pure-fn unit (cart-line 34, cart-storage 26, shipping 21, cart-messages 11), 38 component (cart-provider 14, order-summary 9, quantity-stepper 9, add-to-cart-button 6), 46 e2e (cart.spec.ts, 23×2 projects). Test counts: unit 634→764, integration 110→110 (T6 has no backend), e2e +46 cart. Full suites: unit 764/764, integration 110/110 green. Cart e2e 46/46 green in EVERY run (parallel, --workers=1, --retries=2). All 18 ACs have tests and PASS; all 10 edge cases covered. Freshly-fixed CRITICAL C-1 cross-tab loop guard is regression-locked (provider test "does NOT echo a content-identical cross-tab read" + real 2-tab e2e via context.newPage). Hostile/corrupt localStorage fuzzed (non-JSON, wrong shape, foreign key, tampered price > PRICE_BOUND_MAX_CENTS, junk qty, 5k-element array). store-settings-null degradation, >= threshold boundary, no-$NaN all proven.

Bugs found: NONE in T6 code — it held up under adversarial testing on first run. (Two authoring bugs in my own draft tests re: Infinity were caught+fixed; code was correct.)

AC-18 note (not a defect): NO seeded product is out of stock (variant stock = 8 + i*3), so the out-of-stock add guard is unreachable via a seeded e2e flow — verified at the component level instead (add-to-cart-button.test.tsx drives outOfStock prop: disabled + "Agotado" + no-op click). Suggest T7/seed add a zero-stock variant for a future live e2e.

E2E infra findings (operational, orthogonal to T6):
- Next DEV server is unstable for a 314-test 4-worker parallel run — returns 500s / RootNotFound mid-run from a .next dev-cache race (badly amplified if a stray Playwright-managed `npm run dev` cold-starts on a conflicting port sharing the same .next). FIX: run the authoritative full e2e against the PRODUCTION build (`next build` + `next start`, NEXT_QA_DIST_DIR=.next-t6-qa, local Supabase well-known keys) exactly as T5 did. Never let two servers share one .next.
- The T3/T4/T5 PDP/catalog/search specs carry a pre-existing NON-DETERMINISTIC "resolved to 2 elements" strict-mode flake under load (shifts run-to-run; served HTML has exactly one #main-content; passes in isolation e.g. catalog.spec.ts:35 in 1.7s; clears at CI's retries:2). NOT introduced by T6 (T6 touches no catalog/PDP render path). Local config uses retries:0 which surfaces it; CI uses retries:2 which absorbs it.
- Dep added: @testing-library/dom@^10.4.1 (devDependency) — an unmet peer of the already-declared @testing-library/react, needed to render the new component tests. No runtime/app dep. The 2 pre-existing moderate npm-audit findings (PostCSS-via-Next, dev-only) predate this.

Build/env: build clean (carrito SSG both locales), tsconfig auto-edit reverted, .next-t6-qa + .next build dirs cleaned. User's :3206 server + Docker Supabase left untouched.

=== FORWARD NOTES FOR T7 (Checkout) ===
- CART READ CONTRACT: checkout reads the client cart via `useCart()` from `@/components/cart/cart-provider` (exposes `lines`, `itemCount`, `subtotalCents`, `hydrated`, `addItem`, `setQuantity`, `removeItem`, `keyFor`). Each `CartLine` (see `src/lib/cart/cart-line.ts`) is a CLIENT SNAPSHOT: { productId, slug, name, variantId|null, variantLabel|null, unitPriceCents (integer, 0..PRICE_BOUND_MAX_CENTS), coverImageUrl|null, sku|null (always null in T6 — ProductVariantView carries no SKU), quantity ([1, MAX_CART_ITEM_QUANTITY=99]) }.
- SNAPSHOT IS NOT AUTHORITATIVE AT PAY: T7 MUST re-validate prices AND stock against the live DB (orders/order_items in 0003_commerce.sql) at checkout — the cart renders from its snapshot by design and does not re-fetch. This is the documented boundary (cart-line.ts docstring, ticket edge 4).
- CHECKOUT_PATH="/checkout" (config.ts) — the cart's checkout CTA already links here (may 404 until T7 ships). Shipping math lives in `src/lib/cart/shipping.ts` (computeShipping/totalCents/freeShippingProgress, pure, integer cents, reads flat-rate + free-threshold from store_settings via getStoreSettingsStatic — never hardcode; >= threshold = free). Reuse these in checkout for consistency.
- OUT-OF-STOCK: T6 disables add for a 0-stock variant best-effort from the PDP snapshot only; real overselling protection is T7's server-side stock reservation. Add a zero-stock seed variant so both T6's guard and T7's reservation get live e2e coverage.
- Cart is CLIENT-ONLY localStorage (key "posturpro:cart:v1"); no server write in T6. Checkout is where the first order/order_item write happens.

--- prior stages (T6) ---
S4 (ReviewFix) COMPLETE. Verdict APPROVE (9/10). Found+fixed 1 CRITICAL (C-1 cross-tab storage sync infinite write loop → lastPersistedRef loop guard), 1 MAJOR (M-1 unbounded tampered unitPriceCents → reject > PRICE_BOUND_MAX_CENTS), 1 MINOR (m-1 subtotal DRY); 2 MINOR skipped (justified). Commits: dev 88bf52c, reviewfix 633cb76.
S3 (Dev) COMPLETE. 14 files created + 8 modified. All 18 ACs PASS, 10 edge cases handled. lint/tsc/build clean.
