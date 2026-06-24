-- One-time, order-level delivery fee, added once to the order total (unlike
-- packaging, which is per-unit per-line). Defaults resolve area-first then
-- branch: an order uses its area's fee when set, otherwise the branch default.

alter table public.orders
  add column if not exists delivery_fee numeric(12, 2) not null default 0 check (delivery_fee >= 0);

-- Per-branch default delivery fee.
alter table public.branches
  add column if not exists delivery_fee numeric(12, 2) not null default 0 check (delivery_fee >= 0);

-- Per-area override; null means "use the branch default".
alter table public.areas
  add column if not exists delivery_fee numeric(12, 2) check (delivery_fee >= 0);
