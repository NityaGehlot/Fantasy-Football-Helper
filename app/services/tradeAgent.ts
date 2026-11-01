// app/services/tradeAgent.ts
// Client for the backend trade agent. Ideas are cached on the device for a few hours so
// the agent can run automatically on app open without hammering Sleeper.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiBaseUrl } from './apiBaseUrl';
import { untouchableKey, type TradeScan } from './tradeFormat';

export { countUnseen, isScanStale, TRADE_SCAN_INTERVAL_MS } from './tradeFormat';
export type { TradeIdea, TradeIdeaPlayer, TradeScan } from './tradeFormat';

const scanKey = (leagueId: string, rosterId: number) => `ffh_trade_scan_v1:${leagueId}:${rosterId}`;
const seenKey = (leagueId: string, rosterId: number) => `ffh_trade_seen_v1:${leagueId}:${rosterId}`;
const untouchableStorageKey = (leagueId: string, rosterId: number) => `ffh_trade_untouchable_v1:${leagueId}:${rosterId}`;

export async function loadUntouchables(leagueId: string, rosterId: number): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(untouchableStorageKey(leagueId, rosterId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export async function saveUntouchables(leagueId: string, rosterId: number, ids: string[]): Promise<void> {
  await AsyncStorage.setItem(untouchableStorageKey(leagueId, rosterId), JSON.stringify(ids)).catch(() => undefined);
}

export async function loadSavedScan(leagueId: string, rosterId: number): Promise<TradeScan | null> {
  try {
    const raw = await AsyncStorage.getItem(scanKey(leagueId, rosterId));
    const parsed = raw ? (JSON.parse(raw) as TradeScan) : null;
    return parsed && Array.isArray(parsed.ideas) ? parsed : null;
  } catch {
    return null;
  }
}

export async function runTradeScan(
  team: { leagueId: string; rosterId: number; ownerId?: string },
  untouchable: string[] = []
): Promise<TradeScan> {
  const res = await fetch(`${getApiBaseUrl()}/trade-ideas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...team, untouchable }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Trade agent failed');

  const scan: TradeScan = {
    generatedAt: data.generatedAt ?? new Date().toISOString(),
    leagueId: team.leagueId,
    rosterId: team.rosterId,
    ideas: Array.isArray(data.ideas) ? data.ideas : [],
    untouchableKey: untouchableKey(untouchable),
  };
  AsyncStorage.setItem(scanKey(team.leagueId, team.rosterId), JSON.stringify(scan)).catch(() => undefined);
  return scan;
}

export async function loadSeenIdeaIds(leagueId: string, rosterId: number): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(seenKey(leagueId, rosterId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export async function saveSeenIdeaIds(leagueId: string, rosterId: number, ids: string[]): Promise<void> {
  // Keep the list bounded; old ids naturally fall off.
  await AsyncStorage.setItem(seenKey(leagueId, rosterId), JSON.stringify(ids.slice(-200))).catch(() => undefined);
}
