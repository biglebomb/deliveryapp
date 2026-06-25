-- Driver mileage tracking + per-branch reimbursement rates.

-- Best-effort GPS captured when the driver starts a stop and marks it delivered
-- (foreground taps, so geolocation works). Used for mileage estimation and as
-- proof-of-presence. Mileage falls back to the customer's saved location when a
-- point wasn't captured.
alter table public.orders
  add column if not exists started_at timestamptz,
  add column if not exists start_lat numeric(9, 6),
  add column if not exists start_lng numeric(9, 6),
  add column if not exists delivered_lat numeric(9, 6),
  add column if not exists delivered_lng numeric(9, 6);

-- Per-branch reimbursement components (one rate per metric; 0 = disabled). A
-- driver's payout for a period is the sum across metrics:
--   km driven    × reimburse_per_km
--   deliveries   × reimburse_per_delivery
--   units sold   × reimburse_per_unit
--   revenue      × reimburse_revenue_pct / 100
alter table public.branches
  add column if not exists reimburse_per_km numeric(12, 2) not null default 0 check (reimburse_per_km >= 0),
  add column if not exists reimburse_per_delivery numeric(12, 2) not null default 0 check (reimburse_per_delivery >= 0),
  add column if not exists reimburse_per_unit numeric(12, 2) not null default 0 check (reimburse_per_unit >= 0),
  add column if not exists reimburse_revenue_pct numeric(6, 3) not null default 0 check (reimburse_revenue_pct >= 0);
