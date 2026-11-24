-- Gunita Kopi POS: official product catalog (menu board supplied by the project owner).
-- Data only: product names, menu categories and prices. No descriptions, images, recipes,
-- costing or stock are created here; the Owner adds those later (FR-23 to FR-29, FR-50).
--
-- Repeatable: a product is inserted only when no product with the same name (case and surrounding
-- spaces ignored) exists, so running this again, or on a database where the Owner already entered
-- some of these products, never creates duplicates or changes existing names, prices or availability.
-- created_by stays NULL: no user id is assumed.
--
-- Left out on purpose, pending Owner/client confirmation (see docs/database.md, "Official catalog"):
--   * Biscoff (Non Coffee): price unclear.
--   * Shanghai / Rice (Gunita Meals): conflicting prices reported.
--   * Every item on the partly visible orange board: category not visible, names and prices differ
--     between the transcription and the photo, and seven names conflict with main-menu prices
--     (Butterscotch, Caramel Macchiato, Long Black, Spanish Latte, Mocha Latte, Sea Salt Latte,
--     Salted Caramel). The main-menu prices below are used for those seven.
-- Source notes not stored (products has no notes column): the menu marks "Shawarma Burger" and
-- "Cheese Pancakes" with an asterisk whose meaning is not given.
-- French Fries flavors (BBQ, Cheese, Sour Cream) are not products; they are recorded per order in
-- orders.customization.

insert into public.products (product_name, category, price)
select v.name, v.category, v.price
  from (values
    -- Iced Coffee
    ( 1, 'Iced Coffee', 'Biscoff Kopi', 119.00),
    ( 2, 'Iced Coffee', 'Blueberry Matcha', 119.00),
    ( 3, 'Iced Coffee', 'Strawberry Matcha', 119.00),
    ( 4, 'Iced Coffee', 'Salted Caramel Macchiato', 119.00),
    ( 5, 'Iced Coffee', 'Gunita Kopi (Signature)', 119.00),
    ( 6, 'Iced Coffee', 'Matcha Espresso', 109.00),
    ( 7, 'Iced Coffee', 'Salted Caramel', 114.00),
    ( 8, 'Iced Coffee', 'Ube Espresso Latte', 109.00),
    ( 9, 'Iced Coffee', 'Ube Mocha', 109.00),
    (10, 'Iced Coffee', 'White Chocolate Mocha', 109.00),
    (11, 'Iced Coffee', 'Almond Latte', 99.00),
    (12, 'Iced Coffee', 'Brown Sugar Latte', 99.00),
    (13, 'Iced Coffee', 'Ube Kopi', 99.00),
    (14, 'Iced Coffee', 'Butterscotch', 99.00),
    (15, 'Iced Coffee', 'Cappuccino', 94.00),
    (16, 'Iced Coffee', 'Kopi Jelly Latte', 99.00),
    (17, 'Iced Coffee', 'Long Black', 89.00),
    (18, 'Iced Coffee', 'Caramel Macchiato', 99.00),
    (19, 'Iced Coffee', 'Mocha Latte', 99.00),
    (20, 'Iced Coffee', 'Peanut Butter Kopi', 99.00),
    (21, 'Iced Coffee', 'Spanish Latte', 99.00),
    (22, 'Iced Coffee', 'Spanish Mocha Latte', 104.00),
    (23, 'Iced Coffee', 'Sea Salt Latte', 119.00),
    (24, 'Iced Coffee', 'Tea Latte', 119.00),
    -- Non-Coffee
    (25, 'Non-Coffee', 'Biscoff Matcha', 119.00),
    (26, 'Non-Coffee', 'Black Forest', 99.00),
    (27, 'Non-Coffee', 'Blueberry Milk', 109.00),
    (28, 'Non-Coffee', 'Brown Sugar Matcha', 114.00),
    (29, 'Non-Coffee', 'Choco Berry', 114.00),
    (30, 'Non-Coffee', 'Choco Blueberry', 104.00),
    (31, 'Non-Coffee', 'Chocolate Milk', 119.00),
    (32, 'Non-Coffee', 'Choco Strawberry', 109.00),
    (33, 'Non-Coffee', 'Mango Choco', 99.00),
    (34, 'Non-Coffee', 'Mango Milk', 119.00),
    (35, 'Non-Coffee', 'Mango Matcha', 109.00),
    (36, 'Non-Coffee', 'Matcha', 119.00),
    (37, 'Non-Coffee', 'Matcha Blueberry', 119.00),
    (38, 'Non-Coffee', 'Matcha Choco', 119.00),
    (39, 'Non-Coffee', 'Matcha Salted Caramel', 119.00),
    (40, 'Non-Coffee', 'Matcha Strawberry', 119.00),
    (41, 'Non-Coffee', 'Milky Ube', 109.00),
    (42, 'Non-Coffee', 'Oreo Choco Lava', 119.00),
    (43, 'Non-Coffee', 'Peanut Butter Matcha', 119.00),
    (44, 'Non-Coffee', 'Strawberry Milk', 99.00),
    (45, 'Non-Coffee', 'Sea Salt Matcha', 119.00),
    (46, 'Non-Coffee', 'Ube Choco', 109.00),
    (47, 'Non-Coffee', 'Ube Matcha', 119.00),
    -- Silog Meals
    (48, 'Silog Meals', 'Cornsilog', 70.00),
    (49, 'Silog Meals', 'Malingsilog', 70.00),
    (50, 'Silog Meals', 'Tapsilog', 85.00),
    (51, 'Silog Meals', 'Hotsilog', 70.00),
    (52, 'Silog Meals', 'Longsilog', 80.00),
    (53, 'Silog Meals', 'Chiksilog', 80.00),
    -- Shawarma Meals ("Shawarma Burger" carries an asterisk on the menu)
    (54, 'Shawarma Meals', 'Shawarma Pita', 70.00),
    (55, 'Shawarma Meals', 'Quesadillas', 80.00),
    (56, 'Shawarma Meals', 'Shawarma Rice', 90.00),
    (57, 'Shawarma Meals', 'Shawarma Nachos', 90.00),
    (58, 'Shawarma Meals', 'Shawarma Burger', 80.00),
    -- Gunita Meals (Shanghai / Rice left out: price to be confirmed)
    (59, 'Gunita Meals', 'Shanghai 4 pcs', 60.00),
    (60, 'Gunita Meals', 'Jumbo Shomai', 15.00),
    (61, 'Gunita Meals', 'Chicken Pastil', 60.00),
    (62, 'Gunita Meals', 'Chicken Poppers', 60.00),
    (63, 'Gunita Meals', 'Nuggets / Rice', 60.00),
    (64, 'Gunita Meals', 'Chicken Fillet', 75.00),
    (65, 'Gunita Meals', 'Hungarian', 85.00),
    -- French Fries (sizes as printed on the menu)
    (66, 'French Fries', 'Solo', 60.00),
    (67, 'French Fries', 'Triple', 110.00),
    (68, 'French Fries', 'Barkada', 140.00),
    (69, 'French Fries', 'Family', 200.00),
    -- Snacks ("Cheese Pancakes" carries an asterisk on the menu)
    (70, 'Snacks', 'Toasted Bread', 60.00),
    (71, 'Snacks', 'Waffle', 50.00),
    (72, 'Snacks', 'Churros', 50.00),
    (73, 'Snacks', 'Pancakes', 100.00),
    (74, 'Snacks', 'Cheese Pancakes', 150.00)
  ) as v(ord, category, name, price)
 where not exists (
   select 1 from public.products p where lower(trim(p.product_name)) = lower(trim(v.name)))
 order by v.ord;
