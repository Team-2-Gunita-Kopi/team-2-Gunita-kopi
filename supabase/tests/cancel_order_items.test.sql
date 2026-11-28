-- Cancel single items of an order (20261120001600), checked on a migrated database.
-- Each check raises 'TEST FAILED: ...' on a wrong result; run with psql -v ON_ERROR_STOP=1.

\set owner   '''00000000-0000-0000-0000-0000000000a3'''
\set barista '''00000000-0000-0000-0000-0000000000b3'''

insert into auth.users (id, email) values
  (:owner, 'owner3@example.com'), (:barista, 'dina@staff.gunitakopi.local');
insert into public.users (user_id, auth_user_id, username, full_name, role, email) overriding system value values
  (13, :owner, 'owner3', 'Owner Three', 'owner_admin', 'owner3@example.com'),
  (14, :barista, 'dina', 'Dina Barista', 'barista', null);
insert into public.owner_login_challenges (token_hash, auth_user_id, session_id, verified_at)
  values ('test-' || :owner, :owner, :owner, now());
insert into public.ingredients (ingredient_id, ingredient_name, unit, current_stock, reorder_level, unit_cost,
                                is_addon, addon_selling_price, addon_quantity)
  overriding system value values
  (31, 'Beans', 'g',  500, 50, 0.50, false, null, null),
  (32, 'Syrup', 'ml', 100, 10, 0.20, true, 25.00, 20),
  (33, 'Flour', 'g',  200, 20, 0.10, false, null, null);
insert into public.products (product_id, product_name, category, price, created_by) overriding system value values
  (931, 'Test Latte', 'Coffee', 100.00, 13),
  (932, 'Test Cookie', 'Pastry', 60.00, 13);

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
select public.set_product_recipe(931, '[{"ingredient_id":31,"quantity_needed":18}]');
select public.set_product_recipe(932, '[{"ingredient_id":33,"quantity_needed":10}]');
reset role;

create function pg_temp.stock(p_id int) returns numeric language sql
  as $$ select current_stock from public.ingredients where ingredient_id = p_id $$;
-- Runs p_sql and fails the test unless it raises an error starting with p_prefix.
create function pg_temp.expect_error(p_sql text, p_prefix text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm not like p_prefix || '%' then
      raise exception 'TEST FAILED: expected % from %, got %', p_prefix, p_sql, sqlerrm;
    end if;
    return;
  end;
  raise exception 'TEST FAILED: expected % from %, got no error', p_prefix, p_sql;
end $$;

select set_config('request.jwt.claims', json_build_object('sub', :barista)::text, false);
set role authenticated;

do $$
declare
  v_order int; v_latte int; v_syrup int; v_cookie int; v_other int;
begin
  -- 3 lattes with a syrup each, 1 cookie: total 435, paid 500.
  v_order := (public.process_checkout_transaction('{
    "client_tx_id": "77777777-7777-4777-8777-777777777777", "order_type": "dine-in", "amount_paid": 500,
    "items": [
      {"product_id": 931, "quantity": 3, "unit_price": 100},
      {"is_addon": true, "ingredient_id": 32, "quantity": 3, "unit_price": 25},
      {"product_id": 932, "quantity": 1, "unit_price": 60}
    ]}')->>'order_id')::int;
  select order_line_id into v_latte  from public.orders where order_id = v_order and product_id = 931;
  select order_line_id into v_syrup  from public.orders where order_id = v_order and is_addon;
  select order_line_id into v_cookie from public.orders where order_id = v_order and product_id = 932;
  -- beans 500 - 54 = 446, syrup 100 - 60 = 40, flour 200 - 10 = 190.
  if pg_temp.stock(31) <> 446 or pg_temp.stock(32) <> 40 or pg_temp.stock(33) <> 190 then
    raise exception 'TEST FAILED: checkout deduction';
  end if;

  -- Customer cancels 1 of the 3 lattes: its syrup goes with it.
  perform public.cancel_order_items(v_order, jsonb_build_array(jsonb_build_object('line_id', v_latte, 'quantity', 1)));
  if (select quantity || '/' || subtotal from public.orders where order_line_id = v_latte) <> '2/200.00'
     or (select quantity || '/' || subtotal from public.orders where order_line_id = v_syrup) <> '2/50.00' then
    raise exception 'TEST FAILED: active lines not reduced';
  end if;
  if (select string_agg(coalesce(product_id::text, '') || ':' || quantity || ':' || subtotal || ':' || status, ',' order by order_line_id)
        from public.orders where order_id = v_order and order_line_id > v_cookie)
     <> '931:1:100.00:cancelled,:1:25.00:cancelled' then
    raise exception 'TEST FAILED: cancelled copies (product first, then add-on)';
  end if;
  if pg_temp.stock(31) <> 464 or pg_temp.stock(32) <> 60 or pg_temp.stock(33) <> 190 then
    raise exception 'TEST FAILED: item stock return % % %', pg_temp.stock(31), pg_temp.stock(32), pg_temp.stock(33);
  end if;
  if (select count(*) from public.stock_transactions
       where type = 'in' and remarks = 'Cancelled item, order #' || v_order and user_id = 14) <> 2 then
    raise exception 'TEST FAILED: item return movements';
  end if;
  if (select amount_paid || '/' || change_amount from public.payments where order_id = v_order) <> '500.00/65.00' then
    raise exception 'TEST FAILED: payment must not change (refund is by hand)';
  end if;
  if (select status || '/' || item_count || '/' || total from public.v_order_totals where order_id = v_order)
     <> 'pending/3/310.00' then
    raise exception 'TEST FAILED: order totals after item cancel';
  end if;

  -- Bad requests change nothing.
  perform pg_temp.expect_error(format('select public.cancel_order_items(%s, ''[]'')', v_order), 'VALIDATION');
  perform pg_temp.expect_error(format('select public.cancel_order_items(%s, ''[{"line_id":%s,"quantity":1},{"line_id":%s,"quantity":1}]'')', v_order, v_latte, v_latte), 'VALIDATION');
  perform pg_temp.expect_error(format('select public.cancel_order_items(%s, ''[{"line_id":%s,"quantity":0}]'')', v_order, v_latte), 'VALIDATION');
  perform pg_temp.expect_error(format('select public.cancel_order_items(%s, ''[{"line_id":%s,"quantity":3}]'')', v_order, v_latte), 'VALIDATION');
  perform pg_temp.expect_error(format('select public.cancel_order_items(%s, ''[{"line_id":%s,"quantity":1}]'')', v_order, v_syrup), 'CONFLICT');
  perform pg_temp.expect_error(format('select public.cancel_order_items(%s, ''[{"line_id":1,"quantity":1}]'')', 999999), 'NOT_FOUND');
  v_other := (public.process_checkout_transaction('{
    "client_tx_id": "88888888-8888-4888-8888-888888888888", "order_type": "take-out", "amount_paid": 120,
    "items": [{"product_id": 932, "quantity": 2, "unit_price": 60}]}')->>'order_id')::int;
  perform pg_temp.expect_error(format('select public.cancel_order_items(%s, ''[{"line_id":%s,"quantity":1}]'')', v_other, v_latte), 'CONFLICT');
  if pg_temp.stock(31) <> 464 or pg_temp.stock(32) <> 60 then
    raise exception 'TEST FAILED: a refused cancel changed stock';
  end if;

  -- Moving the order on touches only the active items.
  update public.orders set status = 'preparing' where order_id = v_order and status <> 'cancelled';
  if (select status from public.v_order_totals where order_id = v_order) <> 'preparing' then
    raise exception 'TEST FAILED: status after advancing';
  end if;

  -- A second latte is cancelled while preparing.
  perform public.cancel_order_items(v_order, jsonb_build_array(jsonb_build_object('line_id', v_latte, 'quantity', 1)));
  if pg_temp.stock(31) <> 482 or pg_temp.stock(32) <> 80 then
    raise exception 'TEST FAILED: second item return';
  end if;

  -- The last latte and the cookie: nothing is left, so the order is cancelled and every gram is back.
  perform public.cancel_order_items(v_order, jsonb_build_array(
    jsonb_build_object('line_id', v_latte, 'quantity', 1), jsonb_build_object('line_id', v_cookie, 'quantity', 1)));
  if exists (select 1 from public.orders where order_id = v_order and status <> 'cancelled') then
    raise exception 'TEST FAILED: order not fully cancelled';
  end if;
  if pg_temp.stock(31) <> 500 or pg_temp.stock(32) <> 100 or pg_temp.stock(33) <> 180 then
    raise exception 'TEST FAILED: full return % % %', pg_temp.stock(31), pg_temp.stock(32), pg_temp.stock(33);
  end if;
  if (select status || '/' || item_count || '/' || total from public.v_order_totals where order_id = v_order)
     <> 'cancelled/0/0' then
    raise exception 'TEST FAILED: totals of a fully cancelled order';
  end if;
  perform pg_temp.expect_error(format('select public.cancel_order_items(%s, ''[{"line_id":%s,"quantity":1}]'')', v_order, v_cookie), 'INVALID_TRANSITION');

  -- A completed order cannot have items cancelled.
  update public.orders set status = 'preparing' where order_id = v_other;
  update public.orders set status = 'completed' where order_id = v_other;
  perform pg_temp.expect_error(format('select public.cancel_order_items(%s, ''[{"line_id":%s,"quantity":1}]'')',
    v_other, (select order_line_id from public.orders where order_id = v_other)), 'INVALID_TRANSITION');
end $$;

reset role;

-- The recipe grows after the sale: an item cancel never returns more than the order took out.
select set_config('request.jwt.claims', json_build_object('sub', :barista)::text, false);
set role authenticated;
select public.process_checkout_transaction('{
  "client_tx_id": "99999999-9999-4999-8999-999999999999", "order_type": "dine-in", "amount_paid": 200,
  "items": [{"product_id": 931, "quantity": 2, "unit_price": 100}]}');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :owner, 'session_id', :owner)::text, false);
set role authenticated;
select public.set_product_recipe(931, '[{"ingredient_id":31,"quantity_needed":30}]');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :barista)::text, false);
set role authenticated;

do $$
declare v_order int := (select max(order_id) from public.orders); v_line int;
begin
  select order_line_id into v_line from public.orders where order_id = v_order;
  -- Took 36 g. Cancel 1 at the new recipe (30 g), then the last one gets only the 6 g left.
  perform public.cancel_order_items(v_order, jsonb_build_array(jsonb_build_object('line_id', v_line, 'quantity', 1)));
  perform public.cancel_order_items(v_order, jsonb_build_array(jsonb_build_object('line_id', v_line, 'quantity', 1)));
  if (select string_agg(quantity::text, ',' order by stock_trans_id) from public.stock_transactions
       where type = 'in' and remarks like 'Cancelled % #' || v_order) <> '30.00,6.00' then
    raise exception 'TEST FAILED: capped returns %', (select string_agg(quantity::text, ',' order by stock_trans_id)
      from public.stock_transactions where type = 'in' and remarks like 'Cancelled % #' || v_order);
  end if;
  if pg_temp.stock(31) <> 500 then
    raise exception 'TEST FAILED: capped order stock %', pg_temp.stock(31);
  end if;
end $$;

reset role;

\echo 'cancel_order_items: all checks passed'
