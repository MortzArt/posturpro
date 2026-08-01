-- 0012_admin_orders.sql
--
-- T12 (Admin: order management) foundation migration.
--
-- Adds:
--   (1) orders tracking columns (tracking_number, tracking_carrier,
--       tracking_url) — nullable text, NOT in the 0003 immutability trigger's
--       frozen set, so a `.update({tracking_number})` on a live order is allowed
--       (the trigger only freezes the financial/contact snapshot; tracking is a
--       mutable fulfilment field like status/payment_status/mp_*).
--   (2) order_internal_notes — an append-only, ADMIN-ONLY notes store. NEVER
--       surfaced to the customer and NEVER emailed; distinct from
--       order_status_history.note (which feeds customer-facing derivation
--       context). RLS-deny + service_role grant (mirrors 0011/0009 posture).
--   (3) cancel_order(p_order_id, p_note) — a NEW transactional RPC that, in ONE
--       transaction: locks the order, restores each order_items line's quantity
--       to the product/variant stock (reverse of create_order's decrement,
--       skipping since-deleted null FK references), advances the order to
--       'cancelled' writing an order_status_history row with
--       transition_kind='cancelled', and is IDEMPOTENT (a re-cancel restores
--       nothing twice). SECURITY DEFINER + pinned empty search_path +
--       service_role-only execute — identical posture to create_order /
--       record_inventory_adjustment. This is a single SQL transaction, NOT the
--       T11 app-level compensation pattern.
--   (4) admin_session_version — a single-row server-side session revocation
--       source (SEC-M-1 / ADR-2). The authoritative Node verifier compares the
--       cookie payload's `v` against this persisted value; incrementing it
--       (bump_admin_session_version) invalidates every outstanding cookie,
--       bounding the stolen-cookie window below the 8h max-age. RLS-deny +
--       service_role grant.
--   (5) customers search indexes (lower(email), lower(full_name)) so the admin
--       customer-list read stays fast under a name/email substring filter.
--
-- Idempotent: `alter table ... add column if not exists`, `create table if not
-- exists`, guarded index creates, `create or replace function`, and an
-- `on conflict do nothing` seed. Re-runnable. LOCAL only (the remote project is
-- empty/unlinked); applied via `supabase db reset`. Money is INTEGER cents;
-- stock/quantity are integers; the session version is a bigint counter.

-- ---------------------------------------------------------------------------
-- (1) orders tracking columns.
--
-- The 0003 immutability trigger (orders_block_snapshot_update) freezes the
-- financial + contact snapshot only; these three columns are NOT in its frozen
-- set, so an UPDATE that sets them succeeds. They are the shipped-email inputs
-- (tracking_number may be null → "shipped without tracking", AC-12).
-- ---------------------------------------------------------------------------
alter table orders
  add column if not exists tracking_number  text,
  add column if not exists tracking_carrier text,
  add column if not exists tracking_url     text;

-- ---------------------------------------------------------------------------
-- (2) order_internal_notes — admin-only, append-only notes.
--
-- body is bounded 1..2000 (matches the admin parser; the DB is the authority).
-- Newest-first history per order via the composite index. on delete cascade so
-- notes vanish with a (hypothetically) deleted order. Append-only: no
-- update/delete path is exposed to the app.
-- ---------------------------------------------------------------------------
create table if not exists order_internal_notes (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders (id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at  timestamptz not null default now()
);

-- Most-recent-first notes per order — the notes view.
create index if not exists order_internal_notes_order_id_idx
  on order_internal_notes (order_id, created_at desc);

-- RLS: deny anon/authenticated entirely (mirrors the orders/payments posture).
-- Only the service_role (secret key), which bypasses RLS, reads/writes it.
alter table order_internal_notes enable row level security;
-- No policies → anon/authenticated fully denied; service_role bypasses RLS.

-- Created after 0005's point-in-time grant, so it needs its own explicit grant.
grant all on table order_internal_notes to service_role;

-- ---------------------------------------------------------------------------
-- (3) cancel_order — transactional cancel + stock restore.
--
-- One transaction:
--   * lock the order `for update` (serializes with a concurrent advance/cancel).
--   * if already 'cancelled' → NO-OP: restore nothing (idempotent, AC-13), do
--     NOT write a duplicate history row, return applied=false reason='noop'.
--   * else: for each order_items line, add its snapshot quantity BACK to the
--     product/variant stock. A since-deleted product/variant (FK set null) is
--     SKIPPED without failing the cancel (edge 11 / AC-14).
--   * advance status to 'cancelled' via a direct UPDATE + an order_status_history
--     insert with transition_kind='cancelled' (derived via email_transition_kind
--     — the single-sourced taxonomy, NOT a string literal we invent). 'cancelled'
--     is rank 5 (highest) so this never regression-blocks, even from 'shipped'
--     (edge 3). payment_status is untouched (a paid order stays refundable, edge 6).
--
-- Returns jsonb { applied, reason, from_status } so the write layer can decide
-- whether to fire sendCancelled (only when applied).
--
-- SECURITY DEFINER + pinned empty search_path + service_role-only execute
-- (identical posture to create_order / advance_order_status).
-- ---------------------------------------------------------------------------
create or replace function cancel_order(
  p_order_id uuid,
  p_note     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.orders%rowtype;
  v_item    public.order_items%rowtype;
  v_kind    text;
begin
  select * into v_current
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object(
      'applied', false,
      'reason',  'order_not_found',
      'from_status', null
    );
  end if;

  -- Idempotent: an already-cancelled order restores NO stock a second time and
  -- writes no duplicate history row (AC-13).
  if v_current.status = 'cancelled' then
    return jsonb_build_object(
      'applied', false,
      'reason',  'noop',
      'from_status', v_current.status::text
    );
  end if;

  -- Restore each line's snapshot quantity to the authoritative stock. A line
  -- whose product/variant was since deleted (FK on delete set null) is skipped
  -- so the cancel still completes (edge 11 / AC-14). Variant lines restore the
  -- SPECIFIC variant; no-variant lines restore the product row.
  for v_item in
    select * from public.order_items where order_id = p_order_id
  loop
    if v_item.variant_id is not null then
      update public.product_variants
        set stock = stock + v_item.quantity
        where id = v_item.variant_id;
    elsif v_item.product_id is not null then
      update public.products
        set stock = stock + v_item.quantity
        where id = v_item.product_id;
    end if;
    -- Both FKs null (product AND variant since deleted): nothing to restore; skip.
  end loop;

  -- Advance to 'cancelled' (rank 5, never regresses) + write the audit row with
  -- the single-sourced transition_kind. payment_status is left AS-IS.
  v_kind := public.email_transition_kind('cancelled', v_current.payment_status, false);

  update public.orders
    set status = 'cancelled'
    where id = p_order_id;

  insert into public.order_status_history
    (order_id, from_status, to_status, note, transition_kind)
    values (p_order_id, v_current.status, 'cancelled', p_note, v_kind);

  return jsonb_build_object(
    'applied', true,
    'reason',  'cancelled',
    'from_status', v_current.status::text
  );
end;
$$;

-- Lock down execute: public loses it; only the service_role (admin client) runs it.
revoke all on function cancel_order(uuid, text) from public;
grant execute on function cancel_order(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- (4) admin_session_version — server-side session revocation source (SEC-M-1).
--
-- A single-row counter. The authoritative Node session verifier compares the
-- signed cookie payload's `v` against this `version`; a mismatch → the session
-- is treated as revoked (re-login), with NO further DB access. Bumping the
-- version (bump_admin_session_version) invalidates EVERY outstanding cookie at
-- once — the "log out everywhere / rotate on compromise" control a refund-capable
-- console warrants (AC-27/28). Seeded to the current ADMIN_SESSION_VERSION (1) so
-- freshly-minted cookies validate immediately.
--
-- A DB-enforced singleton via a fixed primary key. RLS-deny + service_role grant.
-- ---------------------------------------------------------------------------
create table if not exists admin_session_version (
  id          integer primary key default 1 check (id = 1),
  version     bigint not null default 1 check (version >= 1),
  updated_at  timestamptz not null default now()
);

alter table admin_session_version enable row level security;
-- No policies → anon/authenticated fully denied; service_role bypasses RLS.
grant all on table admin_session_version to service_role;

-- Seed the singleton at the current session version (idempotent).
insert into admin_session_version (id, version)
values (1, 1)
on conflict (id) do nothing;

-- Bump the version (revoke all outstanding cookies). Returns the new version.
-- SECURITY DEFINER + service_role-only execute so only the admin client can call
-- it; pinned empty search_path.
create or replace function bump_admin_session_version()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new bigint;
begin
  insert into public.admin_session_version (id, version)
    values (1, 2)
  on conflict (id) do update
    set version = public.admin_session_version.version + 1,
        updated_at = now()
  returning version into v_new;
  return v_new;
end;
$$;

revoke all on function bump_admin_session_version() from public;
grant execute on function bump_admin_session_version() to service_role;

-- ---------------------------------------------------------------------------
-- (5) customers search indexes.
--
-- The admin customer list filters by a case-insensitive email/name substring;
-- these keep the uncached read fast. (orders already has created_at/status/
-- customer_id indexes from 0003.)
-- ---------------------------------------------------------------------------
create index if not exists customers_lower_email_idx
  on customers (lower(email));
create index if not exists customers_lower_full_name_idx
  on customers (lower(full_name));
