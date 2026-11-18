// app/services/extensionTrades.ts
// Pending trades the FF Helper browser extension saved to your account (pure helpers).

import type { CapturedTrade } from '../../extension/src/capture';

export type ExtensionTrade = CapturedTrade & { seenAt: number };

const DAY = 86_400_000;
const MAX_AGE = 14 * DAY;
const PENDING = new Set(['proposed', 'pending']);

/** Offers still pending and seen in the last 14 days, newest first. */
export function freshExtensionTrades(docs: ExtensionTrade[], now: number): ExtensionTrade[] {
  return docs
    .filter(t => PENDING.has(String(t.status)) && now - Number(t.seenAt) <= MAX_AGE)
    .sort((a, b) => b.seenAt - a.seenAt);
}

/** "just now", "3m ago", "2h ago", "4d ago" */
export function seenAgo(seenAt: number, now: number): string {
  const s = Math.max(0, Math.floor((now - seenAt) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

/** "via browser extension · seen 3m ago" for offers the extension found ("" for Sleeper's own). */
export function offerSourceLabel(o: { transactionId: string; source?: string }, seen: Map<string, number>, now: number): string {
  if (o.source !== 'extension') return '';
  const at = seen.get(o.transactionId);
  return at ? `via browser extension · seen ${seenAgo(at, now)}` : 'via browser extension';
}

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

/** Draft picks you'd get and give in a trade, as "2027 2nd round pick". */
export function draftPickLines(picks: unknown[] | undefined, myRosterId: number): { get: string[]; give: string[] } {
  const out = { get: [] as string[], give: [] as string[] };
  for (const p of (picks ?? []) as any[]) {
    const line = `${p?.season ?? ''} ${ordinal(Number(p?.round) || 0)} round pick`.trim();
    if (Number(p?.owner_id) === Number(myRosterId)) out.get.push(line);
    else if (Number(p?.previous_owner_id) === Number(myRosterId)) out.give.push(line);
  }
  return out;
}

/** Did a browser link since `before` (id -> linkedAt) was taken? New browser, or the same one re-linked. */
export function newlyLinked(before: Map<string, number>, after: { id: string; linkedAt: number }[]): boolean {
  return after.some(d => before.get(d.id) !== d.linkedAt);
}
