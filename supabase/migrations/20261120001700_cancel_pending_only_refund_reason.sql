-- Cancel only while pending, and keep the refund reason (decided 2026-11-28).
-- Once an order is preparing the customer pays for it: no item or order can be cancelled any more.
-- Nothing has been made while pending, so a cancelled item is always refunded in full. The refunded
-- amount is the subtotal of the cancelled rows (the payment row is never changed); this migration
-- only stores why the items were cancelled.
-- 1. orders.cancel_reason: the reason picked when the item was cancelled (null for older cancels).
-- 2. Status rule: pending -> preparing | cancelled, preparing -> completed. Preparing can no longer
--    be cancelled, by any path.
-- 3. cancel_order_items gets p_reason (default null, so the app version still running keeps
--    working until the new one is deployed) and refuses orders that are not pending.

alter table public.orders add column cancel_reason varchar(100);

create or replace function public.check_order_status_transition() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = old.status then
    return new;
  end if;
  if not ((old.status = 'pending'   and new.status in ('preparing', 'cancelled'))
       or (old.status = 'preparing' and new.status = 'completed')) then
    raise exception 'INVALID_TRANSITION: an order cannot move from % to %', old.status, new.status;
  end if;
  return new;
end $$;

drop function public.cancel_order_items(integer, jsonb);

-- p_items: [{"line_id": <order_line_id of a product line>, "quantity": <how many to cancel>}].
-- SECURITY DEFINER: baristas may only update orders.status; splitting a quantity needs insert and
-- update of quantity/subtotal, which they must not have directly (as process_checkout_transaction).
create function public.cancel_order_items(p_order_id integer, p_items jsonb, p_reason text default null)
returns void
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
  v_reason   text := nullif(btrim(p_reason), '');
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
  if length(v_reason) > 100 then
    raise exception 'VALIDATION: the reason must be 100 characters or fewer';
  end if;

  -- Lock the order so two devices cannot cancel the same item at the same time.
  perform 1 from public.orders where order_id = p_order_id for update;
  if not found then
    raise exception 'NOT_FOUND: order not found';
  end if;
  select status into v_status from public.orders
   where order_id = p_order_id and status <> 'cancelled' limit 1;
  if v_status is distinct from 'pending' then
    raise exception 'INVALID_TRANSITION: items can be cancelled only while the order is pending';
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
  update public.orders set status = 'cancelled', cancel_reason = v_reason
   where order_line_id = any(v_ids);
end $$;

revoke execute on function public.cancel_order_items(integer, jsonb, text) from public, anon, authenticated;
grant execute on function public.cancel_order_items(integer, jsonb, text) to authenticated;
