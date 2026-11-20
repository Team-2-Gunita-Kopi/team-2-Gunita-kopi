-- Reassert Barista stock-in after older pending migrations, including 20261120000600, are applied.

drop policy if exists stock_insert on public.stock_transactions;
create policy stock_insert on public.stock_transactions for insert to authenticated
  with check (
    user_id = public.app_user_id()
    and public.app_role() in ('owner_admin', 'barista')
  );
