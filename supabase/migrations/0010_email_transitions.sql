-- 0010_email_transitions.sql
-- Transactional-email plumbing (T9). Idempotent, LOCAL-only (never pushed to the
-- empty/unlinked remote — project memory; verify with `supabase db reset`).
--
-- Four concerns, all additive over 0003/0008/0009:
--
--   (1) TD-2 — a STRUCTURED transition_kind (T8 Arch "fix before T9").
--       `order_status_history` gains a nullable `transition_kind text` column, and
--       `advance_order_status` is rewritten to DERIVE the transition_kind INSIDE
--       the RPC from (from_status, to_status, payment_status, p_order_status IS
--       NULL), return it in the jsonb result, AND write it to every history row.
--       T9 email triggers branch on this fixed enum — they NEVER string-match the
--       free-text `note`. A payment-only refund (from==to) is now unambiguously
--       `transition_kind='refunded'`.
--
--   (2) orders.locale — the per-order persisted UI locale.
--       Checkout runs under `/es-MX/` or `/en/`, but the MP webhook is a
--       server-to-server call with NO request-locale context. So the customer's
--       chosen language is PERSISTED on the order at creation and read by the
--       webhook path (getTranslations({locale})). Default 'es-MX', constrained to
--       the shipped locale set. `create_order` persists payload->>'locale'.
--
--   (3) email_sends — a durable send ledger (exactly-once across duplicate /
--       redelivered webhooks). unique(order_id, email_kind, dedupe_key); RLS-deny +
--       service_role grant (the 0005 blanket grant is point-in-time and does NOT
--       cover this later-created table — grant explicitly, this bit T8).
--
--   (4) claim_email_send(order_id, email_kind, dedupe_key) -> text — the claim RPC.
--       insert-on-conflict-do-nothing → 'new' / 'duplicate', mirroring
--       record_payment_event. SECURITY DEFINER, empty search_path, service_role
--       execute only.
--
-- The 0003 immutability trigger freezes the financial/contact snapshot; `locale`
-- is set ONCE at creation and is NOT in advance_order_status's UPDATE set, so it
-- is never mutated by a transition (edge 7). The trigger leaves status /
-- payment_status / payment_method / mp_* mutable, so this RPC's UPDATEs remain
-- allowed exactly as in 0009.

-- ---------------------------------------------------------------------------
-- (1a) orders.locale — persisted per-order UI locale.
-- Nullable-free with a default so pre-existing rows backfill to the storefront
-- default; a CHECK pins it to the shipped locale set so a bad value can never be
-- written (defense-in-depth behind the app-side locale validation).
-- ---------------------------------------------------------------------------
alter table orders
  add column if not exists locale text not null default 'es-MX';

-- Add the CHECK guardedly (a plain `add constraint` is not idempotent; drop-then-add
-- makes the migration re-runnable on an already-migrated local DB).
alter table orders drop constraint if exists orders_locale_check;
alter table orders
  add constraint orders_locale_check check (locale in ('es-MX', 'en'));

-- ---------------------------------------------------------------------------
-- (1b) order_status_history.transition_kind — the self-describing audit column.
-- Nullable (pre-existing rows have no derived kind); written by the RPC on every
-- new history-row insert. Emails NEVER parse the note; this is the branch key.
-- ---------------------------------------------------------------------------
alter table order_status_history
  add column if not exists transition_kind text;

-- ---------------------------------------------------------------------------
-- (2) transition_kind derivation — a pure, single-sourced helper.
-- Higher-level than order_status_rank: maps a concrete transition to the fixed
-- taxonomy the app + emails agree on. Kept SEPARATE so the mapping is testable in
-- isolation and single-sourced (SRP). Pinned empty search_path; immutable.
--
-- The fixed set (AC-2):
--   paid | payment_pending | payment_failed | payment_authorized | refunded |
--   shipped | cancelled | delivered | preparing | noop
--
-- Derivation rules:
--   * payment-only mode (p_order_status IS NULL): the kind is decided by the
--     payment_status alone — 'refunded' for refunded, 'payment_pending'/
--     'payment_failed'/'payment_authorized'/'paid' for the matching payment
--     states, else 'noop'.
--   * order-status mode: the kind is the DESTINATION order status
--     (paid/preparing/shipped/delivered/cancelled). When the destination equals
--     'paid' but the payment did not become paid (defensive), fall back to the
--     payment-state kind so a mislabeled call is still meaningful.
-- ---------------------------------------------------------------------------
create or replace function email_transition_kind(
  p_to_status      order_status,
  p_payment_status payment_status,
  p_payment_only   boolean
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_payment_only then
      case p_payment_status
        when 'refunded'   then 'refunded'
        when 'paid'       then 'paid'
        when 'authorized' then 'payment_authorized'
        when 'failed'     then 'payment_failed'
        when 'pending'    then 'payment_pending'
        else 'noop'
      end
    else
      case p_to_status
        when 'paid' then
          case p_payment_status
            when 'paid'       then 'paid'
            when 'authorized' then 'payment_authorized'
            when 'failed'     then 'payment_failed'
            when 'pending'    then 'payment_pending'
            else 'paid'
          end
        when 'preparing' then 'preparing'
        when 'shipped'   then 'shipped'
        when 'delivered' then 'delivered'
        when 'cancelled' then 'cancelled'
        when 'pending_payment' then
          case p_payment_status
            when 'failed'     then 'payment_failed'
            when 'authorized' then 'payment_authorized'
            when 'pending'    then 'payment_pending'
            else 'payment_pending'
          end
        else 'noop'
      end
  end;
$$;

-- ---------------------------------------------------------------------------
-- (2b) advance_order_status — rewritten to derive + return + persist
-- transition_kind. Behavior is otherwise IDENTICAL to 0009 (same regression
-- guard, same idempotent same-status branch, same payment-only mode). The ONLY
-- additions are: the `transition_kind` field in every jsonb result, and the
-- `transition_kind` column on every history-row insert. `create or replace`
-- keeps the same signature so 0009's grant/revoke still apply.
--
-- Returns jsonb (0009 fields + one new field):
--   { applied, reason, from_status, to_status, transition_kind }
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
  v_kind text;
begin
  select * into v_current
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object(
      'applied', false,
      'reason',  'order_not_found',
      'from_status', null,
      'to_status',   coalesce(p_order_status::text, null),
      'transition_kind', 'noop'
    );
  end if;

  v_payment_changed := v_current.payment_status is distinct from p_payment_status;

  -- Payment-only mode (p_order_status IS NULL): set payment fields, keep order
  -- status, write a history row for the payment_status change (C-2). The kind is
  -- derived from the payment_status (refunded/pending/failed/authorized/paid).
  if p_order_status is null then
    v_kind := public.email_transition_kind(v_current.status, p_payment_status, true);

    update public.orders
      set payment_status = p_payment_status,
          payment_method = coalesce(p_payment_method, payment_method),
          mp_payment_id  = coalesce(p_mp_payment_id, mp_payment_id)
      where id = p_order_id;

    if v_payment_changed then
      insert into public.order_status_history
        (order_id, from_status, to_status, note, transition_kind)
        values (p_order_id, v_current.status, v_current.status, p_note, v_kind);
    end if;

    return jsonb_build_object(
      'applied', true,
      'reason',  'payment_updated',
      'from_status', v_current.status::text,
      'to_status',   v_current.status::text,
      'transition_kind', v_kind
    );
  end if;

  v_from_rank := public.order_status_rank(v_current.status);
  v_to_rank   := public.order_status_rank(p_order_status);

  -- Regression guard: never move an order to an EARLIER lifecycle state (edge 2).
  if v_to_rank < v_from_rank then
    return jsonb_build_object(
      'applied', false,
      'reason',  'regression_blocked',
      'from_status', v_current.status::text,
      'to_status',   p_order_status::text,
      'transition_kind', 'noop'
    );
  end if;

  -- Idempotent same-status branch (AC-15): already at the target order status.
  if v_current.status = p_order_status then
    v_kind := public.email_transition_kind(p_order_status, p_payment_status, false);

    update public.orders
      set payment_status = p_payment_status,
          payment_method = coalesce(p_payment_method, payment_method),
          mp_payment_id  = coalesce(p_mp_payment_id, mp_payment_id)
      where id = p_order_id;

    if v_payment_changed then
      insert into public.order_status_history
        (order_id, from_status, to_status, note, transition_kind)
        values (p_order_id, v_current.status, p_order_status, p_note, v_kind);
    end if;

    return jsonb_build_object(
      'applied', v_payment_changed,
      'reason',  'noop_same_status',
      'from_status', v_current.status::text,
      'to_status',   p_order_status::text,
      -- A truly-identical re-notification (no payment change) is a 'noop' for
      -- email purposes so a redelivery never re-triggers a customer email; a
      -- material payment change reports the derived kind.
      'transition_kind', case when v_payment_changed then v_kind else 'noop' end
    );
  end if;

  -- Advance: update the mutable columns and write the history row atomically.
  v_kind := public.email_transition_kind(p_order_status, p_payment_status, false);

  update public.orders
    set status         = p_order_status,
        payment_status = p_payment_status,
        payment_method = coalesce(p_payment_method, payment_method),
        mp_payment_id  = coalesce(p_mp_payment_id, mp_payment_id)
    where id = p_order_id;

  insert into public.order_status_history
    (order_id, from_status, to_status, note, transition_kind)
    values (p_order_id, v_current.status, p_order_status, p_note, v_kind);

  return jsonb_build_object(
    'applied', true,
    'reason',  'advanced',
    'from_status', v_current.status::text,
    'to_status',   p_order_status::text,
    'transition_kind', v_kind
  );
end;
$$;

-- Re-assert least privilege after the create-or-replace (0009 granted these; a
-- replace preserves grants, but re-stating is idempotent and self-documenting).
revoke all on function email_transition_kind(order_status, payment_status, boolean) from public;
revoke all on function advance_order_status(uuid, order_status, payment_status, text, text, text) from public;
grant execute on function advance_order_status(uuid, order_status, payment_status, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- (3) email_sends — durable send ledger (exactly-once, AC-5).
-- One row per (order, email_kind, dedupe_key) we have ever CLAIMED. The UNIQUE is
-- the whole point: a duplicate/redelivered webhook that re-reaches the same
-- trigger collides and is rejected, so a customer never gets two of the same
-- email. dedupe_key = mp_payment_id for payment-linked emails (payment_received,
-- voucher), '' for one-per-order emails (order_confirmation, new_order_owner).
-- Coalesced to '' + NOT NULL default so NULLs never break the UNIQUE (a UNIQUE
-- treats NULLs as distinct). `sent_at` is set after a successful provider send
-- (claim-then-finalize): a claim left un-finalized (provider down) is retryable
-- by a later redelivery. The order_id FK is ON DELETE CASCADE.
-- ---------------------------------------------------------------------------
create table if not exists email_sends (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references orders (id) on delete cascade,
  email_kind   text not null,
  dedupe_key   text not null default '',
  sent_at      timestamptz,
  created_at   timestamptz not null default now()
);

create unique index if not exists email_sends_order_kind_dedupe_key
  on email_sends (order_id, email_kind, dedupe_key);
create index if not exists email_sends_order_id_idx
  on email_sends (order_id);

-- RLS: deny anon/authenticated entirely (mirrors the 0009 payment-table posture).
alter table email_sends enable row level security;
-- No policies → anon/authenticated fully denied; service_role bypasses RLS.

-- Explicit grant: 0005's blanket grant is point-in-time and does NOT cover this
-- later-created table (this bit T8). anon/authenticated get nothing → fully denied.
grant all on table email_sends to service_role;

-- ---------------------------------------------------------------------------
-- (4) claim_email_send(...) -> text  (exactly-once claim, AC-5).
-- Atomically CLAIM an (order_id, email_kind, dedupe_key) triple for sending.
--   'new'       — first claim (this caller should render + send, then finalize).
--   'duplicate' — a claim for this triple already exists → the caller no-ops
--                 (a duplicate webhook delivery never double-sends).
-- insert-on-conflict-do-nothing, mirroring record_payment_event. `sent_at` lands
-- NULL; finalize_email_send stamps it after a successful send. A finalized OR an
-- un-finalized prior claim both return 'duplicate' here: unlike the payment spine
-- we do NOT re-attempt un-finalized email claims automatically (Phase-1 email is
-- best-effort; the ledger row enables a FUTURE manual/queue retry without
-- double-sending — see dev-done "Known Limitations").
--
-- SECURITY DEFINER + empty search_path + service_role-only execute.
-- ---------------------------------------------------------------------------
create or replace function claim_email_send(
  p_order_id   uuid,
  p_email_kind text,
  p_dedupe_key text default ''
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := coalesce(p_dedupe_key, '');
begin
  insert into public.email_sends (order_id, email_kind, dedupe_key, sent_at)
  values (p_order_id, p_email_kind, v_key, null)
  on conflict (order_id, email_kind, dedupe_key) do nothing;

  if found then
    return 'new';
  end if;
  return 'duplicate';
end;
$$;

-- Finalize a claimed send after the provider accepted it (stamps sent_at).
-- Idempotent; a failure here only means the row stays un-finalized (harmless —
-- the claim already prevents a re-send).
create or replace function finalize_email_send(
  p_order_id   uuid,
  p_email_kind text,
  p_dedupe_key text default ''
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.email_sends
    set sent_at = now()
    where order_id = p_order_id
      and email_kind = p_email_kind
      and dedupe_key = coalesce(p_dedupe_key, '')
      and sent_at is null;
$$;

revoke all on function claim_email_send(uuid, text, text) from public;
revoke all on function finalize_email_send(uuid, text, text) from public;
grant execute on function claim_email_send(uuid, text, text) to service_role;
grant execute on function finalize_email_send(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- (5) create_order — persist payload->>'locale' onto the new column.
-- `create or replace` re-declares the 0008 function verbatim EXCEPT for the two
-- lines that write `locale`. The active request locale is threaded through the
-- payload by the checkout action; an absent/invalid value falls back to 'es-MX'
-- (the column default is the ultimate backstop, and the CHECK rejects a bad tag).
-- Everything else is byte-for-byte the 0008 body (idempotency, guarded stock
-- decrement, discount redemption, snapshot inserts, initial history row).
-- ---------------------------------------------------------------------------
create or replace function create_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_idempotency_key text := nullif(payload->>'idempotency_key', '');
  v_existing        public.orders%rowtype;
  v_customer_id     uuid;
  v_order_id        uuid;
  v_order_number    text;
  v_confirmation_token uuid;
  v_seq             bigint;
  v_item            jsonb;
  v_product_id      uuid;
  v_variant_id      uuid;
  v_quantity        integer;
  v_updated_id      uuid;
  v_discount_code   text := nullif(payload->>'discount_code', '');
  -- New (T9): the persisted UI locale, clamped to the shipped set with an es-MX
  -- fallback so a missing/tampered payload value can never violate the CHECK.
  v_locale          text := case
                              when payload->>'locale' in ('es-MX', 'en')
                                then payload->>'locale'
                              else 'es-MX'
                            end;
begin
  if v_idempotency_key is null then
    raise exception 'idempotency_key is required'
      using errcode = 'raise_exception';
  end if;

  select * into v_existing
  from public.orders
  where idempotency_key = v_idempotency_key
  limit 1;
  if found then
    return jsonb_build_object(
      'order_number',       v_existing.order_number,
      'order_id',           v_existing.id,
      'confirmation_token', v_existing.confirmation_token,
      'reused',             true
    );
  end if;

  for v_item in select * from jsonb_array_elements(payload->'items')
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_variant_id := nullif(v_item->>'variant_id', '')::uuid;
    v_quantity   := (v_item->>'quantity')::integer;

    if v_variant_id is not null then
      update public.product_variants
        set stock = stock - v_quantity
        where id = v_variant_id and stock >= v_quantity
        returning id into v_updated_id;
    else
      update public.products
        set stock = stock - v_quantity
        where id = v_product_id and stock >= v_quantity
        returning id into v_updated_id;
    end if;

    if v_updated_id is null then
      raise exception 'OUT_OF_STOCK:%:%',
        v_product_id, coalesce(v_variant_id::text, '-')
        using errcode = 'raise_exception';
    end if;

    update public.products
      set sales_count = sales_count + v_quantity
      where id = v_product_id;
  end loop;

  if v_discount_code is not null then
    update public.discount_codes
      set times_redeemed = times_redeemed + 1
      where upper(code) = upper(v_discount_code)
        and is_active
        and (starts_at is null or starts_at <= now())
        and (ends_at is null or ends_at >= now())
        and (max_redemptions is null or times_redeemed < max_redemptions);
    if not found then
      raise exception 'DISCOUNT_EXHAUSTED'
        using errcode = 'raise_exception';
    end if;
  end if;

  insert into public.customers (email, full_name, phone)
    values (
      payload->>'contact_email',
      payload->>'shipping_full_name',
      nullif(payload->>'contact_phone', '')
    )
    returning id into v_customer_id;

  v_seq := nextval('public.order_number_seq');
  v_order_number := 'PP-' || lpad(v_seq::text, 6, '0');

  insert into public.orders (
    order_number, customer_id, idempotency_key,
    contact_email, contact_phone,
    shipping_full_name, shipping_address_line1, shipping_address_line2,
    shipping_city, shipping_state, shipping_postal_code,
    delivery_notes, rfc,
    subtotal_cents, shipping_cents, discount_cents,
    tax_base_cents, tax_cents, total_cents,
    status, payment_status, locale
  ) values (
    v_order_number, v_customer_id, v_idempotency_key,
    payload->>'contact_email', nullif(payload->>'contact_phone', ''),
    payload->>'shipping_full_name', payload->>'shipping_address_line1',
    nullif(payload->>'shipping_address_line2', ''),
    payload->>'shipping_city', payload->>'shipping_state',
    payload->>'shipping_postal_code',
    nullif(payload->>'delivery_notes', ''), nullif(payload->>'rfc', ''),
    (payload->>'subtotal_cents')::integer,
    (payload->>'shipping_cents')::integer,
    (payload->>'discount_cents')::integer,
    (payload->>'tax_base_cents')::integer,
    (payload->>'tax_cents')::integer,
    (payload->>'total_cents')::integer,
    'pending_payment', 'pending', v_locale
  )
  returning id, confirmation_token into v_order_id, v_confirmation_token;

  for v_item in select * from jsonb_array_elements(payload->'items')
  loop
    insert into public.order_items (
      order_id, product_id, variant_id,
      product_name, product_sku, variant_label,
      unit_price_cents, quantity, line_total_cents
    ) values (
      v_order_id,
      (v_item->>'product_id')::uuid,
      nullif(v_item->>'variant_id', '')::uuid,
      v_item->>'product_name',
      v_item->>'product_sku',
      nullif(v_item->>'variant_label', ''),
      (v_item->>'unit_price_cents')::integer,
      (v_item->>'quantity')::integer,
      (v_item->>'line_total_cents')::integer
    );
  end loop;

  insert into public.order_status_history (order_id, from_status, to_status, note, transition_kind)
    values (v_order_id, null, 'pending_payment', 'Order created at checkout (T7)', 'noop');

  return jsonb_build_object(
    'order_number',       v_order_number,
    'order_id',           v_order_id,
    'confirmation_token', v_confirmation_token,
    'reused',             false
  );
end;
$$;

revoke all on function create_order(jsonb) from public;
grant execute on function create_order(jsonb) to service_role;
