-- Owners may manually record stock-in and stock-out; Baristas remain stock-out only.
-- Checkout stock-out continues through process_checkout_transaction.

drop policy if exists stock_insert on public.stock_transactions;
create policy stock_insert on public.stock_transactions for insert to authenticated
  with check (user_id = public.app_user_id()
              and (public.app_role() = 'owner_admin'
                   or (public.app_role() = 'barista' and type = 'out')));
