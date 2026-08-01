-- 0013_admin_customer_order_counts.sql
--
-- T12 review fix (M-3): a grouped-count RPC for the admin customer list.
--
-- The customer list (AC-24) shows a per-customer order count for the 25 rows on
-- the current page. The first implementation fetched EVERY orders row for those
-- 25 customer ids and tallied in memory — which (a) silently under-counts once
-- the 25 customers collectively exceed PostgREST's 1000-row default cap, and
-- (b) is an unbounded read whose cost grows with total order volume, not page
-- size (the ticket's "no unbounded query" bar forbids it).
--
-- This RPC pushes the aggregation into the DB: it returns exactly ONE row per
-- input customer id (`customer_id`, `order_count`) — at most 25 rows, never the
-- underlying order rows. No truncation, bounded cost.
--
-- Posture matches the other T12 read helpers: SECURITY DEFINER + pinned empty
-- search_path + service_role-only execute (the admin client is the only caller).
-- STABLE (read-only). Idempotent: create-or-replace + revoke/grant. LOCAL only.
-- ---------------------------------------------------------------------------
create or replace function admin_customer_order_counts(
  p_customer_ids uuid[]
)
returns table (customer_id uuid, order_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select o.customer_id, count(*) as order_count
  from public.orders o
  where o.customer_id = any(p_customer_ids)
  group by o.customer_id;
$$;

-- Lock down execute: public loses it; only the service_role (admin client) runs it.
revoke all on function admin_customer_order_counts(uuid[]) from public;
grant execute on function admin_customer_order_counts(uuid[]) to service_role;
