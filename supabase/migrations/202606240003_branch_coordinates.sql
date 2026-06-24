-- Per-branch map coordinates, so every map opens centered on the branch
-- (drawing an area for Cikampek defaults to Cikampek, not Jakarta).
alter table public.branches
  add column if not exists latitude numeric(9, 6),
  add column if not exists longitude numeric(9, 6);

-- Seed approximate town centers for the existing branches; refine via the map
-- picker on the Branches page.
update public.branches set latitude = -6.419400, longitude = 107.451500
  where name = 'Cikampek' and latitude is null;
update public.branches set latitude = -6.322700, longitude = 107.337600
  where name = 'Karawang' and latitude is null;
