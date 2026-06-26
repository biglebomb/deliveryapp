-- Multi-tenancy Phase 1: additive foundation only. Adds an organizations layer
-- above branches, stamps org_id on every tenant table (backfilled to the existing
-- milk business), a current_org_id() helper, and triggers that auto-fill org_id
-- on insert. RLS policies are NOT changed here — everything stays permissive, so
-- current behaviour is identical. The org-scoped policy flip is Phase 2.

-- 1. Organizations (the tenant root). The existing business is seeded as one org.
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

insert into public.organizations (id, name)
values ('dbc20b52-88a6-4a2c-b70f-f11cca93f19d', 'Fresh Milk')
on conflict (id) do nothing;

alter table public.organizations enable row level security;
create policy "authenticated users manage organizations"
on public.organizations for all to authenticated using (true) with check (true);

-- 2. Add org_id to every tenant table. NOT NULL DEFAULT backfills existing rows to
-- the milk org; the default is then dropped so future inserts go through the
-- trigger (added below). Catalog tables (products, packaging) become per-org too.
do $$
declare
  t text;
  tenant_tables text[] := array[
    'branches', 'profiles', 'customers', 'orders', 'order_items', 'areas',
    'subscriptions', 'products', 'packaging_options',
    'branch_product_prices', 'branch_packaging_prices', 'order_inbox'
  ];
begin
  foreach t in array tenant_tables loop
    execute format(
      'alter table public.%I add column if not exists org_id uuid not null
         default ''dbc20b52-88a6-4a2c-b70f-f11cca93f19d'' references public.organizations(id)',
      t
    );
    execute format('alter table public.%I alter column org_id drop default', t);
    execute format('create index if not exists %I on public.%I (org_id)', t || '_org_idx', t);
  end loop;
end $$;

-- 3. The caller's org, read from their profile. SECURITY DEFINER so it bypasses
-- RLS (no recursion) once Phase 2 policies land.
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.profiles where id = auth.uid()
$$;

-- 4. Auto-stamp org_id on insert: the caller's org, falling back to the milk org
-- for service-role inserts (edge functions) where there's no JWT user. The
-- fallback is a single-org-era safety net and is removed when signup lands.
create or replace function public.set_org_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.org_id is null then
    new.org_id := coalesce(public.current_org_id(), 'dbc20b52-88a6-4a2c-b70f-f11cca93f19d');
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
  tenant_tables text[] := array[
    'branches', 'profiles', 'customers', 'orders', 'order_items', 'areas',
    'subscriptions', 'products', 'packaging_options',
    'branch_product_prices', 'branch_packaging_prices', 'order_inbox'
  ];
begin
  foreach t in array tenant_tables loop
    execute format('drop trigger if exists set_org_id on public.%I', t);
    execute format(
      'create trigger set_org_id before insert on public.%I
         for each row execute function public.set_org_id()',
      t
    );
  end loop;
end $$;
