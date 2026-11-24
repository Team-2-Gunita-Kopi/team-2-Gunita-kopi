-- Owner soft delete for ingredients (decided 2026-11-24). A deleted ingredient keeps its row, so
-- stock history and past orders still show its name. It disappears from every list (they read
-- v_inventory_status), is taken out of the recipes that used it (their cost is recomputed by the
-- existing trigger), and stops being an add-on, so an order queued offline with it is a CONFLICT.

alter table public.ingredients add column deleted_at timestamptz;

-- Column privileges (20261120000200): the security_invoker view and the function below read it.
grant select (deleted_at) on public.ingredients to authenticated;

-- Same columns as 20261120000200, without deleted ingredients. Grants are kept by "or replace".
create or replace view public.v_inventory_status with (security_invoker = true) as
select i.ingredient_id, i.ingredient_name, i.unit, i.current_stock, i.reorder_level,
       case when i.current_stock <= 0 then 'out-of-stock'
            when i.current_stock <= i.reorder_level then 'low-stock'
            else 'available' end as stock_status,
       i.supplier_id, s.supplier_name, i.date_updated,
       i.is_addon, i.addon_selling_price, i.addon_quantity
  from public.ingredients i
  left join public.suppliers s on s.supplier_id = i.supplier_id
 where i.deleted_at is null;

-- Returns the products whose recipes lost the ingredient. Owner only (also enforced by RLS).
create function public.delete_ingredient(p_ingredient_id integer)
returns table (product_id integer, product_name text)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if public.app_role() is distinct from 'owner_admin' then
    raise exception 'FORBIDDEN: only the Owner can delete ingredients' using errcode = '42501';
  end if;

  perform 1 from public.ingredients i
   where i.ingredient_id = p_ingredient_id and i.deleted_at is null
     for update;
  if not found then
    raise exception 'NOT_FOUND: ingredient not found' using errcode = 'P0002';
  end if;

  return query
    with removed as (
      delete from public.product_ingredients pi
       where pi.ingredient_id = p_ingredient_id
      returning pi.product_id
    )
    select p.product_id, p.product_name::text
      from removed r
      join public.products p on p.product_id = r.product_id
     order by p.product_id;

  update public.ingredients i
     set deleted_at = now(),
         is_addon = false,
         addon_selling_price = null,
         addon_quantity = null,
         date_updated = now()
   where i.ingredient_id = p_ingredient_id;
end
$$;

revoke execute on function public.delete_ingredient(integer) from public, anon, authenticated;
grant execute on function public.delete_ingredient(integer) to authenticated;

-- A recipe screen opened before the delete cannot put the ingredient back.
create function public.product_ingredients_reject_deleted() returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (select 1 from public.ingredients i
              where i.ingredient_id = new.ingredient_id and i.deleted_at is not null) then
    raise exception 'VALIDATION: this ingredient was deleted' using errcode = '22023';
  end if;
  return new;
end
$$;

create trigger product_ingredients_reject_deleted
  before insert or update of ingredient_id on public.product_ingredients
  for each row execute function public.product_ingredients_reject_deleted();

revoke execute on function public.product_ingredients_reject_deleted() from public, anon, authenticated;
