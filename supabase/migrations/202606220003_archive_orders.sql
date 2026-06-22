-- Archiving lets the owner clear finished (delivered) orders out of the active
-- Orders list without losing them — reports still read archived rows for history.
alter table orders add column if not exists archived_at timestamptz;

create index if not exists orders_archived_at_idx on orders (archived_at);
