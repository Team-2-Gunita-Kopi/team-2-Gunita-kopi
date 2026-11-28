-- Cancel single items of an order (design 2026-11-28, docs/superpowers/specs/2026-11-28-cancel-order-items-design.md).
-- 1. The stock return for cancelled rows works per item: only the cancelled items' ingredients go
--    back, never more than the order took out. When an order has no active item left, exactly the
--    rest of its stock-out is returned (a whole-order cancel stays exact, as in 20261120001200).
-- 2. cancel_order_items cancels chosen items, or part of an item's quantity, in one transaction.
-- 3. v_order_totals: status and total come from the items that are not cancelled.
-- Refunds are handled by hand: payments are never changed.

create or replace function public.return_stock_for_cancelled_orders() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.stock_transactions (ingredient_id, user_id, type, quantity, remarks)
  with cancelled as (
    select n.order_id, n.product_id, n.ingredient_id, n.is_addon, n.quantity
      from new_rows n
      join old_rows o on o.order_line_id = n.order_line_id
     where n.status = 'cancelled' and o.status <> 'cancelled'
  ),
  touched as (
    select c.order_id,
           not exists (select 1 from public.orders x
                        where x.order_id = c.order_id and x.status <> 'cancelled') as whole
      from cancelled c
     group by c.order_id
  ),
  -- Per ingredient: what the order took out minus what was already given back.
  remaining as (
    select t.order_id, t.whole, st.ingredient_id,
           sum(case when st.type = 'out' then st.quantity else -st.quantity end) as qty
      from touched t
      join public.stock_transactions st
        on (st.type = 'out' and st.remarks = 'Order #' || t.order_id)
        or (st.type = 'in'  and st.remarks in ('Cancelled order #' || t.order_id,
                                               'Cancelled item, order #' || t.order_id))
     group by t.order_id, t.whole, st.ingredient_id
  ),
  -- What the cancelled items used: recipe for products, addon_quantity for add-ons (as at checkout).
  item_usage as (
    select u.order_id, u.ingredient_id, sum(u.qty) as qty
      from (select c.order_id, pi.ingredient_id, pi.quantity_needed * c.quantity as qty
              from cancelled c
              join public.product_ingredients pi on pi.product_id = c.product_id
             where not c.is_addon
            union all
            select c.order_id, c.ingredient_id, i.addon_quantity * c.quantity
              from cancelled c
              join public.ingredients i on i.ingredient_id = c.ingredient_id
             where c.is_addon) u
     group by u.order_id, u.ingredient_id
  ),
  returns as (
    select r.order_id, r.whole, r.ingredient_id,
           case when r.whole then r.qty else least(r.qty, coalesce(iu.qty, 0)) end as qty
      from remaining r
      left join item_usage iu on iu.order_id = r.order_id and iu.ingredient_id = r.ingredient_id
  )
  select ingredient_id, public.app_user_id(), 'in', qty,
         case when whole then 'Cancelled order #' else 'Cancelled item, order #' end || order_id
    from returns
   where qty > 0;
  return null;
end $$;

-- p_items: [{"line_id": <order_line_id of a product line>, "quantity": <how many to cancel>}].
-- SECURITY DEFINER: baristas may only update orders.status; splitting a quantity needs insert and
-- update of quantity/subtotal, which they must not have directly (as process_checkout_transaction).
create function public.cancel_order_items(p_order_id integer, p_items jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_item     jsonb;
  v_line     public.orders%rowtype;
  v_addon    public.orders%rowtype;
  v_qty      integer;
  v_addon_qty integer;
  v_next     integer;
  v_status   text;
  v_new_id   integer;
  v_ids      integer[] := '{}';
begin
  if public.app_user_id() is null or public.app_role() not in ('owner_admin', 'barista') then
    raise exception 'FORBIDDEN: no active user profile' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'VALIDATION: choose at least one item to cancel';
  end if;
  if (select count(*) from jsonb_array_elements(p_items))
     <> (select count(distinct e->>'line_id') from jsonb_array_elements(p_items) e) then
    raise exception 'VALIDATION: an item is listed more than once';
  end if;

  -- Lock the order so two devices cannot cancel the same item at the same time.
  perform 1 from public.orders where order_id = p_order_id for update;
  if not found then
    raise exception 'NOT_FOUND: order not found';
  end if;
  select status into v_status from public.orders
   where order_id = p_order_id and status <> 'cancelled' limit 1;
  if v_status is null or v_status not in ('pending', 'preparing') then
    raise exception 'INVALID_TRANSITION: items can be cancelled only while the order is pending or preparing';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_line from public.orders
     where order_line_id = (v_item->>'line_id')::integer
       and order_id = p_order_id and not is_addon and status <> 'cancelled';
    if not found then
      raise exception 'CONFLICT: item % is not an active item of this order', v_item->>'line_id';
    end if;
    v_qty := (v_item->>'quantity')::integer;
    if v_qty is null or v_qty < 1 or v_qty > v_line.quantity then
      raise exception 'VALIDATION: quantity to cancel must be between 1 and %', v_line.quantity;
    end if;

    -- This item's add-ons: the add-on rows after it, up to the next product row (the POS grouping).
    select min(order_line_id) into v_next from public.orders
     where order_id = p_order_id and not is_addon and order_line_id > v_line.order_line_id;

    if v_qty = v_line.quantity then
      v_ids := v_ids || v_line.order_line_id || array(
        select order_line_id from public.orders
         where order_id = p_order_id and is_addon and status <> 'cancelled'
           and order_line_id > v_line.order_line_id
           and (v_next is null or order_line_id < v_next));
    else
      update public.orders
         set quantity = quantity - v_qty, subtotal = unit_price * (quantity - v_qty)
       where order_line_id = v_line.order_line_id;
      insert into public.orders (order_id, client_tx_id, user_id, product_id, is_addon, ingredient_id,
                                 quantity, unit_price, subtotal, order_type, order_date, status,
                                 customization, special_instructions)
      values (v_line.order_id, v_line.client_tx_id, v_line.user_id, v_line.product_id, false, null,
              v_qty, v_line.unit_price, v_line.unit_price * v_qty, v_line.order_type, v_line.order_date,
              v_line.status, v_line.customization, v_line.special_instructions)
      returning order_line_id into v_new_id;
      v_ids := v_ids || v_new_id;

      for v_addon in
        select * from public.orders
         where order_id = p_order_id and is_addon and status <> 'cancelled'
           and order_line_id > v_line.order_line_id
           and (v_next is null or order_line_id < v_next)
         order by order_line_id
      loop
        if (v_qty * v_addon.quantity) % v_line.quantity <> 0 then
          raise exception 'CONFLICT: the add-ons of item % cannot be split; cancel the whole item', v_line.order_line_id;
        end if;
        v_addon_qty := v_qty * v_addon.quantity / v_line.quantity;
        update public.orders
           set quantity = quantity - v_addon_qty, subtotal = unit_price * (quantity - v_addon_qty)
         where order_line_id = v_addon.order_line_id;
        insert into public.orders (order_id, client_tx_id, user_id, product_id, is_addon, ingredient_id,
                                   quantity, unit_price, subtotal, order_type, order_date, status,
                                   customization, special_instructions)
        values (v_addon.order_id, v_addon.client_tx_id, v_addon.user_id, null, true, v_addon.ingredient_id,
                v_addon_qty, v_addon.unit_price, v_addon.unit_price * v_addon_qty, v_addon.order_type,
                v_addon.order_date, v_addon.status, v_addon.customization, v_addon.special_instructions)
        returning order_line_id into v_new_id;
        v_ids := v_ids || v_new_id;
      end loop;
    end if;
  end loop;

  -- One statement, so the stock trigger sees every cancelled row of this request together.
  update public.orders set status = 'cancelled' where order_line_id = any(v_ids);
end $$;

revoke execute on function public.cancel_order_items(integer, jsonb) from public, anon, authenticated;
grant execute on function public.cancel_order_items(integer, jsonb) to authenticated;

-- Same columns as before; cancelled items no longer count. An order is cancelled only when every
-- item is. Existing grants are kept by "or replace".
create or replace view public.v_order_totals with (security_invoker = true) as
select order_id,
       min(order_date) as order_date,
       min(order_type) as order_type,
       coalesce(min(status) filter (where status <> 'cancelled'), 'cancelled') as status,
       count(*) filter (where status <> 'cancelled') as item_count,
       coalesce(sum(subtotal) filter (where status <> 'cancelled'), 0) as total
  from public.orders
 group by order_id;
