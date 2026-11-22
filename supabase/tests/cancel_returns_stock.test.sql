-- Cancelled orders give their ingredients back (20261120001200), checked on a migrated database.
-- Each check raises 'TEST FAILED: ...' on a wrong result; run with psql -v ON_ERROR_STOP=1.

\set owner   '''00000000-0000-0000-0000-0000000000a2'''
\set barista '''00000000-0000-0000-0000-0000000000b2'''

insert into auth.users (id, email) values
  (:owner, 'owner2@example.com'), (:barista, 'cara@staff.gunitakopi.local');
insert into public.users (user_id, auth_user_id, username, full_name, role, email) overriding system value values
  (11, :owner, 'owner2', 'Owner Two', 'owner_admin', 'owner2@example.com'),
  (12, :barista, 'cara', 'Cara Barista', 'barista', null);
insert into public.owner_login_challenges (token_hash, auth_user_id, session_id, verified_at)
  values ('test-' || :owner, :owner, :owner, now());
insert into public.ingredients (ingredient_id, ingredient_name, unit, current_stock, reorder_level, unit_cost,
                                is_addon, addon_selling_price, addon_quantity)
  overriding system value values
  (21, 'Beans', 'g',  500, 50, 0.50, false, null, null),
  (22, 'Syrup', 'ml', 100, 10, 0.20, true, 25.00, 20);
insert into public.products (product_id, product_name, category, price, created_by) overriding system value values
  (921, 'Test Latte', 'Coffee', 100.00, 11);

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
select public.set_product_recipe(921, '[{"ingredient_id":21,"quantity_needed":18}]');
reset role;

-- Barista sells 2 lattes with a syrup add-on each, then cancels the order.
select set_config('request.jwt.claims', json_build_object('sub', :barista)::text, false);
set role authenticated;

do $$
declare v_order int; v_tx int := (select count(*) from public.stock_transactions);
begin
  v_order := (public.process_checkout_transaction('{
    "client_tx_id": "55555555-5555-4555-8555-555555555555", "order_type": "dine-in",
    "amount_paid": 300,
    "items": [
      {"product_id": 921, "quantity": 2, "unit_price": 100},
      {"is_addon": true, "ingredient_id": 22, "quantity": 2, "unit_price": 25}
    ]}')->>'order_id')::int;
  -- 500 - 2*18 = 464 beans, 100 - 2*20 = 60 syrup.
  if (select current_stock from public.ingredients where ingredient_id = 21) <> 464
     or (select current_stock from public.ingredients where ingredient_id = 22) <> 60 then
    raise exception 'TEST FAILED: checkout deduction';
  end if;

  update public.orders set status = 'cancelled' where order_id = v_order;

  if (select current_stock from public.ingredients where ingredient_id = 21) <> 500
     or (select current_stock from public.ingredients where ingredient_id = 22) <> 100 then
    raise exception 'TEST FAILED: cancelled order did not return its stock';
  end if;
  -- One stock-in per ingredient (not per order row), by the cancelling user, with the order number.
  if (select count(*) from public.stock_transactions
       where type = 'in' and remarks = 'Cancelled order #' || v_order) <> 2
     or exists (select 1 from public.stock_transactions
                 where remarks = 'Cancelled order #' || v_order and user_id <> 12) then
    raise exception 'TEST FAILED: return movements';
  end if;

  -- Cancelled is final: touching the order again returns nothing more.
  update public.orders set status = 'cancelled' where order_id = v_order;
  if (select count(*) from public.stock_transactions) <> v_tx + 2 + 2 then
    raise exception 'TEST FAILED: stock returned twice';
  end if;
end $$;

-- A completed order is never returned.
do $$
declare v_order int;
begin
  v_order := (public.process_checkout_transaction('{
    "client_tx_id": "66666666-6666-4666-8666-666666666666", "order_type": "take-out",
    "amount_paid": 100, "items": [{"product_id": 921, "quantity": 1, "unit_price": 100}]}')->>'order_id')::int;
  update public.orders set status = 'preparing' where order_id = v_order;
  update public.orders set status = 'completed' where order_id = v_order;
  if (select current_stock from public.ingredients where ingredient_id = 21) <> 482 then
    raise exception 'TEST FAILED: completed order changed stock';
  end if;
end $$;

reset role;

\echo 'cancel_returns_stock: all checks passed'
