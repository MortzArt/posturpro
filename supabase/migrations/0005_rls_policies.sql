-- 0005_rls_policies.sql
-- Row-Level Security + explicit privilege baseline for the guest-store trust
-- model (AC-12).
--
-- TRUST MODEL
-- -----------
-- * There are NO per-customer identities in Phase 1 (guests are unauthenticated).
-- * The publishable key uses the `anon` role and is RLS-enforced.
-- * The secret key uses a superuser-equivalent role that BYPASSES RLS entirely
--   and is the ONLY path for all privileged reads/writes (orders, customers,
--   discounts, cost_price, admin).
--
-- PRIVILEGE BASELINE (why this is explicit, not inherited)
-- --------------------------------------------------------
-- RLS policies only FILTER rows/commands for a role that already holds the
-- underlying table privilege. Supabase's bootstrap `GRANT ... TO anon` and
-- `ALTER DEFAULT PRIVILEGES` are ambient and not pinned in this repo, so the
-- effective privileges of `anon`/`authenticated` would otherwise be
-- non-deterministic across environments. This migration therefore:
--   1. REVOKEs ALL from anon/authenticated as a hard baseline.
--   2. GRANTs back EXACTLY the narrow reads/writes the storefront needs.
--   3. Exposes the public product catalog through a dedicated VIEW
--      (`products_public`) that STRUCTURALLY omits `cost_price_cents` — the
--      base `products` table is never granted to anon, so internal margin data
--      cannot leak even via `select *` or an accidental later blanket grant.
-- Everything not explicitly granted is denied.

-- ---------------------------------------------------------------------------
-- Enable RLS on every table (idempotent — enabling twice is a no-op).
-- ---------------------------------------------------------------------------
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
-- Hard privilege baseline: strip everything from the public roles, then grant
-- back exactly what the storefront needs. This makes the trust model
-- reproducible regardless of ambient Supabase default privileges.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

-- service_role is the secret-key server path: it BYPASSES RLS but still needs
-- table privileges. Grant it full DML explicitly so the trust model does not
-- depend on ambient Supabase bootstrap grants for the tables this migration
-- creates (same determinism rationale as the anon baseline above).
grant all on all tables in schema public to service_role;

-- Public-catalog SELECT grants (row visibility is further narrowed by the
-- policies below). NOTE: `products` (the base table) is deliberately NOT granted
-- to anon/authenticated — the public path reads `products_public` (view) which
-- omits cost_price_cents. This is column protection by construction.
grant select on brands              to anon, authenticated;
grant select on categories          to anon, authenticated;
grant select on styles              to anon, authenticated;
grant select on tags                to anon, authenticated;
grant select on product_categories  to anon, authenticated;
grant select on product_tags        to anon, authenticated;
grant select on product_variants    to anon, authenticated;
grant select on product_images      to anon, authenticated;
grant select on store_settings      to anon, authenticated;
grant select on static_pages        to anon, authenticated;
grant select on translations        to anon, authenticated;

-- The one public write surface (bounded by the INSERT policy below).
grant select, insert on product_questions to anon, authenticated;

-- ---------------------------------------------------------------------------
-- is_active_product(uuid): SECURITY DEFINER helper so child-table RLS policies
-- (variants/images/joins/questions) can check a product's active status WITHOUT
-- granting anon SELECT on the base `products` table. Running as the definer
-- (owner) keeps `products` — and therefore cost_price_cents — ungranted to anon
-- while still letting the policies gate on product status. STABLE + narrow
-- search_path per SECURITY DEFINER best practice.
-- ---------------------------------------------------------------------------
create or replace function is_active_product(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from products p where p.id = p_id and p.status = 'active'
  );
$$;
revoke all on function is_active_product(uuid) from public;
grant execute on function is_active_product(uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- products_public: the public-facing product view.
-- Structurally omits cost_price_cents (internal margin data) — anon/authenticated
-- read the catalog through this view, never the base table (which is never
-- granted to anon). The view runs with the DEFINER's rights (default
-- security_invoker=false), so it can read `products` even though anon cannot;
-- the active-only row filter is therefore baked INTO the view (`where status =
-- 'active'`) to reproduce the anon row policy. Result: anon sees exactly the
-- active catalog, minus the internal cost column, and can never reach the base
-- table or that column by any path.
-- ---------------------------------------------------------------------------
drop view if exists products_public;
create view products_public as
  select
    id,
    slug,
    name,
    description,
    brand_id,
    style_id,
    sku,
    price_cents,
    compare_at_price_cents,
    -- cost_price_cents intentionally omitted (internal only)
    stock,
    status,
    width_mm,
    depth_mm,
    height_mm,
    seat_height_mm,
    weight_g,
    material_frame,
    material_upholstery,
    material_finish,
    is_featured,
    is_best_seller,
    sales_count,
    created_at,
    updated_at
  from products
  where status = 'active';

grant select on products_public to anon, authenticated;

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

-- products: only status = 'active' (draft/archived hidden from public). The
-- anon path reads via products_public (security_invoker) which applies THIS
-- policy against the base table. The base table itself is never granted to
-- anon, so cost_price_cents is unreachable regardless of this policy.
drop policy if exists products_anon_select on products;
create policy products_anon_select on products
  for select to anon using (status = 'active');

-- product_categories: joins for active products only.
-- Uses is_active_product() (SECURITY DEFINER) so the policy needn't grant anon
-- SELECT on the base products table (which would re-expose cost_price_cents).
drop policy if exists product_categories_anon_select on product_categories;
create policy product_categories_anon_select on product_categories
  for select to anon using (is_active_product(product_id));

-- product_tags: joins for active products only
drop policy if exists product_tags_anon_select on product_tags;
create policy product_tags_anon_select on product_tags
  for select to anon using (is_active_product(product_id));

-- product_variants: variants of active products only
drop policy if exists product_variants_anon_select on product_variants;
create policy product_variants_anon_select on product_variants
  for select to anon using (is_active_product(product_id));

-- product_images: images of active products only
drop policy if exists product_images_anon_select on product_images;
create policy product_images_anon_select on product_images
  for select to anon using (is_active_product(product_id));

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
    (entity_type = 'product' and is_active_product(entity_id))
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
-- only for active products, and bounds the free-text length (M-6) so the one
-- public write surface cannot be abused for multi-megabyte payloads.
-- (App-layer rate limiting / captcha is tracked for the T-question-form ticket
-- in tasks/clean-code-backlog.md — the DB cannot rate-limit.)
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
    and char_length(author_name) between 1 and 120
    and char_length(question) between 1 and 2000
    and is_active_product(product_id)
  );

-- ---------------------------------------------------------------------------
-- NO grants and NO anon policies for: customers, orders, order_items,
-- order_status_history, discount_codes. With the REVOKE ALL baseline above and
-- no grant, the anon role has neither the privilege nor a policy — fully denied
-- (belt AND suspenders). These are reachable only via the secret-key server
-- client (T7 order creation, T10+ admin), which bypasses RLS.
-- ---------------------------------------------------------------------------
