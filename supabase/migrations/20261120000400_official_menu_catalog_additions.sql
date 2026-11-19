-- Gunita Kopi POS: the two main-menu products left out of 20261120000300, now confirmed in the
-- approved menu (Non-Coffee 24, Gunita Meals 8; 76 main-menu products in total).
-- Same rule as 20261120000300: inserted only when no product with the same name (case and
-- surrounding spaces ignored) exists, so re-running never duplicates or overwrites a product.
-- The orange-board items stay out until the Owner confirms them and their category.

insert into public.products (product_name, category, price)
select v.name, v.category, v.price
  from (values
    (1, 'Non-Coffee', 'Biscoff (Non Coffee)', 120.00),
    (2, 'Gunita Meals', 'Shanghai / Rice', 60.00)
  ) as v(ord, category, name, price)
 where not exists (
   select 1 from public.products p where lower(trim(p.product_name)) = lower(trim(v.name)))
 order by v.ord;
