-- 1. Owner soft delete for products (decided 2026-11-24). The row stays, so orders, reports and
--    costing history keep it; the API hides it from every list and read, and it is also made
--    unavailable, so an order queued offline with it is a CONFLICT at checkout.
-- 2. The recipe guard of 20261120001300 names the deleted ingredient, and takes a share lock so a
--    recipe save that starts while delete_ingredient() runs sees the committed delete instead of
--    putting the ingredient back.

alter table public.products add column deleted_at timestamptz;

create or replace function public.product_ingredients_reject_deleted() returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_name    text;
  v_deleted timestamptz;
begin
  select i.ingredient_name, i.deleted_at into v_name, v_deleted
    from public.ingredients i
   where i.ingredient_id = new.ingredient_id
     for share;
  if v_deleted is not null then
    raise exception 'VALIDATION: % was deleted; remove it from the recipe', v_name
      using errcode = '22023';
  end if;
  return new;
end
$$;

revoke execute on function public.product_ingredients_reject_deleted() from public, anon, authenticated;
