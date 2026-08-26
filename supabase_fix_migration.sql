-- ============================================================================
-- FIX MIGRATION — run this in Supabase → SQL Editor → New query.
-- Safe to run multiple times (everything here is idempotent).
--
-- Fixes two bugs:
--
-- 1) "Could not find the table 'public.reservations' in the schema cache"
--    when tapping Reserve Court.
--    → The `reservations` table (from supabase_reservations_migration.sql)
--      was never created in THIS project, or PostgREST's cache hasn't
--      picked it up yet. This script (re)creates it and forces a cache
--      reload at the end.
--
-- 2) A partial cash payment logged as "Pending" doesn't stay logged.
--    → The `payments` table's CHECK constraint on `status` was created
--      before 'pending' existed as a valid value (only 'paid'/'failed'
--      were allowed), so every write with status = 'pending' was
--      silently rejected by Postgres. The app showed "Logged as Pending"
--      locally for a moment, then reverted the next time it re-synced —
--      because the write never actually made it into the database. This
--      script replaces that constraint with one that allows
--      'paid' | 'pending' | 'failed', matching the app's PaymentStatus type.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) payments — create if missing, and normalize the status constraint
--    regardless of what it currently is.
-- ----------------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  player_id uuid,
  description text not null,
  amount numeric not null default 0,
  method text not null default 'Cash',
  status text not null default 'pending',
  date timestamptz not null default now(),
  items jsonb,
  created_at timestamptz not null default now()
);

alter table public.payments enable row level security;

-- Drop whatever CHECK constraint currently exists on `status` (whatever
-- it's named, and whatever values it currently allows) and replace it
-- with the one the app actually needs.
do $$
declare
  con record;
begin
  if to_regclass('public.payments') is not null then
    for con in
      select conname
      from pg_constraint
      where conrelid = 'public.payments'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%status%'
    loop
      execute format('alter table public.payments drop constraint %I', con.conname);
    end loop;

    alter table public.payments
      add constraint payments_status_check
      check (status in ('paid', 'pending', 'failed'));
  end if;
end $$;

-- Everyone signed in can read the shared payment log (owner + players).
drop policy if exists "payments_select_all" on public.payments;
create policy "payments_select_all"
  on public.payments for select
  to authenticated
  using (true);

-- Everyone signed in can insert/update/delete — mirrors how the app
-- already treats this table (owner collects cash, players' own chips
-- can mark their own items paid). Tighten later if you want players
-- restricted to their own rows.
drop policy if exists "payments_insert_all" on public.payments;
create policy "payments_insert_all"
  on public.payments for insert
  to authenticated
  with check (true);

drop policy if exists "payments_update_all" on public.payments;
create policy "payments_update_all"
  on public.payments for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "payments_delete_all" on public.payments;
create policy "payments_delete_all"
  on public.payments for delete
  to authenticated
  using (true);

-- Add to realtime publication if not already there.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'payments'
  ) then
    alter publication supabase_realtime add table public.payments;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2) reservations — (re)create exactly as in
--    supabase_reservations_migration.sql, but safe to re-run.
-- ----------------------------------------------------------------------------
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

drop policy if exists "reservations_select_all" on public.reservations;
create policy "reservations_select_all"
  on public.reservations for select
  to authenticated
  using (true);

drop policy if exists "reservations_insert_own" on public.reservations;
create policy "reservations_insert_own"
  on public.reservations for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists "reservations_update_owner_only" on public.reservations;
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

drop policy if exists "reservations_delete_owner_or_own" on public.reservations;
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

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reservations'
  ) then
    alter publication supabase_realtime add table public.reservations;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 3) Force PostgREST to reload its schema cache. This is the actual fix for
--    "Could not find the table ... in the schema cache" when the table DOES
--    exist but was created/altered after PostgREST last started up.
-- ----------------------------------------------------------------------------
notify pgrst, 'reload schema';
