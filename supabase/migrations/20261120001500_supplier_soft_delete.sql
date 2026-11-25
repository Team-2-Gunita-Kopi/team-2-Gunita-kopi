-- Owner soft delete for suppliers (decided 2026-11-25). A deleted supplier keeps its row, so the
-- audit log still points at it, but it leaves every supplier list and read. It is also marked
-- inactive, so the Barista supplier options and create_barista_ingredient refuse it, and it is
-- unlinked from its ingredients. Table privileges on suppliers are table-level (20261117000000),
-- so the new column needs no extra grant.

alter table public.suppliers add column deleted_at timestamptz;

-- Returns how many ingredients lost the supplier. Owner only (also enforced by RLS).
create function public.delete_supplier(p_supplier_id integer)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_unlinked integer;
begin
  if public.app_role() is distinct from 'owner_admin' then
    raise exception 'FORBIDDEN: only the Owner can delete suppliers' using errcode = '42501';
  end if;

  perform 1 from public.suppliers s
   where s.supplier_id = p_supplier_id and s.deleted_at is null
     for update;
  if not found then
    raise exception 'NOT_FOUND: supplier not found' using errcode = 'P0002';
  end if;

  update public.ingredients i
     set supplier_id = null
   where i.supplier_id = p_supplier_id;
  get diagnostics v_unlinked = row_count;

  update public.suppliers s
     set deleted_at = now(),
         status = 'inactive'
   where s.supplier_id = p_supplier_id;

  return v_unlinked;
end
$$;

revoke execute on function public.delete_supplier(integer) from public, anon, authenticated;
grant execute on function public.delete_supplier(integer) to authenticated;

-- An ingredient form opened before the delete cannot link the supplier again.
create function public.ingredients_reject_deleted_supplier() returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.supplier_id is not null and exists (
       select 1 from public.suppliers s
        where s.supplier_id = new.supplier_id and s.deleted_at is not null) then
    raise exception 'VALIDATION: this supplier was deleted' using errcode = '22023';
  end if;
  return new;
end
$$;

create trigger ingredients_reject_deleted_supplier
  before insert or update of supplier_id on public.ingredients
  for each row execute function public.ingredients_reject_deleted_supplier();

revoke execute on function public.ingredients_reject_deleted_supplier() from public, anon, authenticated;
