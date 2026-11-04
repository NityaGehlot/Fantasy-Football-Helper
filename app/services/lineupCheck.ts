// app/services/lineupCheck.ts
// Client for the backend lineup check: your set lineup vs the best one this week.

import { getApiBaseUrl } from './apiBaseUrl';

export type CheckPlayer = { id: string; name: string; position: string; team?: string; value: number; injuryStatus?: string };
export type LineupSwap = { slot: string; start: CheckPlayer; bench: CheckPlayer | null; gain: number; from?: string; movesTo?: string };
export type LineupCheck = {
  week: number;
  kickoffs: string[];
  currentPoints: number;
  bestPoints: number;
  swaps: LineupSwap[];
  problems: string[];
  // Starting slots that are empty in Sleeper right now
  emptySlots?: string[];
};

export async function fetchLineupCheck(leagueId: string, rosterId: number, ownerId?: string): Promise<LineupCheck> {
  const res = await fetch(`${getApiBaseUrl()}/lineup-check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leagueId, rosterId, ownerId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Lineup check failed');
  return data as LineupCheck;
}

/** Steps to make the swaps in Sleeper (the API can't change lineups for you). */
export const SLEEPER_SWAP_STEPS = [
  'Open your team in the Sleeper app (or sleeper.com).',
  'Tap the position button next to the player you want to bench.',
  'Tap the player you want to start in that spot. Repeat for each swap.',
];

/** When the lineup-check reminder fires: 90 minutes before each kickoff window. */
export const LINEUP_CHECK_LEAD_MS = 90 * 60 * 1000;

export function lineupCheckTimes(kickoffs: string[], now = Date.now()): { kickoff: string; at: Date }[] {
  return [...new Set(kickoffs)]
    .map(k => ({ kickoff: k, at: new Date(Date.parse(k) - LINEUP_CHECK_LEAD_MS) }))
    .filter(x => Number.isFinite(x.at.getTime()) && x.at.getTime() > now)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}
