create table if not exists public.packaging_options (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric(12, 2) not null default 0 check (price >= 0),
  is_active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_packaging_options_updated_at on public.packaging_options;
create trigger set_packaging_options_updated_at
before update on public.packaging_options
for each row execute function public.set_updated_at();

alter table public.packaging_options enable row level security;

create policy "authenticated users manage packaging options"
on public.packaging_options
for all
to authenticated
using (true)
with check (true);

-- Per-line packaging snapshot on order items (stable when prices change later).
alter table public.order_items add column if not exists packaging_id uuid references public.packaging_options(id) on delete set null;
alter table public.order_items add column if not exists packaging_name_snapshot text;
alter table public.order_items add column if not exists packaging_fee_snapshot numeric(12, 2) not null default 0 check (packaging_fee_snapshot >= 0);

insert into public.packaging_options (name, price, is_active, is_default)
values
  ('Plastik', 0, true, true),
  ('Botol', 5000, true, false)
on conflict do nothing;
