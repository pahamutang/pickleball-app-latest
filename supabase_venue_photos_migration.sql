-- ============================================================================
-- VENUE PHOTOS — run this in Supabase → SQL Editor → New query.
-- Safe to run multiple times (everything here is idempotent).
--
-- Lets the owner replace the court photos shown at the top of the booking
-- screen from inside the app (no more rebuilding with new files in
-- assets/venue). Every device — owner and players alike — reads the same
-- rows, and a realtime subscription (see VenuePhotosContext.tsx) means a
-- change the owner makes shows up on every player's screen automatically,
-- the same way reservations already do.
--
-- Two parts: a public storage bucket to hold the actual image files, and
-- a table that lists which ones are currently shown and in what order.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Storage bucket — public read (so <Image> can load the photo straight
--    from its public URL, same as any other image in the app), writes
--    restricted to the owner via the policies below.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('venue-photos', 'venue-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "venue_photos_storage_select_public" on storage.objects;
create policy "venue_photos_storage_select_public"
  on storage.objects for select
  to public
  using (bucket_id = 'venue-photos');

drop policy if exists "venue_photos_storage_insert_owner" on storage.objects;
create policy "venue_photos_storage_insert_owner"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'venue-photos'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'owner'
    )
  );

drop policy if exists "venue_photos_storage_delete_owner" on storage.objects;
create policy "venue_photos_storage_delete_owner"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'venue-photos'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'owner'
    )
  );

-- ----------------------------------------------------------------------------
-- 2) venue_photos — one row per photo currently shown in the carousel.
--    `position` controls display order (lowest first); `storage_path` is
--    what gets passed to storage.remove() when a photo is deleted so the
--    file doesn't outlive its row.
-- ----------------------------------------------------------------------------
create table if not exists public.venue_photos (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,
  url text not null,
  position int not null default 0,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.venue_photos enable row level security;

-- Backfill: earlier versions of this table let every row default to
-- position 0. Spread any such rows out by insertion order before the
-- uniqueness constraint below is added, so it doesn't fail on existing data.
with ordered as (
  select id, row_number() over (order by position asc, created_at asc) - 1 as rn
  from public.venue_photos
)
update public.venue_photos v
set position = ordered.rn
from ordered
where v.id = ordered.id and v.position <> ordered.rn;

-- Guarantees the app's "one row per slide position" assumption at the DB
-- level too — belt-and-suspenders alongside the client-side insert/update
-- branching in setSlidePhoto, so even a rapid double-tap can't leave two
-- rows claiming the same slide.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'venue_photos_position_unique'
  ) then
    alter table public.venue_photos add constraint venue_photos_position_unique unique (position);
  end if;
end $$;

-- Everyone signed in can see the current photo set — players included,
-- since it's their carousel too.
drop policy if exists "venue_photos_select_all" on public.venue_photos;
create policy "venue_photos_select_all"
  on public.venue_photos for select
  to authenticated
  using (true);

-- Only the owner can add, reorder, or remove photos.
drop policy if exists "venue_photos_insert_owner" on public.venue_photos;
create policy "venue_photos_insert_owner"
  on public.venue_photos for insert
  to authenticated
  with check (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'owner'
  ));

drop policy if exists "venue_photos_update_owner" on public.venue_photos;
create policy "venue_photos_update_owner"
  on public.venue_photos for update
  to authenticated
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'owner'
  ))
  with check (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'owner'
  ));

drop policy if exists "venue_photos_delete_owner" on public.venue_photos;
create policy "venue_photos_delete_owner"
  on public.venue_photos for delete
  to authenticated
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'owner'
  ));

-- Let every device subscribe to live changes, so a photo the owner adds
-- or removes appears/disappears on player devices without a manual
-- refresh — same mechanism as `reservations` and `payments`.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'venue_photos'
  ) then
    alter publication supabase_realtime add table public.venue_photos;
  end if;
end $$;

notify pgrst, 'reload schema';
