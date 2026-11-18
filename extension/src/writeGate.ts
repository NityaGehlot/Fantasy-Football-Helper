// extension/src/writeGate.ts
// Keeps the extension from saving the same trade over and over: once per 30 seconds per trade,
// or right away when its status changes (accepted, rejected...).

import type { CapturedTrade } from './capture';

const MIN_GAP_MS = 30_000;

export function shouldWrite(last: Map<string, { at: number; status: string }>, t: CapturedTrade, now: number): boolean {
  const prev = last.get(t.transactionId);
  return !prev || prev.status !== t.status || now - prev.at >= MIN_GAP_MS;
}
