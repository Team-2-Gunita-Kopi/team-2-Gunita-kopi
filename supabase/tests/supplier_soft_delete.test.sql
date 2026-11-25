-- Supplier soft delete (20261120001500), checked on a migrated database.
-- Each check raises 'TEST FAILED: ...' on a wrong result; run with psql -v ON_ERROR_STOP=1.

\set owner   '''00000000-0000-0000-0000-0000000000c6'''
\set barista '''00000000-0000-0000-0000-0000000000d6'''

-- One Owner per database (users_single_owner): retire an Owner left by an earlier test file.
update public.users set role = 'barista', email = null where role = 'owner_admin';

insert into auth.users (id, email) values
  (:owner, 'supplier-delete-owner@example.com'), (:barista, 'spbarista@staff.gunitakopi.local');
insert into public.users (user_id, auth_user_id, username, full_name, role, email) overriding system value values
  (71, :owner, 'spowner', 'Supplier Delete Owner', 'owner_admin', 'supplier-delete-owner@example.com'),
  (72, :barista, 'spbarista', 'Supplier Delete Barista', 'barista', null);
insert into public.owner_login_challenges (token_hash, auth_user_id, session_id, verified_at)
  values ('test-' || :owner, :owner, :owner, now());
insert into public.suppliers (supplier_id, supplier_name, status) overriding system value values
  (771, 'Old Roaster', 'active'),
  (772, 'Kept Dairy', 'active');
insert into public.ingredients (ingredient_id, supplier_id, ingredient_name, unit, current_stock, reorder_level)
  overriding system value values
  (761, 771, 'Roaster Beans', 'g', 500, 50),
  (762, 771, 'Roaster Decaf', 'g', 200, 50),
  (763, 772, 'Dairy Milk',    'ml', 900, 50);

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

-- A Barista may not delete.
select set_config('request.jwt.claims', json_build_object('sub', :barista)::text, false);
set role authenticated;
do $$
begin
  perform public.delete_supplier(771);
  raise exception 'TEST FAILED: barista deleted a supplier';
exception when insufficient_privilege then null;
end $$;
reset role;

-- The Owner deletes Old Roaster.
select set_config('request.jwt.claims', json_build_object('sub', :owner, 'session_id', :owner)::text, false);
set role authenticated;
do $$
declare v_unlinked integer;
begin
  v_unlinked := public.delete_supplier(771);
  if v_unlinked <> 2 then
    raise exception 'TEST FAILED: unlinked % ingredients, expected 2', v_unlinked;
  end if;

  -- The row stays, marked deleted and inactive; the other supplier is untouched.
  if (select deleted_at is null or status <> 'inactive' from public.suppliers where supplier_id = 771) then
    raise exception 'TEST FAILED: supplier not soft deleted';
  end if;
  if (select deleted_at is not null or status <> 'active' from public.suppliers where supplier_id = 772) then
    raise exception 'TEST FAILED: other supplier changed';
  end if;

  -- Its ingredients stay, without the supplier; other links are kept.
  if exists (select 1 from public.ingredients where supplier_id = 771) then
    raise exception 'TEST FAILED: ingredients still linked';
  end if;
  if (select count(*) from public.ingredients where ingredient_id in (761, 762)) <> 2 then
    raise exception 'TEST FAILED: ingredients lost';
  end if;
  if (select supplier_id from public.ingredients where ingredient_id = 763) <> 772 then
    raise exception 'TEST FAILED: other link lost';
  end if;

  -- Deleting twice, or an unknown id, is NOT_FOUND.
  begin
    perform public.delete_supplier(771);
    raise exception 'TEST FAILED: deleted twice';
  exception when others then
    if sqlerrm not like 'NOT_FOUND%' then raise; end if;
  end;
  begin
    perform public.delete_supplier(999999);
    raise exception 'TEST FAILED: unknown id deleted';
  exception when others then
    if sqlerrm not like 'NOT_FOUND%' then raise; end if;
  end;

  -- A stale ingredient form cannot link it again.
  begin
    update public.ingredients set supplier_id = 771 where ingredient_id = 761;
    raise exception 'TEST FAILED: deleted supplier linked again';
  exception when others then
    if sqlerrm not like 'VALIDATION: this supplier was deleted%' then raise; end if;
  end;
end $$;
reset role;

-- Baristas no longer see it, and cannot link it to a new ingredient.
select set_config('request.jwt.claims', json_build_object('sub', :barista)::text, false);
set role authenticated;
do $$
begin
  if exists (select 1 from public.barista_supplier_options() where supplier_id = 771) then
    raise exception 'TEST FAILED: deleted supplier offered to baristas';
  end if;
  if not exists (select 1 from public.barista_supplier_options() where supplier_id = 772) then
    raise exception 'TEST FAILED: active supplier missing for baristas';
  end if;
  begin
    perform public.create_barista_ingredient('Late Beans', 'g', 771, 10, 0);
    raise exception 'TEST FAILED: barista linked a deleted supplier';
  exception when others then
    if sqlerrm not like 'VALIDATION%' then raise; end if;
  end;
end $$;
reset role;

\echo 'supplier_soft_delete: all checks passed'
