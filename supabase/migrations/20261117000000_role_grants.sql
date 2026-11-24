-- Gunita Kopi POS: explicit table privileges.
-- New Supabase projects no longer grant SELECT/INSERT/UPDATE/DELETE on new public tables to
-- authenticated or service_role, so every privilege the app relies on is granted here.
-- RLS policies (initial schema) still decide which rows each role sees.

grant usage on schema public to authenticated, service_role;

-- API server (service role key): account provisioning and audit logs.
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Signed-in staff: read everything RLS allows, except audit logs.
grant select on all tables in schema public to authenticated;
revoke select on public.audit_logs from authenticated;

-- Owner-managed data (RLS limits writes to owner_admin).
grant insert, update, delete on
  public.suppliers, public.ingredients, public.products,
  public.product_ingredients, public.product_costing
  to authenticated;
grant update on public.users to authenticated;

-- Stock movements are append-only (RLS: barista may only record 'out').
grant insert on public.stock_transactions to authenticated;

-- orders.status update was granted in the initial schema; orders and payments are
-- otherwise written only by process_checkout_transaction.

-- TRUNCATE bypasses RLS; staff never need it.
revoke truncate on all tables in schema public from authenticated;
