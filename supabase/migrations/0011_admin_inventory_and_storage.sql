-- 0011_admin_inventory_and_storage.sql
--
-- T11 (Admin: product management) foundation migration.
--
-- Adds:
--   (1) inventory_adjustments — an append-only ledger of manual stock changes
--       (product- or variant-level) with a required reason, for an audit trail.
--   (2) record_inventory_adjustment(...) — an ATOMIC RPC that updates the
--       product/variant stock AND inserts the ledger row in one transaction so
--       the two never diverge; rejects a result below zero (the stock >= 0 CHECK
--       is the DB backstop). SECURITY DEFINER + pinned empty search_path +
--       service_role-only execute — identical posture to the 0009 RPCs.
--   (3) admin-list supporting indexes (products.updated_at desc, lower(name))
--       so the uncached admin product-list read stays fast under filters/sort.
--   (4) the product-images storage bucket (public read) created idempotently in
--       storage.buckets — the storefront + next.config already assume the
--       Supabase public-URL shape (/storage/v1/object/public/product-images/**).
--
-- Idempotent: `create table if not exists`, guarded index creates, `on conflict
-- do nothing` bucket insert, and `create or replace function`. Re-runnable.
-- LOCAL only (the remote project is empty/unlinked); applied via `supabase db
-- reset`. Money is INTEGER cents; stock/delta are integers.

-- ---------------------------------------------------------------------------
-- (1) inventory_adjustments — the audit ledger.
--
-- resulting_stock is the product/variant stock AFTER this adjustment (>= 0). A
-- product-level adjustment has variant_id = null; a variant-level one names the
-- variant. reason is bounded 1..500 (matches the admin parser + the DB is the
-- authority). Append-only: no update/delete path is exposed to the app.
-- ---------------------------------------------------------------------------
create table if not exists inventory_adjustments (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references products (id) on delete cascade,
  variant_id       uuid references product_variants (id) on delete cascade,
  delta            integer not null,
  resulting_stock  integer not null check (resulting_stock >= 0),
  reason           text not null check (char_length(btrim(reason)) between 1 and 500),
  created_at       timestamptz not null default now()
);

-- Most-recent-first history per product (and per variant) — the ledger view.
create index if not exists inventory_adjustments_product_id_idx
  on inventory_adjustments (product_id, created_at desc);
create index if not exists inventory_adjustments_variant_id_idx
  on inventory_adjustments (variant_id, created_at desc);

-- RLS: deny anon/authenticated entirely (mirrors the orders/payments posture).
-- Only the service_role (secret key) — which bypasses RLS — reads/writes it.
alter table inventory_adjustments enable row level security;
-- No policies → anon/authenticated fully denied; service_role bypasses RLS.

-- Created after 0005's point-in-time grant, so it needs its own explicit grant
-- (RLS bypass still requires the base-table privilege).
grant all on table inventory_adjustments to service_role;

-- ---------------------------------------------------------------------------
-- (2) record_inventory_adjustment — atomic stock write + ledger insert.
--
-- Exactly one of p_delta / p_absolute is meaningful:
--   * p_absolute not null → set the new stock to p_absolute (delta computed).
--   * else                → apply p_delta (+/-) to the current stock.
-- Locks the target row `for update` so a concurrent checkout decrement (T7) and
-- this adjustment serialize; last-writer-wins is acceptable for the single Owner
-- but stock never goes negative and the ledger never diverges from stock
-- (edge 6). A negative result is rejected BEFORE the write with a clear errcode
-- the action maps to a friendly message; the stock >= 0 CHECK is the backstop.
--
-- Returns jsonb { resulting_stock, delta } so the caller can echo the outcome.
-- ---------------------------------------------------------------------------
create or replace function record_inventory_adjustment(
  p_product_id uuid,
  p_variant_id uuid,
  p_delta      integer,
  p_absolute   integer,
  p_reason     text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current   integer;
  v_delta     integer;
  v_resulting integer;
  v_reason    text := btrim(coalesce(p_reason, ''));
begin
  if char_length(v_reason) < 1 or char_length(v_reason) > 500 then
    raise exception 'reason must be 1..500 chars' using errcode = 'check_violation';
  end if;
  if p_delta is null and p_absolute is null then
    raise exception 'either p_delta or p_absolute is required'
      using errcode = 'null_value_not_allowed';
  end if;

  -- Read + lock the target stock. Variant-level when p_variant_id is provided,
  -- else product-level (edge 7: the caller decides which stock is authoritative).
  if p_variant_id is not null then
    select stock into v_current
    from public.product_variants
    where id = p_variant_id and product_id = p_product_id
    for update;
  else
    select stock into v_current
    from public.products
    where id = p_product_id
    for update;
  end if;

  if not found then
    raise exception 'target not found' using errcode = 'no_data_found';
  end if;

  -- Resolve the resulting stock. Absolute mode derives the delta for the ledger.
  if p_absolute is not null then
    v_resulting := p_absolute;
    v_delta     := p_absolute - v_current;
  else
    v_delta     := p_delta;
    v_resulting := v_current + p_delta;
  end if;

  if v_resulting < 0 then
    raise exception 'stock cannot go negative' using errcode = 'check_violation';
  end if;

  -- Atomic: update the authoritative stock, then append the ledger row. Both in
  -- this function's transaction — they commit or roll back together.
  if p_variant_id is not null then
    update public.product_variants set stock = v_resulting where id = p_variant_id;
  else
    update public.products set stock = v_resulting where id = p_product_id;
  end if;

  insert into public.inventory_adjustments
    (product_id, variant_id, delta, resulting_stock, reason)
  values
    (p_product_id, p_variant_id, v_delta, v_resulting, v_reason);

  return jsonb_build_object('resulting_stock', v_resulting, 'delta', v_delta);
end;
$$;

-- Lock down execute: public loses it; only the service_role (admin client) runs it.
revoke all on function record_inventory_adjustment(uuid, uuid, integer, integer, text) from public;
grant execute on function record_inventory_adjustment(uuid, uuid, integer, integer, text) to service_role;

-- ---------------------------------------------------------------------------
-- (3) Admin-list supporting indexes.
--
-- The admin product list orders by updated_at desc and filters by a
-- case-insensitive name substring; these keep the uncached read fast. The
-- status/brand/style indexes already exist from 0002.
-- ---------------------------------------------------------------------------
create index if not exists products_updated_at_idx
  on products (updated_at desc);
create index if not exists products_lower_name_idx
  on products (lower(name));

-- ---------------------------------------------------------------------------
-- (4) product-images storage bucket (public read), created idempotently.
--
-- The storage schema exists once [storage] is enabled in supabase/config.toml.
-- A public bucket serves objects at /storage/v1/object/public/product-images/<path>
-- — the exact shape next.config.ts already allow-lists for next/image. Writes
-- go through the service_role (admin client), which bypasses storage RLS, so no
-- storage.objects policy is required for the owner-only Phase-1 upload path.
--
-- Guarded by a to_regclass check so the migration still applies cleanly if a
-- future config keeps storage disabled (the bucket simply is not created; the
-- image-write layer surfaces a friendly error at runtime).
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public)
    values ('product-images', 'product-images', true)
    on conflict (id) do update set public = true;
  end if;
end
$$;
