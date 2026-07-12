-- 0006_data_integrity_hardening.sql
-- Data-layer chaos hardening (Stage 11).
--
-- Prior stages secured RLS, financial CHECKs, immutability, cycles, and seed
-- idempotency. Chaos testing surfaced a set of integrity gaps that let garbage
-- but "valid" data into the store: a duplicate store_settings row, blank /
-- whitespace-only slugs and names, case/whitespace slug near-duplicates,
-- unbounded multi-megabyte free text, garbage i18n locales, whitespace-only
-- Q&A submissions, and a discount code whose window ends before it starts.
--
-- These constraints ADD safety; none weakens an existing guarantee. All are
-- verified to hold against the current seed data (0-row violations) before
-- being added, so the migration applies cleanly on top of a seeded DB.
-- Idempotent: guarded DO blocks (add constraint if not present).

-- ---------------------------------------------------------------------------
-- Helper: add a CHECK constraint only if it does not already exist. Keeps this
-- migration safe to re-run (constraints have no "if not exists" in Postgres).
-- ---------------------------------------------------------------------------
create or replace function add_check_if_absent(
  p_table text,
  p_constraint text,
  p_expr text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = p_constraint
      and conrelid = ('public.' || p_table)::regclass
  ) then
    execute format(
      'alter table public.%I add constraint %I check (%s)',
      p_table, p_constraint, p_expr
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. store_settings singleton (chaos: a second row was insertable).
-- A single-row config table must have exactly one row. A partial unique index
-- on a constant makes a second INSERT fail with a unique violation, so the
-- storefront's "read the settings row" is deterministic. (Prior seed only used
-- a fixed id, which does NOT stop a fresh INSERT with a new uuid.)
-- ---------------------------------------------------------------------------
create unique index if not exists store_settings_singleton
  on store_settings ((true));

-- ---------------------------------------------------------------------------
-- 2. Slug hygiene (chaos: '   ', 'ErgoVita', 'ergovita ' were all accepted as
-- distinct slugs — broken/ambiguous URLs and case/whitespace near-duplicates).
-- Enforce the canonical URL-slug shape: lowercase ASCII alnum groups joined by
-- single hyphens, no leading/trailing/paired hyphens, no spaces, no uppercase.
-- With this in place 'ErgoVita' and 'ergovita ' are rejected outright, so the
-- existing UNIQUE(slug) becomes a true de-dup guard.
-- ---------------------------------------------------------------------------
do $$
declare
  slug_re constant text := '^[a-z0-9]+(-[a-z0-9]+)*$';
begin
  perform add_check_if_absent('brands',       'brands_slug_format',       format('slug ~ %L', slug_re));
  perform add_check_if_absent('categories',   'categories_slug_format',   format('slug ~ %L', slug_re));
  perform add_check_if_absent('styles',       'styles_slug_format',       format('slug ~ %L', slug_re));
  perform add_check_if_absent('tags',         'tags_slug_format',         format('slug ~ %L', slug_re));
  perform add_check_if_absent('products',     'products_slug_format',     format('slug ~ %L', slug_re));
  perform add_check_if_absent('static_pages', 'static_pages_slug_format', format('slug ~ %L', slug_re));
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Non-blank display names (chaos: whitespace-only / emoji-RTL names).
-- A name that is empty after trimming is not a name. char_length bounds also
-- stop a name field being used as a multi-megabyte payload smuggler.
-- ---------------------------------------------------------------------------
do $$
begin
  perform add_check_if_absent('brands',     'brands_name_nonblank',     'char_length(btrim(name)) between 1 and 200');
  perform add_check_if_absent('categories', 'categories_name_nonblank', 'char_length(btrim(name)) between 1 and 200');
  perform add_check_if_absent('styles',     'styles_name_nonblank',     'char_length(btrim(name)) between 1 and 200');
  perform add_check_if_absent('tags',       'tags_name_nonblank',       'char_length(btrim(name)) between 1 and 200');
  perform add_check_if_absent('products',   'products_name_nonblank',   'char_length(btrim(name)) between 1 and 300');
  perform add_check_if_absent('product_variants', 'product_variants_color_name_nonblank', 'char_length(btrim(color_name)) between 1 and 120');
  perform add_check_if_absent('static_pages', 'static_pages_title_nonblank', 'char_length(btrim(title)) between 1 and 300');
  perform add_check_if_absent('customers',  'customers_full_name_nonblank', 'char_length(btrim(full_name)) between 1 and 200');
  perform add_check_if_absent('store_settings', 'store_settings_name_nonblank', 'char_length(btrim(store_name)) between 1 and 200');
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Bounded free text (chaos: a 5 MB products.description was accepted; the
-- same held for descriptions and static_pages.body). Unbounded text is a
-- storage / render / payload-abuse hazard. Bounds are generous (rich marketing
-- copy fits) but finite. Nullable columns only constrain a non-null value.
-- ---------------------------------------------------------------------------
do $$
begin
  perform add_check_if_absent('products',   'products_description_len',   'description is null or char_length(description) <= 20000');
  perform add_check_if_absent('brands',     'brands_description_len',     'description is null or char_length(description) <= 5000');
  perform add_check_if_absent('categories', 'categories_description_len', 'description is null or char_length(description) <= 5000');
  perform add_check_if_absent('styles',     'styles_description_len',     'description is null or char_length(description) <= 5000');
  perform add_check_if_absent('static_pages', 'static_pages_body_len',    'char_length(body) between 1 and 100000');
  -- Material / finish free-text on products (small facets, never long prose).
  perform add_check_if_absent('products',   'products_material_frame_len',      'material_frame is null or char_length(material_frame) <= 300');
  perform add_check_if_absent('products',   'products_material_upholstery_len', 'material_upholstery is null or char_length(material_upholstery) <= 300');
  perform add_check_if_absent('products',   'products_material_finish_len',     'material_finish is null or char_length(material_finish) <= 300');
end
$$;

-- ---------------------------------------------------------------------------
-- 5. i18n locale hygiene (chaos: locale 'zz-GARBAGE' / emoji accepted).
-- Constrain to a BCP-47-ish shape: a 2-3 letter primary subtag, optional
-- region/script subtags. This rejects emoji, blanks, and free-form garbage
-- without hard-coding a fixed allow-list (the app owns which locales it ships).
-- ---------------------------------------------------------------------------
do $$
begin
  perform add_check_if_absent(
    'translations',
    'translations_locale_format',
    $q$locale ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'$q$
  );
  perform add_check_if_absent('translations', 'translations_value_len', 'char_length(value) <= 100000');
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Q&A non-blank (chaos: author_name '    ' and question '   ' were accepted;
-- char_length passed because whitespace has length). Require non-blank AFTER
-- trimming. The base-table CHECK covers every write path (incl. the secret-key
-- server client); the anon INSERT policy is tightened in tandem below.
-- ---------------------------------------------------------------------------
alter table product_questions drop constraint if exists product_questions_author_name_check;
alter table product_questions drop constraint if exists product_questions_question_check;
do $$
begin
  perform add_check_if_absent('product_questions', 'product_questions_author_nonblank',
    'char_length(btrim(author_name)) between 1 and 120');
  perform add_check_if_absent('product_questions', 'product_questions_question_nonblank',
    'char_length(btrim(question)) between 1 and 2000');
  -- answer was already correctly bounded (null or 1..5000); leave as-is.
end
$$;

-- Re-issue the anon INSERT policy so its inline length checks also require
-- non-blank trimmed text (belt & suspenders with the table CHECK above).
drop policy if exists product_questions_anon_insert on product_questions;
create policy product_questions_anon_insert on product_questions
  for insert to anon with check (
    is_published = false
    and answer is null
    and answered_at is null
    and char_length(btrim(author_name)) between 1 and 120
    and char_length(btrim(question)) between 1 and 2000
    and is_active_product(product_id)
  );

-- ---------------------------------------------------------------------------
-- 7. discount_codes temporal integrity (chaos: a code whose ends_at was BEFORE
-- its starts_at was accepted — a window that can never be valid). When both
-- bounds are present, the end must not precede the start. (Redemption-count
-- vs max_redemptions is intentionally NOT constrained here: that is a runtime
-- race the Phase-2 redemption logic owns, and clamping it in the schema would
-- fight legitimate concurrent redemption accounting.)
-- ---------------------------------------------------------------------------
do $$
begin
  perform add_check_if_absent(
    'discount_codes',
    'discount_codes_window_valid',
    'starts_at is null or ends_at is null or ends_at >= starts_at'
  );
end
$$;

-- ---------------------------------------------------------------------------
-- Clean up the helper so it does not linger as a callable public function.
-- (It ran only during this migration.)
-- ---------------------------------------------------------------------------
drop function if exists add_check_if_absent(text, text, text);
