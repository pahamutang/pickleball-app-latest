-- Patch script for an EXISTING database (safe to re-run — every statement
-- is idempotent).
--
-- Reverses the READ restriction added by
-- supabase_reservation_privacy_fix_migration.sql: that migration limited
-- full-row SELECT (customer_name, notes, etc.) to the owner or a row's
-- own creator, so players couldn't see who booked a court they didn't
-- book themselves.
--
-- New requirement: every signed-in account — owner or player — should be
-- able to see every reservation in full, including who booked it,
-- whether it was the owner or another player. They just still can't
-- DO anything about someone else's booking.
--
-- This migration ONLY widens SELECT. It does not touch the write
-- policies (reservations_insert_own, reservations_update_own,
-- reservations_update_owner_only, reservations_delete_owner_or_own) —
-- those still restrict cancelling/editing/marking-paid to the owner or
-- the row's own creator, exactly as before. The app's UI already hides
-- the Cancel button and payment toggle for anyone who isn't allowed to
-- use them (see canCancel/togglePaid in BookingScreen.tsx), and RLS
-- enforces the same rule server-side either way.

drop policy if exists "reservations_select_owner_or_own" on public.reservations;
drop policy if exists "reservations_select_all" on public.reservations;
create policy "reservations_select_all"
  on public.reservations for select
  to authenticated
  using (true);

-- Force PostgREST to pick up the new policy immediately.
notify pgrst, 'reload schema';
