-- Run in Supabase -> SQL Editor. Makes sure live updates work for bookings.
-- Safe to re-run.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reservations'
  ) then
    alter publication supabase_realtime add table public.reservations;
  end if;
end $$;

-- Should return one row: reservations
select tablename from pg_publication_tables
where pubname = 'supabase_realtime' and tablename = 'reservations';
