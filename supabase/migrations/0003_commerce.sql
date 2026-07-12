-- 0003_commerce.sql
-- Commerce domain: customers (guest records), orders (immutable financial
-- snapshot), order_items (line snapshots), order_status_history,
-- discount_codes (table only), store_settings. All money is integer cents.
-- Idempotent.

-- ---------------------------------------------------------------------------
-- customers (guest records only in Phase 1 — no auth/accounts)
-- ---------------------------------------------------------------------------
create table if not exists customers (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  full_name  text not null,
  phone      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists customers_email_idx on customers (email);

-- ---------------------------------------------------------------------------
-- orders
-- Immutable financial snapshot. All amounts are integer cents. Mercado Pago
-- and CFDI columns are nullable now (populated in T8 / Phase 3).
-- ---------------------------------------------------------------------------
create table if not exists orders (
  id                      uuid primary key default gen_random_uuid(),
  order_number            text not null unique,
  customer_id             uuid references customers (id) on delete set null,

  -- contact + shipping snapshot (captured at purchase time)
  contact_email           text not null,
  contact_phone           text,
  shipping_full_name      text not null,
  shipping_address_line1  text not null,
  shipping_address_line2  text,
  shipping_city           text not null,
  shipping_state          text not null,          -- Mexican state
  shipping_postal_code    text not null,          -- Mexican CP
  shipping_country        text not null default 'MX',
  delivery_notes          text,

  -- CFDI (Phase 3, optional now)
  rfc                     text,

  -- financial snapshot (integer cents)
  subtotal_cents          integer not null check (subtotal_cents >= 0),
  shipping_cents          integer not null default 0 check (shipping_cents >= 0),
  discount_cents          integer not null default 0 check (discount_cents >= 0),
  tax_base_cents          integer not null default 0 check (tax_base_cents >= 0),
  tax_cents               integer not null default 0 check (tax_cents >= 0),
  total_cents             integer not null check (total_cents >= 0),
  currency                text not null default 'MXN',

  status                  order_status not null default 'pending_payment',
  payment_method          text,
  payment_status          payment_status not null default 'pending',

  -- Mercado Pago references (nullable now; populated in T8)
  mp_preference_id        text,
  mp_payment_id           text,
  mp_external_reference   text,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists orders_customer_id_idx on orders (customer_id);
create index if not exists orders_status_idx on orders (status);
create index if not exists orders_created_at_idx on orders (created_at);

-- ---------------------------------------------------------------------------
-- order_items
-- Snapshot columns (name/sku/unit price) are the source of truth for order
-- history so editing/deleting a product never rewrites past orders (edge
-- case 8). FK to product is nullable / on delete set null.
-- ---------------------------------------------------------------------------
create table if not exists order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references orders (id) on delete cascade,
  product_id       uuid references products (id) on delete set null,
  variant_id       uuid references product_variants (id) on delete set null,
  product_name     text not null,
  product_sku      text not null,
  variant_label    text,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  quantity         integer not null check (quantity > 0),
  line_total_cents integer not null check (line_total_cents >= 0),
  created_at       timestamptz not null default now()
);
create index if not exists order_items_order_id_idx on order_items (order_id);
create index if not exists order_items_product_id_idx on order_items (product_id);

-- ---------------------------------------------------------------------------
-- order_status_history
-- ---------------------------------------------------------------------------
create table if not exists order_status_history (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders (id) on delete cascade,
  from_status order_status,                    -- null on the initial record
  to_status   order_status not null,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists order_status_history_order_id_idx
  on order_status_history (order_id);

-- ---------------------------------------------------------------------------
-- discount_codes (TABLE ONLY in Phase 1 — no validation logic, no UI)
-- ---------------------------------------------------------------------------
create table if not exists discount_codes (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  discount_type     discount_type not null,
  -- percentage: integer basis 0-100; fixed_amount: integer cents
  value             integer not null check (value >= 0),
  min_subtotal_cents integer check (min_subtotal_cents >= 0),
  max_redemptions   integer check (max_redemptions >= 0),
  times_redeemed    integer not null default 0 check (times_redeemed >= 0),
  starts_at         timestamptz,
  ends_at           timestamptz,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- store_settings — single-row table. Runtime source of truth for shipping.
-- ---------------------------------------------------------------------------
create table if not exists store_settings (
  id                            uuid primary key default gen_random_uuid(),
  store_name                    text not null,
  contact_email                 text not null,
  shipping_flat_rate_cents      integer not null check (shipping_flat_rate_cents >= 0),
  free_shipping_threshold_cents integer not null check (free_shipping_threshold_cents >= 0),
  currency                      text not null default 'MXN',
  updated_at                    timestamptz not null default now()
);

-- updated_at triggers
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'customers_set_updated_at') then
    create trigger customers_set_updated_at before update on customers
      for each row execute function set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'orders_set_updated_at') then
    create trigger orders_set_updated_at before update on orders
      for each row execute function set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'discount_codes_set_updated_at') then
    create trigger discount_codes_set_updated_at before update on discount_codes
      for each row execute function set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'store_settings_set_updated_at') then
    create trigger store_settings_set_updated_at before update on store_settings
      for each row execute function set_updated_at();
  end if;
end
$$;
