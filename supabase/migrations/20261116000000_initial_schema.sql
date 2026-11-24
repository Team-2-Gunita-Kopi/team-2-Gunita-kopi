-- Gunita Kopi POS: initial schema (SDS v3 section 3, ported from MySQL to PostgreSQL)
-- Includes the pure web changes from SDS 3.11:
--   users.auth_user_id, no password column, roles owner_admin/barista,
--   orders.client_tx_id, API-assigned order_id, atomic checkout function, audit_logs.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.users (
  user_id      integer generated always as identity primary key,
  auth_user_id uuid not null unique references auth.users (id) on delete restrict,
  username     varchar(50)  not null unique,
  full_name    varchar(100) not null,
  role         text not null check (role in ('owner_admin', 'barista')),
  status       text not null default 'active' check (status in ('active', 'inactive')),
  date_created timestamptz not null default now()
);

create table public.suppliers (
  supplier_id    integer generated always as identity primary key,
  supplier_name  varchar(100) not null,
  contact_person varchar(100),
  contact_number varchar(20),
  address        varchar(255),
  status         text not null default 'active' check (status in ('active', 'inactive'))
);

create table public.ingredients (
  ingredient_id   integer generated always as identity primary key,
  supplier_id     integer references public.suppliers (supplier_id) on delete set null,
  ingredient_name varchar(100) not null,
  unit            varchar(20),
  current_stock   numeric(10,2) not null default 0 check (current_stock >= 0),
  reorder_level   numeric(10,2) not null default 0 check (reorder_level >= 0),
  unit_cost       numeric(10,2) check (unit_cost >= 0),
  date_updated    timestamptz not null default now()
);

create table public.products (
  product_id   integer generated always as identity primary key,
  product_name varchar(100) not null,
  description  text,
  category     varchar(50),
  price        numeric(10,2) not null check (price >= 0),
  is_available boolean not null default true,
  image        varchar(255),
  date_created timestamptz not null default now(),
  created_by   integer references public.users (user_id) on delete set null
);

create table public.product_ingredients (
  product_ingredient_id integer generated always as identity primary key,
  product_id      integer not null references public.products (product_id) on delete cascade,
  ingredient_id   integer not null references public.ingredients (ingredient_id) on delete restrict,
  quantity_needed numeric(10,2) not null check (quantity_needed > 0),
  unique (product_id, ingredient_id)
);

create table public.product_costing (
  costing_id      integer generated always as identity primary key,
  product_id      integer not null unique references public.products (product_id) on delete cascade,
  ingredient_cost numeric(10,2) not null default 0 check (ingredient_cost >= 0),
  packaging_cost  numeric(10,2) not null default 0 check (packaging_cost >= 0),
  total_cost      numeric(10,2) generated always as (ingredient_cost + packaging_cost) stored,
  date_updated    timestamptz not null default now()
);

create table public.stock_transactions (
  stock_trans_id  integer generated always as identity primary key,
  ingredient_id   integer not null references public.ingredients (ingredient_id) on delete restrict,
  user_id         integer references public.users (user_id) on delete set null,
  type            text not null check (type in ('in', 'out')),
  quantity        numeric(10,2) not null check (quantity > 0),
  remaining_stock numeric(10,2),
  date_time       timestamptz not null default now(),
  remarks         varchar(255)
);

-- Queue numbers. Assigned by process_checkout_transaction at sync, never by the device.
create sequence public.order_id_seq;

-- One row per ordered item; rows of one order share order_id (SDS 3.5.8).
create table public.orders (
  order_line_id        integer generated always as identity primary key,
  order_id             integer not null,
  client_tx_id         uuid not null,
  user_id              integer references public.users (user_id) on delete set null,
  product_id           integer references public.products (product_id) on delete restrict,
  is_addon             boolean not null default false,
  ingredient_id        integer references public.ingredients (ingredient_id) on delete restrict,
  quantity             integer not null check (quantity > 0),
  unit_price           numeric(10,2) not null check (unit_price >= 0),
  subtotal             numeric(10,2) not null check (subtotal >= 0),
  order_type           text check (order_type in ('dine-in', 'take-out', 'pre-order')),
  order_date           timestamptz not null default now(),
  status               text not null default 'pending'
                         check (status in ('pending', 'preparing', 'completed', 'cancelled')),
  customization        varchar(255),
  special_instructions varchar(255),
  -- SDS 3.8 left this rule to the app because MySQL cannot check it; Postgres can.
  check ((is_addon and ingredient_id is not null) or (not is_addon and product_id is not null))
);
create index orders_order_id_idx     on public.orders (order_id);
create index orders_client_tx_id_idx on public.orders (client_tx_id);
create index orders_order_date_idx   on public.orders (order_date);
create index orders_status_idx       on public.orders (status);

-- order_id is not unique in orders, so no FK is possible (SDS 3.8); the checkout function guarantees it exists.
create table public.payments (
  payment_id     integer generated always as identity primary key,
  order_id       integer not null,
  -- One payment per sale; the unique key makes offline retries idempotent at the database level.
  client_tx_id   uuid not null unique,
  amount_paid    numeric(10,2) not null check (amount_paid >= 0),
  payment_method varchar(30) not null default 'cash',
  date_time      timestamptz not null default now(),
  received_by    integer references public.users (user_id) on delete set null,
  change_amount  numeric(10,2) not null default 0 check (change_amount >= 0)
);
create index payments_order_id_idx on public.payments (order_id);

create table public.audit_logs (
  audit_id    bigint generated always as identity primary key,
  action      text not null,
  user_id     uuid,
  user_role   text,
  resource    text not null,
  resource_id text,
  details     jsonb,
  ip_address  text,
  user_agent  text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create function public.set_date_updated() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.date_updated := now();
  return new;
end $$;

create trigger ingredients_date_updated before update on public.ingredients
  for each row execute function public.set_date_updated();
create trigger product_costing_date_updated before update on public.product_costing
  for each row execute function public.set_date_updated();

-- Every stock movement updates ingredients.current_stock and records remaining_stock (SDS 3.5.7, FR-18).
-- security definer: baristas may record stock out but may not update ingredients directly.
create function public.apply_stock_transaction() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_stock numeric(10,2);
begin
  update public.ingredients
     set current_stock = current_stock + case when new.type = 'in' then new.quantity else -new.quantity end
   where ingredient_id = new.ingredient_id
     and (new.type = 'in' or current_stock >= new.quantity)
   returning current_stock into v_stock;

  if not found then
    raise exception 'STOCK_CONFLICT: not enough stock for ingredient %', new.ingredient_id;
  end if;

  new.remaining_stock := v_stock;
  return new;
end $$;

create trigger stock_transactions_apply before insert on public.stock_transactions
  for each row execute function public.apply_stock_transaction();

-- ---------------------------------------------------------------------------
-- Auth helpers (role and status come from the users table, never from the client)
-- ---------------------------------------------------------------------------

create function public.app_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.users where auth_user_id = auth.uid() and status = 'active'
$$;

create function public.app_user_id() returns integer
language sql stable security definer set search_path = '' as $$
  select user_id from public.users where auth_user_id = auth.uid() and status = 'active'
$$;

-- ---------------------------------------------------------------------------
-- Atomic checkout (SDS 2.5, 3.11; FR-58, FR-59)
-- p_order: { client_tx_id, order_type, payment_method, amount_paid,
--            items: [{ product_id | ingredient_id, is_addon, quantity, unit_price,
--                      customization, special_instructions }] }
-- Returns { order_id, duplicate, total, change_amount }.
-- ---------------------------------------------------------------------------

create function public.process_checkout_transaction(p_order jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id   integer := public.app_user_id();
  v_tx        uuid := (p_order->>'client_tx_id')::uuid;
  v_existing  integer;
  v_order_id  integer;
  v_total     numeric(10,2) := 0;
  v_paid      numeric(10,2) := (p_order->>'amount_paid')::numeric;
  v_item      jsonb;
  v_is_addon  boolean;
  v_qty       integer;
  v_price     numeric(10,2);
  v_use       record;
begin
  if v_user_id is null then
    raise exception 'FORBIDDEN: no active user profile' using errcode = '42501';
  end if;

  select order_id into v_existing from public.payments where client_tx_id = v_tx;
  if found then
    return jsonb_build_object('order_id', v_existing, 'duplicate', true);
  end if;

  if jsonb_array_length(coalesce(p_order->'items', '[]')) = 0 then
    raise exception 'VALIDATION: order has no items';
  end if;

  v_order_id := nextval('public.order_id_seq');

  for v_item in select * from jsonb_array_elements(p_order->'items') loop
    v_is_addon := coalesce((v_item->>'is_addon')::boolean, false);
    v_qty := (v_item->>'quantity')::integer;
    v_price := null; -- select into keeps the old value when no row matches

    -- Server recheck of the current price (FR-58). Add-on price basis is ingredients.unit_cost (SDS 3.5.3).
    if v_is_addon then
      select unit_cost into v_price from public.ingredients
       where ingredient_id = (v_item->>'ingredient_id')::integer;
    else
      select price into v_price from public.products
       where product_id = (v_item->>'product_id')::integer and is_available;
    end if;

    if v_price is null then
      raise exception 'CONFLICT: item % is unknown or unavailable', v_item;
    end if;
    if v_price <> (v_item->>'unit_price')::numeric then
      raise exception 'PRICE_CONFLICT: price changed to % for item %', v_price, v_item;
    end if;

    insert into public.orders (order_id, client_tx_id, user_id, product_id, is_addon, ingredient_id,
                               quantity, unit_price, subtotal, order_type, customization, special_instructions)
    values (v_order_id, v_tx, v_user_id,
            case when v_is_addon then null else (v_item->>'product_id')::integer end,
            v_is_addon,
            case when v_is_addon then (v_item->>'ingredient_id')::integer end,
            v_qty, v_price, v_price * v_qty, p_order->>'order_type',
            v_item->>'customization', v_item->>'special_instructions');

    v_total := v_total + v_price * v_qty;
  end loop;

  if v_paid < v_total then
    raise exception 'VALIDATION: amount paid % is less than total %', v_paid, v_total;
  end if;

  insert into public.payments (order_id, client_tx_id, amount_paid, payment_method, received_by, change_amount)
  values (v_order_id, v_tx, v_paid, coalesce(p_order->>'payment_method', 'cash'), v_user_id, v_paid - v_total);

  -- Stock out: recipe usage for products, one unit of the ingredient per add-on (FR-12, FR-16).
  -- The stock trigger raises STOCK_CONFLICT if any ingredient would go negative, rolling back everything.
  for v_use in
    select u.ingredient_id, sum(u.qty) as qty from (
      select pi.ingredient_id, pi.quantity_needed * o.quantity as qty
        from public.orders o join public.product_ingredients pi on pi.product_id = o.product_id
       where o.order_id = v_order_id and not o.is_addon
      union all
      select o.ingredient_id, o.quantity from public.orders o
       where o.order_id = v_order_id and o.is_addon
    ) u group by u.ingredient_id
  loop
    insert into public.stock_transactions (ingredient_id, user_id, type, quantity, remarks)
    values (v_use.ingredient_id, v_user_id, 'out', v_use.qty, 'Order #' || v_order_id);
  end loop;

  return jsonb_build_object('order_id', v_order_id, 'duplicate', false,
                            'total', v_total, 'change_amount', v_paid - v_total);
exception
  -- Two concurrent retries of the same sale: the loser returns the winner's order.
  when unique_violation then
    select order_id into v_existing from public.payments where client_tx_id = v_tx;
    return jsonb_build_object('order_id', v_existing, 'duplicate', true);
end $$;

-- ---------------------------------------------------------------------------
-- Views (SDS 3.7). security_invoker so RLS of the caller applies.
-- Sales reports are owner-only (FR-30); inventory status and order totals are for both roles.
-- ---------------------------------------------------------------------------

create view public.v_sales with (security_invoker = true) as
select order_line_id, order_id, order_date, product_id, ingredient_id, is_addon, quantity, subtotal
  from public.orders
 where status = 'completed' and public.app_role() = 'owner_admin';

create view public.v_order_totals with (security_invoker = true) as
select order_id,
       min(order_date) as order_date,
       min(order_type) as order_type,
       min(status)     as status,
       count(*)        as item_count,
       sum(subtotal)   as total
  from public.orders
 group by order_id;

create view public.v_daily_sales with (security_invoker = true) as
select (order_date at time zone 'Asia/Manila')::date as sale_date,
       count(distinct order_id) as order_count,
       sum(quantity)            as items_sold,
       sum(subtotal)            as total_sales
  from public.v_sales
 group by 1;

create view public.v_monthly_sales with (security_invoker = true) as
select date_trunc('month', order_date at time zone 'Asia/Manila')::date as sale_month,
       count(distinct order_id) as order_count,
       sum(subtotal)            as total_sales
  from public.v_sales
 group by 1;

create view public.v_best_sellers with (security_invoker = true) as
select p.product_id, p.product_name,
       sum(s.quantity) as units_sold,
       sum(s.subtotal) as revenue
  from public.v_sales s join public.products p on p.product_id = s.product_id
 where not s.is_addon
 group by p.product_id, p.product_name
 order by units_sold desc;

create view public.v_inventory_status with (security_invoker = true) as
select ingredient_id, ingredient_name, unit, current_stock, reorder_level,
       case when current_stock <= 0 then 'out-of-stock'
            when current_stock <= reorder_level then 'low-stock'
            else 'available' end as stock_status
  from public.ingredients;

-- ---------------------------------------------------------------------------
-- Row Level Security (second lock behind the API, SDS 2.8)
-- ---------------------------------------------------------------------------

alter table public.users              enable row level security;
alter table public.suppliers          enable row level security;
alter table public.ingredients        enable row level security;
alter table public.products           enable row level security;
alter table public.product_ingredients enable row level security;
alter table public.product_costing    enable row level security;
alter table public.stock_transactions enable row level security;
alter table public.orders             enable row level security;
alter table public.payments           enable row level security;
alter table public.audit_logs         enable row level security; -- no policies: service role only

-- users: own row, or everything for the owner. Accounts are created by the API with the service role.
create policy users_select on public.users for select to authenticated
  using (auth_user_id = auth.uid() or public.app_role() = 'owner_admin');
create policy users_update on public.users for update to authenticated
  using (public.app_role() = 'owner_admin') with check (public.app_role() = 'owner_admin');

-- Owner-only tables (suppliers, costing).
create policy suppliers_owner on public.suppliers for all to authenticated
  using (public.app_role() = 'owner_admin') with check (public.app_role() = 'owner_admin');
create policy product_costing_owner on public.product_costing for all to authenticated
  using (public.app_role() = 'owner_admin') with check (public.app_role() = 'owner_admin');

-- Catalog and inventory: both roles read, owner writes.
create policy ingredients_read on public.ingredients for select to authenticated
  using (public.app_role() is not null);
create policy ingredients_owner_write on public.ingredients for all to authenticated
  using (public.app_role() = 'owner_admin') with check (public.app_role() = 'owner_admin');
create policy products_read on public.products for select to authenticated
  using (public.app_role() is not null);
create policy products_owner_write on public.products for all to authenticated
  using (public.app_role() = 'owner_admin') with check (public.app_role() = 'owner_admin');
create policy product_ingredients_read on public.product_ingredients for select to authenticated
  using (public.app_role() is not null);
create policy product_ingredients_owner_write on public.product_ingredients for all to authenticated
  using (public.app_role() = 'owner_admin') with check (public.app_role() = 'owner_admin');

-- Stock history: both read; owner records in and out, barista records out only (FR-15, FR-16). Append-only.
create policy stock_read on public.stock_transactions for select to authenticated
  using (public.app_role() is not null);
create policy stock_insert on public.stock_transactions for insert to authenticated
  with check (user_id = public.app_user_id()
              and (public.app_role() = 'owner_admin' or (public.app_role() = 'barista' and type = 'out')));

-- Orders and payments: both read; inserts only through process_checkout_transaction.
-- Both roles move order status (FR-10); only the status column is updatable.
create policy orders_read on public.orders for select to authenticated
  using (public.app_role() is not null);
create policy orders_status_update on public.orders for update to authenticated
  using (public.app_role() is not null) with check (public.app_role() is not null);
create policy payments_read on public.payments for select to authenticated
  using (public.app_role() is not null);

-- ---------------------------------------------------------------------------
-- Grants: no anonymous access; least privilege for signed-in users.
-- ---------------------------------------------------------------------------

revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon, public;
-- Supabase grants anon on every new object by default; stop that for future migrations too.
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon, public;

revoke insert, update, delete on public.orders, public.payments, public.audit_logs from authenticated;
revoke update, delete on public.stock_transactions from authenticated;
grant update (status) on public.orders to authenticated;
revoke all on public.audit_logs from authenticated;
revoke usage on sequence public.order_id_seq from authenticated;

grant execute on function public.process_checkout_transaction(jsonb) to authenticated;
grant execute on function public.app_role(), public.app_user_id() to authenticated;
