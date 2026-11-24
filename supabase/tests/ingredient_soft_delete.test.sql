-- Ingredient soft delete (20261120001300), checked on a migrated database.
-- Each check raises 'TEST FAILED: ...' on a wrong result; run with psql -v ON_ERROR_STOP=1.

\set owner   '''00000000-0000-0000-0000-0000000000c5'''
\set barista '''00000000-0000-0000-0000-0000000000d5'''

-- One Owner per database (users_single_owner): retire an Owner left by an earlier test file.
update public.users set role = 'barista', email = null where role = 'owner_admin';

insert into auth.users (id, email) values
  (:owner, 'softdelete-owner@example.com'), (:barista, 'sdbarista@staff.gunitakopi.local');
insert into public.users (user_id, auth_user_id, username, full_name, role, email) overriding system value values
  (51, :owner, 'sdowner', 'Soft Delete Owner', 'owner_admin', 'softdelete-owner@example.com'),
  (52, :barista, 'sdbarista', 'Soft Delete Barista', 'barista', null);
insert into public.owner_login_challenges (token_hash, auth_user_id, session_id, verified_at)
  values ('test-' || :owner, :owner, :owner, now());
insert into public.ingredients (ingredient_id, ingredient_name, unit, current_stock, reorder_level, unit_cost,
                                is_addon, addon_selling_price, addon_quantity)
  overriding system value values
  (41, 'Old Beans', 'g',  500, 50, 1.00, false, null, null),
  (42, 'Milk',      'ml', 900, 50, 0.10, false, null, null),
  (43, 'Old Syrup', 'ml', 300, 10, 0.20, true, 25.00, 20);
insert into public.products (product_id, product_name, category, price, created_by) overriding system value values
  (941, 'Delete Test Latte', 'Coffee', 120.00, 51),
  (942, 'Delete Test Mocha', 'Coffee', 130.00, 51);

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

-- Owner sets two recipes that use Old Beans, and records a stock-in for it.
select set_config('request.jwt.claims', json_build_object('sub', :owner, 'session_id', :owner)::text, false);
set role authenticated;
select public.set_product_recipe(941, '[{"ingredient_id":41,"quantity_needed":10},{"ingredient_id":42,"quantity_needed":100}]');
select public.set_product_recipe(942, '[{"ingredient_id":41,"quantity_needed":5}]');
insert into public.stock_transactions (ingredient_id, user_id, type, quantity, remarks)
  values (41, 51, 'in', 10, 'Delivery');
reset role;

-- A Barista may not delete.
select set_config('request.jwt.claims', json_build_object('sub', :barista)::text, false);
set role authenticated;
do $$
begin
  perform public.delete_ingredient(41);
  raise exception 'TEST FAILED: barista deleted an ingredient';
exception when insufficient_privilege then null;
end $$;
reset role;

-- The Owner deletes Old Beans and the Old Syrup add-on.
select set_config('request.jwt.claims', json_build_object('sub', :owner, 'session_id', :owner)::text, false);
set role authenticated;
do $$
declare v_names text;
begin
  select string_agg(product_name, ',' order by product_id) into v_names from public.delete_ingredient(41);
  if v_names is distinct from 'Delete Test Latte,Delete Test Mocha' then
    raise exception 'TEST FAILED: affected products %', v_names;
  end if;
  perform public.delete_ingredient(43);

  -- Hidden from the inventory view (every list reads it); the row and its history stay.
  if exists (select 1 from public.v_inventory_status where ingredient_id in (41, 43)) then
    raise exception 'TEST FAILED: deleted ingredient still listed';
  end if;
  if (select deleted_at from public.ingredients where ingredient_id = 41) is null then
    raise exception 'TEST FAILED: deleted_at not set';
  end if;
  if not exists (select 1 from public.stock_transactions where ingredient_id = 41 and remarks = 'Delivery') then
    raise exception 'TEST FAILED: stock history lost';
  end if;

  -- Taken out of both recipes; the Latte keeps its Milk and is recosted (100 * 0.10 = 10.00).
  if exists (select 1 from public.product_ingredients where ingredient_id = 41) then
    raise exception 'TEST FAILED: recipe rows kept';
  end if;
  if (select ingredient_cost from public.product_costing where product_id = 941) <> 10.00
     or (select ingredient_cost from public.product_costing where product_id = 942) <> 0 then
    raise exception 'TEST FAILED: products not recosted';
  end if;

  -- The add-on is switched off, so it can no longer be sold.
  if (select is_addon or addon_selling_price is not null or addon_quantity is not null
        from public.ingredients where ingredient_id = 43) then
    raise exception 'TEST FAILED: add-on settings kept';
  end if;

  -- Deleting twice, or an unknown id, is NOT_FOUND.
  begin
    perform public.delete_ingredient(41);
    raise exception 'TEST FAILED: deleted twice';
  exception when others then
    if sqlerrm not like 'NOT_FOUND%' then raise; end if;
  end;
  begin
    perform public.delete_ingredient(999999);
    raise exception 'TEST FAILED: unknown id deleted';
  exception when others then
    if sqlerrm not like 'NOT_FOUND%' then raise; end if;
  end;

  -- A stale recipe screen cannot put it back.
  begin
    perform public.set_product_recipe(942, '[{"ingredient_id":41,"quantity_needed":5}]');
    raise exception 'TEST FAILED: deleted ingredient added to a recipe';
  exception when others then
    -- 20261120001400 names the ingredient so the Owner knows which line to remove.
    if sqlerrm not like 'VALIDATION: Old Beans was deleted%' then raise; end if;
  end;
end $$;
reset role;

-- An order queued offline before the delete, with the deleted add-on, is a conflict, not a sale.
select set_config('request.jwt.claims', json_build_object('sub', :barista)::text, false);
set role authenticated;
do $$
begin
  perform public.process_checkout_transaction('{
    "client_tx_id": "d5d5d5d5-d5d5-4d5d-8d5d-d5d5d5d5d5d5", "order_type": "dine-in",
    "amount_paid": 200,
    "items": [
      {"product_id": 941, "quantity": 1, "unit_price": 120},
      {"is_addon": true, "ingredient_id": 43, "quantity": 1, "unit_price": 25}
    ]}');
  raise exception 'TEST FAILED: sold a deleted add-on';
exception when others then
  if sqlerrm not like 'CONFLICT%' then raise; end if;
end $$;
reset role;

-- Product soft delete (20261120001400): the Owner hides a product and makes it unavailable; an
-- order queued offline with it is a conflict, and its past orders stay.
select set_config('request.jwt.claims', json_build_object('sub', :owner, 'session_id', :owner)::text, false);
set role authenticated;
update public.products set deleted_at = now(), is_available = false where product_id = 942;
do $$
begin
  if (select deleted_at from public.products where product_id = 942) is null then
    raise exception 'TEST FAILED: product not soft deleted';
  end if;
end $$;
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :barista)::text, false);
set role authenticated;
do $$
begin
  perform public.process_checkout_transaction('{
    "client_tx_id": "d5d5d5d5-d5d5-4d5d-8d5d-d5d5d5d5d5d6", "order_type": "take-out",
    "amount_paid": 200, "items": [{"product_id": 942, "quantity": 1, "unit_price": 130}]}');
  raise exception 'TEST FAILED: sold a deleted product';
exception when others then
  if sqlerrm not like 'CONFLICT%' then raise; end if;
end $$;
reset role;

\echo 'ingredient_soft_delete: all checks passed'
