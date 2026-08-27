-- Patch script for an EXISTING database (safe to re-run — every statement
-- is idempotent). Covers two things:
--
-- Part 1: "infinite recursion detected in policy for relation 'profiles'"
--   The "owner reads all profiles" policy checked the caller's role by
--   querying `profiles` from inside a policy ON `profiles` — so checking
--   the policy re-triggered the same policy, forever. Fixed by doing that
--   check inside a SECURITY DEFINER function, which is allowed to bypass
--   RLS on the table it queries, breaking the loop.
--   (If you already ran this part before, it's a no-op — safe to re-run.)
--
-- Part 2: Switch players from claim-code linking to self-join.
--   Players used to enter a 6-character code (shown on their PlayerCard
--   in the owner's app) to link their account. That's gone now — players
--   just add themselves directly from JoinSessionScreen, so this adds the
--   INSERT policy that lets them do that, and drops the now-unused
--   claim_code column and claim_player() function.

-- ============================================================
-- Part 1: is_owner() recursion fix
-- ============================================================
create or replace function public.is_owner()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'owner'
  );
$$;

drop policy if exists "owner reads all profiles" on profiles;
create policy "owner reads all profiles" on profiles
  for select using (public.is_owner());

drop policy if exists "owner full access to players" on players;
create policy "owner full access to players" on players
  for all using (public.is_owner());

drop policy if exists "owner full access to order_items" on order_items;
create policy "owner full access to order_items" on order_items
  for all using (public.is_owner());

drop policy if exists "owner full access to payments" on payments;
create policy "owner full access to payments" on payments
  for all using (public.is_owner());

-- ============================================================
-- Part 2: player self-join (replaces claim codes)
-- ============================================================

-- Lets a signed-in player add themselves directly — they can only ever
-- set linked_user_id to their own auth.uid(), never anyone else's, so one
-- player can't create a row that impersonates another.
drop policy if exists "players can join themselves" on players;
create policy "players can join themselves" on players
  for insert to authenticated
  with check (linked_user_id = auth.uid());

-- The old code-based linking is no longer used by the app — drop it.
drop function if exists public.claim_player(text);
alter table players drop column if exists claim_code;
