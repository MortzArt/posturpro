-- 0009_payments.sql
-- Mercado Pago payment plumbing (T8). All idempotent, LOCAL-only (never pushed to
-- the empty/unlinked remote — project memory). Four things:
--
--   (1) advance_order_status(...) RPC  (T7 Arch R-1)
--       The ONE path that changes an order's status / payment_status /
--       payment_method / mp_payment_id. It writes the mutable columns AND an
--       order_status_history row in a SINGLE transaction, is idempotent (a repeat
--       transition to the same order status is a no-op, no duplicate history row),
--       and refuses to REGRESS an order to an earlier state (out-of-order webhook
--       guard, edge 2). A NULL p_order_status means "payment-only": set the
--       payment fields and WRITE a history row for the payment_status change
--       without touching order_status (the refunded/refund path, C-2/m-1).
--       SECURITY DEFINER, pinned empty search_path, execute granted only to
--       service_role — matching the create_order RPC posture (0008_checkout.sql).
--
--   (2) mp_payment_events table  (T7 Arch R-3)
--       The webhook idempotency SPINE, keyed per (mp_payment_id, mp_status) so a
--       payment id's status PROGRESSIONS (OXXO/SPEI pending → approved; approved →
--       refunded → charged_back) each get their own row and are each processed
--       exactly once, while a true replay of the SAME (id,status) is a no-op
--       (M-1, AC-18). Claim-then-finalize: a row is inserted with processed_at
--       NULL, and finalized only after a successful advance — so a crash between
--       claim and advance is retryable, not a permanent stuck order (M-6).
--
--   (3) payment_refunds ledger  (M-2, M-3)
--       A durable, append-only record of every refund we issue (keyed by MP refund
--       id), so a partial refund has an audit trail and the cumulative-refund
--       guard can be enforced race-safely in SQL (sum of refunds <= order total).
--
--   (4) Indexes on orders(mp_payment_id) and orders(mp_external_reference)
--       (T7 Arch R-4) — the webhook matches an order by these; currently unindexed.
--
-- The immutability trigger (0003_commerce.sql:170-203) deliberately leaves
-- status / payment_status / payment_method / mp_* MUTABLE while freezing the
-- financial + contact snapshot — so this RPC's UPDATEs are allowed, and any
-- attempt to overwrite total_cents (amount-tamper) is blocked by the DB as a
-- defense-in-depth backstop behind the app-level amount reconciliation.

-- ---------------------------------------------------------------------------
-- (2) mp_payment_events — the webhook idempotency spine (R-3, reworked M-1/M-6).
-- One row per (Mercado Pago payment id, mp_status) we have ever CLAIMED. The
-- UNIQUE on (mp_payment_id, mp_status) is the whole point: a re-delivery of the
-- SAME (id, status) collides, but a status PROGRESSION for the same id gets its
-- own row and is processed. `processed_at` implements claim-then-finalize (M-6):
-- inserted NULL, set on a successful advance; an unfinalized claim (e.g. crash
-- after claim, before advance) is reclaimable so the retry reprocesses.
-- The recorded columns (mp_status, mp_status_detail, action, amount_cents) ARE the
-- PII-free audit trail — no `raw` blob is stored (N-5: an unwritten column is
-- worse than none). The order_id FK is ON DELETE CASCADE so deleting an order
-- (admin, later) doesn't leave a dangling event.
-- ---------------------------------------------------------------------------
create table if not exists mp_payment_events (
  id                    uuid primary key default gen_random_uuid(),
  mp_payment_id         text not null,
  order_id              uuid references orders (id) on delete cascade,
  mp_status             text,
  mp_status_detail      text,
  action                text,
  amount_cents          integer,
  processed_at          timestamptz,
  created_at            timestamptz not null default now()
);

-- Drop a `raw` column if a prior 0009 created it (N-5: it was never written).
alter table mp_payment_events drop column if exists raw;

-- Re-key existing local databases: drop the old payment-id-only unique index if a
-- prior 0009 created it, and add the (mp_payment_id, mp_status) index. mp_status
-- is coalesced to '' so NULL statuses still dedupe deterministically (a UNIQUE
-- treats NULLs as distinct, which would let a null-status replay through).
drop index if exists mp_payment_events_mp_payment_id_key;
alter table mp_payment_events
  alter column mp_status set default '';
update mp_payment_events set mp_status = '' where mp_status is null;
alter table mp_payment_events
  alter column mp_status set not null;
alter table mp_payment_events
  add column if not exists processed_at timestamptz;

create unique index if not exists mp_payment_events_payment_status_key
  on mp_payment_events (mp_payment_id, mp_status);

-- Query the events for an order / a payment id (audit / admin, T12).
create index if not exists mp_payment_events_order_id_idx
  on mp_payment_events (order_id);
create index if not exists mp_payment_events_mp_payment_id_idx
  on mp_payment_events (mp_payment_id);

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
-- (3) payment_refunds — durable refund ledger (M-2, M-3).
-- Append-only. One row per refund we issue, keyed by the MP refund id (unique) so
-- retrying the SAME refund does not double-count. `amount_cents` is the refunded
-- amount in integer cents. The cumulative-refund guard sums this per order.
-- ---------------------------------------------------------------------------
create table if not exists payment_refunds (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references orders (id) on delete cascade,
  mp_payment_id      text not null,
  mp_refund_id       text not null,
  amount_cents       integer not null check (amount_cents > 0),
  is_full            boolean not null,
  created_at         timestamptz not null default now()
);

-- One ledger row per MP refund id (retrying the same refund is a no-op insert).
create unique index if not exists payment_refunds_mp_refund_id_key
  on payment_refunds (mp_refund_id);
create index if not exists payment_refunds_order_id_idx
  on payment_refunds (order_id);

alter table payment_refunds enable row level security;
grant all on table payment_refunds to service_role;

-- ---------------------------------------------------------------------------
-- (4) R-4 indexes — the webhook filters orders by these columns.
-- ---------------------------------------------------------------------------
create index if not exists orders_mp_payment_id_idx
  on orders (mp_payment_id)
  where mp_payment_id is not null;

create index if not exists orders_mp_external_reference_idx
  on orders (mp_external_reference)
  where mp_external_reference is not null;

-- ---------------------------------------------------------------------------
-- Lifecycle rank helper — the natural order lifecycle. Higher = more advanced.
-- Pinned search_path; immutable (pure function of its input). Kept SEPARATE so
-- the precedence ordering is single-sourced and testable in isolation. Declared
-- before advance_order_status because that function calls it.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- (1) advance_order_status(...) -> jsonb  (R-1)
--
-- Args (p_order_id + p_payment_status required; p_order_status may be NULL):
--   p_order_id       uuid            -- the order to transition
--   p_order_status   order_status    -- target order status, or NULL = payment-only
--   p_payment_status payment_status  -- target payment status
--   p_payment_method text            -- 'card'|'oxxo'|'spei'|'wallet'|null (only set if non-null)
--   p_mp_payment_id  text            -- MP payment id to persist (only set if non-null)
--   p_note           text            -- order_status_history note
--
-- Returns jsonb: { applied: bool, reason: text, from_status: text, to_status: text }
--   applied=false, reason='order_not_found'    — no such order
--   applied=false, reason='noop_same_status'   — already at target order status; payment
--                                                fields refined; history written ONLY if
--                                                payment_status materially changed (m-1)
--   applied=false, reason='regression_blocked' — target precedes current (out-of-order, edge 2)
--   applied=true,  reason='advanced'           — order status transitioned + history row written
--   applied=true,  reason='payment_updated'    — payment-only change (p_order_status NULL);
--                                                payment fields + a history row written (C-2)
--
-- Payment-only mode (C-2, m-1): a `refunded` webhook / refund flow must record a
-- payment_status change (and its audit history row) WITHOUT asserting an order
-- status — otherwise it either regresses a shipped order (regression_blocked) or
-- silently drops the change on a plain paid order. Passing p_order_status = NULL
-- sets the payment fields, leaves order_status untouched, and writes a history
-- row (from_status = to_status = current order status) so the money-state change
-- is audited (AC-13).
--
-- Idempotency (AC-15): if p_order_status equals the current order status, we still
-- refine the mutable payment fields (payment_status/method/mp_payment_id may
-- legitimately change) and we write a history row IFF payment_status materially
-- changed (m-1); we never write a history row for a truly-identical re-notification.
--
-- Regression guard (edge 2): a stale/lower-precedence order_status never moves a
-- more-advanced order backwards. `failed`/`rejected` map to 'pending_payment'
-- (allow retry), the lowest rank, so a decline never regresses a paid order.
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
  v_payment_changed boolean;
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
      'to_status',   coalesce(p_order_status::text, null)
    );
  end if;

  v_payment_changed := v_current.payment_status is distinct from p_payment_status;

  -- Payment-only mode (p_order_status IS NULL): set payment fields, keep order
  -- status, and write a history row for the payment_status change so a refund /
  -- refunded webhook on ANY order state (paid, shipped, ...) is audited (C-2).
  if p_order_status is null then
    update public.orders
      set payment_status = p_payment_status,
          payment_method = coalesce(p_payment_method, payment_method),
          mp_payment_id  = coalesce(p_mp_payment_id, mp_payment_id)
      where id = p_order_id;

    if v_payment_changed then
      insert into public.order_status_history (order_id, from_status, to_status, note)
        values (p_order_id, v_current.status, v_current.status, p_note);
    end if;

    return jsonb_build_object(
      'applied', true,
      'reason',  'payment_updated',
      'from_status', v_current.status::text,
      'to_status',   v_current.status::text
    );
  end if;

  -- Lifecycle precedence (higher = more advanced). Used only to REFUSE a
  -- regression; a lateral move to the same rank is handled by the noop branch.
  v_from_rank := public.order_status_rank(v_current.status);
  v_to_rank   := public.order_status_rank(p_order_status);

  -- Regression guard: never move an order to an EARLIER lifecycle state (edge 2).
  if v_to_rank < v_from_rank then
    return jsonb_build_object(
      'applied', false,
      'reason',  'regression_blocked',
      'from_status', v_current.status::text,
      'to_status',   p_order_status::text
    );
  end if;

  -- Idempotent same-status branch (AC-15): already at the target order status.
  -- Refine the mutable payment fields; write a history row IFF payment_status
  -- materially changed (m-1 — e.g. paid → refunded on a plain paid order), else
  -- a truly-identical re-notification writes nothing.
  if v_current.status = p_order_status then
    update public.orders
      set payment_status = p_payment_status,
          payment_method = coalesce(p_payment_method, payment_method),
          mp_payment_id  = coalesce(p_mp_payment_id, mp_payment_id)
      where id = p_order_id;

    if v_payment_changed then
      insert into public.order_status_history (order_id, from_status, to_status, note)
        values (p_order_id, v_current.status, p_order_status, p_note);
    end if;

    return jsonb_build_object(
      'applied', v_payment_changed,
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

-- ---------------------------------------------------------------------------
-- record_payment_event(...) -> text  (M-1 / M-6 claim-then-finalize spine)
--
-- Atomically CLAIM a (mp_payment_id, mp_status) pair for processing. Returns:
--   'new'       — first claim (or a re-claim of an unfinalized prior claim); the
--                 caller should process and then call finalize_payment_event.
--   'duplicate' — a claim for this (id, status) already exists AND was finalized
--                 (processed_at set) → the caller no-ops (true replay, AC-10).
--   'error'     — never returned by this fn (errors raise; the caller catches).
--
-- Claim-then-finalize (M-6): the insert lands processed_at NULL. If a prior claim
-- exists but is NOT finalized (a crash between claim and advance, or a concurrent
-- in-flight delivery whose txn hasn't committed), we return 'new' so the retry
-- reprocesses — the advance is itself idempotent, so reprocessing is safe. A
-- finalized prior claim is a genuine duplicate.
--
-- SECURITY DEFINER + empty search_path + service_role-only execute.
-- ---------------------------------------------------------------------------
create or replace function record_payment_event(
  p_mp_payment_id    text,
  p_mp_status        text,
  p_order_id         uuid    default null,
  p_mp_status_detail text    default null,
  p_action           text    default null,
  p_amount_cents     integer default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text := coalesce(p_mp_status, '');
  v_existing public.mp_payment_events%rowtype;
begin
  insert into public.mp_payment_events
    (mp_payment_id, mp_status, order_id, mp_status_detail, action, amount_cents, processed_at)
  values
    (p_mp_payment_id, v_status, p_order_id, p_mp_status_detail, p_action, p_amount_cents, null)
  on conflict (mp_payment_id, mp_status) do nothing;

  if found then
    return 'new';
  end if;

  -- Conflict: a claim for this (id, status) already exists. Finalized → duplicate;
  -- unfinalized → allow the retry to reprocess (M-6).
  select * into v_existing
  from public.mp_payment_events
  where mp_payment_id = p_mp_payment_id and mp_status = v_status
  for update;

  if v_existing.processed_at is not null then
    return 'duplicate';
  end if;

  -- Refresh the unfinalized claim's context (order may now be matched) and let the
  -- caller reprocess.
  update public.mp_payment_events
    set order_id         = coalesce(p_order_id, order_id),
        mp_status_detail = coalesce(p_mp_status_detail, mp_status_detail),
        action           = coalesce(p_action, action),
        amount_cents     = coalesce(p_amount_cents, amount_cents)
    where id = v_existing.id;
  return 'new';
end;
$$;

-- Finalize a claimed event after a successful advance (M-6). Idempotent.
create or replace function finalize_payment_event(
  p_mp_payment_id text,
  p_mp_status     text
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.mp_payment_events
    set processed_at = now()
    where mp_payment_id = p_mp_payment_id
      and mp_status = coalesce(p_mp_status, '')
      and processed_at is null;
$$;

-- ---------------------------------------------------------------------------
-- record_refund(...) -> jsonb  (M-2 / M-3 durable ledger + cumulative guard)
--
-- Race-safe cumulative-refund guard + durable audit. Locks the order, sums the
-- existing ledger rows, and refuses if (prior_refunded + p_amount_cents) exceeds
-- the order total. On success inserts a ledger row keyed by the MP refund id
-- (unique — a retry of the SAME refund id is a no-op that returns 'duplicate').
--
-- Returns jsonb: { ok: bool, reason: text, prior_refunded_cents: int, total_refunded_cents: int }
--   ok=false, reason='order_not_found'
--   ok=false, reason='over_refund'      — would exceed the order total (edge 9)
--   ok=true,  reason='recorded'
--   ok=true,  reason='duplicate'        — this mp_refund_id already recorded
--
-- SECURITY DEFINER + empty search_path + service_role-only execute.
-- ---------------------------------------------------------------------------
create or replace function record_refund(
  p_order_id      uuid,
  p_mp_payment_id text,
  p_mp_refund_id  text,
  p_amount_cents  integer,
  p_is_full       boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total     int;
  v_prior     int;
begin
  select total_cents into v_total
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'order_not_found',
      'prior_refunded_cents', 0, 'total_refunded_cents', 0);
  end if;

  -- Already recorded this exact MP refund id? No-op (retry safety, M-3).
  if exists (select 1 from public.payment_refunds where mp_refund_id = p_mp_refund_id) then
    select coalesce(sum(amount_cents), 0) into v_prior
    from public.payment_refunds where order_id = p_order_id;
    return jsonb_build_object('ok', true, 'reason', 'duplicate',
      'prior_refunded_cents', v_prior, 'total_refunded_cents', v_prior);
  end if;

  select coalesce(sum(amount_cents), 0) into v_prior
  from public.payment_refunds
  where order_id = p_order_id;

  -- Cumulative guard (edge 9): sum of refunds must never exceed the order total.
  if v_prior + p_amount_cents > v_total then
    return jsonb_build_object('ok', false, 'reason', 'over_refund',
      'prior_refunded_cents', v_prior, 'total_refunded_cents', v_prior);
  end if;

  insert into public.payment_refunds
    (order_id, mp_payment_id, mp_refund_id, amount_cents, is_full)
  values
    (p_order_id, p_mp_payment_id, p_mp_refund_id, p_amount_cents, p_is_full);

  return jsonb_build_object('ok', true, 'reason', 'recorded',
    'prior_refunded_cents', v_prior, 'total_refunded_cents', v_prior + p_amount_cents);
end;
$$;

-- ---------------------------------------------------------------------------
-- refunded_total(...) -> int  (M-2 read helper: cumulative refunded cents)
-- Sum of the ledger for an order. Used by the refund fn to pre-check the
-- remaining balance before calling MP (the record_refund guard is the race-safe
-- authority; this is a friendly early reject).
-- ---------------------------------------------------------------------------
create or replace function refunded_total(p_order_id uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(amount_cents), 0)::int
  from public.payment_refunds
  where order_id = p_order_id;
$$;

-- ---------------------------------------------------------------------------
-- Least privilege: only the service_role (the secret key the webhook + refund fn
-- use) may execute. anon/authenticated have NO access (matches create_order).
-- ---------------------------------------------------------------------------
revoke all on function order_status_rank(order_status) from public;
revoke all on function advance_order_status(uuid, order_status, payment_status, text, text, text) from public;
revoke all on function record_payment_event(text, text, uuid, text, text, integer) from public;
revoke all on function finalize_payment_event(text, text) from public;
revoke all on function record_refund(uuid, text, text, integer, boolean) from public;
revoke all on function refunded_total(uuid) from public;

grant execute on function advance_order_status(uuid, order_status, payment_status, text, text, text) to service_role;
grant execute on function record_payment_event(text, text, uuid, text, text, integer) to service_role;
grant execute on function finalize_payment_event(text, text) to service_role;
grant execute on function record_refund(uuid, text, text, integer, boolean) to service_role;
grant execute on function refunded_total(uuid) to service_role;
