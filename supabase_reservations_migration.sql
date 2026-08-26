-- Run this in the Supabase SQL editor (Project → SQL Editor → New query).
-- Adds a shared, realtime `reservations` table so court bookings made by
-- players show up for the owner (and vice versa) instead of living only
-- in that one device's local storage.
--
-- Assumes the `profiles` table from your existing setup already exists,
-- with a `role` column of 'owner' | 'player'.

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  court text not null,
  date date not null,
  hours int[] not null,
  players int not null default 2,
  notes text not null default '',
  is_paid boolean not null default false,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.reservations enable row level security;

-- Everyone signed in can see the availability grid (who booked what,
-- when) — needed so players can tell which slots are free.
create policy "reservations_select_all"
  on public.reservations for select
  to authenticated
  using (true);

-- A signed-in user (owner or player) can create a reservation, but only
-- ever as themselves — the client can't insert a booking "as" someone
-- else's account.
create policy "reservations_insert_own"
  on public.reservations for insert
  to authenticated
  with check (created_by = auth.uid());

-- Only the owner can edit an existing reservation (e.g. mark it paid,
-- change slots on someone's behalf).
create policy "reservations_update_owner_only"
  on public.reservations for update
  to authenticated
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'owner'
  ))
  with check (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'owner'
  ));

-- Cancelling: the owner can cancel anything; a player can only cancel a
-- reservation they created themselves.
create policy "reservations_delete_owner_or_own"
  on public.reservations for delete
  to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'owner'
    )
  );

-- Let the app subscribe to live changes (new bookings, cancellations,
-- paid-status flips) the same way it already does for `players`.
alter publication supabase_realtime add table public.reservations;
