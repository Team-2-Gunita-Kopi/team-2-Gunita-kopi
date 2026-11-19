-- SYNTHETIC TEST DATA for manual localhost testing. NOT Gunita Kopi business data.
-- Every supplier and ingredient name ends in "(synthetic)". Quantities, unit costs, stock levels,
-- recipes, packaging costs, add-on mappings and orders are invented for testing only.
--
-- Run ONLY on a local Supabase stack (scripts/seed-localhost.sh does the checks and passes the
-- two Auth user ids). It refuses to run twice and never deletes anything.
-- psql variables: :owner_id and :barista_id are the Auth user ids (quoted uuids).
-- The 76 products come from the catalog migrations; this file only adds data around them.

\set ON_ERROR_STOP on

do $$ begin
  if exists (select 1 from public.suppliers where supplier_name like '%(synthetic)') then
    raise exception 'SEED REFUSED: synthetic data is already present; nothing was changed';
  end if;
  if (select count(*) from public.products) <> 76 then
    raise exception 'SEED REFUSED: expected the 76 catalog products, found %', (select count(*) from public.products);
  end if;
end $$;

begin;

-- Accounts (the Auth users were created by the seed script through the local Auth admin API).
insert into public.users (auth_user_id, username, full_name, role, email) values
  (:owner_id, 'testowner', 'Test Owner (synthetic)', 'owner_admin', 'test-owner@example.com'),
  (:barista_id, 'testbarista', 'Test Barista (synthetic)', 'barista', null);

insert into public.suppliers (supplier_name, contact_person, contact_number, address, status) values
  ('Coffee Supplier A (synthetic)', 'Test Contact A', '0900-000-0001', 'Test Address A', 'active'),
  ('Dairy Supplier B (synthetic)', 'Test Contact B', '0900-000-0002', 'Test Address B', 'active'),
  ('Dry Goods Supplier C (synthetic)', 'Test Contact C', '0900-000-0003', 'Test Address C', 'active'),
  ('Old Supplier D (synthetic)', null, null, null, 'inactive');

-- Ingredients start at 0 stock; opening stock is recorded below as Owner stock-in (FR-15).
-- The 11 official add-ons each map to exactly one ingredient (names are the menu add-on names).
insert into public.ingredients (supplier_id, ingredient_name, unit, reorder_level, unit_cost,
                                is_addon, addon_selling_price, addon_quantity)
select s.supplier_id, v.name, v.unit, v.reorder, v.cost, v.addon_qty is not null,
       case when v.addon_qty is not null then 25.00 end, v.addon_qty
  from (values
    ('Coffee Supplier A (synthetic)',    'Espresso Extra Shots (synthetic)',       'g',   500, 1.20, 18),
    ('Dairy Supplier B (synthetic)',     'Milk (synthetic)',                       'ml', 3000, 0.08, 30),
    ('Coffee Supplier A (synthetic)',    'Matcha (synthetic)',                     'g',   200, 2.50, 5),
    ('Dry Goods Supplier C (synthetic)', 'Chocolate (synthetic)',                  'ml',  300, 0.40, 15),
    ('Dry Goods Supplier C (synthetic)', 'Caramel (synthetic)',                    'ml',  300, 0.45, 15),
    ('Dry Goods Supplier C (synthetic)', 'Syrup (synthetic)',                      'ml',  300, 0.30, 15),
    ('Dry Goods Supplier C (synthetic)', 'Sauce (synthetic)',                      'ml',  300, 0.35, 15),
    ('Dry Goods Supplier C (synthetic)', 'Biscoff (Spread/Biscuits) (synthetic)',  'g',   200, 0.90, 15),
    ('Dry Goods Supplier C (synthetic)', 'Oreo Biscuits (synthetic)',              'pcs',  20, 4.00, 2),
    ('Dry Goods Supplier C (synthetic)', 'Jam (synthetic)',                        'g',   100, 0.50, 15),
    ('Coffee Supplier A (synthetic)',    'Gunita (synthetic)',                     'ml',  200, 0.60, 20),
    ('Dry Goods Supplier C (synthetic)', 'Ice (synthetic)',                        'g',  5000, 0.01, null),
    ('Dry Goods Supplier C (synthetic)', 'Cup 16oz (synthetic)',                   'pcs',  50, 3.00, null),
    ('Dry Goods Supplier C (synthetic)', 'Rice (synthetic)',                       'g',  2000, 0.05, null),
    ('Dairy Supplier B (synthetic)',     'Egg (synthetic)',                        'pcs',  24, 8.00, null),
    ('Dry Goods Supplier C (synthetic)', 'Chicken (synthetic)',                    'g',  2000, 0.25, null),
    ('Dry Goods Supplier C (synthetic)', 'Pita Bread (synthetic)',                 'pcs',  20, 6.00, null),
    ('Dry Goods Supplier C (synthetic)', 'Potato Fries (synthetic)',               'g',  2000, 0.12, null),
    ('Dry Goods Supplier C (synthetic)', 'Flour Mix (synthetic)',                  'g',  1000, 0.06, null),
    ('Dry Goods Supplier C (synthetic)', 'Breakfast Meat (synthetic)',             'g',  1000, 0.30, null)
  ) as v(supplier, name, unit, reorder, cost, addon_qty)
  join public.suppliers s on s.supplier_name = v.supplier;

-- Opening stock, recorded by the Owner. Jam stays at 0 (out-of-stock); Oreo and Pita end low-stock.
insert into public.stock_transactions (ingredient_id, user_id, type, quantity, remarks)
select i.ingredient_id, (select user_id from public.users where username = 'testowner'), 'in', v.qty,
       'Opening stock (synthetic)'
  from (values
    ('Espresso Extra Shots (synthetic)', 5000), ('Milk (synthetic)', 20000), ('Matcha (synthetic)', 1000),
    ('Chocolate (synthetic)', 2000), ('Caramel (synthetic)', 2000), ('Syrup (synthetic)', 2000),
    ('Sauce (synthetic)', 2000), ('Biscoff (Spread/Biscuits) (synthetic)', 1000),
    ('Oreo Biscuits (synthetic)', 18), ('Gunita (synthetic)', 1000), ('Ice (synthetic)', 30000),
    ('Cup 16oz (synthetic)', 300), ('Rice (synthetic)', 10000), ('Egg (synthetic)', 120),
    ('Chicken (synthetic)', 8000), ('Pita Bread (synthetic)', 22), ('Potato Fries (synthetic)', 8000),
    ('Flour Mix (synthetic)', 5000), ('Breakfast Meat (synthetic)', 5000)
  ) as v(name, qty)
  join public.ingredients i on i.ingredient_name = v.name;

-- Recipes for all 76 catalog products (synthetic amounts, by category; FR-23).
insert into public.product_ingredients (product_id, ingredient_id, quantity_needed)
select p.product_id, i.ingredient_id, r.qty
  from public.products p
  join lateral (values
    -- drinks
    ('Iced Coffee', 'Espresso Extra Shots (synthetic)', 18::numeric, true),
    ('Iced Coffee', 'Milk (synthetic)', 150, true),
    ('Non-Coffee', 'Milk (synthetic)', 200, true),
    ('Iced Coffee', 'Ice (synthetic)', 100, true), ('Non-Coffee', 'Ice (synthetic)', 100, true),
    ('Iced Coffee', 'Cup 16oz (synthetic)', 1, true), ('Non-Coffee', 'Cup 16oz (synthetic)', 1, true),
    ('Non-Coffee', 'Matcha (synthetic)', 5, p.product_name ilike '%matcha%'),
    ('Iced Coffee', 'Matcha (synthetic)', 5, p.product_name ilike '%matcha%'),
    ('Non-Coffee', 'Chocolate (synthetic)', 20, p.product_name ilike '%choco%'),
    -- food
    ('Silog Meals', 'Rice (synthetic)', 200, true), ('Silog Meals', 'Egg (synthetic)', 1, true),
    ('Silog Meals', 'Breakfast Meat (synthetic)', 80, true),
    ('Shawarma Meals', 'Pita Bread (synthetic)', 1, true), ('Shawarma Meals', 'Chicken (synthetic)', 80, true),
    ('Gunita Meals', 'Rice (synthetic)', 150, p.product_name ilike '%rice%'),
    ('Gunita Meals', 'Chicken (synthetic)', 60, true),
    ('French Fries', 'Potato Fries (synthetic)', 150, true),
    ('Snacks', 'Flour Mix (synthetic)', 100, true)
  ) as r(category, ingredient, qty, applies) on r.category = p.category and r.applies
  join public.ingredients i on i.ingredient_name = r.ingredient;

-- Packaging costs (FR-26); ingredient_cost was computed by the recipe trigger.
update public.product_costing c
   set packaging_cost = case when p.category in ('Iced Coffee', 'Non-Coffee') then 6.00 else 4.00 end
  from public.products p
 where p.product_id = c.product_id;

commit;

-- ---------------------------------------------------------------------------
-- Sample orders through the real checkout function, as the Barista (RLS and app_user_id apply).
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', :barista_id, 'role', 'authenticated')::text, false);
set role authenticated;

do $$
declare
  pid  integer;
  milk integer := (select ingredient_id from public.ingredients where ingredient_name = 'Milk (synthetic)');
  car  integer := (select ingredient_id from public.ingredients where ingredient_name = 'Caramel (synthetic)');
  esp  integer := (select ingredient_id from public.ingredients where ingredient_name = 'Espresso Extra Shots (synthetic)');
  orders jsonb := '[]';
  o jsonb;
  item jsonb;
  n integer := 0;
  pr numeric;
begin
  -- [product name, qty, add-ons [[ingredient, selections]], order type, customization, instructions]
  for o in select * from jsonb_array_elements(jsonb_build_array(
    jsonb_build_array('Spanish Latte', 2, jsonb_build_array(jsonb_build_array(milk, 1), jsonb_build_array(car, 2)), 'dine-in', 'less ice', 'synthetic order'),
    jsonb_build_array('Matcha', 1, jsonb_build_array(jsonb_build_array(esp, 1)), 'take-out', null, null),
    jsonb_build_array('Tapsilog', 1, '[]'::jsonb, 'dine-in', null, 'no onions (synthetic)'),
    jsonb_build_array('Barkada', 1, '[]'::jsonb, 'take-out', 'Cheese', null),
    jsonb_build_array('Biscoff Kopi', 3, jsonb_build_array(jsonb_build_array(car, 1)), 'pre-order', null, null),
    jsonb_build_array('Shawarma Rice', 2, '[]'::jsonb, 'dine-in', null, null),
    jsonb_build_array('Chocolate Milk', 1, jsonb_build_array(jsonb_build_array(milk, 2)), 'dine-in', 'more ice', null),
    jsonb_build_array('Churros', 2, '[]'::jsonb, 'take-out', null, null),
    jsonb_build_array('Long Black', 1, '[]'::jsonb, 'dine-in', null, null),
    jsonb_build_array('Cappuccino', 1, '[]'::jsonb, 'take-out', null, null)
  )) loop
    n := n + 1;
    select product_id, price into pid, pr from public.products where product_name = o->>0;
    item := jsonb_build_array(jsonb_build_object('product_id', pid, 'quantity', (o->>1)::int, 'unit_price', pr,
                                                  'customization', o->>4, 'special_instructions', o->>5));
    select item || coalesce(jsonb_agg(jsonb_build_object('is_addon', true, 'ingredient_id', (a->>0)::int,
                                                          'quantity', (a->>1)::int, 'unit_price', 25)), '[]')
      into item from jsonb_array_elements(o->2) a;
    perform public.process_checkout_transaction(jsonb_build_object(
      'client_tx_id', ('5e000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      'order_type', o->>3, 'payment_method', 'cash', 'amount_paid', 1000, 'items', item));
  end loop;
end $$;

-- A manual stock-out by the Barista (spoilage), so stock history has both types (FR-16).
insert into public.stock_transactions (ingredient_id, user_id, type, quantity, remarks)
select ingredient_id, public.app_user_id(), 'out', 500, 'Spoilage (synthetic)'
  from public.ingredients where ingredient_name = 'Milk (synthetic)';

reset role;

-- Order board states (as the Owner): 1-6 completed, 7 preparing, 8 cancelled, 9-10 pending.
select set_config('request.jwt.claims', json_build_object('sub', :owner_id, 'role', 'authenticated', 'aal', 'aal2')::text, false);
set role authenticated;
do $$
declare v integer;
begin
  for v in select order_id from public.payments where client_tx_id::text like '5e000000-%' order by order_id loop
    if v <= (select min(order_id) + 6 from public.payments where client_tx_id::text like '5e000000-%') then
      update public.orders set status = 'preparing' where order_id = v;
    end if;
    if v <= (select min(order_id) + 5 from public.payments where client_tx_id::text like '5e000000-%') then
      update public.orders set status = 'completed' where order_id = v;
    elsif v = (select min(order_id) + 7 from public.payments where client_tx_id::text like '5e000000-%') then
      update public.orders set status = 'cancelled' where order_id = v;
    end if;
  end loop;
end $$;
reset role;
select set_config('request.jwt.claims', '', false);

-- Spread the first three completed orders over earlier days/months so the daily and monthly
-- reports have more than one row (dates only; amounts unchanged).
update public.orders o set order_date = o.order_date - make_interval(days => d.days)
  from (select order_id, (array[1, 2, 35])[row_number() over (order by order_id)] as days
          from public.payments where client_tx_id::text like '5e000000-%' order by order_id limit 3) d
 where o.order_id = d.order_id;
update public.payments p set date_time = p.date_time - make_interval(days => d.days)
  from (select order_id, (array[1, 2, 35])[row_number() over (order by order_id)] as days
          from public.payments where client_tx_id::text like '5e000000-%' order by order_id limit 3) d
 where p.order_id = d.order_id;

select 'synthetic seed complete' as result,
       (select count(*) from public.ingredients where ingredient_name like '%(synthetic)') as ingredients,
       (select count(*) from public.ingredients where is_addon) as addons,
       (select count(distinct product_id) from public.product_ingredients) as products_with_recipe,
       (select count(distinct order_id) from public.orders where client_tx_id::text like '5e000000-%') as orders,
       (select count(*) from public.stock_transactions) as stock_movements;
