// extension/src/background.ts
// The extension's background worker: links to your FF Helper account with a one-time code and
// saves the pending trades the page script found to your account (Firestore, per firestore.rules).

import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth/web-extension';
import { deleteDoc, doc, getDoc, getFirestore, setDoc, updateDoc } from 'firebase/firestore/lite';
import { firebaseConfig } from '../../app/services/firebaseConfig';
import { normalizeCode } from '../../app/services/pairingCode';
import type { CapturedTrade } from './capture';
import { shouldWrite } from './writeGate';

const VERSION = chrome.runtime.getManifest().version;
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

type Link = { uid: string; label: string; linkedAt: number };
type Capture = { transactionId: string; status: string; rosterIds: number[]; leagueId: string | null; at: number };
type Status = { link: Link | null; unlinked: boolean; lastSyncAt: number | null; captures: Capture[]; seenSleeper: boolean };

const lastWrite = new Map<string, { at: number; status: string }>();
let lastDeviceSync = 0;

const getLink = async (): Promise<Link | null> => ((await chrome.storage.local.get('link')).link as Link) ?? null;

async function me(): Promise<string> {
  await auth.authStateReady();
  return auth.currentUser?.uid ?? (await signInAnonymously(auth)).user.uid;
}

function browserName(): string {
  const ua = navigator.userAgent;
  const name = /Edg\//.test(ua) ? 'Edge' : (navigator as any).brave ? 'Brave' : /OPR\//.test(ua) ? 'Opera' : 'Chrome';
  const os = /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : 'computer';
  return `${name} on ${os}`;
}

const isDenied = (e: any) => String(e?.code ?? e?.message ?? '').includes('permission-denied');

/** Link this browser to the account that made the code. */
async function claimCode(input: string): Promise<{ ok: true; label: string } | { error: 'invalid' | 'expired_or_used' | 'network' }> {
  const code = normalizeCode(input);
  if (!code) return { error: 'invalid' };
  try {
    const extUid = await me();
    const ref = doc(db, 'extensionPairings', code);
    let snap;
    try {
      snap = await getDoc(ref);
    } catch (e) {
      if (isDenied(e)) return { error: 'expired_or_used' }; // expired codes can't be read
      throw e;
    }
    const p = snap.data() as any;
    if (!snap.exists() || (p.claimedBy && p.claimedBy !== extUid)) return { error: 'expired_or_used' };
    if (!p.claimedBy) await updateDoc(ref, { claimedBy: extUid });
    const now = Date.now();
    const device = doc(db, 'users', p.uid, 'linkedDevices', extUid);
    // If this browser is still listed from an earlier link, remove that record first: the rules
    // only let an existing record change its sync fields.
    await deleteDoc(device).catch(() => undefined);
    await setDoc(device, { code, browser: browserName(), linkedAt: now, lastSyncAt: null, version: VERSION });
    const link: Link = { uid: p.uid, label: String(p.label ?? 'your account'), linkedAt: now };
    await chrome.storage.local.set({ link, unlinked: false });
    return { ok: true, label: link.label };
  } catch (e) {
    return isDenied(e) ? { error: 'expired_or_used' } : { error: 'network' };
  }
}

async function unlinkHere() {
  const link = await getLink();
  if (link) {
    try {
      await deleteDoc(doc(db, 'users', link.uid, 'linkedDevices', await me()));
    } catch {
      // already unlinked from the app
    }
  }
  await chrome.storage.local.set({ link: null, unlinked: false });
}

async function remember(trades: CapturedTrade[]) {
  const { captures = [] } = (await chrome.storage.session.get('captures')) as { captures?: Capture[] };
  const now = Date.now();
  const fresh = trades.map(t => ({ transactionId: t.transactionId, status: t.status, rosterIds: t.rosterIds, leagueId: t.leagueId, at: now }));
  // Newest first, one line per trade.
  const ids = new Set(fresh.map(c => c.transactionId));
  await chrome.storage.session.set({ captures: [...fresh, ...captures.filter(c => !ids.has(c.transactionId))].slice(0, 20), seenSleeper: true });
}

async function saveTrades(trades: CapturedTrade[]) {
  const now = Date.now();
  try {
    const link = await getLink();
    if (!link) return;
    const extUid = await me();
    for (const t of trades) {
      if (!t.leagueId || !shouldWrite(lastWrite, t, now)) continue;
      const first = !lastWrite.has(t.transactionId);
      await setDoc(
        doc(db, 'users', link.uid, 'pendingTrades', t.transactionId),
        { ...t, seenAt: now, source: 'extension', ...(first ? { capturedAt: now } : {}) },
        { merge: true }
      );
      lastWrite.set(t.transactionId, { at: now, status: t.status });
    }
    if (trades.length && now - lastDeviceSync > 30_000) {
      lastDeviceSync = now;
      await updateDoc(doc(db, 'users', link.uid, 'linkedDevices', extUid), { lastSyncAt: now, version: VERSION });
      await chrome.storage.local.set({ lastSyncAt: now });
    }
  } catch (e) {
    // Unlinked from the app: stop saving and tell the popup.
    if (isDenied(e)) await chrome.storage.local.set({ link: null, unlinked: true });
  }
}

async function status(): Promise<Status> {
  const local = await chrome.storage.local.get(['link', 'unlinked', 'lastSyncAt']);
  const session = await chrome.storage.session.get(['captures', 'seenSleeper']);
  return {
    link: (local.link as Link) ?? null,
    unlinked: !!local.unlinked,
    lastSyncAt: (local.lastSyncAt as number) ?? null,
    captures: (session.captures as Capture[]) ?? [],
    seenSleeper: !!session.seenSleeper,
  };
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  // Trades only come from our own content script on sleeper.com.
  if (msg?.type === 'trades') {
    if (sender.id !== chrome.runtime.id || !sender.url?.startsWith('https://sleeper.com/')) return;
    const trades = (Array.isArray(msg.trades) ? msg.trades : []).slice(0, 200) as CapturedTrade[];
    // Offline or sign-in trouble: skip this batch; the next Sleeper response retries.
    remember(trades).then(() => saveTrades(trades)).catch(() => undefined);
    return;
  }
  // Everything else must come from one of this extension's own pages (the popup).
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return;
  if (msg?.type === 'claim') claimCode(String(msg.code ?? '')).then(reply);
  else if (msg?.type === 'unlink') unlinkHere().then(() => reply({ ok: true }));
  else if (msg?.type === 'status') status().then(reply);
  else return;
  return true; // reply comes later
});
