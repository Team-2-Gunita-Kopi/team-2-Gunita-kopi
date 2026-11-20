-- Owner sign-in approval (20261120001100, replacing the MFA rule of 20261120000000), stock roles, product image storage, and restricted Barista ingredient creation
-- (migrations 20261120000000, 20261120000100, 20261120000600-20261120001000).
-- Runs on a migrated database, alone or after phase2_core.test.sql (its fixture uses other ids).
-- Each check raises 'TEST FAILED: ...' on a wrong result; run with psql -v ON_ERROR_STOP=1.

\set owner   '''00000000-0000-0000-0000-0000000000a2'''
\set barista '''00000000-0000-0000-0000-0000000000b2'''

-- One Owner per database (users_single_owner): retire an Owner left by an earlier test file.
update public.users set role = 'barista', email = null where role = 'owner_admin';
insert into auth.users (id, email) values
  (:owner, 'owner2@example.com'), (:barista, 'cora@staff.gunitakopi.local');
insert into public.users (user_id, auth_user_id, username, full_name, role, email) overriding system value values
  (11, :owner, 'owner2', 'Owner Two', 'owner_admin', 'owner2@example.com'),
  (12, :barista, 'cora', 'Cora Barista', 'barista', null);

-- The Owner signed in with password + emailed code: apps/api approved this session (20261120001100).
-- The test uses the Owner's id as the session id.
insert into public.owner_login_challenges (token_hash, auth_user_id, session_id, verified_at)
  values ('test-' || :owner, :owner, :owner, now());
insert into public.suppliers (supplier_id, supplier_name, status) overriding system value values
  (11, 'Barista Supplier', 'active'),
  (12, 'Inactive Supplier', 'inactive');
insert into public.ingredients (ingredient_id, ingredient_name, unit, current_stock, reorder_level, unit_cost)
  overriding system value values (11, 'Cocoa', 'g', 100, 10, 0.20);
insert into public.products (product_id, product_name, category, price, created_by) overriding system value values
  (911, 'Cocoa Drink', 'Non-coffee', 90.00, 11);
insert into public.product_ingredients (product_id, ingredient_id, quantity_needed) values (911, 11, 20);

-- ---------------------------------------------------------------------------
-- Owner session that apps/api did not approve (password only, or an email code used directly
-- against Supabase Auth): no data access, no writes.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', :owner, 'session_id', '00000000-0000-4000-8000-00000000dead')::text, false);
set role authenticated;

do $$ begin
  if public.app_role() is not null or public.app_user_id() is not null then
    raise exception 'TEST FAILED: unapproved Owner has a role';
  end if;
  if exists (select 1 from public.products) or exists (select 1 from public.ingredients) then
    raise exception 'TEST FAILED: unapproved Owner reads the catalog';
  end if;
  -- Own profile stays readable so the API can answer MFA_REQUIRED instead of "no profile".
  if (select role from public.users where auth_user_id = auth.uid()) is distinct from 'owner_admin' then
    raise exception 'TEST FAILED: unapproved Owner cannot read own profile';
  end if;
end $$;

do $$ begin
  insert into public.stock_transactions (ingredient_id, user_id, type, quantity) values (11, 11, 'in', 5);
  raise exception 'TEST FAILED: unapproved Owner recorded stock in';
exception when insufficient_privilege then null;
end $$;

do $$ begin
  perform public.process_checkout_transaction('{
    "client_tx_id": "55555555-5555-4555-8555-555555555555", "order_type": "dine-in",
    "amount_paid": 100, "items": [{"product_id": 911, "quantity": 1, "unit_price": 90}]}');
  raise exception 'TEST FAILED: unapproved Owner checked out';
exception when insufficient_privilege then null;
end $$;

do $$ begin
  insert into storage.objects (bucket_id, name) values ('product-images', '11/x.png');
  raise exception 'TEST FAILED: unapproved Owner uploaded an image';
exception when insufficient_privilege then null;
end $$;

reset role;

-- No session id, or only the old TOTP claim (aal2), gives no role either.
select set_config('request.jwt.claims', json_build_object('sub', :owner)::text, false);
set role authenticated;
do $$ begin
  if public.app_role() is not null then
    raise exception 'TEST FAILED: Owner without a session id has a role';
  end if;
end $$;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :owner, 'aal', 'aal2')::text, false);
set role authenticated;
do $$ begin
  if public.app_role() is not null then
    raise exception 'TEST FAILED: aal2 alone gives the Owner a role';
  end if;
  -- Staff cannot approve sessions themselves.
  begin
    insert into public.owner_login_challenges (token_hash, auth_user_id, session_id)
      values ('x', auth.uid(), gen_random_uuid());
    raise exception 'TEST FAILED: staff wrote owner_login_challenges';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Owner with an approved session: stock-in/out allowed, images managed.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', :owner, 'session_id', :owner)::text, false);
set role authenticated;

do $$
declare v_remaining numeric;
begin
  if public.app_role() is distinct from 'owner_admin' then
    raise exception 'TEST FAILED: approved Owner role';
  end if;
  insert into public.stock_transactions (ingredient_id, user_id, type, quantity, remarks)
  values (11, 11, 'in', 50, 'delivery') returning remaining_stock into v_remaining;
  if v_remaining <> 150 then
    raise exception 'TEST FAILED: Owner stock in updates stock';
  end if;
end $$;

do $$
declare v_remaining numeric;
begin
  insert into public.stock_transactions (ingredient_id, user_id, type, quantity, remarks)
  values (11, 11, 'out', 5, 'waste') returning remaining_stock into v_remaining;
  if v_remaining <> 145 then
    raise exception 'TEST FAILED: Owner stock out updates stock';
  end if;
end $$;

-- Stock-in under another user's id is refused.
do $$ begin
  insert into public.stock_transactions (ingredient_id, user_id, type, quantity) values (11, 12, 'in', 5);
  raise exception 'TEST FAILED: Owner recorded stock under another user';
exception when insufficient_privilege then null;
end $$;

do $$ begin
  perform public.create_barista_ingredient('Forbidden Owner Ingredient', 'g', null, 5, 0);
  raise exception 'TEST FAILED: Owner used the Barista ingredient function';
exception when insufficient_privilege then null;
end $$;

do $$ begin
  perform 1 from public.barista_supplier_options();
  raise exception 'TEST FAILED: Owner listed Barista supplier options';
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
-- Barista: stock-in/out allowed, checkout still deducts stock, images read-only.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', :barista, 'aal', 'aal1')::text, false);
set role authenticated;

do $$
declare
  v_ingredient_id integer;
begin
  if exists (select 1 from public.suppliers) then
    raise exception 'TEST FAILED: Barista read supplier records directly';
  end if;

  v_ingredient_id := public.create_barista_ingredient('Barista Sugar', 'g', 11, 25, 500);
  if not exists (
    select 1 from public.ingredients
    where ingredient_id = v_ingredient_id
      and supplier_id = 11
      and current_stock = 500
      and reorder_level = 25
  ) then
    raise exception 'TEST FAILED: Barista ingredient has a supplier or incorrect stock';
  end if;
  if not exists (
    select 1 from public.stock_transactions
    where ingredient_id = v_ingredient_id
      and user_id = 12
      and type = 'in'
      and quantity = 500
      and remarks = 'Opening stock'
  ) then
    raise exception 'TEST FAILED: opening stock was not recorded in history';
  end if;
  if not exists (
    select 1 from public.barista_supplier_options()
    where supplier_id = 11 and supplier_name = 'Barista Supplier'
  ) or exists (
    select 1 from public.barista_supplier_options()
    where supplier_id = 12
  ) then
    raise exception 'TEST FAILED: supplier options are not limited to active suppliers';
  end if;

  v_ingredient_id := public.create_barista_ingredient('Barista Salt', null, null, 0, 0);
  if (select current_stock from public.ingredients where ingredient_id = v_ingredient_id) <> 0
    or exists (select 1 from public.stock_transactions where ingredient_id = v_ingredient_id) then
    raise exception 'TEST FAILED: zero opening stock created an incorrect movement';
  end if;
end $$;

do $$ begin
  perform public.create_barista_ingredient('Invalid Reorder Level', 'g', null, -1, 0);
  raise exception 'TEST FAILED: negative reorder level was accepted';
exception when invalid_parameter_value then null;
end $$;

do $$ begin
  perform public.create_barista_ingredient('Invalid Opening Stock', 'g', null, 0, -1);
  raise exception 'TEST FAILED: negative opening stock was accepted';
exception when invalid_parameter_value then null;
end $$;

do $$ begin
  perform public.create_barista_ingredient('Inactive Supplier Link', 'g', 12, 0, 0);
  raise exception 'TEST FAILED: inactive supplier was assigned';
exception when invalid_parameter_value then null;
end $$;

do $$
declare v_remaining numeric;
begin
  insert into public.stock_transactions (ingredient_id, user_id, type, quantity, remarks)
  values (11, 12, 'in', 5, 'delivery') returning remaining_stock into v_remaining;
  if v_remaining <> 150 then
    raise exception 'TEST FAILED: barista stock in';
  end if;
  if not exists (select 1 from public.stock_transactions
                  where ingredient_id = 11 and user_id = 12 and type = 'in' and remarks = 'delivery') then
    raise exception 'TEST FAILED: barista stock-in history';
  end if;
end $$;

do $$ begin
  insert into public.stock_transactions (ingredient_id, user_id, type, quantity) values (11, 11, 'in', 5);
  raise exception 'TEST FAILED: barista recorded stock under another user';
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
  if exists (
    select 1 from public.ingredients
    where ingredient_name = 'Barista Salt'
      and (supplier_id is not null or unit_cost is not null)
  ) then
    raise exception 'TEST FAILED: Barista omitted supplier incorrectly or set unit cost';
  end if;
  if not exists (
    select 1 from public.ingredients
    where ingredient_name = 'Barista Sugar'
      and supplier_id = 11
      and unit_cost is null
  ) then
    raise exception 'TEST FAILED: Barista supplier assignment or unit-cost privacy';
  end if;
end $$;

do $$ begin
  if (select public from storage.buckets where id = 'product-images') then
    raise exception 'TEST FAILED: product-images bucket is public';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- owner_otp_use (apps/api, service role): send and attempt limits, expiry, single use.
-- ---------------------------------------------------------------------------
reset role;
insert into public.owner_login_challenges (token_hash, auth_user_id) values ('otp-test', :owner);
do $$
declare v_email text;
begin
  select email into v_email from public.owner_otp_use('otp-test', 'send');
  if v_email is distinct from 'owner2@example.com' then
    raise exception 'TEST FAILED: owner_otp_use returns the Owner email';
  end if;
  begin
    perform public.owner_otp_use('otp-test', 'send');
    raise exception 'TEST FAILED: resend within 60 s accepted';
  exception when others then
    if sqlerrm not like 'OTP_RESEND_WAIT%' then raise; end if;
  end;
  update public.owner_login_challenges set last_sent_at = now() - interval '2 minutes', sends = 3
   where token_hash = 'otp-test';
  begin
    perform public.owner_otp_use('otp-test', 'send');
    raise exception 'TEST FAILED: fourth code sent';
  exception when others then
    if sqlerrm not like 'OTP_LIMIT%' then raise; end if;
  end;
  for i in 1..5 loop perform public.owner_otp_use('otp-test', 'verify'); end loop;
  begin
    perform public.owner_otp_use('otp-test', 'verify');
    raise exception 'TEST FAILED: sixth attempt accepted';
  exception when others then
    if sqlerrm not like 'OTP_LIMIT%' then raise; end if;
  end;
  update public.owner_login_challenges set attempts = 0, expires_at = now() - interval '1 second'
   where token_hash = 'otp-test';
  begin
    perform public.owner_otp_use('otp-test', 'verify');
    raise exception 'TEST FAILED: expired challenge accepted';
  exception when others then
    if sqlerrm not like 'OTP_EXPIRED%' then raise; end if;
  end;
  update public.owner_login_challenges set expires_at = now() + interval '5 minutes',
         session_id = gen_random_uuid() where token_hash = 'otp-test';
  begin
    perform public.owner_otp_use('otp-test', 'verify');
    raise exception 'TEST FAILED: used challenge accepted';
  exception when others then
    if sqlerrm not like 'OTP_EXPIRED%' then raise; end if;
  end;
end $$;
do $$ begin
  insert into public.users (auth_user_id, username, full_name, role, email)
    values (gen_random_uuid(), 'owner-two', 'Second Owner', 'owner_admin', 'second@example.com');
  raise exception 'TEST FAILED: a second Owner was inserted';
exception when unique_violation then null;
end $$;
do $$ begin
  if has_function_privilege('authenticated', 'public.owner_otp_use(text, text)', 'execute')
     or has_table_privilege('authenticated', 'public.owner_login_challenges', 'select') then
    raise exception 'TEST FAILED: staff can reach Owner sign-in challenges';
  end if;
end $$;

\echo 'roles_mfa_storage: all checks passed'
