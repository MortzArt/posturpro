-- 0016_product_condition_grade.sql
--
-- WHY: T19 adds an optional condition-grade system (A+ / A / B) to products so
-- the storefront can show a "Grado A+" badge on cards and PDPs. The grade is
-- OPTIONAL — a nullable column, no default, no backfill — so every existing row
-- stays NULL and renders no badge.
--
-- WHAT:
--   (1) create the enum `product_condition_grade` (A+, A, B) — guarded, idempotent.
--   (2) add a nullable `condition_grade` column to `products` — no default.
--   (3) regenerate `products_public` to project `condition_grade`, COPYING the
--       explicit column list from 0005 (never `select *`) so cost_price_cents
--       stays omitted, then re-grant SELECT to anon/authenticated (0005 posture).
--
-- GRANT POSTURE (mirrors 0015): the ONLY intentional API-role privilege here is
-- `grant select on products_public`. Recreating the view drops its grants, so we
-- restore exactly that one; we also re-assert the read-only revoke (no
-- insert/update/delete for the API roles) to keep the audited posture. No new
-- table/function grants; no default-ACL changes (0015 already stripped the
-- postgres role's default ACLs so a recreated view starts ungranted on hosted).
--
-- Idempotent: the guarded enum block, `add column if not exists`, and
-- drop-then-create view all re-run cleanly on a fresh stack AND on re-apply.

-- (1) Condition-grade enum. `'A+'` contains a `+` and is stored verbatim — the
-- application layer (src/lib/catalog/grade.ts) uses the identical strings.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'product_condition_grade') then
    create type product_condition_grade as enum ('A+', 'A', 'B');
  end if;
end
$$;

-- (2) Nullable column on products. No default, no NOT NULL — existing rows → NULL.
alter table products
  add column if not exists condition_grade product_condition_grade;

-- (3) Regenerate the public view with condition_grade added. Column list is
-- copied verbatim from 0005 (cost_price_cents intentionally omitted) so no
-- internal column can leak; condition_grade is appended.
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
    condition_grade,
    created_at,
    updated_at
  from products
  where status = 'active';

-- Restore the 0005 read grant (recreating the view dropped it). This is the
-- ONLY intentional anon/authenticated privilege introduced by this migration.
grant select on products_public to anon, authenticated;

-- Re-assert the read-only posture (0015): the API roles never write the view.
revoke insert, update, delete on table public.products_public
from anon, authenticated;
