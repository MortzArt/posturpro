-- 0009_payments.sql
-- Mercado Pago payment plumbing (T8). Three things, all idempotent, LOCAL-only
-- (never pushed to the empty/unlinked remote — project memory):
--
--   (1) advance_order_status(...) RPC  (T7 Arch R-1)
--       The ONE path that changes an order's status / payment_status /
--       payment_method / mp_payment_id. It writes the mutable columns AND an
--       order_status_history row in a SINGLE transaction, is idempotent (a repeat
--       transition to the same status is a no-op, no duplicate history row), and
--       refuses to REGRESS an order to an earlier state (out-of-order webhook
--       guard, edge 2). SECURITY DEFINER, pinned empty search_path, execute
--       granted only to service_role — matching the create_order RPC posture
--       (0008_checkout.sql).
--
--   (2) mp_payment_events table  (T7 Arch R-3)
--       The webhook idempotency SPINE: unique(mp_payment_id). A duplicate MP
--       webhook for a payment id already recorded is a guaranteed no-op at the DB
--       level (ON CONFLICT DO NOTHING), SEPARATE from orders.idempotency_key
--       (which dedupes order CREATION, not payment events).
--
--   (3) Indexes on orders(mp_payment_id) and orders(mp_external_reference)
--       (T7 Arch R-4) — the webhook matches an order by these; currently
--       unindexed.
--
-- The immutability trigger (0003_commerce.sql:170-203) deliberately leaves
-- status / payment_status / payment_method / mp_* MUTABLE while freezing the
-- financial + contact snapshot — so this RPC's UPDATEs are allowed, and any
-- attempt to overwrite total_cents (amount-tamper) is blocked by the DB as a
-- defense-in-depth backstop behind the app-level amount reconciliation.

-- ---------------------------------------------------------------------------
-- (2) mp_payment_events — the webhook idempotency spine (R-3).
-- One row per Mercado Pago payment id we have ever processed. The UNIQUE on
-- mp_payment_id is the whole point: an INSERT ... ON CONFLICT (mp_payment_id)
-- DO NOTHING from the webhook is the atomic "have I seen this payment?" guard.
-- `raw` keeps a small audit trail (the mapped decision, never card data). The
-- order_id FK is ON DELETE CASCADE so deleting an order (admin, later) doesn't
-- leave a dangling event.
-- ---------------------------------------------------------------------------
create table if not exists mp_payment_events (
  id                    uuid primary key default gen_random_uuid(),
  mp_payment_id         text not null,
  order_id              uuid references orders (id) on delete cascade,
  mp_status             text,
  mp_status_detail      text,
  action                text,
  amount_cents          integer,
  raw                   jsonb,
  created_at            timestamptz not null default now()
);

-- The idempotency spine. A partial-free plain UNIQUE: every processed payment id
-- is recorded exactly once.
create unique index if not exists mp_payment_events_mp_payment_id_key
  on mp_payment_events (mp_payment_id);

-- Query the events for an order (audit / admin, T12).
create index if not exists mp_payment_events_order_id_idx
  on mp_payment_events (order_id);

-- RLS: deny anon entirely (mirrors the 0005 commerce posture). Only the
-- service_role (secret key) — which bypasses RLS — reads/writes this table.
alter table mp_payment_events enable row level security;
-- No policies added → anon/authenticated have zero access; service_role bypasses.

-- Table privileges. 0005's `grant all ... to service_role` was a point-in-time
-- grant over tables that existed THEN; this table is created later, so it needs
-- its own explicit grant (RLS bypass still requires the base table privilege).
-- anon/authenticated are granted nothing → fully denied (RLS + no privilege).
grant all on table mp_payment_events to service_role;

-- ---------------------------------------------------------------------------
-- (3) R-4 indexes — the webhook filters orders by these columns.
-- ---------------------------------------------------------------------------
create index if not exists orders_mp_payment_id_idx
  on orders (mp_payment_id)
  where mp_payment_id is not null;

create index if not exists orders_mp_external_reference_idx
  on orders (mp_external_reference)
  where mp_external_reference is not null;

-- ---------------------------------------------------------------------------
-- (1) advance_order_status(...) -> jsonb  (R-1)
--
-- Args (all optional except p_order_id + p_order_status + p_payment_status):
--   p_order_id       uuid            -- the order to transition
--   p_order_status   order_status    -- target order status
--   p_payment_status payment_status  -- target payment status
--   p_payment_method text            -- 'card'|'oxxo'|'spei'|'wallet'|null (only set if non-null)
--   p_mp_payment_id  text            -- MP payment id to persist (only set if non-null)
--   p_note           text            -- order_status_history note
--
-- Returns jsonb: { applied: bool, reason: text, from_status: text, to_status: text }
--   applied=false, reason='order_not_found'  — no such order
--   applied=false, reason='noop_same_status' — already at target order_status (idempotent, AC-15)
--   applied=false, reason='regression_blocked' — target precedes current (out-of-order, edge 2)
--   applied=true,  reason='advanced'         — transitioned + history row written
--
-- Idempotency (AC-15): if the order is ALREADY at p_order_status, we still
-- update the mutable payment fields (payment_status/method/mp_payment_id may
-- legitimately refine — e.g. a re-notification carrying the payment id) but we
-- do NOT write a duplicate order_status_history row and we report noop_same_status.
--
-- Regression guard (edge 2): a stale/lower-precedence order_status never moves a
-- more-advanced order backwards (e.g. a late `pending` after `paid`). Precedence
-- is the natural lifecycle order. `failed`/`rejected` map to order_status
-- 'pending_payment' (allow retry) which has the LOWEST rank, so a decline never
-- regresses a paid order either.
--
-- SECURITY DEFINER + empty search_path + service_role-only execute — identical
-- posture to create_order.
-- ---------------------------------------------------------------------------
create or replace function advance_order_status(
  p_order_id       uuid,
  p_order_status   order_status,
  p_payment_status payment_status,
  p_payment_method text default null,
  p_mp_payment_id  text default null,
  p_note           text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.orders%rowtype;
  v_from_rank int;
  v_to_rank   int;
begin
  -- Lock the order row for the duration of the transition so concurrent webhook
  -- deliveries for the same order serialize (belt-and-suspenders alongside the
  -- mp_payment_events unique guard, which is the primary dedupe).
  select * into v_current
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object(
      'applied', false,
      'reason',  'order_not_found',
      'from_status', null,
      'to_status',   p_order_status::text
    );
  end if;

  -- Lifecycle precedence (higher = more advanced). Used only to REFUSE a
  -- regression; a lateral move to the same rank is handled by the noop branch.
  v_from_rank := public.order_status_rank(v_current.status);
  v_to_rank   := public.order_status_rank(p_order_status);

  -- Regression guard: never move an order to an EARLIER lifecycle state (edge 2).
  -- 'cancelled' is terminal and has max rank so nothing overrides a cancel here.
  if v_to_rank < v_from_rank then
    return jsonb_build_object(
      'applied', false,
      'reason',  'regression_blocked',
      'from_status', v_current.status::text,
      'to_status',   p_order_status::text
    );
  end if;

  -- Idempotent same-status branch (AC-15): already at the target order status.
  -- Refine the mutable payment fields (a re-notification may now carry the
  -- payment id / method / a refined payment_status) but write NO history row.
  if v_current.status = p_order_status then
    update public.orders
      set payment_status = p_payment_status,
          payment_method = coalesce(p_payment_method, payment_method),
          mp_payment_id  = coalesce(p_mp_payment_id, mp_payment_id)
      where id = p_order_id;
    return jsonb_build_object(
      'applied', false,
      'reason',  'noop_same_status',
      'from_status', v_current.status::text,
      'to_status',   p_order_status::text
    );
  end if;

  -- Advance: update the mutable columns and write the history row atomically.
  update public.orders
    set status         = p_order_status,
        payment_status = p_payment_status,
        payment_method = coalesce(p_payment_method, payment_method),
        mp_payment_id  = coalesce(p_mp_payment_id, mp_payment_id)
    where id = p_order_id;

  insert into public.order_status_history (order_id, from_status, to_status, note)
    values (p_order_id, v_current.status, p_order_status, p_note);

  return jsonb_build_object(
    'applied', true,
    'reason',  'advanced',
    'from_status', v_current.status::text,
    'to_status',   p_order_status::text
  );
end;
$$;

-- Lifecycle rank helper — the natural order lifecycle. Higher = more advanced.
-- Pinned search_path; immutable (pure function of its input). Kept SEPARATE so
-- the precedence ordering is single-sourced and testable in isolation.
create or replace function order_status_rank(p_status order_status)
returns int
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'pending_payment' then 0
    when 'paid'            then 1
    when 'preparing'       then 2
    when 'shipped'         then 3
    when 'delivered'       then 4
    when 'cancelled'       then 5
  end;
$$;

-- Least privilege: only the service_role (the secret key the webhook + refund fn
-- use) may execute. anon/authenticated have NO access (matches create_order).
revoke all on function order_status_rank(order_status) from public;
revoke all on function advance_order_status(uuid, order_status, payment_status, text, text, text) from public;
grant execute on function advance_order_status(uuid, order_status, payment_status, text, text, text) to service_role;
