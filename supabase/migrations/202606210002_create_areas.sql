create table if not exists public.areas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text,
  polygon jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_areas_updated_at on public.areas;
create trigger set_areas_updated_at
before update on public.areas
for each row execute function public.set_updated_at();

alter table public.areas enable row level security;

create policy "authenticated users manage areas"
on public.areas
for all
to authenticated
using (true)
with check (true);
