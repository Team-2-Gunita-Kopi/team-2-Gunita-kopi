-- Supplier address fields (20261120001800), checked on a migrated database as the table owner.
-- Each check raises 'TEST FAILED: ...' on a wrong result; run with psql -v ON_ERROR_STOP=1.

do $$
declare v_id int;
begin
  -- Suppliers saved before the fields keep only the old one-line address.
  insert into public.suppliers (supplier_name, address) values ('Old Address Co', 'Calamba, Laguna');

  -- A complete address is saved field by field.
  insert into public.suppliers (supplier_name, street, barangay, city, province, zip_code, region)
  values ('Field Co', '12 Mabini St.', 'Poblacion', 'La Trinidad', 'Benguet', '2601',
          'CAR (Cordillera Administrative Region)')
  returning supplier_id into v_id;
  if (select city || '/' || province || '/' || zip_code from public.suppliers where supplier_id = v_id)
     <> 'La Trinidad/Benguet/2601' then
    raise exception 'TEST FAILED: address fields not saved';
  end if;

  -- Half an address cannot be filtered on, so it is refused.
  begin
    insert into public.suppliers (supplier_name, city, province) values ('Half Co', 'Baguio', 'Benguet');
    raise exception 'TEST FAILED: half address accepted';
  exception when check_violation then null;
  end;
  begin
    update public.suppliers set region = null where supplier_id = v_id;
    raise exception 'TEST FAILED: clearing one field accepted';
  exception when check_violation then null;
  end;

  -- The ZIP code is 4 digits.
  foreach v_id in array array[1, 2] loop
    begin
      insert into public.suppliers (supplier_name, street, barangay, city, province, zip_code, region)
      values ('Zip Co', 'St.', 'Brgy.', 'City', 'Province', case v_id when 1 then '260' else 'AB12' end, 'NCR');
      raise exception 'TEST FAILED: bad ZIP code accepted';
    exception when check_violation then null;
    end;
  end loop;
end $$;

\echo 'supplier_address: all checks passed'
