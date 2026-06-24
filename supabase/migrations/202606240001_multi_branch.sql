-- Multi-branch (multi-tenant) support.
--
-- One business, several outlets. All domain rows carry a branch_id; the owner
-- sees/aggregates across branches, staff are scoped to theirs (enforced in the
-- app for now — see the app-layer scoping work; DB-level RLS hardening is a
-- planned follow-up). Catalog (products, packaging) stays global/shared, but
-- price is per-branch via override tables.
--
-- Every branch_id defaults to the existing Cikampek branch and is NOT NULL, so
-- this migration backfills existing rows automatically and no current insert
-- path (app or WhatsApp bot) breaks before the app starts setting it explicitly.

-- Fixed ids so backfill, app config, and the bot can reference branches stably.
-- 8d287342… = Cikampek (existing outlet), dc816ed0… = Karawang (new outlet).

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_branches_updated_at on public.branches;
create trigger set_branches_updated_at
before update on public.branches
for each row execute function public.set_updated_at();

alter table public.branches enable row level security;

create policy "authenticated users manage branches"
on public.branches
for all
to authenticated
using (true)
with check (true);

insert into public.branches (id, name)
values
  ('8d287342-63be-47df-b078-3dd769e17c9b', 'Cikampek'),
  ('dc816ed0-406e-4518-aecd-390305badc4e', 'Karawang')
on conflict (id) do nothing;

-- Add branch_id to every tenant-scoped table. The NOT NULL DEFAULT fills all
-- existing rows with Cikampek and keeps legacy inserts working.
alter table public.customers
  add column if not exists branch_id uuid not null
  default '8d287342-63be-47df-b078-3dd769e17c9b' references public.branches(id);

alter table public.orders
  add column if not exists branch_id uuid not null
  default '8d287342-63be-47df-b078-3dd769e17c9b' references public.branches(id);

alter table public.areas
  add column if not exists branch_id uuid not null
  default '8d287342-63be-47df-b078-3dd769e17c9b' references public.branches(id);

alter table public.subscriptions
  add column if not exists branch_id uuid not null
  default '8d287342-63be-47df-b078-3dd769e17c9b' references public.branches(id);

alter table public.order_inbox
  add column if not exists branch_id uuid not null
  default '8d287342-63be-47df-b078-3dd769e17c9b' references public.branches(id);

-- Which branch a staff member belongs to (owner spans all, so the value is
-- informational for owners; admins/drivers are scoped to it by the app).
alter table public.profiles
  add column if not exists branch_id uuid not null
  default '8d287342-63be-47df-b078-3dd769e17c9b' references public.branches(id);

create index if not exists customers_branch_idx on public.customers (branch_id);
create index if not exists orders_branch_idx on public.orders (branch_id);
create index if not exists areas_branch_idx on public.areas (branch_id);
create index if not exists subscriptions_branch_idx on public.subscriptions (branch_id);
create index if not exists order_inbox_branch_idx on public.order_inbox (branch_id);
create index if not exists profiles_branch_idx on public.profiles (branch_id);

-- Per-branch price overrides over the shared catalog. A branch's effective price
-- is its override row, falling back to the catalog base price when absent.
create table if not exists public.branch_product_prices (
  branch_id uuid not null references public.branches(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  price numeric(12, 2) not null check (price >= 0),
  updated_at timestamptz not null default now(),
  primary key (branch_id, product_id)
);

create table if not exists public.branch_packaging_prices (
  branch_id uuid not null references public.branches(id) on delete cascade,
  packaging_id uuid not null references public.packaging_options(id) on delete cascade,
  price numeric(12, 2) not null check (price >= 0),
  updated_at timestamptz not null default now(),
  primary key (branch_id, packaging_id)
);

alter table public.branch_product_prices enable row level security;
alter table public.branch_packaging_prices enable row level security;

create policy "authenticated users manage branch product prices"
on public.branch_product_prices for all to authenticated using (true) with check (true);

create policy "authenticated users manage branch packaging prices"
on public.branch_packaging_prices for all to authenticated using (true) with check (true);

-- Seed both branches with the current catalog prices so existing pricing is
-- preserved and Karawang starts from a sensible baseline (editable per branch).
insert into public.branch_product_prices (branch_id, product_id, price)
select b.id, p.id, p.price
from public.branches b cross join public.products p
on conflict (branch_id, product_id) do nothing;

insert into public.branch_packaging_prices (branch_id, packaging_id, price)
select b.id, o.id, o.price
from public.branches b cross join public.packaging_options o
on conflict (branch_id, packaging_id) do nothing;

-- Introduce the owner role (superset of admin: full app + cross-branch view).
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('owner', 'admin', 'driver'));

update public.profiles
set role = 'owner'
where id = '32248a1e-a06b-46a2-8295-9aa24d8c4b0e';
