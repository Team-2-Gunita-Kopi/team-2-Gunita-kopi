-- Baristas may link a new ingredient to an existing active supplier, but cannot create suppliers
-- or read supplier contact details.

drop function public.create_barista_ingredient(text, text, numeric, numeric);

create function public.create_barista_ingredient(
  p_name text,
  p_unit text,
  p_supplier_id integer,
  p_reorder_level numeric,
  p_opening_stock numeric
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id integer := public.app_user_id();
  v_ingredient_id integer;
  v_name text := btrim(coalesce(p_name, ''));
  v_unit text := nullif(btrim(coalesce(p_unit, '')), '');
begin
  if public.app_role() is distinct from 'barista' or v_user_id is null then
    raise exception 'FORBIDDEN: only an active Barista can use this function'
      using errcode = '42501';
  end if;

  if v_name = '' or length(v_name) > 100 then
    raise exception 'VALIDATION: ingredient name must contain 1 to 100 characters'
      using errcode = '22023';
  end if;
  if v_unit is not null and length(v_unit) > 20 then
    raise exception 'VALIDATION: unit must be 20 characters or fewer'
      using errcode = '22023';
  end if;
  if p_supplier_id is not null and not exists (
    select 1 from public.suppliers
    where supplier_id = p_supplier_id and status = 'active'
  ) then
    raise exception 'VALIDATION: select an existing active supplier'
      using errcode = '22023';
  end if;
  if p_reorder_level is null
    or p_reorder_level < 0
    or p_reorder_level > 99999999.99
    or p_reorder_level * 100 <> trunc(p_reorder_level * 100) then
    raise exception 'VALIDATION: reorder level must be non-negative with at most two decimals'
      using errcode = '22023';
  end if;
  if p_opening_stock is null
    or p_opening_stock < 0
    or p_opening_stock > 99999999.99
    or p_opening_stock * 100 <> trunc(p_opening_stock * 100) then
    raise exception 'VALIDATION: opening stock must be non-negative with at most two decimals'
      using errcode = '22023';
  end if;

  insert into public.ingredients (supplier_id, ingredient_name, unit, reorder_level)
  values (p_supplier_id, v_name, v_unit, p_reorder_level)
  returning ingredient_id into v_ingredient_id;

  if p_opening_stock > 0 then
    insert into public.stock_transactions (
      ingredient_id, user_id, type, quantity, remarks
    ) values (
      v_ingredient_id, v_user_id, 'in', p_opening_stock, 'Opening stock'
    );
  end if;

  return v_ingredient_id;
end
$$;

revoke all on function public.create_barista_ingredient(text, text, integer, numeric, numeric)
  from public, anon;
grant execute on function public.create_barista_ingredient(text, text, integer, numeric, numeric)
  to authenticated;

create function public.barista_supplier_options()
returns table (supplier_id integer, supplier_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.app_role() is distinct from 'barista' or public.app_user_id() is null then
    raise exception 'FORBIDDEN: only an active Barista can list supplier options'
      using errcode = '42501';
  end if;

  return query
    select s.supplier_id, s.supplier_name::text
    from public.suppliers s
    where s.status = 'active'
    order by s.supplier_name;
end
$$;

revoke all on function public.barista_supplier_options() from public, anon;
grant execute on function public.barista_supplier_options() to authenticated;
