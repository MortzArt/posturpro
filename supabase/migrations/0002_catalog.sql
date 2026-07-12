-- 0002_catalog.sql
-- Catalog domain: brands, categories (nestable), styles, tags, products,
-- M2M joins, variants, images. All money is integer cents (MXN centavos).
-- Idempotent: create table if not exists + guarded constraints/indexes.

-- ---------------------------------------------------------------------------
-- brands
-- ---------------------------------------------------------------------------
create table if not exists brands (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text,
  logo_url    text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- categories (self-referential for nesting; root has parent_id = null)
-- on delete restrict => cannot orphan children; must reparent/delete first.
-- ---------------------------------------------------------------------------
create table if not exists categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text,
  parent_id   uuid references categories (id) on delete restrict,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- A category cannot be its own parent (blocks the trivial 1-node cycle).
  -- Deeper cycles (A->B->A) are blocked by the categories_no_cycle trigger below
  -- (edge case 4: "a category cannot be its own ancestor").
  constraint categories_no_self_parent check (parent_id is null or parent_id <> id)
);
create index if not exists categories_parent_id_idx on categories (parent_id);

-- ---------------------------------------------------------------------------
-- Deep-cycle prevention (edge case 4): walk the parent chain upward from the
-- proposed parent; if we reach the row being inserted/updated, the edit would
-- create a cycle (a category becoming its own ancestor) — reject it. A depth
-- guard also aborts a pre-existing corrupt chain rather than looping forever.
-- ---------------------------------------------------------------------------
create or replace function categories_check_no_cycle()
returns trigger
language plpgsql
-- Pin search_path (defense-in-depth). Table references below are schema-
-- qualified (public.categories) so an empty search_path resolves correctly.
set search_path = ''
as $$
declare
  ancestor_id uuid := new.parent_id;
  depth       integer := 0;
begin
  if new.parent_id is null then
    return new;
  end if;
  while ancestor_id is not null loop
    if ancestor_id = new.id then
      raise exception 'category % cannot be its own ancestor (cycle via parent_id)', new.id
        using errcode = 'check_violation';
    end if;
    depth := depth + 1;
    if depth > 100 then
      raise exception 'category ancestor chain exceeds max depth (possible cycle)'
        using errcode = 'check_violation';
    end if;
    select parent_id into ancestor_id from public.categories where id = ancestor_id;
  end loop;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'categories_no_cycle') then
    create trigger categories_no_cycle
      before insert or update of parent_id on categories
      for each row execute function categories_check_no_cycle();
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- styles (design style facet, e.g. "Ejecutiva", "Ergonómica")
-- ---------------------------------------------------------------------------
create table if not exists styles (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- tags (free-form facets, e.g. "malla", "reposacabezas")
-- ---------------------------------------------------------------------------
create table if not exists tags (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- products
-- Money columns are integer cents. cost_price_cents is internal only and is
-- never exposed to the anon/public role (enforced by RLS + view usage).
-- Stock rule: when a product has variants, per-variant stock is authoritative
-- and the product row's stock is a fallback for the no-variant case. See
-- product_variants below and dev-done.md.
-- ---------------------------------------------------------------------------
create table if not exists products (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique,
  name                  text not null,
  description           text,
  brand_id              uuid references brands (id) on delete set null,
  style_id              uuid references styles (id) on delete set null,
  sku                   text not null unique,
  price_cents           integer not null check (price_cents >= 0),
  compare_at_price_cents integer check (compare_at_price_cents >= 0),
  cost_price_cents      integer check (cost_price_cents >= 0),
  stock                 integer not null default 0 check (stock >= 0),
  status                product_status not null default 'draft',
  -- dimensions in millimetres, weight in grams (integer units, no floats)
  width_mm              integer check (width_mm >= 0),
  depth_mm              integer check (depth_mm >= 0),
  height_mm             integer check (height_mm >= 0),
  seat_height_mm        integer check (seat_height_mm >= 0),
  weight_g              integer check (weight_g >= 0),
  material_frame        text,
  material_upholstery   text,
  material_finish       text,
  is_featured           boolean not null default false,
  is_best_seller        boolean not null default false,
  sales_count           integer not null default 0 check (sales_count >= 0),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists products_status_idx on products (status);
create index if not exists products_brand_id_idx on products (brand_id);
create index if not exists products_style_id_idx on products (style_id);
create index if not exists products_best_seller_idx on products (is_best_seller);
create index if not exists products_featured_idx on products (is_featured);

-- ---------------------------------------------------------------------------
-- product_categories (M2M) — a product may sit in several categories.
-- ---------------------------------------------------------------------------
create table if not exists product_categories (
  product_id  uuid not null references products (id) on delete cascade,
  category_id uuid not null references categories (id) on delete cascade,
  primary key (product_id, category_id)
);
create index if not exists product_categories_category_id_idx
  on product_categories (category_id);

-- ---------------------------------------------------------------------------
-- product_tags (M2M)
-- ---------------------------------------------------------------------------
create table if not exists product_tags (
  product_id uuid not null references products (id) on delete cascade,
  tag_id     uuid not null references tags (id) on delete cascade,
  primary key (product_id, tag_id)
);
create index if not exists product_tags_tag_id_idx on product_tags (tag_id);

-- ---------------------------------------------------------------------------
-- product_variants
-- price_override_cents = null  => inherit product.price_cents (edge case 5).
-- price_override_cents = value => overrides the product base price.
-- ---------------------------------------------------------------------------
create table if not exists product_variants (
  id                  uuid primary key default gen_random_uuid(),
  product_id          uuid not null references products (id) on delete cascade,
  sku                 text not null unique,
  color_name          text not null,
  color_hex           text not null check (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  price_override_cents integer check (price_override_cents >= 0),
  stock               integer not null default 0 check (stock >= 0),
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists product_variants_product_id_idx
  on product_variants (product_id);

-- ---------------------------------------------------------------------------
-- product_images
-- A row belongs to a product and may optionally be tied to a specific variant
-- (variant_id null => shared / default product image).
-- ---------------------------------------------------------------------------
create table if not exists product_images (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  variant_id uuid references product_variants (id) on delete cascade,
  url        text not null,
  alt_text   text,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  -- URL is unique per product so the seed (and any writer) can upsert on
  -- (product_id, url) — a real DB-level idempotency guard, not an app-only
  -- check that a concurrent insert could bypass (m-4).
  constraint product_images_product_url_unique unique (product_id, url)
);
create index if not exists product_images_product_id_idx
  on product_images (product_id);
create index if not exists product_images_variant_id_idx
  on product_images (variant_id);

-- updated_at triggers
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'brands_set_updated_at') then
    create trigger brands_set_updated_at before update on brands
      for each row execute function set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'categories_set_updated_at') then
    create trigger categories_set_updated_at before update on categories
      for each row execute function set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'styles_set_updated_at') then
    create trigger styles_set_updated_at before update on styles
      for each row execute function set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'products_set_updated_at') then
    create trigger products_set_updated_at before update on products
      for each row execute function set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'product_variants_set_updated_at') then
    create trigger product_variants_set_updated_at before update on product_variants
      for each row execute function set_updated_at();
  end if;
end
$$;
