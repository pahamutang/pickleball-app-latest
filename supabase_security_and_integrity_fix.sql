-- ============================================================================
-- SECURITY + INTEGRITY FIXES — run in Supabase -> SQL Editor -> New query.
-- Safe to run multiple times (idempotent). Run it AFTER the other migrations.
--
-- 1) PRIVILEGE ESCALATION: `profiles_update_own` let any signed-in user
--    UPDATE their own profiles row — including the `role` column. Anyone
--    could open the API and set role = 'owner', bypassing the owner PIN.
--    Fix: users may only update display_name. Role changes still work
--    through claim_owner_role(), which is SECURITY DEFINER.
--
-- 2) PAYMENTS WIDE OPEN: supabase_fix_migration.sql created
--    payments_select/insert/update/delete_all policies with `using (true)`.
--    Policies are OR'd together, so the owner-only policy added later was
--    meaningless — every player account could read, edit and delete the
--    whole payment log. Fix: drop the *_all policies (owner policy stays).
--
-- 3) Double-booking trigger now runs SECURITY DEFINER so its overlap check
--    always sees every reservation regardless of RLS.
--
-- 4) Basic sanity constraints on reservations.hours / players.
-- ============================================================================

-- 1) profiles: only display_name is user-editable ---------------------------
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

-- Belt and braces: even if someone re-grants column access later, block a
-- role change unless it comes from the SECURITY DEFINER claim function
-- (which runs as the function owner, not as 'authenticated').
create or replace function public.block_role_change()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role
     and current_user in ('authenticated', 'anon') then
    raise exception 'Role can only be changed through claim_owner_role().';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_block_role_change on public.profiles;
create trigger profiles_block_role_change
  before update of role on public.profiles
  for each row execute function public.block_role_change();

-- 2) payments: owner only ----------------------------------------------------
drop policy if exists "payments_select_all" on public.payments;
drop policy if exists "payments_insert_all" on public.payments;
drop policy if exists "payments_update_all" on public.payments;
drop policy if exists "payments_delete_all" on public.payments;

-- (re)assert the owner policy in case supabase_profiles_recursion_fix.sql
-- was never run
create or replace function public.is_owner()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'owner');
$$;

alter table public.payments enable row level security;
drop policy if exists "owner full access to payments" on public.payments;
create policy "owner full access to payments" on public.payments
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- 3) double-booking trigger: see every row, whatever RLS says -----------------
alter function public.prevent_double_booking() security definer;
alter function public.prevent_double_booking() set search_path = public;

-- 4) sanity constraints (NOT VALID = only checked for new/changed rows, so
--    existing data can't make this script fail) -------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reservations_hours_valid') then
    alter table public.reservations
      add constraint reservations_hours_valid
      check (cardinality(hours) > 0 and hours <@ array[7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22]) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reservations_players_valid') then
    alter table public.reservations
      add constraint reservations_players_valid
      check (players between 1 and 200) not valid;
  end if;
end $$;

notify pgrst, 'reload schema';
