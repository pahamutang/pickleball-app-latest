-- Patch script for an EXISTING database (safe to re-run — every statement
-- is idempotent).
--
-- Problem: `reservations_select_all` (from supabase_reservations_migration.sql
-- / supabase_fix_migration.sql) lets ANY signed-in user — owner or player —
-- read every column of every reservation row, including `customer_name`
-- and `notes` for bookings made by other people.
--
-- The double-booking migration (supabase_double_booking_migration.sql)
-- already added `get_booked_slots(date)`, a SECURITY DEFINER RPC that
-- returns just (court, hour, is_paid) for a date — specifically so the
-- availability grid could be built "without every player needing full
-- SELECT access to other people's customer_name/notes," per its own
-- comment. But the app never actually switched to using it, and the
-- table's SELECT policy was never tightened to match — so every player
-- account has, this whole time, been able to read every other customer's
-- full name and notes for every date, straight off the `reservations`
-- table, regardless of what the booking screen chooses to display.
--
-- This finishes that fix:
--   1) Restricts full-row SELECT on `reservations` to the owner, or a
--      row's own creator. A player reading their own bookings still works
--      exactly as before; reading anyone else's no longer does.
--   2) The app (BookingContext.tsx) now gets park-wide availability via
--      get_booked_slots(date) instead of scanning the full table, so the
--      grid still shows every taken slot correctly — just without names
--      or notes attached for anyone else's booking.
--
-- Depends on `public.is_owner()` from supabase_profiles_recursion_fix.sql
-- — run that one first if you haven't already.

drop policy if exists "reservations_select_all" on public.reservations;
drop policy if exists "reservations_select_owner_or_own" on public.reservations;
create policy "reservations_select_owner_or_own"
  on public.reservations for select
  to authenticated
  using (
    created_by = auth.uid()
    or public.is_owner()
  );

-- Force PostgREST to pick up the new policy immediately.
notify pgrst, 'reload schema';
