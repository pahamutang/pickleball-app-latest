-- ============================================================================
-- ACCOUNT NOTIFICATIONS — lets the owner know, inside the app, when someone
-- creates a new account. Safe to re-run (everything here is idempotent).
--
-- How it works:
--   1) `account_notifications` is a small table: one row per new signup,
--      with a `seen` flag the owner's device flips once they've looked.
--   2) A trigger on `public.profiles` (AFTER INSERT) writes that row
--      automatically. Profiles rows are only ever INSERTed once, at
--      signup — claiming the owner role later (claim_owner_role) is an
--      UPDATE to an existing row, so it never fires this again. The
--      trigger also skips notifying until an owner already exists, so
--      the owner's own first-time signup never shows up as a "new
--      account" alert about themselves.
--   3) `account_notifications` is added to the realtime publication so
--      the owner's app can subscribe and get told the instant a row
--      lands, without polling.
--   4) RLS restricts read/update to the owner only (reusing the
--      is_owner() helper from supabase_profiles_recursion_fix.sql) — no
--      one else can see who else has signed up.
--
-- This is deliberately DB + realtime-subscription only — there is no
-- push notification here. The app only shows anything while it's open
-- and the owner's account is signed in; see AccountNotificationsContext.
-- ============================================================================

create table if not exists public.account_notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  seen boolean not null default false
);

alter table public.account_notifications enable row level security;

drop policy if exists "owner reads account_notifications" on public.account_notifications;
create policy "owner reads account_notifications"
  on public.account_notifications for select
  to authenticated
  using (public.is_owner());

drop policy if exists "owner updates account_notifications" on public.account_notifications;
create policy "owner updates account_notifications"
  on public.account_notifications for update
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- No insert/delete policy for regular clients on purpose — rows are only
-- ever created by the trigger below (which runs as SECURITY DEFINER and
-- so isn't subject to RLS), and there's no product reason for anyone,
-- owner included, to delete or fabricate one from the client.

create or replace function public.notify_owner_of_new_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Skip the very first signup(s) that happen before anyone has claimed
  -- the owner role yet (i.e. the owner's own bootstrap account). Without
  -- this check, the owner would open the bell after claiming their role
  -- and see a "new account" notification about themselves. Once an
  -- owner exists, every subsequent signup (which is always a genuine
  -- player, since claiming owner is an UPDATE, not an INSERT) notifies
  -- as normal.
  if exists (select 1 from public.profiles where role = 'owner') then
    insert into public.account_notifications (profile_id, display_name)
    values (new.id, new.display_name);
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_notify_owner_on_insert on public.profiles;
create trigger profiles_notify_owner_on_insert
  after insert on public.profiles
  for each row
  execute function public.notify_owner_of_new_account();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'account_notifications'
  ) then
    alter publication supabase_realtime add table public.account_notifications;
  end if;
end $$;

notify pgrst, 'reload schema';
