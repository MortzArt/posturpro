-- 0007_search.sql
-- T5 — Search, Filters & Sorting: DB-side filtered query path.
--
-- WHY AN RPC (not PostgREST embedded filters / a materialized view)
-- -----------------------------------------------------------------
-- The T3 read path (page products_public, then batch-fetch variants and stitch
-- in JS) structurally CANNOT (a) keyword-search across name/brand/description,
-- (b) filter by variant color, (c) filter by availability (effective stock is
-- only known after the variant batch), or (d) paginate the FILTERED total.
-- All four need the DB to filter BEFORE pagination. `search_products` does the
-- correlated availability/color/category work in SQL and returns the page rows
-- AND the exact filtered total (`COUNT(*) OVER ()`) in ONE round trip.
--
-- SECURITY MODEL (mirrors products_public grant discipline in 0005)
-- -----------------------------------------------------------------
-- * SECURITY INVOKER: the function runs with the CALLER's rights, so RLS on
--   every underlying table still applies. Anon reads ONLY the anon-safe
--   surfaces: the `products_public` VIEW (which omits cost_price_cents and is
--   itself security-definer + active-only), plus `product_variants` and
--   `product_categories` (both anon-granted with active-product RLS in 0005).
--   The base `products` table is NEVER touched here and remains ungranted to
--   anon — cost_price_cents is unreachable by construction.
-- * EXECUTE is REVOKED from public, then granted to anon + authenticated only
--   (same pattern as the products_public SELECT grant in 0005).
-- * FULLY PARAMETERIZED: every filter is a bind parameter; zero string
--   interpolation, so no SQL injection is possible regardless of input. The
--   app additionally caps `p_query` length and drops unknown ids before the
--   call (defence in depth), but the DB is safe on its own.
--
-- AVAILABILITY SEMANTICS (must equal effectiveStock() in stock.ts — AC-6)
-- -----------------------------------------------------------------------
-- effective_stock = COALESCE(SUM(variant.stock), product.stock). SUM over
-- product_variants is NULL only when a product has ZERO variants, so COALESCE
-- falls back to the product-level stock exactly in the no-variant case; when
-- variants exist their sum is authoritative (even if 0). This matches
-- effectiveStock() byte-for-byte. `p_in_stock_only` (default true) keeps only
-- effective_stock > 0 (AC-5). Passing false includes out-of-stock rows.

-- ---------------------------------------------------------------------------
-- Extensions. Both ship with the Supabase Postgres image; idempotent.
-- ---------------------------------------------------------------------------
create extension if not exists unaccent;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Indexes.
-- pg_trgm GIN indexes make `ILIKE '%term%'` index-assisted (the mitigation
-- that lets the app NOT cache free-text search — Constraint 3). NOTE: because
-- the predicate wraps the column in unaccent(), a plain-column trigram index
-- cannot be used for the accent-insensitive branch; at Phase-1 scale (30 rows)
-- the planner seq-scans regardless, so these indexes are forward-looking
-- insurance for catalog growth (revisit with an IMMUTABLE unaccent wrapper +
-- functional index if the catalog grows large — tracked in the backlog).
-- The btree indexes cover the sortable/filterable scalar columns.
-- ---------------------------------------------------------------------------
create index if not exists products_name_trgm_idx
  on products using gin (name gin_trgm_ops);
create index if not exists products_description_trgm_idx
  on products using gin (description gin_trgm_ops);
create index if not exists brands_name_trgm_idx
  on brands using gin (name gin_trgm_ops);

create index if not exists products_price_cents_idx on products (price_cents);
create index if not exists products_created_at_idx on products (created_at);
create index if not exists products_sales_count_idx on products (sales_count);
create index if not exists product_variants_color_hex_idx
  on product_variants (color_hex);

-- ---------------------------------------------------------------------------
-- search_products(...) — the filtered/sorted/paginated catalog read.
--
-- Facet combination (AC-4): distinct facets AND together; multiple values
-- within one facet OR together (implemented as `col = ANY(array)` / EXISTS over
-- an array membership). An empty/NULL array for a facet means "no constraint".
--
-- Returns each card's columns (matching the JS card view model), the computed
-- effective_stock, the distinct variant-color count, and total_count (the
-- filtered total, identical on every returned row via the window function).
-- ---------------------------------------------------------------------------
create or replace function search_products(
  p_query          text    default null,
  p_category_ids   uuid[]  default null,
  p_brand_ids      uuid[]  default null,
  p_style_ids      uuid[]  default null,
  p_colors         text[]  default null,   -- normalized lowercase '#rrggbb'
  p_materials      text[]  default null,   -- unaccented lowercase material terms
  p_price_min      integer default null,
  p_price_max      integer default null,
  p_in_stock_only  boolean default true,
  p_sort           text    default 'mas-vendidas',
  p_limit          integer default 12,
  p_offset         integer default 0
)
returns table (
  id                     uuid,
  slug                   text,
  name                   text,
  price_cents            integer,
  compare_at_price_cents integer,
  is_best_seller         boolean,
  sales_count            integer,
  stock                  integer,
  brand_name             text,
  brand_slug             text,
  brand_logo_url         text,
  effective_stock        integer,
  distinct_color_count   integer,
  total_count            bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with filtered as (
    select
      pp.id,
      pp.slug,
      pp.name,
      pp.price_cents,
      pp.compare_at_price_cents,
      pp.is_best_seller,
      pp.sales_count,
      pp.stock,
      pp.created_at,
      b.name     as brand_name,
      b.slug     as brand_slug,
      b.logo_url as brand_logo_url,
      coalesce(
        (select sum(v.stock)::integer
           from product_variants v
          where v.product_id = pp.id),
        pp.stock
      ) as effective_stock,
      coalesce(
        (select count(distinct v.color_hex)::integer
           from product_variants v
          where v.product_id = pp.id),
        0
      ) as distinct_color_count
    from products_public pp
    left join brands b on b.id = pp.brand_id
    where
      -- keyword: name OR brand name OR description, case + accent insensitive
      (
        p_query is null
        or unaccent(lower(pp.name))        like '%' || unaccent(lower(p_query)) || '%'
        or unaccent(lower(coalesce(pp.description, ''))) like '%' || unaccent(lower(p_query)) || '%'
        or unaccent(lower(coalesce(b.name, '')))         like '%' || unaccent(lower(p_query)) || '%'
      )
      -- brand facet (OR within, via ANY)
      and (p_brand_ids is null or pp.brand_id = any(p_brand_ids))
      -- style facet
      and (p_style_ids is null or pp.style_id = any(p_style_ids))
      -- category facet (M2M): product is in ANY of the requested categories
      and (
        p_category_ids is null
        or exists (
          select 1 from product_categories pc
           where pc.product_id = pp.id
             and pc.category_id = any(p_category_ids)
        )
      )
      -- color facet: product has a variant in ANY requested color
      and (
        p_colors is null
        or exists (
          select 1 from product_variants v
           where v.product_id = pp.id
             and lower(v.color_hex) = any(p_colors)
        )
      )
      -- material facet: ANY of the three material columns matches ANY requested
      -- material term (accent + case insensitive, substring so "malla" matches
      -- "Malla transpirable")
      and (
        p_materials is null
        or exists (
          select 1 from unnest(p_materials) as m(term)
           where unaccent(lower(coalesce(pp.material_frame, '')))      like '%' || m.term || '%'
              or unaccent(lower(coalesce(pp.material_upholstery, ''))) like '%' || m.term || '%'
              or unaccent(lower(coalesce(pp.material_finish, '')))     like '%' || m.term || '%'
        )
      )
      -- price range (either bound optional)
      and (p_price_min is null or pp.price_cents >= p_price_min)
      and (p_price_max is null or pp.price_cents <= p_price_max)
  ),
  availability as (
    select *
    from filtered
    where (p_in_stock_only is not true) or effective_stock > 0
  ),
  counted as (
    select *, count(*) over () as total_count
    from availability
  )
  select
    c.id,
    c.slug,
    c.name,
    c.price_cents,
    c.compare_at_price_cents,
    c.is_best_seller,
    c.sales_count,
    c.stock,
    c.brand_name,
    c.brand_slug,
    c.brand_logo_url,
    c.effective_stock,
    c.distinct_color_count,
    c.total_count
  from counted c
  order by
    -- best-selling (default): sales_count DESC + deterministic tiebreak
    case when p_sort = 'mas-vendidas' then c.sales_count end desc nulls last,
    case when p_sort = 'mas-vendidas' then c.is_best_seller end desc nulls last,
    -- price
    case when p_sort = 'precio-asc'  then c.price_cents end asc  nulls last,
    case when p_sort = 'precio-desc' then c.price_cents end desc nulls last,
    -- newest
    case when p_sort = 'novedades'   then c.created_at end desc nulls last,
    -- name
    case when p_sort = 'nombre-asc'  then c.name end asc  nulls last,
    case when p_sort = 'nombre-desc' then c.name end desc nulls last,
    -- global deterministic tiebreak so every sort is stable (and best-selling
    -- stays non-random pre-T7): name then id.
    c.name asc,
    c.id asc
  limit  greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

-- Grant discipline: strip from public, grant to the storefront roles only.
revoke all on function search_products(
  text, uuid[], uuid[], uuid[], text[], text[], integer, integer, boolean, text, integer, integer
) from public;
grant execute on function search_products(
  text, uuid[], uuid[], uuid[], text[], text[], integer, integer, boolean, text, integer, integer
) to anon, authenticated;
