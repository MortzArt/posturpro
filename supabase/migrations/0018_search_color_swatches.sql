-- 0018 — search_products returns the per-product colour swatches (owner
-- request 2026-09-12: product cards show colour DOTS instead of "N colores").
--
-- Adds `color_swatches jsonb` — a JSON array of {name, hex} objects, one per
-- DISTINCT variant colour (by hex, case-insensitive), ordered by name; `[]` when
-- a product has no variants. Everything else is byte-identical to 0007's body.
-- Changing a table-returning function's OUT columns requires DROP + CREATE (a
-- plain CREATE OR REPLACE errors with "cannot change return type"), so the
-- grant posture from 0007/0015 is re-applied below.

drop function if exists search_products(text, uuid[], uuid[], uuid[], text[], text[], integer, integer, boolean, text, integer, integer);

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
  color_swatches         jsonb,
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
      ) as distinct_color_count,
      coalesce(
        (select jsonb_agg(
                  jsonb_build_object('name', s.color_name, 'hex', s.color_hex)
                  order by s.color_name)
           from (select distinct on (lower(v.color_hex)) v.color_name, v.color_hex
                   from product_variants v
                  where v.product_id = pp.id
                  order by lower(v.color_hex), v.color_name) s),
        '[]'::jsonb
      ) as color_swatches
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
    c.color_swatches,
    c.total_count
  from counted c
  order by
    -- best-selling: sales_count DESC + deterministic tiebreak
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

revoke all on function search_products(
  text, uuid[], uuid[], uuid[], text[], text[], integer, integer, boolean, text, integer, integer
) from public;
grant execute on function search_products(
  text, uuid[], uuid[], uuid[], text[], text[], integer, integer, boolean, text, integer, integer
) to anon, authenticated;
