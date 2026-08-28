-- ============================================================================
-- OWNER ROLE MIGRATION — run this in Supabase → SQL Editor → New query.
-- Safe to run multiple times (everything here is idempotent).
--
-- This file didn't exist anywhere in the repo before — `profiles`,
-- `handle_new_user`, and `claim_owner_role` had only ever been created
-- directly in the Supabase SQL Editor, with no copy saved to source
-- control. This captures the current live definitions (pulled from the
-- project via `pg_get_functiondef`) plus one bug fix.
--
-- BUG FIXED: claim_owner_role always returned `true`, even when its
-- UPDATE matched 0 rows. That happens when this function runs before the
-- handle_new_user trigger has finished inserting the new profiles row
-- (a race right after signUp) — the UPDATE silently touches nothing,
-- but the function still reported success. Net effect: typing the
-- correct owner PIN would sometimes leave the account as a player with
-- no error shown. Fixed by checking the row count and inserting the
-- profile directly if the trigger hasn't created it yet — this also
-- means the app no longer needs any artificial delay before calling it.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) profiles — one row per auth user, tracks role ('owner' | 'player').
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'player' check (role in ('owner', 'player')),
  display_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Everyone signed in can read profiles (needed so players/owner can see
-- each other's display names).
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all"
  on public.profiles for select
  to authenticated
  using (true);

-- Users can only update their own row directly (role changes only happen
-- through claim_owner_role, which runs as SECURITY DEFINER and bypasses
-- this policy).
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ----------------------------------------------------------------------------
-- 2) private_settings — stores the owner signup PIN. Not readable by
--    normal clients; only claim_owner_role (SECURITY DEFINER) reads it.
-- ----------------------------------------------------------------------------
create table if not exists public.private_settings (
  key text primary key,
  value text not null
);

alter table public.private_settings enable row level security;
-- Intentionally no policies — nothing is readable/writable directly by
-- authenticated or anon roles. Only SECURITY DEFINER functions can touch it.

-- Set your owner PIN here (edit the value before running, or update it
-- later with: update private_settings set value = 'NEW_PIN' where key =
-- 'owner_signup_code';)
insert into public.private_settings (key, value)
values ('owner_signup_code', 'CHANGE_ME')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- 3) handle_new_user — creates the matching profiles row right after
--    someone signs up.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'display_name')
  on conflict (id) do nothing;
  return new;
end;
$function$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 4) claim_owner_role — FIXED VERSION. See bug note at the top of the
--    file for what changed and why.
-- ----------------------------------------------------------------------------
create or replace function public.claim_owner_role(pin text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  correct_pin text;
  updated_rows int;
begin
  select value into correct_pin from private_settings where key = 'owner_signup_code';

  if correct_pin is null or pin <> correct_pin then
    return false;
  end if;

  update profiles set role = 'owner' where id = auth.uid();
  get diagnostics updated_rows = row_count;

  if updated_rows = 0 then
    -- profiles row doesn't exist yet (handle_new_user trigger for this
    -- signup hasn't run yet) — create it directly instead of losing the
    -- claim.
    insert into public.profiles (id, role, display_name)
    values (
      auth.uid(),
      'owner',
      (select raw_user_meta_data->>'display_name' from auth.users where id = auth.uid())
    )
    on conflict (id) do update set role = 'owner';
  end if;

  return true;
end;
$function$;
