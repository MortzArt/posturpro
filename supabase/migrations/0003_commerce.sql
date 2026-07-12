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
  -- Single-currency in Phase 1. Constrained so a malformed/wrong currency
  -- (e.g. 'mxn', 'USD', '$') can never enter the immutable financial record
  -- (M-2). Widen to a real ISO set only when multi-currency is built.
  currency                text not null default 'MXN' check (currency = 'MXN'),

  status                  order_status not null default 'pending_payment',
  payment_method          text,
  payment_status          payment_status not null default 'pending',

  -- Mercado Pago references (nullable now; populated in T8)
  mp_preference_id        text,
  mp_payment_id           text,
  mp_external_reference   text,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  -- Cross-column financial consistency (M-3): a discount can never exceed the
  -- subtotal, and the total must be the exact sum of its parts. These make the
  -- "immutable financial snapshot" internally trustworthy at the DB level, not
  -- only as correct as app code.
  constraint orders_discount_within_subtotal check (discount_cents <= subtotal_cents),
  constraint orders_total_identity check (
    total_cents = subtotal_cents + shipping_cents + tax_cents - discount_cents
  )
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
  created_at       timestamptz not null default now(),
  -- The line total must equal unit price * quantity (M-3). Backstops a
  -- totals-calculation bug in checkout (T7) writing a self-contradictory line.
  constraint order_items_line_total_identity check (
    line_total_cents = unit_price_cents * quantity
  )
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
  -- percentage: integer 0-100; fixed_amount: integer cents (n-2: a percentage
  -- row is bounded to 100 so a 5000% discount can never be stored).
  value             integer not null check (value >= 0),
  constraint discount_codes_percentage_bound check (
    discount_type <> 'percentage' or value <= 100
  ),
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

-- ---------------------------------------------------------------------------
-- Immutability of the order financial snapshot (M-4, AC-8/AC-9).
--
-- An order legitimately transitions status, payment_status, payment_method, and
-- acquires Mercado Pago references over its lifecycle — those columns are
-- mutable. But the FINANCIAL SNAPSHOT and the customer/shipping capture are
-- frozen at creation and must survive any later product edit/delete. This
-- trigger rejects any UPDATE that changes a frozen column, so "immutable" is
-- enforced at the DB level and not merely aspirational — even the secret-key
-- server client (which bypasses RLS) is bound by it.
-- ---------------------------------------------------------------------------
create or replace function orders_block_snapshot_update()
returns trigger
language plpgsql
-- Pin search_path (defense-in-depth); function only touches new/old, no tables.
set search_path = ''
as $$
begin
  if new.order_number            is distinct from old.order_number
     or new.customer_id          is distinct from old.customer_id
     or new.contact_email        is distinct from old.contact_email
     or new.contact_phone        is distinct from old.contact_phone
     or new.shipping_full_name   is distinct from old.shipping_full_name
     or new.shipping_address_line1 is distinct from old.shipping_address_line1
     or new.shipping_address_line2 is distinct from old.shipping_address_line2
     or new.shipping_city        is distinct from old.shipping_city
     or new.shipping_state       is distinct from old.shipping_state
     or new.shipping_postal_code is distinct from old.shipping_postal_code
     or new.shipping_country     is distinct from old.shipping_country
     or new.rfc                  is distinct from old.rfc
     or new.subtotal_cents       is distinct from old.subtotal_cents
     or new.shipping_cents       is distinct from old.shipping_cents
     or new.discount_cents       is distinct from old.discount_cents
     or new.tax_base_cents       is distinct from old.tax_base_cents
     or new.tax_cents            is distinct from old.tax_cents
     or new.total_cents          is distinct from old.total_cents
     or new.currency             is distinct from old.currency
     or new.created_at           is distinct from old.created_at
  then
    raise exception 'order % financial/contact snapshot is immutable and cannot be updated', old.id
      using errcode = 'raise_exception';
  end if;
  return new;
end;
$$;

-- order_items rows are a pure historical purchase snapshot: their descriptive
-- and financial columns (name, SKU, unit price, quantity, line total) are
-- frozen. We reject any UPDATE that mutates a SNAPSHOT column, but we must NOT
-- reject the reference-nulling that Postgres performs when a referenced product
-- or variant is deleted (`product_id`/`variant_id` FKs are `on delete set
-- null`). Blocking those would make a referenced product undeletable and defeat
-- edge case 8 (order history must survive product deletes/edits). So: allow an
-- UPDATE whose ONLY change is `product_id`/`variant_id` going NULL; block
-- everything else. (DELETE is still permitted via the ON DELETE CASCADE from
-- orders.)
create or replace function order_items_block_update()
returns trigger
language plpgsql
-- Pin search_path (defense-in-depth); function only touches new/old, no tables.
set search_path = ''
as $$
begin
  if new.order_id         is distinct from old.order_id
     or new.product_name  is distinct from old.product_name
     or new.product_sku   is distinct from old.product_sku
     or new.variant_label is distinct from old.variant_label
     or new.unit_price_cents is distinct from old.unit_price_cents
     or new.quantity      is distinct from old.quantity
     or new.line_total_cents is distinct from old.line_total_cents
     or new.created_at    is distinct from old.created_at
     -- FK columns may only be CLEARED (set null by a cascade), never repointed.
     or (new.product_id is distinct from old.product_id and new.product_id is not null)
     or (new.variant_id is distinct from old.variant_id and new.variant_id is not null)
  then
    raise exception 'order_items are an immutable purchase snapshot and cannot be updated'
      using errcode = 'raise_exception';
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'orders_immutable_snapshot') then
    create trigger orders_immutable_snapshot
      before update on orders
      for each row execute function orders_block_snapshot_update();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'order_items_immutable') then
    create trigger order_items_immutable
      before update on order_items
      for each row execute function order_items_block_update();
  end if;
end
$$;

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
