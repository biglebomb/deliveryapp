create table if not exists public.order_inbox (
  id uuid primary key default gen_random_uuid(),
  raw_text text,
  parsed jsonb,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  sender text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists order_inbox_status_idx on public.order_inbox (status, created_at desc);

alter table public.order_inbox enable row level security;

create policy "authenticated users manage order inbox"
on public.order_inbox
for all
to authenticated
using (true)
with check (true);
