create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  role text not null default 'driver' check (role in ('admin', 'driver')),
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "authenticated users manage profiles"
on public.profiles
for all
to authenticated
using (true)
with check (true);

-- Auto-create a profile (default role driver) whenever an auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', new.email), 'driver')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Backfill existing users, then promote the owner account to admin.
insert into public.profiles (id, name, role)
select id, coalesce(raw_user_meta_data ->> 'name', email), 'driver'
from auth.users
on conflict (id) do nothing;

update public.profiles
set role = 'admin', name = coalesce(name, 'Admin')
where id = '32248a1e-a06b-46a2-8295-9aa24d8c4b0e';

alter table public.orders add column if not exists assigned_driver_id uuid references auth.users(id) on delete set null;
alter table public.orders add column if not exists payment_method text check (payment_method in ('cash', 'qris', 'transfer', 'other'));

create index if not exists orders_assigned_driver_idx on public.orders (assigned_driver_id);
