-- 0014_admin_customer_aggregates.sql
--
-- T18: lifetime aggregates for the admin customer-detail page.
--
-- The detail page (`/admin/orders/customers/[id]`) shows a customer's lifetime
-- totals: order count, total spent (sum of ALL their order totals), and the
-- first/last order dates. The order-history table on the same page is BOUNDED
-- (LIMIT CUSTOMER_ORDER_HISTORY_LIMIT) so it can never be trusted to compute the
-- totals — a customer with more orders than the limit would under-count. Summing
-- `total_cents` over an unbounded PostgREST select would also silently truncate
-- at PostgREST's 1000-row cap (the exact bug 0013 was created to dodge).
--
-- This RPC pushes the aggregation into the DB and returns EXACTLY ONE row for the
-- given customer id — the count/sum/min/max over ALL their orders, never the
-- underlying order rows. Totals are exact regardless of history-page size and the
-- read is a single index-backed scan (orders_customer_id_idx, migration 0003).
--
-- `total_cents` is integer (int4) per row; `sum(...)` returns `bigint`, so the
-- total is exact integer arithmetic (no float peso math) up to bigint range.
-- A customer with zero orders yields count 0, total 0, and NULL first/last dates
-- (the single-row aggregate always returns one row) — the app renders "—".
--
-- Posture matches 0013 verbatim: SECURITY DEFINER + pinned empty search_path +
-- service_role-only execute (the admin client is the only caller). STABLE
-- (read-only). Idempotent: create-or-replace + revoke/grant. LOCAL only.
-- ---------------------------------------------------------------------------
create or replace function admin_customer_aggregates(
  p_customer_id uuid
)
returns table (
  order_count bigint,
  total_cents bigint,
  first_order_at timestamptz,
  last_order_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*) as order_count,
    coalesce(sum(o.total_cents), 0) as total_cents,
    min(o.created_at) as first_order_at,
    max(o.created_at) as last_order_at
  from public.orders o
  where o.customer_id = p_customer_id;
$$;

-- Lock down execute: public loses it; only the service_role (admin client) runs it.
revoke all on function admin_customer_aggregates(uuid) from public;
grant execute on function admin_customer_aggregates(uuid) to service_role;
