-- System validation (2026-11-19): business calculations checked against hand-computed values.
-- SYNTHETIC DATA ONLY. Names start with "Synthetic"; quantities, costs and prices are invented for
-- the test and are not Gunita Kopi business data. Never run on a real Supabase project.
-- Runs on a migrated database, alone or after the other test files (its fixture uses ids 31-39, 931-939).
-- Works on both migration chains: the full chain and the live chain (without 20261120000000/0100).
-- Each check raises 'TEST FAILED: ...' on a wrong result; run with psql -v ON_ERROR_STOP=1.
--
-- Hand calculation used below (unit costs in PHP per unit):
--   Recipe of "Synthetic Latte" (price 120.00): beans 18 g x 1.20 + milk 150 ml x 0.08 + cup 1 x 3.00
--     ingredient_cost = 21.60 + 12.00 + 3.00 = 36.60; packaging 5.00; total 41.60; margin 78.40.
--   Order A: 2 lattes, 2 x milk add-on (30 ml each), 1 x caramel add-on (15 ml), paid 500.00
--     total = 2 x 120 + 2 x 25 + 1 x 25 = 315.00; change 185.00
--     stock out: beans 36; milk 2 x 150 + 2 x 30 = 360 (one movement); caramel 15; cups 2.

\set owner   '''00000000-0000-0000-0000-0000000000a4'''
\set barista '''00000000-0000-0000-0000-0000000000b4'''

-- One Owner per database (users_single_owner): retire an Owner left by an earlier test file.
update public.users set role = 'barista', email = null where role = 'owner_admin';
insert into auth.users (id, email) values
  (:owner, 'synthetic-owner@example.com'), (:barista, 'synthbarista@staff.gunitakopi.local');
insert into public.users (user_id, auth_user_id, username, full_name, role, email) overriding system value values
  (31, :owner, 'synthowner', 'Synthetic Owner', 'owner_admin', 'synthetic-owner@example.com'),
  (32, :barista, 'synthbarista', 'Synthetic Barista', 'barista', null);

-- The Owner signed in with password + emailed code: apps/api approved this session (20261120001100).
-- The test uses the Owner's id as the session id.
insert into public.owner_login_challenges (token_hash, auth_user_id, session_id, verified_at)
  values ('test-' || :owner, :owner, :owner, now());
insert into public.suppliers (supplier_id, supplier_name) overriding system value values (31, 'Synthetic Supplier');
insert into public.ingredients (ingredient_id, supplier_id, ingredient_name, unit, current_stock, reorder_level, unit_cost)
  overriding system value values
  (31, 31, 'Synthetic Espresso Beans', 'g', 1000, 100, 1.20),
  (32, 31, 'Synthetic Fresh Milk', 'ml', 2000, 500, 0.08),
  (33, 31, 'Synthetic Caramel Syrup', 'ml', 100, 20, 0.50),
  (34, 31, 'Synthetic Cup', 'pcs', 5, 2, 3.00);
insert into public.products (product_id, product_name, category, price, created_by) overriding system value values
  (931, 'Synthetic Latte', 'Iced Coffee', 120.00, 31),
  (932, 'Synthetic Silog', 'Silog Meals', 80.00, 31);

-- Empty state: no orders yet, so every sales view returns no rows (not an error).
do $$ begin
  if exists (select 1 from public.orders where product_id in (931, 932)) then
    raise exception 'TEST FAILED: fixture starts without orders';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Owner: recipe, costing, add-on configuration
-- ---------------------------------------------------------------------------
-- Fixture rows use fixed ids, which do not advance identity sequences. Move every sequence past the
-- existing rows so rows created by the functions under test get fresh ids, also when the test files
-- run one after another in one database (CI).
do $$
declare r record; v bigint;
begin
  for r in select c.table_name, c.column_name from information_schema.columns c
            where c.table_schema = 'public' and c.is_identity = 'YES' loop
    execute format('select max(%I) from public.%I', r.column_name, r.table_name) into v;
    if v is not null then
      perform setval(pg_get_serial_sequence(format('public.%I', r.table_name), r.column_name), v);
    end if;
  end loop;
end $$;

select set_config('request.jwt.claims', json_build_object('sub', :owner, 'session_id', :owner)::text, false);
set role authenticated;

do $$ begin
  perform public.set_product_recipe(931,
    '[{"ingredient_id":31,"quantity_needed":18},{"ingredient_id":32,"quantity_needed":150},{"ingredient_id":34,"quantity_needed":1}]');
  update public.product_costing set packaging_cost = 5.00 where product_id = 931;
  update public.ingredients set is_addon = true, addon_selling_price = 25, addon_quantity = 30 where ingredient_id = 32;
  update public.ingredients set is_addon = true, addon_selling_price = 25, addon_quantity = 15 where ingredient_id = 33;

  if (select ingredient_cost from public.product_costing where product_id = 931) <> 36.60 then
    raise exception 'TEST FAILED: ingredient cost 36.60, got %', (select ingredient_cost from public.product_costing where product_id = 931);
  end if;
  if (select total_cost from public.product_costing where product_id = 931) <> 41.60 then
    raise exception 'TEST FAILED: total cost 41.60';
  end if;
  if (select p.price - c.total_cost from public.products p join public.product_costing c using (product_id)
       where product_id = 931) <> 78.40 then
    raise exception 'TEST FAILED: margin 78.40';
  end if;
end $$;

-- Invalid foreign key in a recipe is refused and leaves the recipe unchanged.
do $$ begin
  perform public.set_product_recipe(931, '[{"ingredient_id":9999,"quantity_needed":1}]');
  raise exception 'TEST FAILED: recipe with unknown ingredient accepted';
exception when foreign_key_violation then null;
end $$;
do $$ begin
  if (select count(*) from public.product_ingredients where product_id = 931) <> 3 then
    raise exception 'TEST FAILED: failed recipe change kept the old recipe';
  end if;
end $$;

-- The same ingredient twice in one recipe is refused by the database (the API refuses it first).
do $$ begin
  perform public.set_product_recipe(931, '[{"ingredient_id":31,"quantity_needed":1},{"ingredient_id":31,"quantity_needed":2}]');
  raise exception 'TEST FAILED: duplicate recipe ingredient accepted';
exception when cardinality_violation then null;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Barista: checkout, add-ons, idempotency, failures roll back completely
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', :barista, 'aal', 'aal1')::text, false);
set role authenticated;

do $$
declare
  r jsonb;
  v_order integer;
  v_lines integer;
begin
  r := public.process_checkout_transaction(jsonb_build_object(
    'client_tx_id', '10000000-0000-0000-0000-00000000000a', 'order_type', 'dine-in',
    'payment_method', 'cash', 'amount_paid', 500,
    'items', jsonb_build_array(
      jsonb_build_object('product_id', 931, 'quantity', 2, 'unit_price', 120,
                         'customization', 'less ice', 'special_instructions', 'extra hot'),
      jsonb_build_object('is_addon', true, 'ingredient_id', 32, 'quantity', 2, 'unit_price', 25),
      jsonb_build_object('is_addon', true, 'ingredient_id', 33, 'quantity', 1, 'unit_price', 25))));
  v_order := (r->>'order_id')::integer;

  if (r->>'duplicate')::boolean or (r->>'total')::numeric <> 315 or (r->>'change_amount')::numeric <> 185 then
    raise exception 'TEST FAILED: order A total 315 / change 185, got %', r;
  end if;
  select count(*) into v_lines from public.orders where order_id = v_order;
  if v_lines <> 3 then raise exception 'TEST FAILED: order A has 3 rows, got %', v_lines; end if;
  if (select sum(subtotal) from public.orders where order_id = v_order) <> 315
     or (select total from public.v_order_totals where order_id = v_order) <> 315 then
    raise exception 'TEST FAILED: order A subtotals add up to 315';
  end if;
  if not exists (select 1 from public.orders where order_id = v_order and product_id = 931
                    and customization = 'less ice' and special_instructions = 'extra hot'
                    and unit_price = 120 and subtotal = 240 and user_id = 32) then
    raise exception 'TEST FAILED: product row keeps customization, instructions, price and user';
  end if;
  if (select count(*) from public.orders where order_id = v_order and is_addon and product_id is null
        and unit_price = 25 and ingredient_id in (32, 33)) <> 2 then
    raise exception 'TEST FAILED: add-ons are separate rows at 25.00 linked to their ingredient';
  end if;
  if not exists (select 1 from public.payments where order_id = v_order and amount_paid = 500
                    and change_amount = 185 and payment_method = 'cash' and received_by = 32) then
    raise exception 'TEST FAILED: payment 500 / change 185 / cash / received_by barista';
  end if;
  -- Stock: beans 1000-36, milk 2000-360 in ONE movement (recipe + add-on share it), caramel 100-15, cups 5-2.
  if (select current_stock from public.ingredients where ingredient_id = 31) <> 964
     or (select current_stock from public.ingredients where ingredient_id = 32) <> 1640
     or (select current_stock from public.ingredients where ingredient_id = 33) <> 85
     or (select current_stock from public.ingredients where ingredient_id = 34) <> 3 then
    raise exception 'TEST FAILED: stock after order A is 964 / 1640 / 85 / 3';
  end if;
  if (select count(*) from public.stock_transactions where remarks = 'Order #' || v_order) <> 4
     or (select count(*) from public.stock_transactions where remarks = 'Order #' || v_order
           and ingredient_id = 32 and type = 'out' and quantity = 360 and remaining_stock = 1640 and user_id = 32) <> 1 then
    raise exception 'TEST FAILED: one stock-out per ingredient; milk 360 with remaining 1640';
  end if;

  -- Same sale sent again (offline retry): same order, nothing written twice.
  r := public.process_checkout_transaction(jsonb_build_object(
    'client_tx_id', '10000000-0000-0000-0000-00000000000a', 'order_type', 'dine-in',
    'payment_method', 'cash', 'amount_paid', 500,
    'items', jsonb_build_array(jsonb_build_object('product_id', 931, 'quantity', 2, 'unit_price', 120))));
  if not (r->>'duplicate')::boolean or (r->>'order_id')::integer <> v_order then
    raise exception 'TEST FAILED: retry returns the original order as duplicate';
  end if;
  if (select count(*) from public.orders where client_tx_id = '10000000-0000-0000-0000-00000000000a') <> 3
     or (select count(*) from public.payments where client_tx_id = '10000000-0000-0000-0000-00000000000a') <> 1
     or (select current_stock from public.ingredients where ingredient_id = 32) <> 1640 then
    raise exception 'TEST FAILED: retry wrote rows or moved stock';
  end if;
end $$;

-- Insufficient stock (4 lattes need 4 cups, 3 left): everything rolls back.
do $$ begin
  perform public.process_checkout_transaction(jsonb_build_object(
    'client_tx_id', '10000000-0000-0000-0000-00000000000b', 'order_type', 'take-out', 'amount_paid', 1000,
    'items', jsonb_build_array(jsonb_build_object('product_id', 931, 'quantity', 4, 'unit_price', 120))));
  raise exception 'TEST FAILED: order beyond stock accepted';
exception when others then
  if sqlerrm not like 'STOCK_CONFLICT%' then raise exception 'TEST FAILED: expected STOCK_CONFLICT, got %', sqlerrm; end if;
end $$;
do $$ begin
  if exists (select 1 from public.orders where client_tx_id = '10000000-0000-0000-0000-00000000000b')
     or exists (select 1 from public.payments where client_tx_id = '10000000-0000-0000-0000-00000000000b')
     or (select current_stock from public.ingredients where ingredient_id = 31) <> 964
     or (select current_stock from public.ingredients where ingredient_id = 34) <> 3 then
    raise exception 'TEST FAILED: failed checkout left rows or stock changes';
  end if;
end $$;

-- Large quantity: refused, nothing saved.
do $$ begin
  perform public.process_checkout_transaction(jsonb_build_object(
    'client_tx_id', '10000000-0000-0000-0000-00000000000c', 'order_type', 'dine-in', 'amount_paid', 99999999,
    'items', jsonb_build_array(jsonb_build_object('product_id', 931, 'quantity', 100000, 'unit_price', 120))));
  raise exception 'TEST FAILED: 100000 lattes accepted';
exception when others then
  if sqlerrm like 'TEST FAILED%' then raise; end if;
end $$;

-- Stale price, non-add-on ingredient sold as add-on, underpayment: each refused.
do $$ begin
  perform public.process_checkout_transaction(jsonb_build_object(
    'client_tx_id', '10000000-0000-0000-0000-00000000000d', 'order_type', 'dine-in', 'amount_paid', 500,
    'items', jsonb_build_array(jsonb_build_object('product_id', 931, 'quantity', 1, 'unit_price', 110))));
  raise exception 'TEST FAILED: stale price accepted';
exception when others then
  if sqlerrm not like 'PRICE_CONFLICT%' then raise exception 'TEST FAILED: expected PRICE_CONFLICT, got %', sqlerrm; end if;
end $$;
do $$ begin
  perform public.process_checkout_transaction(jsonb_build_object(
    'client_tx_id', '10000000-0000-0000-0000-00000000000e', 'order_type', 'dine-in', 'amount_paid', 500,
    'items', jsonb_build_array(jsonb_build_object('is_addon', true, 'ingredient_id', 31, 'quantity', 1, 'unit_price', 25))));
  raise exception 'TEST FAILED: regular ingredient sold as add-on';
exception when others then
  if sqlerrm not like 'CONFLICT%' then raise exception 'TEST FAILED: expected CONFLICT, got %', sqlerrm; end if;
end $$;
do $$ begin
  perform public.process_checkout_transaction(jsonb_build_object(
    'client_tx_id', '10000000-0000-0000-0000-00000000000f', 'order_type', 'dine-in', 'amount_paid', 100,
    'items', jsonb_build_array(jsonb_build_object('product_id', 931, 'quantity', 1, 'unit_price', 120))));
  raise exception 'TEST FAILED: underpayment accepted';
exception when others then
  if sqlerrm not like 'VALIDATION%' then raise exception 'TEST FAILED: expected VALIDATION, got %', sqlerrm; end if;
end $$;

-- Order C: product without a recipe deducts nothing. Order D: exact payment, change 0.
do $$
declare r jsonb;
begin
  r := public.process_checkout_transaction(jsonb_build_object(
    'client_tx_id', '10000000-0000-0000-0000-000000000010', 'order_type', 'take-out', 'amount_paid', 100,
    'items', jsonb_build_array(jsonb_build_object('product_id', 932, 'quantity', 1, 'unit_price', 80))));
  if (r->>'change_amount')::numeric <> 20
     or exists (select 1 from public.stock_transactions where remarks = 'Order #' || (r->>'order_id')) then
    raise exception 'TEST FAILED: order C change 20 and no stock movement';
  end if;
  r := public.process_checkout_transaction(jsonb_build_object(
    'client_tx_id', '10000000-0000-0000-0000-000000000011', 'order_type', 'pre-order', 'amount_paid', 120,
    'items', jsonb_build_array(jsonb_build_object('product_id', 931, 'quantity', 1, 'unit_price', 120))));
  if (r->>'change_amount')::numeric <> 0
     or (select current_stock from public.ingredients where ingredient_id = 34) <> 2 then
    raise exception 'TEST FAILED: order D change 0, cups 2';
  end if;
end $$;

-- Stock status: cups 2 <= reorder 2 is low-stock; a manual stock-out of all caramel makes it out-of-stock.
do $$ begin
  insert into public.stock_transactions (ingredient_id, user_id, type, quantity, remarks)
  values (33, 32, 'out', 85, 'Synthetic spoilage');
  if (select stock_status from public.v_inventory_status where ingredient_id = 34) <> 'low-stock'
     or (select stock_status from public.v_inventory_status where ingredient_id = 33) <> 'out-of-stock'
     or (select stock_status from public.v_inventory_status where ingredient_id = 31) <> 'available' then
    raise exception 'TEST FAILED: low-stock / out-of-stock / available';
  end if;
  if (select remaining_stock from public.stock_transactions where remarks = 'Synthetic spoilage') <> 0 then
    raise exception 'TEST FAILED: remaining_stock 0 after manual stock-out';
  end if;
end $$;

-- Over-deduction refused; a barista may not record stock-in.
do $$ begin
  insert into public.stock_transactions (ingredient_id, user_id, type, quantity) values (34, 32, 'out', 1000);
  raise exception 'TEST FAILED: stock-out beyond stock accepted';
exception when others then
  if sqlerrm not like 'STOCK_CONFLICT%' then raise exception 'TEST FAILED: expected STOCK_CONFLICT, got %', sqlerrm; end if;
end $$;
do $$ begin
  -- Barista stock-in is allowed (user-approved POS permission, 20261120000700/0800). The row is
  -- undone right away so the stock numbers checked below stay the same.
  begin
    insert into public.stock_transactions (ingredient_id, user_id, type, quantity) values (34, 32, 'in', 10);
    raise exception 'UNDO_TEST_ROW';
  exception when others then
    if sqlerrm <> 'UNDO_TEST_ROW' then
      raise exception 'TEST FAILED: barista stock-in refused: %', sqlerrm;
    end if;
  end;
end $$;

-- Add-on with zero stock left: refused as STOCK_CONFLICT.
do $$ begin
  perform public.process_checkout_transaction(jsonb_build_object(
    'client_tx_id', '10000000-0000-0000-0000-000000000012', 'order_type', 'dine-in', 'amount_paid', 200,
    'items', jsonb_build_array(
      jsonb_build_object('product_id', 932, 'quantity', 1, 'unit_price', 80),
      jsonb_build_object('is_addon', true, 'ingredient_id', 33, 'quantity', 1, 'unit_price', 25))));
  raise exception 'TEST FAILED: add-on with no stock accepted';
exception when others then
  if sqlerrm not like 'STOCK_CONFLICT%' then raise exception 'TEST FAILED: expected STOCK_CONFLICT, got %', sqlerrm; end if;
end $$;

-- Barista: no sales rows and no costing (Owner-only reports).
do $$ begin
  if exists (select 1 from public.v_sales) or exists (select 1 from public.product_costing) then
    raise exception 'TEST FAILED: barista reads sales or costing';
  end if;
end $$;

-- Cash only (migration 20261120000500): a direct call with another method is refused and leaves
-- nothing behind; the same sale paid in cash then goes through.
do $$ begin
  perform public.process_checkout_transaction(jsonb_build_object(
    'client_tx_id', '10000000-0000-0000-0000-000000000013', 'order_type', 'dine-in',
    'payment_method', 'gcash', 'amount_paid', 80,
    'items', jsonb_build_array(jsonb_build_object('product_id', 932, 'quantity', 1, 'unit_price', 80))));
  raise exception 'TEST FAILED: non-cash payment accepted';
exception when check_violation then null;
end $$;
do $$
declare r jsonb;
begin
  if exists (select 1 from public.orders where client_tx_id = '10000000-0000-0000-0000-000000000013')
     or exists (select 1 from public.payments where client_tx_id = '10000000-0000-0000-0000-000000000013') then
    raise exception 'TEST FAILED: refused non-cash checkout left rows';
  end if;
  r := public.process_checkout_transaction(jsonb_build_object(
    'client_tx_id', '10000000-0000-0000-0000-000000000013', 'order_type', 'dine-in',
    'payment_method', 'cash', 'amount_paid', 80,
    'items', jsonb_build_array(jsonb_build_object('product_id', 932, 'quantity', 1, 'unit_price', 80))));
  if (r->>'duplicate')::boolean
     or not exists (select 1 from public.payments where order_id = (r->>'order_id')::integer and payment_method = 'cash') then
    raise exception 'TEST FAILED: cash checkout after a refused non-cash attempt';
  end if;
end $$;

-- Direct insert into payments is not granted to signed-in users at all.
do $$ begin
  insert into public.payments (order_id, client_tx_id, amount_paid, payment_method)
  values (1, gen_random_uuid(), 1, 'gcash');
  raise exception 'TEST FAILED: barista inserted a payment directly';
exception when insufficient_privilege then null;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Owner: status flow, history kept after price and cost changes, reports
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', :owner, 'session_id', :owner)::text, false);
set role authenticated;

do $$
declare
  a integer := (select order_id from public.payments where client_tx_id = '10000000-0000-0000-0000-00000000000a');
  c integer := (select order_id from public.payments where client_tx_id = '10000000-0000-0000-0000-000000000010');
  today date := (now() at time zone 'Asia/Manila')::date;
  -- Other test files may have completed orders today; compare against this baseline.
  b_total numeric := coalesce((select total_sales from public.v_daily_sales where sale_date = today), 0);
  b_orders bigint := coalesce((select order_count from public.v_daily_sales where sale_date = today), 0);
  b_items bigint := coalesce((select items_sold from public.v_daily_sales where sale_date = today), 0);
  b_month numeric := coalesce((select total_sales from public.v_monthly_sales where sale_month = date_trunc('month', today)::date), 0);
begin
  update public.orders set status = 'preparing' where order_id = a;
  update public.orders set status = 'completed' where order_id = a;
  update public.orders set status = 'cancelled' where order_id = c;

  -- Later price and cost changes never touch saved orders.
  update public.products set price = 130.00 where product_id = 931;
  update public.ingredients set unit_cost = 1.50 where ingredient_id = 31;
  if (select unit_price from public.orders where order_id = a and product_id = 931) <> 120
     or (select subtotal from public.orders where order_id = a and product_id = 931) <> 240 then
    raise exception 'TEST FAILED: saved order keeps price 120 / subtotal 240';
  end if;
  -- 18 x 1.50 + 12.00 + 3.00 = 42.00; + 5.00 packaging = 47.00
  if (select ingredient_cost from public.product_costing where product_id = 931) <> 42.00
     or (select total_cost from public.product_costing where product_id = 931) <> 47.00 then
    raise exception 'TEST FAILED: costing recomputed to 42.00 / 47.00';
  end if;

  -- Reports: only completed order A counts. items_sold counts add-on selections too (2 + 2 + 1).
  if (select total_sales from public.v_daily_sales where sale_date = today) - b_total <> 315
     or (select order_count from public.v_daily_sales where sale_date = today) - b_orders <> 1
     or (select items_sold from public.v_daily_sales where sale_date = today) - b_items <> 5 then
    raise exception 'TEST FAILED: daily sales +315 / +1 order / +5 items, got %',
      (select row_to_json(d) from public.v_daily_sales d where sale_date = today);
  end if;
  if (select total_sales from public.v_monthly_sales where sale_month = date_trunc('month', today)::date) - b_month <> 315 then
    raise exception 'TEST FAILED: monthly sales 315';
  end if;
  if (select units_sold from public.v_best_sellers where product_id = 931) <> 2
     or (select revenue from public.v_best_sellers where product_id = 931) <> 240
     or exists (select 1 from public.v_best_sellers where product_id = 932) then
    raise exception 'TEST FAILED: best sellers: latte 2 units / 240, add-ons and cancelled orders left out';
  end if;
end $$;

-- Completed is final.
do $$ begin
  update public.orders set status = 'pending'
   where order_id = (select order_id from public.payments where client_tx_id = '10000000-0000-0000-0000-00000000000a');
  raise exception 'TEST FAILED: completed order reopened';
exception when others then
  if sqlerrm not like 'INVALID_TRANSITION%' then raise exception 'TEST FAILED: expected INVALID_TRANSITION, got %', sqlerrm; end if;
end $$;

-- FR-51: the Owner marks a product unavailable; checkout then refuses it.
update public.products set is_available = false where product_id = 932;
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :barista, 'aal', 'aal1')::text, false);
set role authenticated;
do $$ begin
  perform public.process_checkout_transaction(jsonb_build_object(
    'client_tx_id', '10000000-0000-0000-0000-000000000014', 'order_type', 'dine-in', 'amount_paid', 100,
    'items', jsonb_build_array(jsonb_build_object('product_id', 932, 'quantity', 1, 'unit_price', 80))));
  raise exception 'TEST FAILED: unavailable product sold';
exception when others then
  if sqlerrm not like 'CONFLICT%' then raise exception 'TEST FAILED: expected CONFLICT, got %', sqlerrm; end if;
end $$;
reset role;

\echo 'validation_calculations: all checks passed'
