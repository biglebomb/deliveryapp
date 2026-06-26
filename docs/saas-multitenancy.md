# Multi-tenancy + RLS isolation — scope

Turn the single-tenant app into a SaaS where each business (an **organization**)
is isolated at the **database** level via Postgres RLS, not the app. The existing
**branch** becomes a sub-grouping inside an org.

```
organization (tenant)
  └── branches            (existing)
        └── customers, orders, order_items, areas, subscriptions,
            branch_product_prices, branch_packaging_prices, profiles (staff)
```

Assumption: **one user belongs to one organization** (stored on their profile).
Multi-org membership is out of scope.

## 1. Schema

- New `organizations` table: `id, name, created_at` (+ `plan/status` later for billing).
- Add `org_id uuid not null references organizations(id)` to **every tenant table**:
  branches, profiles, customers, orders, order_items, areas, subscriptions,
  branch_product_prices, branch_packaging_prices (and order_inbox if kept).
  - Denormalized onto each table so every RLS check is a simple equality
    (`org_id = current_org_id()`) instead of joining through branches — faster and
    far easier to audit.
- **Backfill** (same safe pattern as the branch_id rollout): create one default org
  for the existing milk business, default all existing rows to it, then set NOT NULL.

## 2. Org context in RLS (the core mechanism)

A `SECURITY DEFINER` helper returns the caller's org, bypassing RLS to avoid
recursion:

```sql
create or replace function public.current_org_id()
returns uuid language sql stable security definer set search_path = public as $$
  select org_id from public.profiles where id = auth.uid()
$$;
```

Every permissive `using (true)` policy is **replaced** with:

```sql
create policy "org isolation" on public.orders
  for all to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());
```

Why this is the whole game: the public anon key shipped in the frontend is only as
powerful as RLS allows. Once policies are org-scoped, a signed-in user of org A
**cannot** read org B's rows — even hitting the REST API directly with their token.

> Scale path (not now): a Supabase **Custom Access Token Hook** can inject `org_id`
> into the JWT so RLS reads `auth.jwt()` with no per-row table lookup. The helper
> function is simpler and fine at this size.

## 3. Insert ergonomics

A `BEFORE INSERT` trigger per tenant table:

```sql
if new.org_id is null then new.org_id := public.current_org_id(); end if;
```

So the app keeps inserting exactly as today; `org_id` auto-fills from the caller.
Kills a whole class of "forgot to stamp the tenant" bugs.

## 4. Signup / org creation

- New `SECURITY DEFINER` RPC `create_organization(name text)`: for the calling new
  user, atomically creates the org, sets their profile `org_id` + role `owner`, and
  creates a first default branch.
- Frontend: a signup screen → on success call the RPC → onboarding.
- Replaces the migration that hardcodes one owner UUID.

## 5. What changes in the current app

- The permissive RLS on every table is replaced (the careful flip).
- `branchContext` stays (active branch *within* the org); branch filtering keeps
  working under the org umbrella.
- Edge functions `create-driver` / `delete-staff`: add an **org check** — a
  caller may only manage staff in their own org (today they're only branch-scoped).
- Seed data (Cikampek/Karawang, products) becomes the milk org's data.

## 6. Isolation tests (the proof + the portfolio signal)

A small Vitest/Node suite that:
1. Seeds two orgs + two users via the admin API.
2. Signs in as each (real JWTs).
3. Asserts A reads only org A's orders/customers; B only org B's.
4. Asserts A cannot select/insert/update org B rows (RLS denies).
5. Asserts anon reads nothing.

This is the artifact that *proves* isolation — exactly what a SaaS-competency
reviewer checks.

## 7. Rollout phases

1. **Schema** — organizations + org_id columns + backfill + helper + insert triggers.
   Low risk (defaults backfill existing rows).
2. **RLS flip** — replace permissive policies with org-scoped ones; run isolation
   tests. The one to get exactly right; test-driven.
3. **Signup** — `create_organization` RPC + onboarding screen.
4. **Edge functions** — scope to org.

(Billing is a separate later step.)

## 8. Risks

- A wrong policy can lock you out of your own data → **do this on a Supabase preview
  branch / staging first**, not directly on the production DB you use daily.
- RLS recursion if the helper isn't `SECURITY DEFINER` (avoided above).
- Missing a table = a leak → enumerate every `public` table; RLS on, default-deny,
  no leftover permissive policy.
- The migration stays reversible (re-adding permissive policies restores the old
  behavior) until signup exists.
