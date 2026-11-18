# FF Helper browser extension: setup

## One-time Firebase setup (project ffhelper-eb35a)

1. **Anonymous sign-in** (the extension uses it to identify itself):
   Firebase console -> Authentication -> Sign-in method -> Add new provider -> Anonymous -> Enable -> Save.
2. **Firestore rules**: Firestore Database -> Rules -> replace everything with the contents of
   `firestore.rules` -> Publish.
   - These also fix saving favorites / "my team" / last league to your account (the old rules
     only allowed `users/{uid}/leagues`, so those saves were silently blocked).
   - To undo: paste `firestore.rules.previous` and Publish.

## Build the extension

```bash
npm install
npm run build:extension
```

This makes `extension/dist/` (the unpacked extension) and `public/ffhelper-extension.zip`
(what the app's Download button serves).

## Install it (Chrome, Edge, Brave)

1. Unzip `ffhelper-extension.zip` (or use `extension/dist/` directly).
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick the unzipped folder.
4. Pin the FF Helper icon, open it, and enter the code from the app
   (account menu -> Browser extension -> Connect).

Then open your league on sleeper.com. Pending trades show in the app's Trades tab within a few
seconds, labelled "via browser extension".

## Test the Firestore rules (optional, needs Java)

```bash
npx -p firebase-tools -p @firebase/rules-unit-testing -p firebase firebase emulators:exec --only firestore --project demo-ffh "node --test tests-rules/rules.test.cjs"
```

Expected: `# pass 7`, `# fail 0`.
