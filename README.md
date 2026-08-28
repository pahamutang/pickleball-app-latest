# Pickleball Court Reservation and Payment Management System for Mt. Pickle Park

An Expo/React Native app with two parts:

- **Court Reservation** (`src/screens/BookingScreen.tsx`) — the screen the
  app opens to. Lets staff pick a court, a date, and one or more hourly
  time slots, record who booked it and how many players, and mark the
  reservation paid/unpaid. Double-booked slots are automatically disabled.
- **Session Tracker** (the original app — `src/screens/HomeScreen.tsx` and
  friends) — tracks players, court fee, food/drink orders, per-item
  paid/unpaid status, and emails a full receipt when a session finishes.

A button in each screen's top bar ("💳 Payment Tracker" on the Reservation
screen, "📅" on the Session Tracker) switches between the two.

## Owner vs. player accounts (Supabase)

The app now requires an account (email + password) and syncs live through
Supabase instead of storing everything only on one phone. There are two
roles:

- **Owner** — full access: booking, the session tracker, adding players,
  logging orders, marking things paid. Becomes the owner by entering the
  secret PIN (set in `supabase_owner_role_migration.sql`) at sign-up.
- **Player** — read-only. After signing up, they add themselves to the
  session with just their name (`JoinSessionScreen.tsx`) — no code, no
  owner involvement. From then on they see their own orders and bill
  update live, but can't mark anything paid or see anyone else's data —
  enforced by Postgres Row Level Security, not just hidden in the UI.

Setup:
1. Create a free Supabase project.
2. Run `supabase_owner_role_migration.sql` in the SQL Editor (edit the owner PIN near
   the top first).
3. Copy the Project URL + "Publishable"/anon key into `.env` (see
   `.env` in this repo for the expected variable names).
4. `npm install` to pull in `@supabase/supabase-js` and
   `react-native-url-polyfill`.

Data no longer lives only in `AsyncStorage` — `players`, `order_items`,
`payments`, and `reservations` (the Court Reservation module) are all
synced from Supabase in real time, the same way, across every device.

## Email sending (no backend, no sign-in)

Earlier versions of this app had each user sign into their own Gmail
account with Google OAuth and send through the Gmail API. That's gone now
— it required a custom Development Build to work at all (Google sign-in
redirects don't work in plain Expo Go), which was more setup than this
needed.

There is no backend and no server-side email account. `emailService.ts`
just opens the device's own mail app (Gmail's compose screen on Android,
the native Mail app / `expo-mail-composer` on iOS) pre-filled with the
receipt, addressed to whatever recipient email the user types in (e.g.
into a "session owner email" field in Settings). The user reviews it in
their own mail app and hits send themselves — no sign-in screen, no
OAuth, no API key, no token refresh, and it works fine in plain Expo Go.

## Project structure

```
pickleball-app/
  App.tsx                        entry point, top-level tab switcher
  app.json                       Expo config (name, package id)
  eas.json                       EAS Build config (for the APK)
  .github/workflows/eas-build.yml  triggers a cloud APK build on push (see below)
  assets/
    mt_pickle_logo.jpg           placeholder — swap with your real logo
  src/
    colors.ts                    brand palette
    types.ts                     Player / OrderItem + derived getters (session tracker)
    bookingTypes.ts               Reservation type + court/date/time-slot helpers (booking)
    context/PaymentLogContext.tsx Supabase-synced payment log
    context/BookingContext.tsx    Supabase-synced reservations list
    context/PlayersContext.tsx    Supabase-synced players/orders (session tracker)
    context/VenuePhotosContext.tsx  Supabase-synced venue photo carousel
    context/AccountNotificationsContext.tsx
    context/AuthContext.tsx
    services/emailService.ts     builds the receipt and opens the device's mail app
    services/settingsService.ts  AsyncStorage for session title/owner email
    utils/currency.ts            ₱ formatting, date formatting
    components/                  PlayerCard, PaidChip, and the 3 modals
    screens/BookingScreen.tsx     NEW — Court Reservation (app's landing screen)
    screens/HomeScreen.tsx        Session Tracker (original app)
    screens/SettingsScreen.tsx
    screens/PaymentHistoryScreen.tsx
```

Note: `src/context/AuthContext.tsx` and the `expo-auth-session`,
`expo-crypto`, and `expo-secure-store` packages are no longer used —
delete the file and they're already removed from `package.json`.

## 1. Install and run in Expo Go

```
cd pickleball-app
npm install
npx expo install --fix   # aligns dependency versions with your Expo SDK
npx expo start
```

Scan the QR code with the Expo Go app on your phone.

## 2. Build the APK — on GitHub, not locally

This repo includes `.github/workflows/eas-build.yml`, which triggers a
cloud build on Expo's EAS servers straight from GitHub — no `expo start`,
no Expo Go, and no waiting on your own machine.

**One-time setup:**
1. Push this repo to GitHub (if you haven't already).
2. Create a free account at [expo.dev](https://expo.dev) if you don't have
   one, then generate an access token under
   **Account Settings → Access Tokens**.
3. In the GitHub repo: **Settings → Secrets and variables → Actions →
   New repository secret**. Name it `EXPO_TOKEN`, paste the token as the
   value.
4. If this is the first time *your* Expo account is building this project,
   run `npx eas init` once from your machine to link `app.json`'s
   `extra.eas.projectId` to your own account (only needed once, not for
   every build).

**After that**, every push to `main`/`master` kicks off a build
automatically. You can also trigger one manually from the **Actions** tab
→ **Build Android APK** → **Run workflow**. When it finishes, the
downloadable APK link shows up on your
[expo.dev](https://expo.dev) dashboard under the project's **Builds** tab.

Builds run on Expo's servers (typically a few minutes), so you can close
your laptop and check back later — nothing runs on your own device.

If you ever do need a local build instead:
```
npx eas-cli build -p android --profile preview
```

## Notes

- Session data (players/orders/payments/reservations) lives in Supabase
  and syncs live across devices — closing the app does not clear it.
- Each receipt is composed **in the device's own mail app**, addressed to
  whatever email the user types in (e.g. into a "session owner email"
  field in Settings), and sent from whichever account is signed into that
  app. Nothing about the recipient needs to sign in or authorize anything.
- Currency is peso (₱) formatting, done manually in `utils/currency.ts`
  rather than via `Intl`, to avoid relying on the device's ICU data.
