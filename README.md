# Mt Pickle Park — Session Tracker (Expo)

Tracks players, court fee, food/drink orders, per-item paid/unpaid status,
and emails a full receipt when you finish a session.

## Email sending (no sign-in)

Earlier versions of this app had each user sign into their own Gmail
account with Google OAuth and send through the Gmail API. That's gone now
— it required a custom Development Build to work at all (Google sign-in
redirects don't work in plain Expo Go), which was more setup than this
needed.

Instead: there's **one fixed Gmail account** on the backend. The app just
asks for the recipient's email address (typed in, same as before) and
POSTs the receipt to the backend, which sends it via that one account
using a Gmail **App Password**. No sign-in screen, no OAuth, no token
refresh, works fine in plain Expo Go.

## Project structure

```
pickleball-app/
  App.tsx                        entry point, screen switcher
  app.json                       Expo config (name, package id)
  eas.json                       EAS Build config (for the APK)
  assets/
    mt_pickle_logo.jpg           placeholder — swap with your real logo
  src/
    colors.ts                    brand palette
    types.ts                     Player / OrderItem + derived getters
    context/PaymentLogContext.tsx
    services/emailService.ts     builds + sends the receipt via the backend
    services/settingsService.ts  AsyncStorage for session title/owner email
    utils/currency.ts            ₱ formatting, date formatting
    components/                  PlayerCard, PaidChip, and the 3 modals
    screens/HomeScreen.tsx
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

## 2. Set up the backend

See `../pickleball-backend/README.md`. In short:

```
cd pickleball-backend
npm install
cp .env.example .env
# fill in APP_API_KEY, GMAIL_USER, GMAIL_APP_PASSWORD in .env
npm start
```

For the Gmail account you use as `GMAIL_USER`:
1. Turn on 2-Step Verification (Google Account → Security).
2. Google Account → Security → App Passwords → generate one for "Mail".
3. Paste that 16-character password into `.env` as `GMAIL_APP_PASSWORD`.

While testing locally, expose it with ngrok (`ngrok http 3000`) and use
that `https://...ngrok...` URL as `BACKEND_URL`. For the real APK, deploy
the backend to Render/Railway/Fly.io instead so it has a stable URL.

## 3. Point the app at the backend

In `src/services/emailService.ts`:

```ts
const BACKEND_URL = 'https://your-backend-url';
const BACKEND_API_KEY = 'same value as APP_API_KEY in the backend .env';
```

## 4. Build the APK

```
npm install -g eas-cli
eas login
eas build:configure
eas build -p android --profile preview
```

## Notes

- **Session data (players/orders) is in-memory only** — closing the app
  clears the current session.
- Every receipt is sent **from** the one fixed Gmail account, **to**
  whatever address the user types in (e.g. into a "session owner email"
  field in Settings). Nothing about the recipient needs to sign in or
  authorize anything.
- Gmail App Passwords are fine for this volume of sending. If you ever
  send a lot of email or need better deliverability, a transactional
  email service (Resend, SendGrid, Postmark) is a more durable long-term
  choice — not something you need to worry about now.
- Currency is peso (₱) formatting, done manually in `utils/currency.ts`
  rather than via `Intl`, to avoid relying on the device's ICU data.
