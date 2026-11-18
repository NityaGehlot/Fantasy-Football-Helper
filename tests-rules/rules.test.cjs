// Firestore rules tests. Needs Java + the Firebase emulator:
//   npx -p firebase-tools -p @firebase/rules-unit-testing firebase emulators:exec --only firestore --project demo-ffh "node --test tests-rules/rules.test.cjs"
const { test, before, after, beforeEach } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");
// Use the same Firebase copy as @firebase/rules-unit-testing (not the app's).
const fsPath = require.resolve("firebase/firestore", { paths: [path.dirname(require.resolve("@firebase/rules-unit-testing"))] });
const { doc, getDoc, setDoc, updateDoc, deleteDoc, Timestamp, serverTimestamp } = require(fsPath);

let env;
const MIN = 60 * 1000;
const ts = ms => Timestamp.fromMillis(Date.now() + ms);

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-ffh",
    firestore: { rules: fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8") },
  });
});
after(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const as = uid => env.authenticatedContext(uid).firestore();
const seed = (p, data) => env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), p), data));
// Seeded pairings (rules disabled) use explicit times; app-created ones use the server's clock.
const pairingDoc = (over = {}) => ({ uid: "alice", label: "Alice", createdAt: ts(0), claimedBy: null, ...over });
const newPairing = (over = {}) => ({ uid: "alice", label: "Alice", createdAt: serverTimestamp(), claimedBy: null, ...over });
const trade = id => ({ transactionId: id, leagueId: "1", status: "proposed", type: "trade", creator: "u", rosterIds: [1, 2], adds: {}, drops: {}, draftPicks: [], waiverBudget: [], created: 1, seenAt: 1, capturedAt: 1, source: "extension" });

test("owner can save to their own account document (favorites, my team)", async () => {
  await assertSucceeds(setDoc(doc(as("alice"), "users/alice"), { favorites: { players: [], teams: [] } }, { merge: true }));
  await assertFails(setDoc(doc(as("bob"), "users/alice"), { x: 1 }));
});

test("leagues stay owner-only", async () => {
  await assertSucceeds(setDoc(doc(as("alice"), "users/alice/leagues/1"), { leagueId: "1" }));
  await assertFails(getDoc(doc(as("bob"), "users/alice/leagues/1")));
});

test("app can create a pairing code for itself only, timed by the server clock", async () => {
  await assertSucceeds(setDoc(doc(as("alice"), "extensionPairings/ABCDEFGH"), newPairing()));
  await assertFails(setDoc(doc(as("alice"), "extensionPairings/ABCDEFGJ"), newPairing({ uid: "bob" })));
  // A device clock that's off can't set the time (skewed createdAt is rejected).
  await assertFails(setDoc(doc(as("alice"), "extensionPairings/ABCDEFGK"), newPairing({ createdAt: ts(5 * MIN) })));
});

test("extension claims a fresh code once, then links itself", async () => {
  await seed("extensionPairings/ABCDEFGH", pairingDoc());
  const ext = as("ext1");
  await assertSucceeds(updateDoc(doc(ext, "extensionPairings/ABCDEFGH"), { claimedBy: "ext1" }));
  await assertFails(updateDoc(doc(as("ext2"), "extensionPairings/ABCDEFGH"), { claimedBy: "ext2" }));
  await assertSucceeds(setDoc(doc(ext, "users/alice/linkedDevices/ext1"), { code: "ABCDEFGH", browser: "Chrome", linkedAt: 1, lastSyncAt: null, version: "1.0.0" }));
  // another extension can't link with someone else's claim
  await assertFails(setDoc(doc(as("ext2"), "users/alice/linkedDevices/ext2"), { code: "ABCDEFGH", browser: "x", linkedAt: 1, lastSyncAt: null, version: "1" }));
});

test("expired codes can't be read or claimed", async () => {
  await seed("extensionPairings/OLDCODE2", pairingDoc({ createdAt: ts(-11 * MIN) }));
  await assertFails(getDoc(doc(as("ext1"), "extensionPairings/OLDCODE2")));
  await assertFails(updateDoc(doc(as("ext1"), "extensionPairings/OLDCODE2"), { claimedBy: "ext1" }));
});

test("only a linked extension can save trades, and only the owner can read them", async () => {
  await assertFails(setDoc(doc(as("ext1"), "users/alice/pendingTrades/9"), trade("9")));
  await seed("users/alice/linkedDevices/ext1", { code: "ABCDEFGH", browser: "x", linkedAt: 1, lastSyncAt: null, version: "1" });
  await assertSucceeds(setDoc(doc(as("ext1"), "users/alice/pendingTrades/9"), trade("9")));
  await assertFails(setDoc(doc(as("ext1"), "users/alice/pendingTrades/9"), { ...trade("9"), token: "secret" }));
  await assertSucceeds(getDoc(doc(as("alice"), "users/alice/pendingTrades/9")));
  await assertFails(getDoc(doc(as("bob"), "users/alice/pendingTrades/9")));
  await assertFails(getDoc(doc(as("ext1"), "users/alice/pendingTrades/9")));
});

test("after unlinking, the extension can't save anymore", async () => {
  await seed("users/alice/linkedDevices/ext1", { code: "ABCDEFGH", browser: "x", linkedAt: 1, lastSyncAt: null, version: "1" });
  await assertSucceeds(deleteDoc(doc(as("alice"), "users/alice/linkedDevices/ext1")));
  await assertFails(setDoc(doc(as("ext1"), "users/alice/pendingTrades/9"), trade("9")));
});

test("an extension can unlink itself, but not other browsers", async () => {
  await seed("users/alice/linkedDevices/ext1", { code: "ABCDEFGH", browser: "x", linkedAt: 1, lastSyncAt: null, version: "1" });
  await seed("users/alice/linkedDevices/ext2", { code: "ABCDEFGJ", browser: "y", linkedAt: 1, lastSyncAt: null, version: "1" });
  await assertFails(deleteDoc(doc(as("ext1"), "users/alice/linkedDevices/ext2")));
  await assertSucceeds(deleteDoc(doc(as("ext1"), "users/alice/linkedDevices/ext1")));
});

test("a browser whose device record still exists can re-link with a new code (remove, then add)", async () => {
  await seed("users/alice/linkedDevices/ext1", { code: "OLDCODE2", browser: "x", linkedAt: 1, lastSyncAt: null, version: "1" });
  await seed("extensionPairings/NEWCODE2", pairingDoc({ claimedBy: "ext1" }));
  const ext = as("ext1");
  // Overwriting the old record is an update, which only allows sync fields:
  await assertFails(setDoc(doc(ext, "users/alice/linkedDevices/ext1"), { code: "NEWCODE2", browser: "y", linkedAt: 2, lastSyncAt: null, version: "1" }));
  // ...so the extension removes its own record first, then creates it again.
  await assertSucceeds(deleteDoc(doc(ext, "users/alice/linkedDevices/ext1")));
  await assertSucceeds(setDoc(doc(ext, "users/alice/linkedDevices/ext1"), { code: "NEWCODE2", browser: "y", linkedAt: 2, lastSyncAt: null, version: "1" }));
});
