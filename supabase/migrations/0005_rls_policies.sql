-- 0005_rls_policies.sql
-- Row-Level Security for the guest-store trust model (AC-12).
--
-- TRUST MODEL
-- -----------
-- * There are NO per-customer identities in Phase 1 (guests are unauthenticated).
-- * The publishable key uses the `anon` role and is RLS-enforced.
-- * The secret key bypasses RLS entirely and is the ONLY path for all
--   privileged reads/writes (orders, customers, discounts, cost_price, admin).
-- * Therefore: enable RLS on EVERY table (default-deny), then grant the anon
--   role the narrow SELECTs the storefront needs plus the one public INSERT
--   (product questions). Everything not explicitly allowed is denied.
--
-- cost_price_cents: the anon SELECT policy on products is row-scoped (active
-- only). Column-level protection of cost_price_cents is enforced by REVOKEing
-- the column from anon below, so even `select *` cannot read it.

-- Enable RLS on every table (idempotent — enabling twice is a no-op).
alter table brands                enable row level security;
alter table categories            enable row level security;
alter table styles                enable row level security;
alter table tags                  enable row level security;
alter table products              enable row level security;
alter table product_categories    enable row level security;
alter table product_tags          enable row level security;
alter table product_variants      enable row level security;
alter table product_images        enable row level security;
alter table customers             enable row level security;
alter table orders                enable row level security;
alter table order_items           enable row level security;
alter table order_status_history  enable row level security;
alter table discount_codes        enable row level security;
alter table store_settings        enable row level security;
alter table product_questions     enable row level security;
alter table static_pages          enable row level security;
alter table translations          enable row level security;

-- ---------------------------------------------------------------------------
-- Column-level protection: anon must never read internal cost price.
-- REVOKE the column so even a wildcard select excludes it. The secret-key
-- (service) path bypasses RLS and column grants, so admin reads are unaffected.
-- ---------------------------------------------------------------------------
revoke select (cost_price_cents) on products from anon;

-- ---------------------------------------------------------------------------
-- Public (anon) SELECT policies — active catalog only.
-- Drop-then-create so the migration is idempotent.
-- ---------------------------------------------------------------------------

-- brands: only active
drop policy if exists brands_anon_select on brands;
create policy brands_anon_select on brands
  for select to anon using (is_active = true);

-- categories: only active
drop policy if exists categories_anon_select on categories;
create policy categories_anon_select on categories
  for select to anon using (is_active = true);

-- styles: only active
drop policy if exists styles_anon_select on styles;
create policy styles_anon_select on styles
  for select to anon using (is_active = true);

-- tags: fully public (no active flag)
drop policy if exists tags_anon_select on tags;
create policy tags_anon_select on tags
  for select to anon using (true);

-- products: only status = 'active' (draft/archived hidden from public)
drop policy if exists products_anon_select on products;
create policy products_anon_select on products
  for select to anon using (status = 'active');

-- product_categories: joins for active products only
drop policy if exists product_categories_anon_select on product_categories;
create policy product_categories_anon_select on product_categories
  for select to anon using (
    exists (
      select 1 from products p
      where p.id = product_categories.product_id and p.status = 'active'
    )
  );

-- product_tags: joins for active products only
drop policy if exists product_tags_anon_select on product_tags;
create policy product_tags_anon_select on product_tags
  for select to anon using (
    exists (
      select 1 from products p
      where p.id = product_tags.product_id and p.status = 'active'
    )
  );

-- product_variants: variants of active products only
drop policy if exists product_variants_anon_select on product_variants;
create policy product_variants_anon_select on product_variants
  for select to anon using (
    exists (
      select 1 from products p
      where p.id = product_variants.product_id and p.status = 'active'
    )
  );

-- product_images: images of active products only
drop policy if exists product_images_anon_select on product_images;
create policy product_images_anon_select on product_images
  for select to anon using (
    exists (
      select 1 from products p
      where p.id = product_images.product_id and p.status = 'active'
    )
  );

-- store_settings: public read (store name / shipping rules) — no secrets here
drop policy if exists store_settings_anon_select on store_settings;
create policy store_settings_anon_select on store_settings
  for select to anon using (true);

-- static_pages: published only
drop policy if exists static_pages_anon_select on static_pages;
create policy static_pages_anon_select on static_pages
  for select to anon using (is_published = true);

-- translations: only for content the anon role can otherwise see. We scope to
-- published static pages and active products/categories/styles.
drop policy if exists translations_anon_select on translations;
create policy translations_anon_select on translations
  for select to anon using (
    (entity_type = 'product' and exists (
      select 1 from products p where p.id = translations.entity_id and p.status = 'active'))
    or (entity_type = 'category' and exists (
      select 1 from categories c where c.id = translations.entity_id and c.is_active = true))
    or (entity_type = 'style' and exists (
      select 1 from styles s where s.id = translations.entity_id and s.is_active = true))
    or (entity_type = 'brand' and exists (
      select 1 from brands b where b.id = translations.entity_id and b.is_active = true))
    or (entity_type = 'static_page' and exists (
      select 1 from static_pages sp where sp.id = translations.entity_id and sp.is_published = true))
  );

-- ---------------------------------------------------------------------------
-- Public (anon) Q&A: read only PUBLISHED (answered) questions; INSERT allowed.
-- The INSERT policy forces the safe initial state: unanswered + unpublished,
-- and only for active products. Anon cannot self-publish or pre-fill answers.
-- ---------------------------------------------------------------------------
drop policy if exists product_questions_anon_select on product_questions;
create policy product_questions_anon_select on product_questions
  for select to anon using (is_published = true);

drop policy if exists product_questions_anon_insert on product_questions;
create policy product_questions_anon_insert on product_questions
  for insert to anon with check (
    is_published = false
    and answer is null
    and answered_at is null
    and exists (
      select 1 from products p
      where p.id = product_questions.product_id and p.status = 'active'
    )
  );

-- ---------------------------------------------------------------------------
-- NO anon policies for: customers, orders, order_items, order_status_history,
-- discount_codes. With RLS enabled and no policy, the anon role is fully
-- denied (default-deny). These are reachable only via the secret-key server
-- client (T7 order creation, T10+ admin), which bypasses RLS.
-- ---------------------------------------------------------------------------
