-- ============================================================================
-- DOUBLE-BOOKING PREVENTION — run this in Supabase → SQL Editor → New query.
-- Safe to run multiple times (everything here is idempotent).
--
-- Fixes: the `reservations` table has no server-side rule stopping two
-- overlapping bookings for the same court/date/hour. The app only checked
-- for conflicts client-side, right before insert — a classic race: if two
-- players tap "Reserve" on the same slot within a moment of each other,
-- both can pass that check before either insert lands, and you end up with
-- two paid reservations for the same court and time.
--
-- This adds:
--   1) A BEFORE INSERT/UPDATE trigger that takes a per-(court, date)
--      advisory lock before checking for an overlapping reservation, so
--      concurrent attempts for the same court+date are serialized instead
--      of racing each other. A plain "SELECT then INSERT" check (what the
--      app was doing) can't be made race-safe from the client; this has to
--      live in the database, in the same transaction as the write.
--   2) get_booked_slots(date) — a SECURITY DEFINER RPC that returns just
--      (court, hour, is_paid) for a date, so the availability grid can be
--      built without every player needing full SELECT access to other
--      people's customer_name/notes on the reservations table.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Trigger: prevent_double_booking
-- ----------------------------------------------------------------------------
create or replace function public.prevent_double_booking()
returns trigger
language plpgsql
as $$
declare
  lock_key bigint;
  conflict_id uuid;
  conflict_hours int[];
begin
  -- Serialize concurrent writes for the same court+date. Without this, two
  -- transactions inserting at the same moment could both run the overlap
  -- check below, both see "no conflict" (because neither has committed
  -- yet), and both proceed — the exact race this trigger exists to close.
  -- hashtextextended() gives a stable 64-bit key from the court+date text,
  -- which is what pg_advisory_xact_lock needs; the lock is automatically
  -- released at the end of the transaction (commit or rollback).
  lock_key := hashtextextended(new.court || '|' || new.date::text, 0);
  perform pg_advisory_xact_lock(lock_key);

  select id, hours
    into conflict_id, conflict_hours
  from public.reservations
  where court = new.court
    and date = new.date
    and hours && new.hours          -- array overlap: any shared hour
    and id is distinct from new.id  -- ignore the row being updated, if any
  limit 1;

  if conflict_id is not null then
    raise exception
      'This slot on % (court %) was just booked by someone else. Please choose another time.',
      new.date, new.court
      using errcode = '23505', -- unique_violation, so the client can detect this reliably
            detail = format('conflicting_reservation_id=%s conflicting_hours=%s', conflict_id, conflict_hours);
  end if;

  return new;
end;
$$;

drop trigger if exists reservations_prevent_double_booking on public.reservations;
create trigger reservations_prevent_double_booking
  before insert or update of court, date, hours
  on public.reservations
  for each row
  execute function public.prevent_double_booking();

-- ----------------------------------------------------------------------------
-- 2) get_booked_slots(date) RPC
-- ----------------------------------------------------------------------------
create or replace function public.get_booked_slots(p_date date)
returns table (court text, hour int, is_paid boolean)
language sql
stable
security definer
set search_path = public
as $$
  select r.court, h.hour, r.is_paid
  from public.reservations r,
       unnest(r.hours) as h(hour)
  where r.date = p_date;
$$;

grant execute on function public.get_booked_slots(date) to authenticated;

-- ----------------------------------------------------------------------------
-- 3) Force PostgREST to reload its schema cache so the new function/trigger
--    are picked up immediately instead of after its next restart.
-- ----------------------------------------------------------------------------
notify pgrst, 'reload schema';
