-- Owner MFA, stock roles and product image storage rules (migrations 20261120000000, 20261120000100).
-- Runs on a migrated database, alone or after phase2_core.test.sql (its fixture uses other ids).
-- Each check raises 'TEST FAILED: ...' on a wrong result; run with psql -v ON_ERROR_STOP=1.

\set owner   '''00000000-0000-0000-0000-0000000000a2'''
\set barista '''00000000-0000-0000-0000-0000000000b2'''

insert into auth.users (id, email) values
  (:owner, 'owner2@example.com'), (:barista, 'cora@staff.gunitakopi.local');
insert into public.users (user_id, auth_user_id, username, full_name, role, email) overriding system value values
  (11, :owner, 'owner2', 'Owner Two', 'owner_admin', 'owner2@example.com'),
  (12, :barista, 'cora', 'Cora Barista', 'barista', null);
insert into public.ingredients (ingredient_id, ingredient_name, unit, current_stock, reorder_level, unit_cost)
  overriding system value values (11, 'Cocoa', 'g', 100, 10, 0.20);
insert into public.products (product_id, product_name, category, price, created_by) overriding system value values
  (911, 'Cocoa Drink', 'Non-coffee', 90.00, 11);
insert into public.product_ingredients (product_id, ingredient_id, quantity_needed) values (911, 11, 20);

-- ---------------------------------------------------------------------------
-- Owner before the second sign-in step (aal1): no data access, no writes.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', :owner, 'aal', 'aal1')::text, false);
set role authenticated;

do $$ begin
  if public.app_role() is not null or public.app_user_id() is not null then
    raise exception 'TEST FAILED: aal1 Owner has a role';
  end if;
  if exists (select 1 from public.products) or exists (select 1 from public.ingredients) then
    raise exception 'TEST FAILED: aal1 Owner reads the catalog';
  end if;
  -- Own profile stays readable so the API can answer MFA_REQUIRED instead of "no profile".
  if (select role from public.users where auth_user_id = auth.uid()) is distinct from 'owner_admin' then
    raise exception 'TEST FAILED: aal1 Owner cannot read own profile';
  end if;
end $$;

do $$ begin
  insert into public.stock_transactions (ingredient_id, user_id, type, quantity) values (11, 11, 'in', 5);
  raise exception 'TEST FAILED: aal1 Owner recorded stock in';
exception when insufficient_privilege then null;
end $$;

do $$ begin
  perform public.process_checkout_transaction('{
    "client_tx_id": "55555555-5555-4555-8555-555555555555", "order_type": "dine-in",
    "amount_paid": 100, "items": [{"product_id": 911, "quantity": 1, "unit_price": 90}]}');
  raise exception 'TEST FAILED: aal1 Owner checked out';
exception when insufficient_privilege then null;
end $$;

do $$ begin
  insert into storage.objects (bucket_id, name) values ('product-images', '11/x.png');
  raise exception 'TEST FAILED: aal1 Owner uploaded an image';
exception when insufficient_privilege then null;
end $$;

reset role;

-- Missing aal claim counts as aal1.
select set_config('request.jwt.claims', json_build_object('sub', :owner)::text, false);
set role authenticated;
do $$ begin
  if public.app_role() is not null then
    raise exception 'TEST FAILED: Owner without aal claim has a role';
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Owner after MFA (aal2): stock-in allowed, manual stock-out denied, images managed.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', :owner, 'aal', 'aal2')::text, false);
set role authenticated;

do $$
declare v_remaining numeric;
begin
  if public.app_role() is distinct from 'owner_admin' then
    raise exception 'TEST FAILED: aal2 Owner role';
  end if;
  insert into public.stock_transactions (ingredient_id, user_id, type, quantity, remarks)
  values (11, 11, 'in', 50, 'delivery') returning remaining_stock into v_remaining;
  if v_remaining <> 150 then
    raise exception 'TEST FAILED: Owner stock in updates stock';
  end if;
end $$;

do $$ begin
  insert into public.stock_transactions (ingredient_id, user_id, type, quantity) values (11, 11, 'out', 5);
  raise exception 'TEST FAILED: Owner recorded manual stock out';
exception when insufficient_privilege then null;
end $$;

-- Stock-in under another user's id is refused.
do $$ begin
  insert into public.stock_transactions (ingredient_id, user_id, type, quantity) values (11, 12, 'in', 5);
  raise exception 'TEST FAILED: Owner recorded stock under another user';
exception when insufficient_privilege then null;
end $$;

do $$ begin
  insert into storage.objects (bucket_id, name) values ('product-images', '11/a.png');
  update storage.objects set name = '11/b.png' where bucket_id = 'product-images' and name = '11/a.png';
  if not exists (select 1 from storage.objects where name = '11/b.png') then
    raise exception 'TEST FAILED: Owner manages images';
  end if;
end $$;

do $$ begin
  insert into storage.objects (bucket_id, name) values ('other-bucket', '11/a.png');
  raise exception 'TEST FAILED: Owner wrote outside the product-images bucket';
exception when insufficient_privilege then null;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Barista: stock-out allowed, stock-in denied, checkout still deducts stock, images read-only.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', :barista, 'aal', 'aal1')::text, false);
set role authenticated;

do $$ begin
  insert into public.stock_transactions (ingredient_id, user_id, type, quantity) values (11, 12, 'in', 5);
  raise exception 'TEST FAILED: barista recorded stock in';
exception when insufficient_privilege then null;
end $$;

do $$ begin
  insert into public.stock_transactions (ingredient_id, user_id, type, quantity, remarks)
  values (11, 12, 'out', 10, 'spilled');
  if (select current_stock from public.ingredients where ingredient_id = 11) <> 140 then
    raise exception 'TEST FAILED: barista stock out';
  end if;
end $$;

-- Automatic deduction through checkout: 2 drinks * 20 g = 40 g.
do $$
declare v_res jsonb;
begin
  v_res := public.process_checkout_transaction('{
    "client_tx_id": "66666666-6666-4666-8666-666666666666", "order_type": "take-out",
    "amount_paid": 200, "items": [{"product_id": 911, "quantity": 2, "unit_price": 90}]}');
  if (select current_stock from public.ingredients where ingredient_id = 11) <> 100 then
    raise exception 'TEST FAILED: checkout deduction %', v_res;
  end if;
  if not exists (select 1 from public.stock_transactions
                  where ingredient_id = 11 and type = 'out' and remarks = 'Order #' || (v_res->>'order_id')) then
    raise exception 'TEST FAILED: checkout stock history';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from storage.objects where bucket_id = 'product-images' and name = '11/b.png') then
    raise exception 'TEST FAILED: barista cannot read product images';
  end if;
  insert into storage.objects (bucket_id, name) values ('product-images', '11/c.png');
  raise exception 'TEST FAILED: barista uploaded an image';
exception when insufficient_privilege then null;
end $$;

do $$ begin
  delete from storage.objects where bucket_id = 'product-images';
  if not exists (select 1 from storage.objects where name = '11/b.png') then
    raise exception 'TEST FAILED: barista deleted an image';
  end if;
end $$;

reset role;

do $$ begin
  if (select public from storage.buckets where id = 'product-images') then
    raise exception 'TEST FAILED: product-images bucket is public';
  end if;
end $$;

\echo 'roles_mfa_storage: all checks passed'
