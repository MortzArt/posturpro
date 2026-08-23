-- 0015_enforce_grant_posture.sql
--
-- WHY: Hosted Supabase projects ship default ACLs (pg_default_acl, FOR ROLE
-- postgres, both global and IN SCHEMA public) that grant ALL on tables and
-- EXECUTE on functions to anon/authenticated for every object a migration
-- creates. The local CLI stack has no such defaults, so objects our migrations
-- left "ungranted by omission" (correct locally, verified by the T14 security
-- audit) came out anon-granted after `supabase db push` to the hosted project.
-- Found 2026-08-23 by the deploy-readiness checklist §2 anon-denial sweep:
-- every privileged RPC — including the SECURITY DEFINER order/payment
-- functions, which bypass RLS — was anon-EXECUTABLE on hosted.
--
-- WHAT: (1) revoke the stray function EXECUTE grants, (2) revoke the stray
-- table data-privilege grants, (3) strip anon/authenticated from the postgres
-- role's default ACLs so future migrations cannot re-drift. service_role
-- grants are untouched. Storefront grants (brands/categories/styles/tags/
-- product_* read surface, products_public SELECT, search_products,
-- is_active_product) are explicit in 0001/0002/0007 and remain intact.
--
-- Idempotent, and a no-op on a clean local reset (revoking an absent grant
-- does not error).

-- (1) Privileged functions: EXECUTE is service_role-only. Signatures are
-- resolved from the catalog so overloads / future signature changes are safe.
do $$
declare fn record;
begin
  for fn in
    select p.oid, p.proname
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in (
        'admin_customer_aggregates',
        'admin_customer_order_counts',
        'advance_order_status',
        'bump_admin_session_version',
        'cancel_order',
        'claim_email_send',
        'create_order',
        'email_transition_kind',
        'finalize_email_send',
        'finalize_payment_event',
        'order_status_rank',
        'record_inventory_adjustment',
        'record_payment_event',
        'record_refund',
        'refunded_total'
      )
  loop
    execute format(
      'revoke all on function public.%I(%s) from public, anon, authenticated',
      fn.proname,
      pg_get_function_identity_arguments(fn.oid)
    );
  end loop;
end $$;

-- (2) Privileged tables: no data privileges for the API roles (RLS already has
-- no policies here — this restores the audited dual-layer no-grant posture).
revoke select, insert, update, delete on table
  public.admin_session_version,
  public.email_sends,
  public.inventory_adjustments,
  public.mp_payment_events,
  public.order_internal_notes,
  public.payment_refunds
from anon, authenticated;

-- The public catalog view is read-only for the API roles.
revoke insert, update, delete on table public.products_public
from anon, authenticated;

-- (3) Stop the drift at the source: objects created by future migrations (run
-- as postgres) must start ungranted for the API roles, exactly as they do on
-- the local stack. Grants for intended surfaces stay explicit per convention.
-- Both the global and the schema-scoped default-ACL entries exist on hosted.
alter default privileges for role postgres revoke all on tables from anon, authenticated;
alter default privileges for role postgres revoke all on sequences from anon, authenticated;
alter default privileges for role postgres revoke execute on functions from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
