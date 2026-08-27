-- Patch script for an EXISTING database (safe to re-run — every statement
-- is idempotent).
--
-- Problem: booking another court (or another time on the same court, same
-- day) always inserted a brand new `reservations` row, even if that same
-- person already had one for that exact court + date. Result: "My
-- Reservations" filled up with a separate card per booking action instead
-- of one growing reservation — annoying to review whether or not the
-- earlier booking was paid yet.
--
-- Fix (app-side): when a player selects more hours for a court+date they
-- already have an active reservation on, the app now UPDATEs that existing
-- row's `hours` (merging the new hours in) instead of INSERTing a new one.
--
-- That requires a DB change too: `reservations_update_owner_only` (from
-- supabase_reservations_migration.sql) only lets the *owner* run UPDATE —
-- a player updating their own row was previously blocked outright by RLS,
-- which would have made this merge silently fail for the exact people who
-- most need it (players booking themselves).
--
-- Depends on `public.is_owner()` from supabase_profiles_recursion_fix.sql
-- — run that one first if you haven't already.
--
-- This adds a second, narrower UPDATE policy for players, plus a trigger
-- that enforces the "narrower" part: even though the policy grants access
-- to the whole row, the trigger blocks a non-owner from changing anything
-- other than `hours`, `players`, and `notes` on their own row — court,
-- date, customer_name, is_paid, and created_by stay owner-only to change.
-- Without that trigger, a player could technically mark their own
-- reservation `is_paid = true` themselves, which is exactly the kind of
-- bug this needs to avoid.

-- ============================================================
-- 1) Let a player UPDATE a reservation they created themselves
-- ============================================================
drop policy if exists "reservations_update_own" on public.reservations;
create policy "reservations_update_own"
  on public.reservations for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- ============================================================
-- 2) Trigger: non-owners may only change hours/players/notes on their
--    own row. Owner is unrestricted (still needs to edit anything,
--    including marking paid, on anyone's behalf).
-- ============================================================
create or replace function public.restrict_reservation_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Reuses the SECURITY DEFINER is_owner() from
  -- supabase_profiles_recursion_fix.sql (must have been run already) so
  -- this check bypasses RLS on `profiles` the same safe way, rather than
  -- re-querying it directly here and risking the same recursion class of
  -- bug that fix addressed.
  if public.is_owner() then
    return new;
  end if;

  if new.created_by <> old.created_by then
    raise exception 'You can only update your own reservation.';
  end if;
  if new.court <> old.court
     or new.date <> old.date
     or new.customer_name <> old.customer_name
     or new.is_paid <> old.is_paid then
    raise exception 'Only the owner can change the court, date, customer name, or paid status of a reservation.';
  end if;

  return new;
end;
$$;

drop trigger if exists reservations_restrict_update on public.reservations;
create trigger reservations_restrict_update
  before update
  on public.reservations
  for each row
  execute function public.restrict_reservation_update();

-- Force PostgREST to pick up the new policy/trigger immediately.
notify pgrst, 'reload schema';
