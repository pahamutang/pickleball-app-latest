-- OPTIONAL. Court 3 is marked "COMING SOON" in the app, so it can't be
-- booked from the screen. This makes the DATABASE refuse Court 3 bookings
-- too (someone calling the API directly could otherwise still book it).
-- Safe to re-run. Only applies to NEW or changed rows.
--
-- WHEN COURT 3 OPENS: run   alter table public.reservations drop constraint reservations_court_open;
-- and remove `comingSoon: true` from Court 3 in src/bookingTypes.ts.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reservations_court_open') then
    alter table public.reservations
      add constraint reservations_court_open
      check (court in ('Court 1', 'Court 2')) not valid;
  end if;
end $$;
