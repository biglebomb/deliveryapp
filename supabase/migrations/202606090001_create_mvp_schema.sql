create extension if not exists pgcrypto;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price numeric(12, 2) not null check (price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  order_date timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'preparing', 'delivering', 'delivered', 'cancelled')),
  total_amount numeric(12, 2) not null default 0 check (total_amount >= 0),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid')),
  delivery_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name_snapshot text not null,
  unit_price_snapshot numeric(12, 2) not null check (unit_price_snapshot >= 0),
  quantity integer not null check (quantity > 0),
  subtotal numeric(12, 2) not null check (subtotal >= 0)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists set_customers_updated_at on public.customers;
create trigger set_customers_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy "authenticated users manage products"
on public.products
for all
to authenticated
using (true)
with check (true);

create policy "authenticated users manage customers"
on public.customers
for all
to authenticated
using (true)
with check (true);

create policy "authenticated users manage orders"
on public.orders
for all
to authenticated
using (true)
with check (true);

create policy "authenticated users manage order items"
on public.order_items
for all
to authenticated
using (true)
with check (true);

create index if not exists customers_name_idx on public.customers (name);
create index if not exists products_active_name_idx on public.products (is_active, name);
create index if not exists orders_order_date_idx on public.orders (order_date desc);
create index if not exists orders_status_idx on public.orders (status);
create index if not exists order_items_order_id_idx on public.order_items (order_id);

insert into public.products (name, description, price, is_active)
values
  ('Susu Original 1L', 'Fresh milk original 1 liter', 18000, true),
  ('Susu Coklat 1L', 'Fresh chocolate milk 1 liter', 20000, true),
  ('Susu Stroberi 1L', 'Fresh strawberry milk 1 liter', 20000, true),
  ('Roti Bakar Coklat', 'Chocolate toast', 12000, true)
on conflict do nothing;

