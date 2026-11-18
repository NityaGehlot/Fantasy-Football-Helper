// extension/src/messages.ts
// The message the page script sends to the relay script (window.postMessage), and its check.

import type { CapturedTrade } from './capture';

export const RELAY_TAG = 'ffh-trades-v1';
const MAX = 200;

export type RelayMessage = { tag: typeof RELAY_TAG; trades: CapturedTrade[]; seenGraphql: boolean };

export function isRelayMessage(data: unknown): data is RelayMessage {
  const d = data as any;
  return !!d && typeof d === 'object' && d.tag === RELAY_TAG && Array.isArray(d.trades) && d.trades.length <= MAX && typeof d.seenGraphql === 'boolean';
}
