-- Local stack only: the two test accounts plus the first stock deliveries for the demo ingredients
-- (demo_ingredients_recipes.sql). Run by `SEED_DATA=demo bash supabase/seed/seed-localhost.sh`.
-- psql variables: :owner_id and :barista_id are the Auth user ids (quoted uuids).
-- Each ingredient gets 4 x its reorder level, recorded as an Owner stock-in like the app does, with
-- the remark a shop would write for that kind of delivery.

\set ON_ERROR_STOP on

begin;

insert into public.users (auth_user_id, username, full_name, role, email) values
  (:owner_id, 'testowner', 'Test Owner', 'owner_admin', 'test-owner@example.com'),
  (:barista_id, 'testbarista', 'Test Barista', 'barista', null);

insert into public.stock_transactions (ingredient_id, user_id, type, quantity, remarks)
select i.ingredient_id, (select user_id from public.users where username = 'testowner'), 'in',
       i.reorder_level * 4,
       case
         when i.ingredient_name in ('Espresso Beans', 'Matcha Powder', 'Black Tea Leaves')
           then 'Delivery from coffee and tea supplier'
         when i.ingredient_name in ('Fresh Milk', 'Condensed Milk', 'Sea Salt Cream', 'Butter', 'Cheddar Cheese', 'Cheese Sauce')
           then 'Dairy delivery'
         when i.ingredient_name in ('Corned Beef', 'Luncheon Meat', 'Beef Tapa', 'Hotdog', 'Longganisa', 'Chicken Thigh',
                                    'Shawarma Meat', 'Lumpiang Shanghai', 'Jumbo Siomai', 'Chicken Pastil Flakes',
                                    'Chicken Poppers', 'Chicken Nuggets', 'Breaded Chicken Fillet', 'Hungarian Sausage',
                                    'Frozen French Fries')
           then 'Frozen meat and poultry delivery'
         when i.ingredient_name in ('Lettuce', 'Tomato', 'Onion', 'Garlic', 'Egg')
           then 'Bought at the public market'
         when i.ingredient_name in ('Plastic Cup 16oz', 'Dome Lid', 'Straw', 'Meal Box', 'Paper Bag')
           then 'Packaging supplies delivery'
         when i.ingredient_name = 'Ice' then 'Ice delivery'
         else 'Restock from grocery supplier'
       end
  from public.ingredients i
 where i.current_stock = 0 and i.reorder_level > 0;

commit;
