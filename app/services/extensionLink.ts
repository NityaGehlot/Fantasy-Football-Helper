// app/services/extensionLink.ts
// Linking the FF Helper browser extension to your account (one-time pairing code), the browsers
// you've linked, and the pending Sleeper trades they saved. Firestore paths match firestore.rules.

import { collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from './firebase';
import { newPairingCode, PAIRING_TTL_MS } from './pairingCode';
import { freshExtensionTrades, type ExtensionTrade } from './extensionTrades';

export type LinkedDevice = { id: string; browser: string; linkedAt: number; lastSyncAt: number | null; version: string };

/**
 * A new pairing code for this account. It lasts 10 minutes from when the server saves it (the
 * rules time it with the server's clock, so a wrong device clock doesn't matter); `expiresAt` is
 * this device's estimate for the countdown. `label` is a display name, never the email.
 */
export async function createPairing(uid: string, label: string): Promise<{ code: string; expiresAt: number }> {
  const code = newPairingCode();
  await setDoc(doc(db, 'extensionPairings', code), { uid, label: label.slice(0, 60), createdAt: serverTimestamp(), claimedBy: null });
  return { code, expiresAt: Date.now() + PAIRING_TTL_MS };
}

/** Browsers linked to this account (live). Returns an unsubscribe function. */
export function watchLinkedDevices(uid: string, cb: (d: LinkedDevice[]) => void): () => void {
  return onSnapshot(
    collection(db, 'users', uid, 'linkedDevices'),
    snap =>
      cb(
        snap.docs.map(d => {
          const v = d.data() as any;
          return { id: d.id, browser: String(v.browser ?? 'Browser'), linkedAt: Number(v.linkedAt) || 0, lastSyncAt: v.lastSyncAt ?? null, version: String(v.version ?? '') };
        })
      ),
    () => cb([])
  );
}

export const unlinkDevice = (uid: string, extUid: string) => deleteDoc(doc(db, 'users', uid, 'linkedDevices', extUid));

/** Pending trades the extension saved for one league (live, only fresh pending ones). */
export function watchExtensionTrades(uid: string, leagueId: string, cb: (t: ExtensionTrade[]) => void): () => void {
  return onSnapshot(
    query(collection(db, 'users', uid, 'pendingTrades'), where('leagueId', '==', String(leagueId))),
    snap => cb(freshExtensionTrades(snap.docs.map(d => d.data() as ExtensionTrade), Date.now())),
    () => cb([])
  );
}
