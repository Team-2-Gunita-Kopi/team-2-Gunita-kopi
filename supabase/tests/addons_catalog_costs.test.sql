-- Add-ons from INGREDIENTS, Owner-only ingredient costs and the official catalog
-- (migrations 20261120000200, 20261120000300).
-- Runs on a migrated database, alone or after the other test files (its fixture uses other ids).
-- Each check raises 'TEST FAILED: ...' on a wrong result; run with psql -v ON_ERROR_STOP=1.

\set owner   '''00000000-0000-0000-0000-0000000000a3'''
\set barista '''00000000-0000-0000-0000-0000000000b3'''

-- One Owner per database (users_single_owner): retire an Owner left by an earlier test file.
update public.users set role = 'barista', email = null where role = 'owner_admin';
insert into auth.users (id, email) values
  (:owner, 'owner3@example.com'), (:barista, 'dani@staff.gunitakopi.local');
insert into public.users (user_id, auth_user_id, username, full_name, role, email) overriding system value values
  (21, :owner, 'owner3', 'Owner Three', 'owner_admin', 'owner3@example.com'),
  (22, :barista, 'dani', 'Dani Barista', 'barista', null);

-- The Owner signed in with password + emailed code: apps/api approved this session (20261120001100).
-- The test uses the Owner's id as the session id.
insert into public.owner_login_challenges (token_hash, auth_user_id, session_id, verified_at)
  values ('test-' || :owner, :owner, :owner, now());
insert into public.ingredients (ingredient_id, ingredient_name, unit, current_stock, reorder_level, unit_cost)
  overriding system value values
  (21, 'Espresso Beans', 'g', 200, 20, 1.00),
  (22, 'Caramel Sauce', 'ml', 30, 5, 0.40),
  (23, 'Rice', 'g', 1000, 100, 0.05);
insert into public.products (product_id, product_name, category, price, created_by) overriding system value values
  (921, 'Test Iced Spanish Latte', 'Test', 145.00, 21);
insert into public.product_ingredients (product_id, ingredient_id, quantity_needed) values (921, 21, 18);

-- ---------------------------------------------------------------------------
-- Defaults and configuration rules (table owner, RLS bypassed)
-- ---------------------------------------------------------------------------
do $$ begin
  if exists (select 1 from public.ingredients
              where ingredient_id in (21, 22, 23)
                and (is_addon or addon_selling_price is not null or addon_quantity is not null)) then
    raise exception 'TEST FAILED: ingredients default to regular (false, NULL, NULL)';
  end if;
end $$;

do $$ begin
  update public.ingredients set is_addon = true, addon_selling_price = 30, addon_quantity = 18 where ingredient_id = 21;
  raise exception 'TEST FAILED: add-on price other than 25.00 accepted';
exception when check_violation then null;
end $$;

do $$ begin
  update public.ingredients set is_addon = true, addon_selling_price = 25, addon_quantity = 0 where ingredient_id = 21;
  raise exception 'TEST FAILED: add-on quantity 0 accepted';
exception when check_violation then null;
end $$;

do $$ begin
  update public.ingredients set is_addon = true, addon_selling_price = 25 where ingredient_id = 21;
  raise exception 'TEST FAILED: add-on without a quantity accepted';
exception when check_violation then null;
end $$;

do $$ begin
  update public.ingredients set is_addon = true, addon_quantity = 18 where ingredient_id = 21;
  raise exception 'TEST FAILED: add-on without a price accepted';
exception when check_violation then null;
end $$;

do $$ begin
  update public.ingredients set addon_selling_price = 25, addon_quantity = 18 where ingredient_id = 21;
  raise exception 'TEST FAILED: add-on values on a regular ingredient accepted';
exception when check_violation then null;
end $$;

-- ---------------------------------------------------------------------------
-- Owner (approved session): configures add-ons, reads costs only through ingredient_unit_costs()
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', :owner, 'session_id', :owner)::text, false);
set role authenticated;

do $$ begin
  update public.ingredients set is_addon = true, addon_selling_price = 25, addon_quantity = 18 where ingredient_id = 21;
  update public.ingredients set is_addon = true, addon_selling_price = 25, addon_quantity = 15 where ingredient_id = 22;
  if (select count(*) from public.v_inventory_status
       where ingredient_id in (21, 22) and is_addon and addon_selling_price = 25) <> 2 then
    raise exception 'TEST FAILED: Owner configures add-ons';
  end if;
  if (select unit_cost from public.ingredient_unit_costs() where ingredient_id = 21) <> 1.00 then
    raise exception 'TEST FAILED: Owner reads unit costs';
  end if;
  if (select ingredient_cost from public.product_costing where product_id = 921) <> 18.00 then
    raise exception 'TEST FAILED: Owner costing still computed from unit costs';
  end if;
end $$;

-- Direct column reads are closed for every signed-in role; the Owner uses the function above.
do $$ begin
  perform unit_cost from public.ingredients;
  raise exception 'TEST FAILED: unit_cost selectable directly';
exception when insufficient_privilege then null;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Barista: no cost data anywhere, add-on configuration read-only, add-ons sold through checkout
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', :barista, 'aal', 'aal1')::text, false);
set role authenticated;

do $$ begin
  perform unit_cost from public.ingredients;
  raise exception 'TEST FAILED: barista reads ingredients.unit_cost';
exception when insufficient_privilege then null;
end $$;

do $$ begin
  perform * from public.ingredients;
  raise exception 'TEST FAILED: barista reads every ingredients column';
exception when insufficient_privilege then null;
end $$;

do $$ begin
  perform public.ingredient_unit_costs();
  raise exception 'TEST FAILED: barista called ingredient_unit_costs()';
exception when insufficient_privilege then null;
end $$;

do $$ begin
  perform public.recalculate_product_costing(921);
  raise exception 'TEST FAILED: barista called recalculate_product_costing()';
exception when insufficient_privilege then null;
end $$;

do $$ begin
  -- Stock information and the add-on menu stay readable.
  if (select count(*) from public.v_inventory_status where ingredient_id in (21, 22, 23)) <> 3
     or (select addon_quantity from public.ingredients where ingredient_id = 21) <> 18 then
    raise exception 'TEST FAILED: barista reads stock and add-on configuration';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'v_inventory_status' and column_name = 'unit_cost') then
    raise exception 'TEST FAILED: v_inventory_status still has unit_cost';
  end if;
  if exists (select 1 from public.product_costing) then
    raise exception 'TEST FAILED: barista reads product costing';
  end if;
  -- Configuration is Owner-only (RLS turns the update into a no-op).
  update public.ingredients set is_addon = false, addon_selling_price = null, addon_quantity = null where ingredient_id = 21;
end $$;

reset role;
do $$ begin
  if not (select is_addon from public.ingredients where ingredient_id = 21) then
    raise exception 'TEST FAILED: barista changed an add-on configuration';
  end if;
end $$;
select set_config('request.jwt.claims', json_build_object('sub', :barista, 'aal', 'aal1')::text, false);
set role authenticated;

-- 1 Iced Spanish Latte (PHP 145) + Espresso Extra Shots + Caramel (PHP 25 each) = PHP 195.
-- Beans are in the recipe and sold as an add-on: one movement of 18 + 18 = 36 g.
do $$
declare
  v_res jsonb;
  v_order int;
begin
  v_res := public.process_checkout_transaction('{
    "client_tx_id": "77777777-7777-4777-8777-777777777777", "order_type": "dine-in",
    "payment_method": "cash", "amount_paid": 200,
    "items": [
      {"product_id": 921, "quantity": 1, "unit_price": 145},
      {"is_addon": true, "ingredient_id": 21, "quantity": 1, "unit_price": 25},
      {"is_addon": true, "ingredient_id": 22, "quantity": 1, "unit_price": 25}
    ]}');
  v_order := (v_res->>'order_id')::int;
  if (v_res->>'total')::numeric <> 195 or (v_res->>'change_amount')::numeric <> 5 then
    raise exception 'TEST FAILED: add-on checkout totals %', v_res;
  end if;
  if (select count(*) from public.orders where order_id = v_order) <> 3
     or (select count(*) from public.orders
          where order_id = v_order and is_addon and product_id is null
            and quantity = 1 and unit_price = 25 and subtotal = 25
            and ingredient_id in (21, 22)) <> 2
     or not exists (select 1 from public.orders
                     where order_id = v_order and not is_addon and product_id = 921 and subtotal = 145) then
    raise exception 'TEST FAILED: product and add-on rows';
  end if;
  if (select current_stock from public.ingredients where ingredient_id = 21) <> 164
     or (select current_stock from public.ingredients where ingredient_id = 22) <> 15 then
    raise exception 'TEST FAILED: add-on stock deduction uses addon_quantity';
  end if;
  if (select count(*) from public.stock_transactions where remarks = 'Order #' || v_order) <> 2
     or (select quantity from public.stock_transactions
          where remarks = 'Order #' || v_order and ingredient_id = 21) <> 36 then
    raise exception 'TEST FAILED: one stock movement per ingredient';
  end if;

  -- Retry of the same sale: no new rows, no second deduction.
  v_res := public.process_checkout_transaction('{
    "client_tx_id": "77777777-7777-4777-8777-777777777777", "order_type": "dine-in",
    "payment_method": "cash", "amount_paid": 200,
    "items": [{"is_addon": true, "ingredient_id": 21, "quantity": 1, "unit_price": 25}]}');
  if not (v_res->>'duplicate')::boolean
     or (select current_stock from public.ingredients where ingredient_id = 21) <> 164
     or (select count(*) from public.orders where order_id = v_order) <> 3 then
    raise exception 'TEST FAILED: retried add-on sale deducted again';
  end if;
end $$;

do $$ begin
  perform public.process_checkout_transaction('{
    "client_tx_id": "88888888-8888-4888-8888-888888888881", "order_type": "take-out",
    "amount_paid": 100, "items": [{"is_addon": true, "ingredient_id": 21, "quantity": 1, "unit_price": 18}]}');
  raise exception 'TEST FAILED: add-on below the fixed price accepted';
exception when raise_exception then
  if sqlerrm not like 'PRICE_CONFLICT%' then raise; end if;
end $$;

do $$ begin
  perform public.process_checkout_transaction('{
    "client_tx_id": "88888888-8888-4888-8888-888888888882", "order_type": "take-out",
    "amount_paid": 100, "items": [{"is_addon": true, "ingredient_id": 23, "quantity": 1, "unit_price": 25}]}');
  raise exception 'TEST FAILED: regular ingredient sold as an add-on';
exception when raise_exception then
  if sqlerrm not like 'CONFLICT%' then raise; end if;
end $$;

-- 2 caramel selections need 30 ml; 15 ml left.
do $$ begin
  perform public.process_checkout_transaction('{
    "client_tx_id": "88888888-8888-4888-8888-888888888883", "order_type": "take-out",
    "amount_paid": 100, "items": [{"is_addon": true, "ingredient_id": 22, "quantity": 2, "unit_price": 25}]}');
  raise exception 'TEST FAILED: add-on beyond stock accepted';
exception when raise_exception then
  if sqlerrm not like 'STOCK_CONFLICT%' then raise; end if;
end $$;

do $$ begin
  if (select current_stock from public.ingredients where ingredient_id = 22) <> 15
     or exists (select 1 from public.payments where client_tx_id::text like '88888888-%') then
    raise exception 'TEST FAILED: rejected add-on sales left writes behind';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Owner changes the configuration: future sales only, nothing historical moves
-- ---------------------------------------------------------------------------
create temp table history_before as
  select stock_trans_id, ingredient_id, quantity, remaining_stock from public.stock_transactions;
create temp table orders_before as
  select order_line_id, quantity, unit_price, subtotal from public.orders;
grant select on history_before, orders_before to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', :owner, 'session_id', :owner)::text, false);
set role authenticated;

do $$ begin
  update public.ingredients set addon_quantity = 20 where ingredient_id = 21;
  update public.ingredients set is_addon = false, addon_selling_price = null, addon_quantity = null
   where ingredient_id = 22;
  if (select current_stock from public.ingredients where ingredient_id = 21) <> 164
     or (select current_stock from public.ingredients where ingredient_id = 22) <> 15 then
    raise exception 'TEST FAILED: configuration change moved stock';
  end if;
  if exists (select stock_trans_id, ingredient_id, quantity, remaining_stock from public.stock_transactions
             except select * from history_before)
     or exists (select * from history_before
                except select stock_trans_id, ingredient_id, quantity, remaining_stock from public.stock_transactions) then
    raise exception 'TEST FAILED: configuration change touched stock history';
  end if;
  if exists (select order_line_id, quantity, unit_price, subtotal from public.orders
             except select * from orders_before) then
    raise exception 'TEST FAILED: configuration change touched saved orders';
  end if;
  if exists (select 1 from public.v_inventory_status where ingredient_id = 22 and is_addon) then
    raise exception 'TEST FAILED: disabled add-on still offered';
  end if;
end $$;

reset role;
select set_config('request.jwt.claims', json_build_object('sub', :barista, 'aal', 'aal1')::text, false);
set role authenticated;

-- Disabled add-on cannot be sold; the new quantity applies to the next sale (164 - 20 = 144).
do $$
declare v_res jsonb;
begin
  begin
    perform public.process_checkout_transaction('{
      "client_tx_id": "99999999-9999-4999-8999-999999999991", "order_type": "take-out",
      "amount_paid": 100, "items": [{"is_addon": true, "ingredient_id": 22, "quantity": 1, "unit_price": 25}]}');
    raise exception 'TEST FAILED: disabled add-on sold';
  exception when raise_exception then
    if sqlerrm not like 'CONFLICT%' then raise; end if;
  end;
  v_res := public.process_checkout_transaction('{
    "client_tx_id": "99999999-9999-4999-8999-999999999992", "order_type": "take-out",
    "amount_paid": 25, "items": [{"is_addon": true, "ingredient_id": 21, "quantity": 1, "unit_price": 25}]}');
  if (select current_stock from public.ingredients where ingredient_id = 21) <> 144 then
    raise exception 'TEST FAILED: new add-on quantity applies to the next sale %', v_res;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Official catalog: 76 products (20261120000300 + 20261120000400), orange-board items left out
-- ---------------------------------------------------------------------------
do $$ begin
  if (select count(*) from public.products
       where category in ('Iced Coffee', 'Non-Coffee', 'Silog Meals', 'Shawarma Meals',
                          'Gunita Meals', 'French Fries', 'Snacks')) <> 76 then
    raise exception 'TEST FAILED: official catalog size';
  end if;
  if (select string_agg(category || ':' || n, ',' order by category) from (
        select category, count(*) n from public.products
         where category in ('Iced Coffee', 'Non-Coffee', 'Silog Meals', 'Shawarma Meals',
                            'Gunita Meals', 'French Fries', 'Snacks')
         group by category) c)
     <> 'French Fries:4,Gunita Meals:8,Iced Coffee:24,Non-Coffee:24,Shawarma Meals:5,Silog Meals:6,Snacks:5' then
    raise exception 'TEST FAILED: products per menu category';
  end if;
  if (select price from public.products where product_name = 'Gunita Kopi (Signature)') <> 119
     or (select price from public.products where product_name = 'Jumbo Shomai') <> 15
     or (select price from public.products where product_name = 'Long Black') <> 89
     or (select price from public.products where product_name = 'Family') <> 200
     or (select price from public.products where product_name = 'Biscoff (Non Coffee)') <> 120
     or (select price from public.products where product_name = 'Shanghai / Rice') <> 60 then
    raise exception 'TEST FAILED: catalog prices';
  end if;
  if exists (select 1 from public.products
              where product_name in ('Brusko Kopi', 'White Chocolate',
                                     'Kopi Latte', 'Tres Leches', 'Matcha Latte', 'Matcha Papaya')) then
    raise exception 'TEST FAILED: unconfirmed items were inserted';
  end if;
  if exists (select 1 from public.products p
              where p.category in ('Iced Coffee', 'Non-Coffee', 'Silog Meals', 'Shawarma Meals',
                                   'Gunita Meals', 'French Fries', 'Snacks')
                and (p.created_by is not null or p.description is not null or p.image is not null
                     or not p.is_available
                     or exists (select 1 from public.product_ingredients pi where pi.product_id = p.product_id)
                     or exists (select 1 from public.product_costing pc where pc.product_id = p.product_id))) then
    raise exception 'TEST FAILED: catalog invented data';
  end if;
  if (select count(*) from (select lower(product_name) from public.products group by 1 having count(*) > 1) d) > 0 then
    raise exception 'TEST FAILED: duplicate product names';
  end if;
end $$;

-- Running the catalog again keeps existing records, including one the Owner changed.
update public.products set price = 55 where product_name = 'Waffle';
delete from public.products where product_name = 'Churros';
insert into public.products (product_name, category, price) values ('churros', 'Snacks', 48);

\ir ../migrations/20261120000300_official_menu_catalog.sql
\ir ../migrations/20261120000400_official_menu_catalog_additions.sql

do $$ begin
  if (select count(*) from public.products
       where category in ('Iced Coffee', 'Non-Coffee', 'Silog Meals', 'Shawarma Meals',
                          'Gunita Meals', 'French Fries', 'Snacks')) <> 76
     or (select price from public.products where product_name = 'Waffle') <> 55
     or (select count(*) from public.products where lower(product_name) = 'churros') <> 1
     or (select price from public.products where lower(product_name) = 'churros') <> 48 then
    raise exception 'TEST FAILED: catalog re-run changed or duplicated records';
  end if;
end $$;

\echo 'addons_catalog_costs: all checks passed'
