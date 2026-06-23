-- Track WHEN an order was actually delivered and paid, not just its status.
-- "Today's sales" should count revenue on the delivery day, even if the order
-- was created the night before.

alter table public.orders
  add column if not exists delivered_at timestamptz,
  add column if not exists paid_at timestamptz;

-- Backfill existing rows from the best available proxy so historical figures
-- aren't lost. archived_at is set when a delivered order is cleared; otherwise
-- the last update is the closest signal we have.
update public.orders
  set delivered_at = coalesce(archived_at, updated_at)
  where status = 'delivered' and delivered_at is null;

update public.orders
  set paid_at = updated_at
  where payment_status = 'paid' and paid_at is null;

create index if not exists orders_delivered_at_idx on public.orders (delivered_at);
create index if not exists orders_paid_at_idx on public.orders (paid_at);
