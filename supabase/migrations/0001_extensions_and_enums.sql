-- 0001_extensions_and_enums.sql
-- Extensions and enum types shared across the schema.
-- Idempotent: safe to re-run (IF NOT EXISTS / guarded DO blocks).

-- gen_random_uuid() lives in pgcrypto (available by default on Supabase).
create extension if not exists pgcrypto;

-- Product lifecycle status.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'product_status') then
    create type product_status as enum ('draft', 'active', 'archived');
  end if;
end
$$;

-- Order lifecycle status — matches the PRODUCT_SPEC fulfilment pipeline.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type order_status as enum (
      'pending_payment',
      'paid',
      'preparing',
      'shipped',
      'delivered',
      'cancelled'
    );
  end if;
end
$$;

-- Payment processing status (Mercado Pago populated in T8).
do $$
begin
  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type payment_status as enum (
      'pending',
      'authorized',
      'paid',
      'failed',
      'refunded'
    );
  end if;
end
$$;

-- Discount code kind (table-only in Phase 1; validation logic is Phase 2).
do $$
begin
  if not exists (select 1 from pg_type where typname = 'discount_type') then
    create type discount_type as enum ('percentage', 'fixed_amount');
  end if;
end
$$;

-- Reusable trigger function: keep updated_at fresh on UPDATE.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
