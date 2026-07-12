-- 0004_content_qa.sql
-- Content + Q&A domain: product_questions, static_pages, and a generic i18n
-- translations structure for localizable content. Idempotent.

-- ---------------------------------------------------------------------------
-- product_questions (public Q&A)
-- Anon may INSERT a question. It is not published until the owner answers and
-- flips is_published (done via the secret server client in the admin — T10+).
-- ---------------------------------------------------------------------------
create table if not exists product_questions (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references products (id) on delete cascade,
  author_name   text not null check (char_length(author_name) between 1 and 120),
  question      text not null check (char_length(question) between 1 and 2000),
  answer        text check (answer is null or char_length(answer) between 1 and 5000),
  is_published  boolean not null default false,
  answered_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists product_questions_product_id_idx
  on product_questions (product_id);
create index if not exists product_questions_published_idx
  on product_questions (is_published);

-- ---------------------------------------------------------------------------
-- static_pages — data-backed static content (no editing UI in Phase 1)
-- ---------------------------------------------------------------------------
create table if not exists static_pages (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  title        text not null,
  body         text not null,
  is_published boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- translations — generic i18n content structure (STRUCTURE ONLY; runtime
-- language toggle is T2). Rows key a (locale, entity_type, entity_id, field)
-- to a translated text value, letting any localizable column be overridden
-- per-locale without altering the base tables.
-- ---------------------------------------------------------------------------
create table if not exists translations (
  id           uuid primary key default gen_random_uuid(),
  locale       text not null,              -- BCP-47, e.g. 'es-MX', 'en'
  entity_type  text not null,              -- e.g. 'product', 'category', 'static_page'
  entity_id    uuid not null,              -- id of the row in the base table
  field        text not null,              -- column name being translated
  value        text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (locale, entity_type, entity_id, field)
);
create index if not exists translations_entity_idx
  on translations (entity_type, entity_id);

-- updated_at triggers
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'product_questions_set_updated_at') then
    create trigger product_questions_set_updated_at before update on product_questions
      for each row execute function set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'static_pages_set_updated_at') then
    create trigger static_pages_set_updated_at before update on static_pages
      for each row execute function set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'translations_set_updated_at') then
    create trigger translations_set_updated_at before update on translations
      for each row execute function set_updated_at();
  end if;
end
$$;
