# Pickleball Court Reservation and Payment Management System for Mt. Pickle Park

An Expo/React Native app with two parts, both synced live through Supabase:

- **Court Reservation** (`src/screens/BookingScreen.tsx`) — the screen the
  app opens to. Lets an owner or player pick a court, a date, and one or
  more hourly time slots, record who booked it and how many players, and
  (owner-only) mark the reservation paid/unpaid. Double-booked slots are
  automatically disabled, with a database-level trigger preventing race
  conditions on top of the client-side check.
- **Session Tracker** (`src/screens/HomeScreen.tsx` and friends) — tracks
  players, court fee, food/drink orders, per-item paid/unpaid status, and
  emails a receipt when a session finishes.

A button in each screen's top bar ("💳 Payment Tracker" on the Reservation
screen, "📅" on the Session Tracker) switches between the two — owner
accounts only.

## Owner vs. player accounts (Supabase)

The app requires an account (email + password) and syncs live through
Supabase. There are two roles:

- **Owner** — full access: booking, the session tracker, adding players,
  logging orders, marking things paid/unpaid. Becomes the owner by entering
  the secret PIN (set inside `claim_owner_role()`) via `AuthContext.claimOwnerRole`.
- **Player** — mostly read-only. After signing up, they add themselves to
  the session with just their name (`JoinSessionScreen.tsx`) — no code, no
  owner involvement. They see their own bill update live, can book courts
  themselves, but can't mark anything paid or see other players'/customers'
  data — enforced by Postgres Row Level Security, not just hidden in the UI.

### Setup

1. Create a free Supabase project.
2. Run the SQL migrations in the SQL Editor, **in this order** (each file's
   header comments explain what it does and what it depends on):
   1. A base migration creating `profiles`, `players`, `order_items`, and
      the `claim_owner_role()` PIN function — **not included in this repo
      as of this snapshot**; if you don't already have one, see
      `supabase_base_migration_DRAFT.sql` for a reconstructed starting
      point (edit the PIN before running).
   2. `supabase_fix_migration.sql` — creates `payments` and `reservations`.
   3. `supabase_profiles_recursion_fix.sql` — owner-access policies, `is_owner()`.
   4. `supabase_double_booking_migration.sql` — booking race prevention + `get_booked_slots()`.
   5. `supabase_reservation_merge_migration.sql` — lets players extend their own bookings.
   6. `supabase_reservation_privacy_fix_migration.sql` — locks reservation rows down to owner/creator.
   7. `supabase_venue_photos_migration.sql` — venue photo carousel storage.
3. Copy the Project URL + "Publishable"/anon key into `.env` (see
   `.env.example` for the expected variable names). **Never** put the
   secret/service_role key here.
4. `npm install`.

Data lives in Supabase and is synced in real time: `players`, `order_items`,
`payments`, `reservations`, and `venue_photos` all update live across every
signed-in device.

## Email sending (no backend)

Receipts are sent by opening the device's own mail app (or, on Android,
Gmail's compose intent directly, to avoid an OS-level crash on some Android
15 devices), pre-filled with the receipt text — the user reviews and hits
Send themselves. There is **no backend service and no fixed sending
account**; `src/services/emailService.ts` is entirely on-device.

## Project structure

```
pickleball-app/
  App.tsx                        entry point; routes by role (owner/player)
  app.json                       Expo config (name, package id)
  eas.json                       EAS Build config (for the APK)
  assets/
    mt_pickle_logo.jpg           venue logo
    venue/                       court photos for the carousel
  src/
    colors.ts                    brand palette
    types.ts                     Player / OrderItem + derived getters (session tracker)
    payment.ts / paymentLogReducer.ts   Payment log types + pure reducer logic
    bookingTypes.ts               Reservation type + court/date/time-slot helpers
    context/
      AuthContext.tsx             session, profile, sign in/up/out, claimOwnerRole
      BookingContext.tsx          Supabase-synced reservations
      PlayersContext.tsx          Supabase-synced players/orders
      PaymentLogContext.tsx       Supabase-synced payment history
      VenuePhotosContext.tsx      Supabase-synced venue photo carousel
    services/
      supabaseClient.ts
      emailService.ts             builds + sends the receipt via the device's mail app
      settingsService.ts          AsyncStorage for session title/owner email
      venuePhotoStorage.ts
    utils/                        currency formatting, base64, venue slide helpers
    components/                   PlayerCard, PaidChip, and the modals
    screens/
      BookingScreen.tsx            Court Reservation (app's landing screen)
      HomeScreen.tsx                Session Tracker
      SettingsScreen.tsx
      PaymentHistoryScreen.tsx
      AuthScreen.tsx
      JoinSessionScreen.tsx        player self-join flow
      MyBillScreen.tsx              player's live read-only bill
```

## 1. Install and run in Expo Go

```
cd pickleball-app
npm install
npx expo install --fix   # aligns dependency versions with your Expo SDK
npx expo start
```

Scan the QR code with the Expo Go app on your phone.

## 2. Build the APK — on GitHub, not locally

This repo includes `.github/workflows/eas-build.yml` (if present in your
checkout), which triggers a cloud build on Expo's EAS servers straight from
GitHub — no `expo start`, no Expo Go, and no waiting on your own machine.

**One-time setup:**
1. Push this repo to GitHub.
2. Create a free account at [expo.dev](https://expo.dev), then generate an
   access token under **Account Settings → Access Tokens**.
3. In the GitHub repo: **Settings → Secrets and variables → Actions → New
   repository secret**. Name it `EXPO_TOKEN`, paste the token as the value.
4. If this is the first time *your* Expo account is building this project,
   run `npx eas init` once to link `app.json`'s `extra.eas.projectId` to
   your own account.

**After that**, every push to `main`/`master` kicks off a build
automatically, or trigger one manually from the **Actions** tab.

If you need a local build instead:
```
npx eas-cli build -p android --profile preview
```

## Notes

- Currency is peso (₱) formatting, done manually in `utils/currency.ts`
  rather than via `Intl`, to avoid relying on the device's ICU data.
- `.env` in this repo is expected to hold your *own* project's URL/anon
  key — don't commit real credentials if you're sharing this repo further,
  even though the anon/publishable key is safe-by-design (RLS-gated).
