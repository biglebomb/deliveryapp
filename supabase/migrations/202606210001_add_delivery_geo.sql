alter table public.orders add column if not exists latitude numeric(9, 6);
alter table public.orders add column if not exists longitude numeric(9, 6);
alter table public.orders add column if not exists delivery_area text;

alter table public.customers add column if not exists latitude numeric(9, 6);
alter table public.customers add column if not exists longitude numeric(9, 6);

create index if not exists orders_location_idx on public.orders (latitude, longitude);
