-- 0008_checkout.sql
-- Atomic checkout: reserve stock + create the order in ONE transaction (T7 AC-9,
-- AC-10, AC-11, AC-14, edges 2 & 8). The Supabase JS client cannot span a
-- transaction across multiple `.insert()` calls, so the reserve-and-create is a
-- single plpgsql function invoked via `admin.rpc('create_order', ...)`.
--
-- Guarantees:
--   * per-line guarded stock decrement (UPDATE ... WHERE stock >= qty RETURNING
--     id) — zero rows → raise → whole call rolls back (last-unit race, edge 2);
--     the row lock Postgres takes on the matched row serializes concurrent
--     decrements so stock never goes negative (the stock >= 0 CHECK is the floor).
--   * customers + orders + order_items + initial order_status_history inserted in
--     the same implicit transaction; sales_count bumped by quantity (AC-10).
--   * a DB-generated unique order number (sequence-backed) satisfies the
--     NOT NULL UNIQUE constraint without app coordination.
--   * idempotency: a client-supplied key is stored; a repeat call with the same
--     key returns the ORIGINAL order instead of creating a second (AC-14, edge 7).
--   * discount redemption incremented with a bound check inside the transaction
--     (concurrent over-redemption rolls back).
--
-- Idempotent migration (create-or-replace + guarded DO blocks). LOCAL Docker
-- Supabase only — never pushed to the empty/unlinked remote (project memory).

-- ---------------------------------------------------------------------------
-- Order-number sequence. A dedicated sequence guarantees a gap-tolerant, unique,
-- monotonically increasing integer with no app-side coordination. The display
-- number is PREFIX-<zero-padded seq> (matches formatOrderNumber in TS + config).
-- ---------------------------------------------------------------------------
create sequence if not exists order_number_seq start with 1 increment by 1;

-- ---------------------------------------------------------------------------
-- Idempotency: a client-generated key threaded through the action. A unique
-- index lets a retry map back to the already-created order (AC-14). Nullable so
-- pre-existing rows and non-idempotent callers are unaffected; partial unique
-- so only non-null keys are constrained.
-- ---------------------------------------------------------------------------
alter table orders add column if not exists idempotency_key text;
create unique index if not exists orders_idempotency_key_key
  on orders (idempotency_key)
  where idempotency_key is not null;

-- ---------------------------------------------------------------------------
-- create_order(payload jsonb) -> jsonb
--
-- payload shape (all cents are integers; validated + assembled server-side):
-- {
--   "idempotency_key": "uuid-string",            -- required, non-empty
--   "contact_email": "...", "contact_phone": null | "...",
--   "shipping_full_name": "...", "shipping_address_line1": "...",
--   "shipping_address_line2": null | "...", "shipping_city": "...",
--   "shipping_state": "...", "shipping_postal_code": "...",
--   "delivery_notes": null | "...", "rfc": null | "...",
--   "subtotal_cents": 0, "shipping_cents": 0, "discount_cents": 0,
--   "tax_base_cents": 0, "tax_cents": 0, "total_cents": 0,
--   "discount_code": null | "NORMALIZED",        -- to increment times_redeemed
--   "items": [
--     { "product_id": "uuid", "variant_id": null | "uuid",
--       "product_name": "...", "product_sku": "...", "variant_label": null | "...",
--       "unit_price_cents": 0, "quantity": 1, "line_total_cents": 0 }
--   ]
-- }
--
-- Returns: { "order_number": "...", "order_id": "uuid", "reused": bool }
-- Raises (mapped to friendly enums by the action, never echoed raw):
--   'OUT_OF_STOCK:<product_id>:<variant_id|->'  — a line lacked live stock
--   'DISCOUNT_EXHAUSTED'                          — code hit its redemption cap
--   (any other exception — CHECK violations etc. — bubbles as a generic error)
-- ---------------------------------------------------------------------------
create or replace function create_order(payload jsonb)
returns jsonb
language plpgsql
-- SECURITY DEFINER so the function owns the write regardless of caller role, with
-- a pinned empty search_path (defense-in-depth, matching the repo style). The
-- action calls it via the secret/service_role key; execute is granted only to
-- service_role below.
security definer
set search_path = ''
as $$
declare
  v_idempotency_key text := nullif(payload->>'idempotency_key', '');
  v_existing        public.orders%rowtype;
  v_customer_id     uuid;
  v_order_id        uuid;
  v_order_number    text;
  v_seq             bigint;
  v_item            jsonb;
  v_product_id      uuid;
  v_variant_id      uuid;
  v_quantity        integer;
  v_updated_id      uuid;
  v_discount_code   text := nullif(payload->>'discount_code', '');
begin
  if v_idempotency_key is null then
    raise exception 'idempotency_key is required'
      using errcode = 'raise_exception';
  end if;

  -- Idempotency short-circuit: a prior call with this key already created an
  -- order → return it, do NOT reserve stock or insert again (AC-14, edge 7).
  select * into v_existing
  from public.orders
  where idempotency_key = v_idempotency_key
  limit 1;
  if found then
    return jsonb_build_object(
      'order_number', v_existing.order_number,
      'order_id',     v_existing.id,
      'reused',       true
    );
  end if;

  -- 1. Guarded per-line stock decrement. Variant lines decrement the SPECIFIC
  --    variant; no-variant lines decrement the product row. Zero rows updated
  --    (row lacked stock, or vanished) → raise → the whole call rolls back
  --    (edge 2). The WHERE stock >= qty guard + the matched-row lock make this
  --    race-safe; the stock >= 0 CHECK is the hard floor.
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

    -- Feed best-selling sort (AC-10): bump the product's sales_count by qty in
    -- the same transaction. Always the PRODUCT row (variants have no counter).
    update public.products
      set sales_count = sales_count + v_quantity
      where id = v_product_id;
  end loop;

  -- 2. Discount redemption bound check + increment (inside the transaction so a
  --    concurrent over-redemption rolls back). Only when a code was applied.
  if v_discount_code is not null then
    update public.discount_codes
      set times_redeemed = times_redeemed + 1
      where upper(code) = upper(v_discount_code)
        and (max_redemptions is null or times_redeemed < max_redemptions);
    if not found then
      raise exception 'DISCOUNT_EXHAUSTED'
        using errcode = 'raise_exception';
    end if;
  end if;

  -- 3. Guest customer record (AC-11). No accounts in Phase 1 — one row per order.
  insert into public.customers (email, full_name, phone)
    values (
      payload->>'contact_email',
      payload->>'shipping_full_name',
      nullif(payload->>'contact_phone', '')
    )
    returning id into v_customer_id;

  -- 4. Order number from the sequence (unique, no app coordination).
  v_seq := nextval('public.order_number_seq');
  v_order_number := 'PP-' || lpad(v_seq::text, 6, '0');

  -- 5. The immutable order snapshot (AC-11). Satisfies every DB CHECK (the
  --    action assembled the totals to the identity; the CHECK is the backstop).
  insert into public.orders (
    order_number, customer_id, idempotency_key,
    contact_email, contact_phone,
    shipping_full_name, shipping_address_line1, shipping_address_line2,
    shipping_city, shipping_state, shipping_postal_code,
    delivery_notes, rfc,
    subtotal_cents, shipping_cents, discount_cents,
    tax_base_cents, tax_cents, total_cents,
    status, payment_status
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
    'pending_payment', 'pending'
  )
  returning id into v_order_id;

  -- 6. Line snapshots (AC-11). line_total is trusted from the assembled payload
  --    and re-checked by order_items_line_total_identity.
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

  -- 7. Initial status-history row (AC-11): from_status null → pending_payment.
  insert into public.order_status_history (order_id, from_status, to_status, note)
    values (v_order_id, null, 'pending_payment', 'Order created at checkout (T7)');

  return jsonb_build_object(
    'order_number', v_order_number,
    'order_id',     v_order_id,
    'reused',       false
  );
end;
$$;

-- Least privilege: only the service_role (the secret key the action uses) may
-- execute. anon/authenticated have NO access to the write path (matches the
-- 0005 RLS posture that fully denies anon on the commerce tables).
revoke all on function create_order(jsonb) from public;
grant execute on function create_order(jsonb) to service_role;
