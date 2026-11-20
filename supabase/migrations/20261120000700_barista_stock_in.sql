-- Baristas may manually record stock-in and stock-out as requested for the POS inventory workflow.
-- Each movement remains tied to the caller; checkout deductions continue through the atomic RPC.

drop policy if exists stock_insert on public.stock_transactions;
create policy stock_insert on public.stock_transactions for insert to authenticated
  with check (
    user_id = public.app_user_id()
    and public.app_role() in ('owner_admin', 'barista')
  );
