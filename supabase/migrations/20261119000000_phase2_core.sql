-- Gunita Kopi POS: Phase 2 core API support (additive; no table or column changes).
--   1. Order status transitions enforced in the database (FR-10, SDS 3.10).
--   2. Atomic recipe replacement (FR-23).
--   3. product_costing.ingredient_cost kept equal to sum(quantity_needed * unit_cost) (FR-24 to FR-28).
--   4. v_inventory_status gains supplier, unit cost and date columns so the ingredient list and the
--      stock status (FR-19) come from one rule.

-- ---------------------------------------------------------------------------
-- 4. Inventory view. Columns are only appended (create or replace keeps the existing ones).
--    security_invoker: suppliers are Owner-only by RLS, so a barista sees supplier_name as NULL.
-- ---------------------------------------------------------------------------

create or replace view public.v_inventory_status with (security_invoker = true) as
select i.ingredient_id, i.ingredient_name, i.unit, i.current_stock, i.reorder_level,
       case when i.current_stock <= 0 then 'out-of-stock'
            when i.current_stock <= i.reorder_level then 'low-stock'
            else 'available' end as stock_status,
       i.supplier_id, s.supplier_name, i.unit_cost, i.date_updated
  from public.ingredients i
  left join public.suppliers s on s.supplier_id = i.supplier_id;

-- ---------------------------------------------------------------------------
-- 1. Order status: pending -> preparing -> completed, or pending/preparing -> cancelled.
--    completed and cancelled are final. Applies to every row of an order (all share the status).
-- ---------------------------------------------------------------------------

create function public.check_order_status_transition() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = old.status then
    return new;
  end if;
  if not ((old.status = 'pending'   and new.status in ('preparing', 'cancelled'))
       or (old.status = 'preparing' and new.status in ('completed', 'cancelled'))) then
    raise exception 'INVALID_TRANSITION: an order cannot move from % to %', old.status, new.status;
  end if;
  return new;
end $$;

create trigger orders_status_transition
  before update of status on public.orders
  for each row execute function public.check_order_status_transition();

revoke execute on function public.check_order_status_transition() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Product costing. ingredient_cost is derived, never typed in; packaging_cost is entered by the
--    Owner. A missing unit_cost counts as 0 (the API reports which ingredients have none).
--    SECURITY INVOKER: only the Owner can write recipes or unit costs, and RLS lets the Owner
--    write product_costing.
-- ---------------------------------------------------------------------------

create function public.recalculate_product_costing(p_product_id integer) returns void
language plpgsql set search_path = '' as $$
begin
  -- A product being deleted cascades its recipe rows; do not recreate its costing row.
  if not exists (select 1 from public.products where product_id = p_product_id) then
    return;
  end if;

  insert into public.product_costing (product_id, ingredient_cost)
  select p_product_id, coalesce(round(sum(pi.quantity_needed * coalesce(i.unit_cost, 0)), 2), 0)
    from public.product_ingredients pi
    join public.ingredients i on i.ingredient_id = pi.ingredient_id
   where pi.product_id = p_product_id
  on conflict (product_id) do update set ingredient_cost = excluded.ingredient_cost;
end $$;

create function public.product_ingredients_recost() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op <> 'DELETE' then
    perform public.recalculate_product_costing(new.product_id);
  end if;
  if tg_op = 'DELETE' then
    perform public.recalculate_product_costing(old.product_id);
  elsif tg_op = 'UPDATE' then
    if old.product_id <> new.product_id then
      perform public.recalculate_product_costing(old.product_id);
    end if;
  end if;
  return null;
end $$;

create trigger product_ingredients_recost
  after insert or update or delete on public.product_ingredients
  for each row execute function public.product_ingredients_recost();

create function public.ingredients_recost() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_product integer;
begin
  for v_product in
    select product_id from public.product_ingredients where ingredient_id = new.ingredient_id
  loop
    perform public.recalculate_product_costing(v_product);
  end loop;
  return null;
end $$;

-- Stock movements update current_stock only, so they never fire this.
create trigger ingredients_unit_cost_recost
  after update of unit_cost on public.ingredients
  for each row when (old.unit_cost is distinct from new.unit_cost)
  execute function public.ingredients_recost();

revoke execute on function public.product_ingredients_recost(), public.ingredients_recost()
  from public, anon, authenticated, service_role;
-- Called from the trigger functions, which run as the signed-in Owner.
grant execute on function public.recalculate_product_costing(integer) to authenticated, service_role;

-- Bring costing rows of existing recipes up to date.
select public.recalculate_product_costing(product_id)
  from (select distinct product_id from public.product_ingredients) p;

-- ---------------------------------------------------------------------------
-- 2. Replace a product's whole recipe in one transaction.
--    p_items: [{ ingredient_id, quantity_needed }]. Rows not listed are removed.
--    SECURITY INVOKER: RLS limits recipe writes to the Owner.
-- ---------------------------------------------------------------------------

create function public.set_product_recipe(p_product_id integer, p_items jsonb) returns void
language plpgsql set search_path = '' as $$
begin
  -- RLS alone would turn a barista's delete into a silent no-op; refuse it outright.
  if public.app_role() is distinct from 'owner_admin' then
    raise exception 'FORBIDDEN: only the Owner can change recipes' using errcode = '42501';
  end if;
  if not exists (select 1 from public.products where product_id = p_product_id) then
    raise exception 'NOT_FOUND: product % does not exist', p_product_id;
  end if;

  delete from public.product_ingredients
   where product_id = p_product_id
     and ingredient_id not in (
       select (e->>'ingredient_id')::integer from jsonb_array_elements(p_items) e);

  insert into public.product_ingredients (product_id, ingredient_id, quantity_needed)
  select p_product_id, (e->>'ingredient_id')::integer, (e->>'quantity_needed')::numeric
    from jsonb_array_elements(p_items) e
  on conflict (product_id, ingredient_id) do update set quantity_needed = excluded.quantity_needed;
end $$;

grant execute on function public.set_product_recipe(integer, jsonb) to authenticated;
