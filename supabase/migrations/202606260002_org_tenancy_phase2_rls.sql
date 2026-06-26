-- Multi-tenancy Phase 2: the RLS flip. Replace every permissive `using (true)`
-- policy with org-scoped isolation: a row is visible/writable only when its
-- org_id matches the caller's org (current_org_id()). Service-role access
-- (edge functions) bypasses RLS and is unaffected.
--
-- For the single existing org this is transparent — all milk data has the milk
-- org_id, so the owner still sees everything. Isolation only bites once a second
-- org exists (see tests/rls-isolation.test.mjs).

do $$
declare
  t text;
  pol record;
  tenant_tables text[] := array[
    'branches', 'profiles', 'customers', 'orders', 'order_items', 'areas',
    'subscriptions', 'products', 'packaging_options',
    'branch_product_prices', 'branch_packaging_prices', 'order_inbox'
  ];
begin
  foreach t in array tenant_tables loop
    -- Drop whatever policies exist (names vary across earlier migrations).
    for pol in
      select policyname from pg_policies where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, t);
    end loop;

    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "org isolation" on public.%I
         for all to authenticated
         using (org_id = public.current_org_id())
         with check (org_id = public.current_org_id())',
      t
    );
  end loop;
end $$;

-- Ensure the API roles have table grants on every tenant table (some migration-
-- created tables don't inherit them depending on the environment's default
-- privileges). RLS still gates the rows; this only fixes table-level access.
grant all on public.organizations to anon, authenticated, service_role;
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
    execute format('grant all on public.%I to anon, authenticated, service_role', t);
  end loop;
end $$;

-- Organizations: a user sees and edits only their own org.
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies where schemaname = 'public' and tablename = 'organizations'
  loop
    execute format('drop policy if exists %I on public.organizations', pol.policyname);
  end loop;
end $$;

alter table public.organizations enable row level security;
create policy "own organization" on public.organizations
  for all to authenticated
  using (id = public.current_org_id())
  with check (id = public.current_org_id());
