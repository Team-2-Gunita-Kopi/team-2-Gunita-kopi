-- Gunita Kopi POS: database side of Owner MFA and the SRS stock roles (no table or column changes).
--   1. Owner MFA (SDS 2.4 "Admin MFA", 2.8 "Admin protection"; SRS NFR-09, NFR-10).
--      An Owner session counts only after the second sign-in step (JWT claim aal = 'aal2').
--      app_role() and app_user_id() return NULL for an Owner at aal1, so every RLS policy, view and
--      function that uses them treats a password-only Owner session as having no access, even when
--      the token is used against the Data API directly instead of through apps/api.
--      Barista sessions are unchanged (SDS 2.4 requires the second step for the Owner only).
--   2. Manual stock movements follow SRS 2.3, FR-15 and FR-16 strictly:
--      Owner records stock-in only, Barista records stock-out only.
--      Checkout stock-out is unaffected: process_checkout_transaction is SECURITY DEFINER and its
--      inserts are not subject to the stock_insert policy.

-- ---------------------------------------------------------------------------
-- 1. Owner MFA. Same signature, language and security as before; only the body changes, so the
--    existing grants (execute to authenticated) are kept. users.role is the authority, and aal comes
--    from the verified JWT (auth.jwt()), which only Supabase Auth can sign.
-- ---------------------------------------------------------------------------

create or replace function public.app_role() returns text
language sql stable security definer set search_path = '' as $$
  select u.role from public.users u
   where u.auth_user_id = auth.uid() and u.status = 'active'
     and (u.role <> 'owner_admin' or coalesce(auth.jwt() ->> 'aal', '') = 'aal2')
$$;

create or replace function public.app_user_id() returns integer
language sql stable security definer set search_path = '' as $$
  select u.user_id from public.users u
   where u.auth_user_id = auth.uid() and u.status = 'active'
     and (u.role <> 'owner_admin' or coalesce(auth.jwt() ->> 'aal', '') = 'aal2')
$$;

revoke execute on function public.app_role(), public.app_user_id() from public, anon;
grant execute on function public.app_role(), public.app_user_id() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Manual stock movements: Owner 'in', Barista 'out'. Append-only as before (no update/delete).
-- ---------------------------------------------------------------------------

drop policy stock_insert on public.stock_transactions;
create policy stock_insert on public.stock_transactions for insert to authenticated
  with check (user_id = public.app_user_id()
              and ((public.app_role() = 'owner_admin' and type = 'in')
                   or (public.app_role() = 'barista' and type = 'out')));
