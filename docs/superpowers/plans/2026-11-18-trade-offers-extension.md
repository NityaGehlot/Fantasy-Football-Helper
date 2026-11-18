# Trade Offers Browser Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A downloadable Chrome (MV3) extension that passively captures a user's pending Sleeper trades on sleeper.com and saves them to their FF Helper account, where the Trades panel grades them.

**Architecture:** Pure, tested core modules (trade capture, pairing codes, request validation, freshness filtering) shared by three thin shells: the extension (content scripts + background worker + popup, bundled with esbuild), the app (pairing screen, Firestore listeners, Trades panel merge), and the backend (`/trade-offers` accepts `extraTransactions`). Linking is a one-time pairing code; Firestore rules enforce who can read/write.

**Tech Stack:** TypeScript, Chrome Manifest V3, Firebase JS SDK v12 (`firebase/auth/web-extension`, `firebase/firestore/lite` in the extension; `firebase/firestore` in the app), esbuild + fflate (new devDependencies), Expo 54 web, Express, node:test via ts-node.

**Spec:** `docs/superpowers/specs/2026-11-17-trade-offers-extension-design.md`

## Global Constraints

- Delivery is patch files; never commit or push. "Commit" steps below mean: stage nothing, just confirm `npm test` and `npm run typecheck` pass and move on.
- The extension never reads Sleeper tokens, cookies, headers or storage, and never makes its own requests to Sleeper.
- Host permissions: `https://sleeper.com/*` only, plus `https://firestore.googleapis.com/*`, `https://identitytoolkit.googleapis.com/*`, `https://securetoken.googleapis.com/*`. Permissions: `storage` only.
- Pairing code: 8 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, displayed `XXXX-XXXX`, stored without the dash, expires 10 minutes after creation.
- Pairing doc stores `label` = display name, never the email.
- Extension trades shown only if status is `proposed` or `pending` and `seenAt` is within 14 days.
- Background writes: at most 1 write per transaction per 30 seconds unless its status changed.
- `extraTransactions`: array of at most 50; each must be `type: "trade"` and include the caller's roster id.
- Signed-out users (uid `'anon'`) see "Sign in to connect the extension" instead of Connect.
- Firebase web config is the one in `app/services/firebase.ts` (same project `ffhelper-eb35a`).

## Review Focus

1. A trade the public API already shows as `complete`/`failed` but the extension still has as `proposed` → must not show as pending (public status wins).
2. Pasted code with lowercase, spaces or a dash (`ab3d-ef7h `) → must link; an expired or already-claimed code → clear "code expired or used" message, not a generic error.
3. Sleeper responses that are huge, non-JSON, or contain trade-shaped objects for leagues the user didn't open → walker must not throw, must cap work (depth ≤ 12, ≤ 200 trades per response), and league id falls back to the page URL.
4. Extension unlinked from the app while the browser is open → next write fails → popup shows "Unlinked: enter a new code" and capturing stops writing.
5. Offers involving draft picks only (no players) → still listed with picks as text, not dropped and not crashing `gradeTrade`.

---

### Task 1: Trade capture core (pure)

**Files:**
- Create: `extension/src/capture.ts`
- Test: `tests/extension/capture.test.ts`

**Interfaces:**
- Produces:
  - `type CapturedTrade = { transactionId: string; leagueId: string | null; status: string; type: "trade"; creator: string | null; rosterIds: number[]; adds: Record<string, number>; drops: Record<string, number>; draftPicks: unknown[]; waiverBudget: unknown[]; created: number | null }`
  - `findTrades(json: unknown, pageLeagueId?: string | null): CapturedTrade[]`: depth-first walk, max depth 12, max 200 results, de-duped by `transactionId`; accepts objects with `type === "trade"`, a `transaction_id`, and an array `roster_ids`; copies only the whitelisted fields (renamed to camelCase); `leagueId` from `league_id` on the object, else `pageLeagueId`.
  - `leagueIdFromUrl(url: string): string | null`: matches `/leagues/(\d+)` on sleeper.com.
  - `toTransaction(t: CapturedTrade): Record<string, unknown>`: back to Sleeper's v1 shape (`transaction_id`, `type`, `status`, `creator`, `roster_ids`, `adds`, `drops`, `draft_picks`, `waiver_budget`, `created`) for the backend.

- [ ] **Step 1: Write failing tests** `findTrades`:
  - nested GraphQL payload `{data:{league_transactions_filtered:[{transaction_id:"9",type:"trade",status:"proposed",roster_ids:[1,4],adds:{"6794":1},drops:{"6794":4},creator:"u1",leg:10,league_id:"123",metadata:{secret:"x"}}]}}` → one trade, `leagueId "123"`, no `metadata`/`leg` keys present.
  - waiver/free-agent objects and strings ignored; the same trade twice → 1 result.
  - object without `league_id` + `pageLeagueId "777"` → `leagueId "777"`.
  - 13-deep nesting → not found; 250 trades → 200 returned; `findTrades("not json")`, `findTrades(null)` → `[]`.
  - `leagueIdFromUrl("https://sleeper.com/leagues/1180/trades")` → `"1180"`; `"https://sleeper.com/"` → `null`.
  - `toTransaction(findTrades(payload)[0]).roster_ids` deep-equals `[1,4]`.
- [ ] **Step 2: Run** `npm test` → new tests FAIL (module not found).
- [ ] **Step 3: Implement** `extension/src/capture.ts` per Interfaces (no DOM or chrome APIs in this file).
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Checkpoint** `npm run typecheck` passes.

### Task 2: Pairing codes (pure, shared)

**Files:**
- Create: `app/services/pairingCode.ts`
- Test: `tests/extension/pairingCode.test.ts`

**Interfaces:**
- Produces:
  - `PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"`, `PAIRING_TTL_MS = 600_000`
  - `newPairingCode(rand: () => number = secureRandom): string`: 8 chars, no dash (secureRandom uses `crypto.getRandomValues`).
  - `formatCode(code: string): string` → `"ABCD-EFGH"`.
  - `normalizeCode(input: string): string | null`: uppercase, strips spaces and dashes, `null` unless exactly 8 alphabet chars.

- [ ] **Step 1: Failing tests:** `newPairingCode(() => 0)` → `"AAAAAAAA"`; 1000 codes all match `/^[A-HJ-NP-Z2-9]{8}$/`; `formatCode("ABCDEFGH")` → `"ABCD-EFGH"`; `normalizeCode(" ab3d-ef7h ")` → `"AB3DEF7H"`; `normalizeCode("AB0DEF7H")` → `null` (0 not allowed); `normalizeCode("ABC")` → `null`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.

### Task 3: Backend accepts extension trades

**Files:**
- Create: `app/backend/utils/extraTransactions.ts`
- Modify: `app/backend/routes.ts` (`/trade-offers` handler, ~line 574)
- Modify: `app/backend/services/tradeGrade.ts` (`PendingTrade` gets `source`)
- Test: `tests/backend/extension.test.ts`

**Interfaces:**
- Consumes: Sleeper v1 shape from Task 1 `toTransaction`.
- Produces:
  - `validateExtraTransactions(raw: unknown, rosterId: number): any[]`: returns `[]` for non-arrays; keeps ≤ 50; each item must have `type === "trade"`, string/number `transaction_id`, `roster_ids` array of numbers including `rosterId`, `adds`/`drops` plain objects of `string → number`; drops anything else.
  - `mergeTransactions(publicTx: any[], extra: any[]): any[]`: union by `transaction_id`; when both exist, the public one wins (so `complete`/`failed` hides the offer).
  - `PendingTrade.source: "sleeper" | "extension"`; response offers carry it. `/trade-offers` body gains optional `extraTransactions`.

- [ ] **Step 1: Failing tests:** 60 valid items → 50 kept; item without caller roster → dropped; `adds: {"1": "x"}` → dropped; `mergeTransactions([{transaction_id:"9",status:"complete",...}], [{transaction_id:"9",status:"proposed",...}])` then `pendingTradesFor(..., 1)` → `[]` (Review Focus 1); extension-only trade → `pendingTradesFor` returns it with `source "extension"`; draft-pick-only trade (empty adds/drops, `draft_picks:[{...}]`) → returned, `give`/`get` empty, no throw (Review Focus 5).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** utils; in the route, `validateExtraTransactions(req.body.extraTransactions, ctx.me.rosterId)` → `mergeTransactions(transactions, extra)` before `pendingTradesFor`; `pendingTradesFor` marks `source` by whether the id came only from `extra` (pass a `Set` of extension ids as an optional 4th param). Also add `draftPicks: t.draft_picks ?? []` to `PendingTrade`.
- [ ] **Step 4: Run** → PASS, plus existing `trade.test.ts` unchanged and passing.

### Task 4: Firestore rules and setup guide

**Files:**
- Create: `firestore.rules`, `firestore.rules.previous` (the user's current rules verbatim), `docs/extension-setup.md`

**Interfaces:**
- Produces the paths used by Tasks 5 and 8: `extensionPairings/{code}` `{uid,label,createdAt,expiresAt,claimedBy}`; `users/{uid}/linkedDevices/{extUid}` `{code,browser,linkedAt,lastSyncAt,version}`; `users/{uid}/pendingTrades/{transactionId}` (CapturedTrade fields + `capturedAt`, `seenAt`, `source:"extension"`). Timestamps are Firestore `Timestamp`s.

- [ ] **Step 1:** Write `firestore.rules` from the spec §2 sketch, plus: owner read/write on `users/{uid}` doc itself; linked-device create also requires pairing `expiresAt > request.time`; pendingTrades writes require `request.resource.data.keys().hasOnly([...whitelisted fields])`.
- [ ] **Step 2:** If `java -version` works, add `tests/rules/` with `@firebase/rules-unit-testing` covering: other user can't read `pendingTrades`; unlinked anon can't write; expired code can't be claimed; claimed code can't be re-claimed; owner can write `users/{uid}`. Otherwise write that list as a manual checklist in `docs/extension-setup.md`.
- [ ] **Step 3:** `docs/extension-setup.md`: enable Anonymous provider (done by user), paste rules (Firestore → Rules → Publish), rollback by pasting `firestore.rules.previous`, build and load the extension.

### Task 5: App linking service

**Files:**
- Create: `app/services/extensionLink.ts`
- Test: `tests/extension/extensionLink.test.ts` (pure parts only)

**Interfaces:**
- Consumes: Task 2 `newPairingCode`, `PAIRING_TTL_MS`; Task 4 paths.
- Produces:
  - `createPairing(uid: string, label: string): Promise<{ code: string; expiresAt: number }>`
  - `watchLinkedDevices(uid: string, cb: (d: LinkedDevice[]) => void): () => void`
  - `unlinkDevice(uid: string, extUid: string): Promise<void>`
  - `watchExtensionTrades(uid: string, leagueId: string, cb: (t: ExtensionTrade[]) => void): () => void`
  - pure `freshExtensionTrades(docs: ExtensionTrade[], now: number): ExtensionTrade[]` (status `proposed`/`pending`, `seenAt` within 14 days, newest first)
  - pure `seenAgo(seenAt: number, now: number): string` → `"just now"`, `"3m ago"`, `"2h ago"`, `"4d ago"`
  - `type LinkedDevice = { id: string; browser: string; linkedAt: number; lastSyncAt: number | null; version: string }`; `type ExtensionTrade = CapturedTrade & { seenAt: number }`

- [ ] **Step 1: Failing tests** for `freshExtensionTrades` (accepted dropped, 15-day-old dropped, order) and `seenAgo` boundaries (59 s → "just now", 3 min, 2 h, 4 d).
- [ ] **Step 2–4:** FAIL → implement (Firestore calls thin, not unit-tested) → PASS.

### Task 6: Trades panel shows extension offers

**Files:**
- Modify: `app/services/tradeGrader.ts` (`fetchTradeOffers` 4th param `extraTransactions?: unknown[]`; `PendingOffer` gets `source`, `draftPicks`)
- Modify: `app/components/TradeOffers.tsx`
- Test: `tests/extension/offersMerge.test.ts`

**Interfaces:**
- Consumes: Task 1 `toTransaction`, Task 5 `watchExtensionTrades`, `seenAgo`, Task 3 response `source`.
- Produces: pure `offerSourceLabel(o: PendingOffer, seen: Map<string, number>, now: number): string` → `"via browser extension · seen 3m ago"` or `""`.

- [ ] **Step 1: Failing test** for `offerSourceLabel` (extension vs sleeper source).
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** In `TradeOffers`: subscribe with `watchExtensionTrades` (uid from `auth.currentUser`, skip when signed out); re-fetch offers when the extension set changes, passing `toTransaction` of each; render the label under each offer; draft picks as text ("+ 2027 2nd round pick"); when the user has no linked device, show a card "See offers people sent you · Get the browser extension" that navigates to `Extension`.

### Task 7: Browser extension screen

**Files:**
- Create: `app/screens/ExtensionScreen.tsx`
- Modify: `app/AppNavigator.tsx` (route `Extension: undefined`, account-menu item "Browser extension")

**Interfaces:**
- Consumes: Task 5 (`createPairing`, `watchLinkedDevices`, `unlinkDevice`), Task 2 `formatCode`, Task 9 zip at `/ffhelper-extension.zip`.

- [ ] **Step 1:** Use the frontend-design skill for layout. Sections: what it does + privacy promise ("Reads only the trades Sleeper's website shows you. Never sees your Sleeper password or login. Sends only trade details to your FF Helper account."), Download button + 4 install steps (unzip → chrome://extensions → Developer mode → Load unpacked), Connect (signed out → "Sign in to connect the extension"; else code in large monospace `XXXX-XXXX` with mm:ss countdown and "New code" when expired; flips to "Linked ✓" when a device appears), Linked browsers list with last sync and Unlink.
- [ ] **Step 2:** `npm run typecheck` passes; screenshot via the run skill in light and dark.

### Task 8: Extension runtime

**Files:**
- Create: `extension/manifest.json`, `extension/src/content-main.ts`, `extension/src/content-relay.ts`, `extension/src/background.ts`, `extension/src/popup.html`, `extension/src/popup.ts`, `extension/src/messages.ts`, `extension/src/writeGate.ts`
- Test: `tests/extension/runtime.test.ts`

**Interfaces:**
- Consumes: Task 1 `findTrades`, `leagueIdFromUrl`; Task 2 `normalizeCode`; Task 4 paths.
- Produces:
  - `RELAY_TAG = "ffh-trades-v1"`; `isRelayMessage(data: unknown): data is { tag: typeof RELAY_TAG; trades: CapturedTrade[]; seenGraphql: boolean }` (rejects other tags, non-array trades, > 200 trades)
  - `shouldWrite(last: Map<string, { at: number; status: string }>, t: CapturedTrade, now: number): boolean` (30 s per id unless status changed)
  - `claimCode(code: string): Promise<{ uid: string; label: string } | { error: "invalid" | "expired_or_used" | "network" }>`

- [ ] **Step 1: Failing tests:** `isRelayMessage` accepts a valid payload, rejects wrong tag/201 trades/strings; `shouldWrite` → true first time, false at +10 s same status, true at +10 s new status, true at +31 s.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Wire runtime: `content-main` (MAIN world, `document_start`) wraps `fetch`/`XMLHttpRequest` to clone and parse responses whose URL host is `sleeper.com`/`sleeper.app`/`api.sleeper.app`, runs `findTrades(json, leagueIdFromUrl(location.href))`, posts `{tag, trades, seenGraphql}` to window; `content-relay` (isolated) checks `event.source === window && isRelayMessage` → `chrome.runtime.sendMessage`; `background` signs in anonymously (persisted), on message filters with `shouldWrite`, `setDoc(users/{uid}/pendingTrades/{id}, {...trade, seenAt, capturedAt, source})`, updates `linkedDevices.lastSyncAt`; on permission-denied clears link state (Review Focus 4); keeps the last 20 captures in `chrome.storage.session` for the popup. `popup`: code entry (Task 2 normalize; error copy for `expired_or_used` = "That code expired or was already used. Make a new one in the app." (Review Focus 2)), linked state with label + last sync + count, **Check what I see** (last 20 captures + whether any Sleeper response was seen) with **Copy**, **Unlink this browser**.

### Task 9: Build, package, download

**Files:**
- Create: `scripts/build-extension.mjs`, `extension/PRIVACY.md`, `extension/README.md`
- Modify: `package.json` (devDependencies `esbuild`, `fflate`; script `"build:extension": "node scripts/build-extension.mjs"`), `.gitignore` (`extension/dist/`, `public/ffhelper-extension.zip`)

- [ ] **Step 1:** Script bundles `background`, `content-main`, `content-relay`, `popup` (IIFE for content scripts, ESM for background) into `extension/dist/`, copies `manifest.json`, `popup.html`, icons resized-by-copy from `assets/icon.png` (16/48/128 entries pointing at the same PNG), writes `public/ffhelper-extension.zip` with fflate.
- [ ] **Step 2:** Run `npm run build:extension` → `extension/dist/manifest.json` exists, zip > 0 bytes.
- [ ] **Step 3:** With the run skill, start Expo web and confirm `GET /ffhelper-extension.zip` returns 200 (if Expo 54 doesn't serve `public/`, put the zip under `assets/` and import it as an asset URL instead; record which in README).

### Task 10: End-to-end check with Playwright

**Files:**
- Create: `scripts/e2e-extension.mjs` (not part of `npm test`)

- [ ] **Step 1:** Launch Chromium persistent context with `--load-extension=extension/dist`; `page.route("https://sleeper.com/**")` serves a fixture HTML page whose script `fetch`es `https://sleeper.com/graphql` (also routed, returning the Task 1 GraphQL fixture).
- [ ] **Step 2:** Open the popup page (`chrome-extension://<id>/popup.html`) → "Check what I see" lists transaction `9`, status `proposed`, rosters `1, 4`. Expected output printed: `captured 1 trade(s)`.
- [ ] **Step 3:** Screenshot popup (linked-out state) for the user.

### Task 11: Reviews and delivery

- [ ] **Step 1:** Run the security-review skill on the full diff; fix findings that apply.
- [ ] **Step 2:** Run the code-review skill; fix confirmed findings.
- [ ] **Step 3:** verification-before-completion: `npm test`, `npm run typecheck`, `npm run build:extension`, `node scripts/e2e-extension.mjs` all shown passing.
- [ ] **Step 4:** Build `Fantasy-Football-Helper-v16.patch` against `origin/main` (no binaries; zip and dist are built by the user), check it applies in a clean `git archive`, send it with apply steps + `docs/extension-setup.md` steps.
