# FF Helper browser extension

Source for the Chrome (Manifest V3) extension that shows your pending Sleeper trade offers in FF
Helper. See `docs/extension-setup.md` for Firebase setup, building and installing.

- `src/capture.ts`: finds trades in Sleeper responses (pure, unit-tested)
- `src/content-main.ts`: runs in sleeper.com's page, reads responses Sleeper already fetched
- `src/content-relay.ts`: passes trades to the background worker
- `src/background.ts`: links with a code and saves trades to Firestore
- `src/popup.*`: connect, status, "Check what I see"

The download is served from `public/ffhelper-extension.zip` by Expo web.
