-- Gunita Kopi POS: POS add-ons from INGREDIENTS and Owner-only ingredient costs.
-- Confirmed client decisions: every add-on is one inventory ingredient, the same add-on list is
-- offered for every drink, and every add-on sells for a fixed PHP 25.00.
--   1. Three add-on columns on the existing ingredients table (no new table).
--   2. Checkout charges addon_selling_price for add-on rows and deducts
--      orders.quantity * ingredients.addon_quantity of stock (was: unit_cost and 1 unit).
--   3. Ingredient costs are Owner-only at the database level too: the authenticated role (both
--      Owner and Barista) loses SELECT on ingredients.unit_cost; the Owner reads costs through
--      ingredient_unit_costs(), and costing triggers run as the function owner.

-- ---------------------------------------------------------------------------
-- 1. Add-on configuration. Existing rows become regular ingredients (false, NULL, NULL);
--    stock, costs and history are not touched.
--    A configured add-on always has the fixed price and a positive serving quantity, so an
--    incomplete configuration cannot be stored, and so cannot reach the POS.
-- ---------------------------------------------------------------------------

alter table public.ingredients
  add column is_addon            boolean not null default false,
  add column addon_selling_price numeric(10,2),
  add column addon_quantity      numeric(10,2),
  add constraint ingredients_addon_config_check check (
    (not is_addon and addon_selling_price is null and addon_quantity is null)
    -- "is not null" first: a CHECK passes when it evaluates to NULL.
    or (is_addon and addon_selling_price is not null and addon_quantity is not null
        and addon_selling_price = 25.00 and addon_quantity > 0));

comment on column public.ingredients.is_addon is
  'True when the ingredient is offered as a POS add-on for every drink.';
comment on column public.ingredients.addon_selling_price is
  'Price charged per add-on selection; fixed at 25.00 by client decision. NULL when not an add-on.';
comment on column public.ingredients.addon_quantity is
  'Ingredient amount (in ingredients.unit) used per add-on selection. NULL when not an add-on.';

-- ---------------------------------------------------------------------------
-- 3. Owner-only costs. Column privileges apply to every role that is not the table owner, so
--    a barista token used directly against the Data API cannot read unit_cost either.
--    INSERT/UPDATE privileges are unchanged: the Owner still writes unit_cost (RLS: owner only).
-- ---------------------------------------------------------------------------

revoke select on public.ingredients from authenticated;
grant select (ingredient_id, supplier_id, ingredient_name, unit, current_stock, reorder_level,
              date_updated, is_addon, addon_selling_price, addon_quantity)
  on public.ingredients to authenticated;

-- The inventory view loses unit_cost (a security_invoker view would need the column privilege)
-- and gains the add-on columns. Recreated, so its grants are restated.
drop view public.v_inventory_status;
create view public.v_inventory_status with (security_invoker = true) as
select i.ingredient_id, i.ingredient_name, i.unit, i.current_stock, i.reorder_level,
       case when i.current_stock <= 0 then 'out-of-stock'
            when i.current_stock <= i.reorder_level then 'low-stock'
            else 'available' end as stock_status,
       i.supplier_id, s.supplier_name, i.date_updated,
       i.is_addon, i.addon_selling_price, i.addon_quantity
  from public.ingredients i
  left join public.suppliers s on s.supplier_id = i.supplier_id;

revoke all on public.v_inventory_status from anon, authenticated;
grant select on public.v_inventory_status to authenticated, service_role;

-- Owner reads unit costs here (ingredient list, recipe costing). Raises FORBIDDEN for anyone else.
create function public.ingredient_unit_costs()
returns table (ingredient_id integer, unit_cost numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.app_role() is distinct from 'owner_admin' then
    raise exception 'FORBIDDEN: ingredient costs are Owner-only' using errcode = '42501';
  end if;
  return query select i.ingredient_id, i.unit_cost from public.ingredients i;
end $$;

revoke execute on function public.ingredient_unit_costs() from public, anon;
grant execute on function public.ingredient_unit_costs() to authenticated;

-- Costing triggers read unit_cost, which the signed-in Owner can no longer select directly.
-- They fire only on Owner writes (RLS: recipes and ingredients are Owner-only) and only recompute
-- the derived ingredient_cost, so they run as the function owner.
alter function public.product_ingredients_recost() security definer;
alter function public.ingredients_recost() security definer;
-- No longer called with the caller's privileges; nothing else needs to call it directly.
revoke execute on function public.recalculate_product_costing(integer) from authenticated;

-- ---------------------------------------------------------------------------
-- 2. Checkout. Same signature, security and idempotency as before; only the add-on price and the
--    add-on stock usage change. Values are read at checkout time, so a later configuration change
--    never alters saved order rows or stock history.
-- ---------------------------------------------------------------------------

create or replace function public.process_checkout_transaction(p_order jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id   integer := public.app_user_id();
  v_tx        uuid := (p_order->>'client_tx_id')::uuid;
  v_existing  integer;
  v_order_id  integer;
  v_total     numeric(10,2) := 0;
  v_paid      numeric(10,2) := (p_order->>'amount_paid')::numeric;
  v_item      jsonb;
  v_is_addon  boolean;
  v_qty       integer;
  v_price     numeric(10,2);
  v_use       record;
begin
  if v_user_id is null then
    raise exception 'FORBIDDEN: no active user profile' using errcode = '42501';
  end if;

  select order_id into v_existing from public.payments where client_tx_id = v_tx;
  if found then
    return jsonb_build_object('order_id', v_existing, 'duplicate', true);
  end if;

  if jsonb_array_length(coalesce(p_order->'items', '[]')) = 0 then
    raise exception 'VALIDATION: order has no items';
  end if;

  v_order_id := nextval('public.order_id_seq');

  for v_item in select * from jsonb_array_elements(p_order->'items') loop
    v_is_addon := coalesce((v_item->>'is_addon')::boolean, false);
    v_qty := (v_item->>'quantity')::integer;
    v_price := null; -- select into keeps the old value when no row matches

    -- Server recheck of the current price (FR-58). An add-on must be configured as one right now;
    -- the table constraint guarantees its price is the fixed add-on price and its quantity > 0.
    if v_is_addon then
      select addon_selling_price into v_price from public.ingredients
       where ingredient_id = (v_item->>'ingredient_id')::integer and is_addon;
    else
      select price into v_price from public.products
       where product_id = (v_item->>'product_id')::integer and is_available;
    end if;

    if v_price is null then
      raise exception 'CONFLICT: item % is unknown or unavailable', v_item;
    end if;
    if v_price <> (v_item->>'unit_price')::numeric then
      raise exception 'PRICE_CONFLICT: price changed to % for item %', v_price, v_item;
    end if;

    insert into public.orders (order_id, client_tx_id, user_id, product_id, is_addon, ingredient_id,
                               quantity, unit_price, subtotal, order_type, customization, special_instructions)
    values (v_order_id, v_tx, v_user_id,
            case when v_is_addon then null else (v_item->>'product_id')::integer end,
            v_is_addon,
            case when v_is_addon then (v_item->>'ingredient_id')::integer end,
            v_qty, v_price, v_price * v_qty, p_order->>'order_type',
            v_item->>'customization', v_item->>'special_instructions');

    v_total := v_total + v_price * v_qty;
  end loop;

  if v_paid < v_total then
    raise exception 'VALIDATION: amount paid % is less than total %', v_paid, v_total;
  end if;

  insert into public.payments (order_id, client_tx_id, amount_paid, payment_method, received_by, change_amount)
  values (v_order_id, v_tx, v_paid, coalesce(p_order->>'payment_method', 'cash'), v_user_id, v_paid - v_total);

  -- Stock out: recipe usage for products (add-on rows have no product_id, so recipes never count
  -- them) plus selections * addon_quantity for add-ons (FR-12, FR-16). One movement per ingredient.
  -- The stock trigger raises STOCK_CONFLICT if any ingredient would go negative, rolling back everything.
  for v_use in
    select u.ingredient_id, sum(u.qty) as qty from (
      select pi.ingredient_id, pi.quantity_needed * o.quantity as qty
        from public.orders o join public.product_ingredients pi on pi.product_id = o.product_id
       where o.order_id = v_order_id and not o.is_addon
      union all
      select o.ingredient_id, o.quantity * i.addon_quantity
        from public.orders o join public.ingredients i on i.ingredient_id = o.ingredient_id
       where o.order_id = v_order_id and o.is_addon
    ) u group by u.ingredient_id
  loop
    insert into public.stock_transactions (ingredient_id, user_id, type, quantity, remarks)
    values (v_use.ingredient_id, v_user_id, 'out', v_use.qty, 'Order #' || v_order_id);
  end loop;

  return jsonb_build_object('order_id', v_order_id, 'duplicate', false,
                            'total', v_total, 'change_amount', v_paid - v_total);
exception
  -- Two concurrent retries of the same sale: the loser returns the winner's order.
  when unique_violation then
    select order_id into v_existing from public.payments where client_tx_id = v_tx;
    return jsonb_build_object('order_id', v_existing, 'duplicate', true);
end $$;

revoke execute on function public.process_checkout_transaction(jsonb) from public, anon;
grant execute on function public.process_checkout_transaction(jsonb) to authenticated;
