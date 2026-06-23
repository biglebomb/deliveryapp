-- Prepaid subscriptions: a customer pays upfront for N deliveries of a fixed
-- set of items, delivered on chosen weekdays. Each generated order counts the
-- balance down by one and is marked paid. When the balance hits zero the
-- subscription completes and the owner can renew.

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  -- snapshot of the recurring line items:
  -- [{ product_id, product_name, unit_price, quantity, packaging_id, packaging_name, packaging_fee }]
  items jsonb not null,
  -- JS getDay() convention: 0 = Sunday .. 6 = Saturday
  weekdays int[] not null,
  deliveries_total int not null check (deliveries_total > 0),
  deliveries_used int not null default 0 check (deliveries_used >= 0),
  price_per_delivery numeric(12, 2) not null default 0,
  amount_paid numeric(12, 2) not null default 0,
  delivery_notes text,
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'cancelled')),
  start_date date not null default current_date,
  -- guards generation so a subscription cannot produce two orders on the same day
  last_generated_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_status_idx on public.subscriptions (status);
create index if not exists subscriptions_customer_idx on public.subscriptions (customer_id);

drop trigger if exists set_subscriptions_updated_at on public.subscriptions;
create trigger set_subscriptions_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();

-- Link generated orders back to their subscription (null for one-off orders).
alter table public.orders
  add column if not exists subscription_id uuid references public.subscriptions(id) on delete set null;

create index if not exists orders_subscription_id_idx on public.orders (subscription_id);

alter table public.subscriptions enable row level security;

create policy "authenticated users manage subscriptions"
on public.subscriptions
for all
to authenticated
using (true)
with check (true);
