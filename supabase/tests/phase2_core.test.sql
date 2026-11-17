-- Phase 2 database rules, checked on a migrated database (see supabase/tests/README.md).
-- Each check raises 'TEST FAILED: ...' on a wrong result; run with psql -v ON_ERROR_STOP=1.
-- Sessions are simulated the way PostgREST does it: role authenticated + request.jwt.claims.

\set owner   '''00000000-0000-0000-0000-0000000000a1'''
\set barista '''00000000-0000-0000-0000-0000000000b1'''

-- ---------------------------------------------------------------------------
-- Fixture (as the migration owner, RLS bypassed)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  (:owner, 'owner@example.com'), (:barista, 'bea@staff.gunitakopi.local');
insert into public.users (user_id, auth_user_id, username, full_name, role, email) overriding system value values
  (1, :owner, 'owner', 'Owner One', 'owner_admin', 'owner@example.com'),
  (2, :barista, 'bea', 'Bea Barista', 'barista', null);
insert into public.suppliers (supplier_id, supplier_name) overriding system value values (1, 'Bean Co');
insert into public.ingredients (ingredient_id, supplier_id, ingredient_name, unit, current_stock, reorder_level, unit_cost)
  overriding system value values
  (1, 1, 'Espresso beans', 'g',  1000, 100, 0.50),
  (2, 1, 'Milk',           'ml', 2000, 500, 0.10),
  (3, null, 'Vanilla syrup', 'pump', 10, 5, 15.00);
insert into public.products (product_id, product_name, category, price, created_by) overriding system value values
  (1, 'Latte', 'Coffee', 120.00, 1),
  (2, 'Mocha', 'Coffee', 140.00, 1);

-- ---------------------------------------------------------------------------
-- Owner: recipe and costing
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', :owner)::text, false);
set role authenticated;

do $$ begin
  perform public.set_product_recipe(1, '[{"ingredient_id":1,"quantity_needed":18},{"ingredient_id":2,"quantity_needed":200}]');
  -- 18 * 0.50 + 200 * 0.10 = 29.00
  if (select ingredient_cost from public.product_costing where product_id = 1) <> 29.00 then
    raise exception 'TEST FAILED: ingredient cost after recipe';
  end if;

  update public.product_costing set packaging_cost = 6.50 where product_id = 1;
  if (select total_cost from public.product_costing where product_id = 1) <> 35.50 then
    raise exception 'TEST FAILED: total cost includes packaging';
  end if;

  update public.ingredients set unit_cost = 0.60 where ingredient_id = 1; -- 10.80 + 20.00
  if (select ingredient_cost from public.product_costing where product_id = 1) <> 30.80 then
    raise exception 'TEST FAILED: unit cost change recosts products';
  end if;

  -- Replace the recipe: milk removed, beans changed.
  perform public.set_product_recipe(1, '[{"ingredient_id":1,"quantity_needed":20}]');
  if (select count(*) from public.product_ingredients where product_id = 1) <> 1
     or (select ingredient_cost from public.product_costing where product_id = 1) <> 12.00 then
    raise exception 'TEST FAILED: recipe replacement';
  end if;
  if (select total_cost from public.product_costing where product_id = 1) <> 18.50 then
    raise exception 'TEST FAILED: packaging kept on recost';
  end if;

  -- Final recipe used by the checkout checks below: 18 g beans + 200 ml milk.
  perform public.set_product_recipe(1, '[{"ingredient_id":1,"quantity_needed":18},{"ingredient_id":2,"quantity_needed":200}]');
end $$;

do $$ begin
  perform public.set_product_recipe(99, '[]');
  raise exception 'TEST FAILED: recipe for a missing product';
exception when raise_exception then
  if sqlerrm not like 'NOT_FOUND%' then raise; end if;
end $$;

-- Owner sees supplier names in the inventory view.
do $$ begin
  if (select supplier_name from public.v_inventory_status where ingredient_id = 1) is distinct from 'Bean Co' then
    raise exception 'TEST FAILED: owner sees supplier name';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Barista: permissions, stock, checkout
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', :barista)::text, false);
set role authenticated;

do $$ begin
  perform public.set_product_recipe(1, '[]');
  raise exception 'TEST FAILED: barista changed a recipe';
exception when insufficient_privilege then null;
end $$;

do $$ begin
  insert into public.stock_transactions (ingredient_id, user_id, type, quantity) values (1, 2, 'in', 5);
  raise exception 'TEST FAILED: barista recorded stock in';
exception when insufficient_privilege then null;
end $$;

do $$ begin
  if (select supplier_name from public.v_inventory_status where ingredient_id = 1) is not null then
    raise exception 'TEST FAILED: barista must not see supplier data';
  end if;
  if (select stock_status from public.v_inventory_status where ingredient_id = 3) <> 'available' then
    raise exception 'TEST FAILED: stock status available';
  end if;
end $$;

-- Manual stock out: remaining stock recorded, negative stock refused.
do $$
declare v_remaining numeric;
begin
  insert into public.stock_transactions (ingredient_id, user_id, type, quantity, remarks)
  values (3, 2, 'out', 5, 'spilled') returning remaining_stock into v_remaining;
  if v_remaining <> 5 or (select current_stock from public.ingredients where ingredient_id = 3) <> 5 then
    raise exception 'TEST FAILED: stock out updates stock';
  end if;
  if (select stock_status from public.v_inventory_status where ingredient_id = 3) <> 'low-stock' then
    raise exception 'TEST FAILED: low-stock status';
  end if;
end $$;

do $$ begin
  insert into public.stock_transactions (ingredient_id, user_id, type, quantity) values (3, 2, 'out', 6);
  raise exception 'TEST FAILED: stock went negative';
exception when raise_exception then
  if sqlerrm not like 'STOCK_CONFLICT%' then raise; end if;
end $$;

do $$ begin
  insert into public.stock_transactions (ingredient_id, user_id, type, quantity) values (3, 2, 'out', 0);
  raise exception 'TEST FAILED: zero quantity accepted';
exception when check_violation then null;
end $$;

-- Checkout: 2 lattes + 1 vanilla add-on, paid 300.
do $$
declare v_res jsonb;
begin
  v_res := public.process_checkout_transaction('{
    "client_tx_id": "11111111-1111-4111-8111-111111111111", "order_type": "dine-in",
    "payment_method": "cash", "amount_paid": 300,
    "items": [
      {"product_id": 1, "quantity": 2, "unit_price": 120, "customization": "less ice"},
      {"is_addon": true, "ingredient_id": 3, "quantity": 1, "unit_price": 15}
    ]}');
  if (v_res->>'total')::numeric <> 255 or (v_res->>'change_amount')::numeric <> 45 or (v_res->>'duplicate')::boolean then
    raise exception 'TEST FAILED: checkout totals %', v_res;
  end if;
  if (select count(*) from public.orders where order_id = (v_res->>'order_id')::int) <> 2 then
    raise exception 'TEST FAILED: one row per item';
  end if;
  -- 1000 - 2*18 = 964 beans, 2000 - 2*200 = 1600 milk, 5 - 1 = 4 vanilla.
  if (select current_stock from public.ingredients where ingredient_id = 1) <> 964
     or (select current_stock from public.ingredients where ingredient_id = 2) <> 1600
     or (select current_stock from public.ingredients where ingredient_id = 3) <> 4 then
    raise exception 'TEST FAILED: recipe stock deduction';
  end if;

  -- Same client_tx_id again: no second sale.
  v_res := public.process_checkout_transaction('{
    "client_tx_id": "11111111-1111-4111-8111-111111111111", "order_type": "dine-in",
    "amount_paid": 300, "items": [{"product_id": 1, "quantity": 2, "unit_price": 120}]}');
  if not (v_res->>'duplicate')::boolean or (select count(*) from public.payments) <> 1 then
    raise exception 'TEST FAILED: duplicate checkout';
  end if;
end $$;

-- Stale price: whole sale rolls back.
do $$ begin
  perform public.process_checkout_transaction('{
    "client_tx_id": "22222222-2222-4222-8222-222222222222", "order_type": "take-out",
    "amount_paid": 500, "items": [{"product_id": 1, "quantity": 1, "unit_price": 100}]}');
  raise exception 'TEST FAILED: stale price accepted';
exception when raise_exception then
  if sqlerrm not like 'PRICE_CONFLICT%' then raise; end if;
end $$;

-- Not enough stock: the order rows and payment written before the stock step roll back too.
do $$ begin
  perform public.process_checkout_transaction('{
    "client_tx_id": "33333333-3333-4333-8333-333333333333", "order_type": "take-out",
    "amount_paid": 1000, "items": [{"is_addon": true, "ingredient_id": 3, "quantity": 5, "unit_price": 15}]}');
  raise exception 'TEST FAILED: checkout beyond stock';
exception when raise_exception then
  if sqlerrm not like 'STOCK_CONFLICT%' then raise; end if;
end $$;

do $$ begin
  perform public.process_checkout_transaction('{
    "client_tx_id": "44444444-4444-4444-8444-444444444444", "order_type": "take-out",
    "amount_paid": 50, "items": [{"product_id": 1, "quantity": 1, "unit_price": 120}]}');
  raise exception 'TEST FAILED: underpayment accepted';
exception when raise_exception then
  if sqlerrm not like 'VALIDATION%' then raise; end if;
end $$;

do $$ begin
  if (select count(*) from public.payments) <> 1 or (select count(distinct order_id) from public.orders) <> 1
     or (select current_stock from public.ingredients where ingredient_id = 3) <> 4 then
    raise exception 'TEST FAILED: failed checkouts left writes behind';
  end if;
end $$;

-- Order status transitions.
do $$
declare v_order int := (select max(order_id) from public.orders);
begin
  begin
    update public.orders set status = 'completed' where order_id = v_order;
    raise exception 'TEST FAILED: pending -> completed allowed';
  exception when raise_exception then
    if sqlerrm not like 'INVALID_TRANSITION%' then raise; end if;
  end;

  update public.orders set status = 'preparing' where order_id = v_order;
  update public.orders set status = 'completed' where order_id = v_order;

  begin
    update public.orders set status = 'cancelled' where order_id = v_order;
    raise exception 'TEST FAILED: completed order reopened';
  exception when raise_exception then
    if sqlerrm not like 'INVALID_TRANSITION%' then raise; end if;
  end;

  -- Sales reports are Owner-only, even through the views.
  if exists (select 1 from public.v_daily_sales) then
    raise exception 'TEST FAILED: barista reads sales';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Owner: reports match the completed order
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', :owner)::text, false);
set role authenticated;

do $$ begin
  if (select sum(total_sales) from public.v_daily_sales) <> 255
     or (select sum(order_count) from public.v_daily_sales) <> 1
     or (select sum(total_sales) from public.v_monthly_sales) <> 255 then
    raise exception 'TEST FAILED: sales report totals';
  end if;
  if (select units_sold from public.v_best_sellers where product_id = 1) <> 2 then
    raise exception 'TEST FAILED: best sellers leave add-ons out';
  end if;
end $$;

reset role;

\echo 'phase2_core: all checks passed'
