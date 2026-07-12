# Clean-Code / Deferred-Work Backlog

Open items discovered during the pipeline. Check off when addressed.

## T1 — Data Foundation (deferred by design)

- [ ] **Product-questions abuse controls (app layer).** The DB bounds question
  length (`char_length` CHECK on `product_questions` + the anon INSERT policy in
  `0005_rls_policies.sql`), but the DB cannot rate-limit. The ticket that ships
  the public question form must add per-IP throttling and/or a CAPTCHA hook
  before the anon INSERT path is exposed in the UI. (Ref: review finding M-6.)
- [ ] **Translations orphan cleanup.** `translations` is polymorphic
  (`entity_type` + `entity_id`, no FK by design), so deleting a base row leaves
  orphan translation rows. Add a periodic cleanup job or per-entity delete hook
  when the i18n runtime lands (T2+). (Ref: review nit n-4.)
- [ ] **Mexican state / postal validation.** `orders.shipping_state` /
  `shipping_postal_code` are free text. Add a validation list / regex when the
  checkout form is built (T7). (Ref: review nit n-1.)
- [ ] **Effective-stock read path.** Stock authority (per-variant authoritative,
  product-level fallback) is documented in `0002_catalog.sql` but not enforced
  by a view/generated column. Consider an `effective_stock` view when the
  cart/inventory logic lands so consumers cannot read the wrong column.
  (Ref: review minor m-2.)
- [ ] **Race-safe stock reservation primitive (T7).** The schema has stock
  columns but no reservation mechanism. T7 checkout must implement an atomic
  RPC / `SELECT ... FOR UPDATE` decrement inside the order-creation
  transaction — never an app-level read-then-write. (Ref: architecture review,
  HIGH risk.)
- [ ] **Webhook idempotency ledger for Mercado Pago (T8).** `mp_payment_id`
  exists but there is no processed-events table or unique constraint making
  duplicate webhook deliveries safe. Add before handling MP callbacks in T8.
  (Ref: architecture review, HIGH risk.)
- [ ] **PostgREST embedding through `products_public` (T3).** Views cannot
  embed related rows the way base tables can. Standardize the catalog-read
  embedding strategy at the start of T3 so it isn't discovered mid-build.
  (Ref: architecture review, MED risk.)
