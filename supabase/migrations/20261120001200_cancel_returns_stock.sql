-- A cancelled order gives its ingredients back (FR-18): when an order's rows move to 'cancelled',
-- one stock-in per ingredient equal to that order's checkout stock-outs ("Order #N") is recorded,
-- remark "Cancelled order #N". It goes through stock_transactions, so the existing trigger updates
-- ingredients.current_stock and remaining_stock. Cancelled is final (orders_status_transition),
-- so an order is returned at most once.

create function public.return_stock_for_cancelled_orders() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.stock_transactions (ingredient_id, user_id, type, quantity, remarks)
  select st.ingredient_id, public.app_user_id(), 'in', sum(st.quantity),
         'Cancelled order #' || c.order_id
    from (select distinct n.order_id
            from new_rows n
            join old_rows o on o.order_line_id = n.order_line_id
           where n.status = 'cancelled' and o.status <> 'cancelled') c
    join public.stock_transactions st
      on st.type = 'out' and st.remarks = 'Order #' || c.order_id
   group by c.order_id, st.ingredient_id;
  return null;
end $$;

-- Statement level: one return per order, however many rows (product and add-on lines) it has.
create trigger orders_cancel_returns_stock
  after update on public.orders
  referencing old table as old_rows new table as new_rows
  for each statement execute function public.return_stock_for_cancelled_orders();

revoke execute on function public.return_stock_for_cancelled_orders() from public, anon, authenticated;
