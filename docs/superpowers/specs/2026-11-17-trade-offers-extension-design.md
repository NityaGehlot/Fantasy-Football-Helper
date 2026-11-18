# FF Helper browser extension: pending Sleeper trades in the app

Date: 2026-11-17 · Project 1 of 7 (round 14)

## Intent

Sleeper's public API never returns trades that haven't been accepted yet, so the app can't show
the offers people send you (e.g. the Deebo Samuel ↔ Jahmyr Gibbs offer in "goongent") or the ones
you've sent. Sleeper's own website does load them, because you're logged in there.

A downloadable browser extension, for **anyone who uses the app**, runs on sleeper.com while the
user browses it, picks out their pending trades (sent and received), and saves just the trade
details to their FF Helper account. The app shows them in the Trades tab, graded, with
counter-offers, the way it already handles offers it can find today.

This is the first piece of a larger "AI agent in your browser". Version 1 only **reads**.

## Goals

- Pending trades (sent and received) from Sleeper web show in the app's Trade offers panel within
  seconds of the user having Sleeper open, graded with the existing trade engine (`gradeTrade`,
  `counterOffers`).
- Anyone can install it: a downloadable zip from the app now (load-unpacked steps), packaged so it
  can go to the Chrome Web Store later without changes.
- Linking by a one-time pairing code (chosen approach A, below). Works for Google and email users.
- The user can see what's linked, when it last synced, and unlink it, from the app.

## Non-goals (v1)

- Sending, accepting, rejecting or countering trades on Sleeper from the extension (later version;
  always a confirm-in-Sleeper step, never automatic).
- Phones. Mobile browsers don't run Chrome extensions.
- Any league platform other than Sleeper.
- Draft picks / FAAB in trades: captured and stored, shown as text, not graded.

## Anti-goals (a failure even if it "works")

- The extension reads, stores or sends the user's Sleeper login token, password or cookies.
- One user can read or write another user's trades.
- The extension makes its own requests to Sleeper (looks like a bot, risks the user's account).
  It only reads responses the Sleeper website already fetched.
- Asking for broad permissions ("read all websites").

## Approaches considered (linking the extension to an account)

| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | One-time pairing code: app shows a code, user types it into the extension, extension signs in to Firebase anonymously and is linked to that account by Firestore rules | No backend changes, no secrets, works for Google + email users. Needs the Firebase "Anonymous" sign-in provider turned on (one console toggle) and new Firestore rules. |
| B | Sign in inside the extension with the app account | Easy for email users; Google sign-in inside an MV3 extension needs extra OAuth client setup. |
| C | Extension posts to our backend, backend stores | Backend has no database; needs a Firebase Admin service-account key on the server. More parts, a secret to protect. |

The user picked A.

## Constraints

- Manifest V3 (Chrome, Edge, Brave; Firefox later). No remotely hosted code, everything bundled.
- Firebase project `ffhelper-eb35a`, web SDK v12 (already in the app). In the extension's
  background service worker use `firebase/auth/web-extension` and `firebase/firestore/lite`
  (works with `fetch`, no XHR).
- No paid services. (Chrome Web Store listing later costs a one-time $5 developer fee; not needed
  for the download route.)
- The user tests changes before committing: everything ships as patch files; nothing is committed
  or pushed for them.
- Firestore rules currently live only in the Firebase console. The repo gets a `firestore.rules`
  file the user pastes/deploys; it must keep every path the app already uses working
  (`users/{uid}` and its `leagues` subcollection, owner read/write).

## Design

### 1. Pairing (Firestore)

```
extensionPairings/{code}          created by the app (signed-in user)
  uid, label (the user's display name, never the email), createdAt,
  expiresAt (createdAt + 10 min), claimedBy: null | <extension anon uid>

users/{uid}/linkedDevices/{extUid}  created by the extension after claiming
  code, browser ("Chrome 131 on Mac"), linkedAt, lastSyncAt, version

users/{uid}/pendingTrades/{transactionId}
  leagueId, transactionId, status, type:"trade", creator, rosterIds[], adds{}, drops{},
  draftPicks[], waiverBudget[], created (Sleeper ms), capturedAt, seenAt, source:"extension"
```

- Code: 8 characters from an unambiguous alphabet (no 0/O/1/I), shown as `XXXX-XXXX`.
  ~10^12 combinations and a 10-minute life make guessing impractical.
- Flow: app → "Connect browser extension" → writes pairing doc → shows code and a countdown.
  Extension popup → user enters code → extension signs in anonymously → `updateDoc` sets
  `claimedBy` to its uid (rules: only if unclaimed and unexpired) → reads `uid` from the doc →
  creates `users/{uid}/linkedDevices/{extUid}` (rules: allowed only if that pairing doc names this
  `uid` and is `claimedBy` this extension) → stores `{uid}` locally. The app listens to
  `linkedDevices` and flips to "Linked ✓".
- Unlink: the app deletes the `linkedDevices` doc; the extension's next write is denied, it shows
  "Unlinked: enter a new code".

### 2. Firestore rules (sketch)

```
match /users/{uid} {
  allow read, write: if request.auth.uid == uid;              // unchanged behaviour
  match /leagues/{leagueId} { allow read, write: if request.auth.uid == uid; }
  match /linkedDevices/{extUid} {
    allow read, delete: if request.auth.uid == uid;
    allow read: if request.auth.uid == extUid;
    allow create: if request.auth.uid == extUid
      && get(/databases/$(database)/documents/extensionPairings/$(request.resource.data.code)).data.uid == uid
      && get(/databases/$(database)/documents/extensionPairings/$(request.resource.data.code)).data.claimedBy == extUid
      && get(/databases/$(database)/documents/extensionPairings/$(request.resource.data.code)).data.expiresAt > request.time;
    allow update: if request.auth.uid == extUid && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['lastSyncAt','version','browser']);
  }
  match /pendingTrades/{tid} {
    allow read, delete: if request.auth.uid == uid;
    allow write: if exists(/databases/$(database)/documents/users/$(uid)/linkedDevices/$(request.auth.uid));
  }
}
match /extensionPairings/{code} {
  allow create: if request.auth.uid == request.resource.data.uid && request.resource.data.claimedBy == null;
  allow get: if request.auth != null && resource.data.expiresAt > request.time;   // no list
  allow update: if request.auth != null && resource.data.claimedBy == null
    && resource.data.expiresAt > request.time
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['claimedBy'])
    && request.resource.data.claimedBy == request.auth.uid;
  allow delete: if request.auth.uid == resource.data.uid;
}
```

The app itself only uses `users/{uid}` and `users/{uid}/leagues/{leagueId}` (checked across
`app/`, `App.tsx`, `index.ts`; the backend doesn't use Firestore). Whether the console has rules
for anything else is open (see Open questions).

### 3. Reading trades on sleeper.com (extension)

- `content-main.js` runs in the page (`"world": "MAIN"`, `run_at: document_start`, matches
  `https://sleeper.com/*`). It wraps `fetch` and `XMLHttpRequest` **only to read** responses
  from `sleeper.com/graphql` and `api.sleeper.app` the page already makes. It never changes
  requests and never reads headers, cookies or storage.
- It walks the JSON for objects shaped like a Sleeper transaction (`type === "trade"`,
  `transaction_id`, `roster_ids`, `status`) and posts only those fields (plus the league id from
  the object or the page URL `/leagues/{id}/…`) to `content-relay.js` (isolated world) via
  `window.postMessage` with a fixed tag; the relay checks `event.source === window` and the tag,
  then `chrome.runtime.sendMessage`s to the background worker.
- Background worker: de-dupes by `transaction_id`, writes `pendingTrades/{id}` (status updates too,
  so accepted/rejected/expired offers drop off), updates `lastSyncAt`. Debounced (≤1 write per
  trade per 30 s).
- Popup: link/unlink, "Linked to <display name>" (the pairing doc's `label`), last sync, number of pending trades
  seen, and **Check what I see**: the last 20 trade-shaped objects captured (ids, status, rosters)
  plus whether any GraphQL responses were seen at all, with a "Copy" button for bug reports.
- Permissions: `storage`, host permissions only for `https://sleeper.com/*`, Firebase hosts the SDK
  needs (`firestore.googleapis.com`, `identitytoolkit.googleapis.com`, `securetoken.googleapis.com`).

Unknown until tested on a real logged-in account: which Sleeper page loads pending trades (league
home vs the Trades tab) and the exact response shape. The walker is shape-based, not
query-name-based, so it should hold; the "Check what I see" output is the fallback.

### 4. App changes

- `services/extensionLink.ts`: create pairing code, watch `linkedDevices`, unlink; watch
  `pendingTrades` for the active league.
- `TradeOffers` panel: merge trades from the extension with what `/trade-offers` finds today; send
  extension trades to the backend as `extraTransactions` so the same `pendingTradesFor` +
  `gradeTrade` + `counterOffers` grade them (they're already in Sleeper's transaction shape).
  Each offer is labelled **Received** / **Sent by you** and "via browser extension · seen 3m ago".
  Hide extension trades whose status isn't proposed/pending, and any older than 14 days.
- Empty state when not linked: a short card "See offers people sent you: get the browser
  extension" → link to the extension page.
- New "Browser extension" screen (from the account menu and that card): what it does, privacy
  promise in plain words, **Download** (zip) + 4-step install, **Connect** (code + countdown),
  linked browsers with last sync and Unlink.
- Backend `/trade-offers`: accept optional `extraTransactions` (validated: array ≤ 50, each must be
  `type:"trade"`, involve the caller's roster, ids/rosters numeric/string only).

### 5. Packaging

- `extension/` folder at the repo root: `manifest.json`, `src/` (TypeScript), esbuild script
  (`npm run build:extension`) → `extension/dist/` + `ffhelper-extension.zip` copied into the web
  app's public assets so the app's Download button serves it. Icons from the app's logo.
- Privacy policy page text (needed for the Web Store later) included as `extension/PRIVACY.md`.

### Calls made by the builder check (author's calls, check these)

- **Signed-in users only.** The app also runs signed out (uid `'anon'`); pairing needs a real
  account, so Connect shows "Sign in to connect the extension" for signed-out users. No guest mode.
- Offers are matched to "via browser extension" labels by transaction id.
- The zip and icons are produced by the build, not shipped as binaries in the patch.
- The device-create rule also checks the code hasn't expired, so an unlinked extension can't
  re-link with its old code.

## Testing

- Unit (node:test, existing setup): transaction walker on sample GraphQL/REST payloads (nested,
  arrays, non-trade noise), field whitelisting, league-id detection, de-dupe/debounce, pairing-code
  generation/format, `extraTransactions` validation, merge + labelling in the app.
- Firestore rules: if the emulator can't run here, a written test checklist for the user
  (cross-account read/write denied, expired/claimed code denied, unlinked device denied).
- Manual by the user: install from zip, link, open Sleeper, see the Deebo/Gibbs offer graded.

## Answers from the user (2026-11-18)

1. **Current console rules** only allow `users/{uid}/leagues/{leagueId}` (owner read/write).
   Nothing else uses the project. Consequence: the app's writes to the `users/{uid}` document
   itself (favorites, myTeam, lastLeagueId, favorite team) are denied today and only persist
   locally. The new `firestore.rules` is a clean replacement that adds owner read/write on
   `users/{uid}` (fixing that), keeps `leagues`, and adds the extension paths. Rollback = paste the
   old rules (kept verbatim in `firestore.rules.previous`).
2. **API keys** are API-restricted ("28 APIs"), not website-restricted, and the app already uses
   Identity Toolkit + Firestore with its key. The extension uses the same web config; no key change.
3. **Sleeper Terms risk accepted.** Research (`reports/Sleeper pending trades access.md`) found
   Sleeper's Terms §11.3 (per search excerpts) forbid third parties retrieving data through a
   user's credentials, so the extension is a gray area. The user chose to proceed. Mitigations
   built in: passive reading only (no requests of our own to Sleeper), only trade fields leave the
   page, no token/cookie access, clear disclosure on the extension page and in the popup.

## Left to the builder

File layout inside `extension/src`, popup styling (match the app's theme tokens), debounce
details, how the zip is served in dev vs. production, copy wording.
