// app/services/liveMatchup.ts
// Client for the backend live scoreboard (current points, projected finals, win odds).

import { getApiBaseUrl } from './apiBaseUrl';

export type LivePlayer = {
  id: string;
  name: string;
  position: string;
  slot: string;
  team: string;
  points: number;
  projectedTotal: number;
  projectedRemaining: number;
  fractionRemaining: number;
  game: { state: 'pre' | 'in' | 'post' | 'bye'; detail: string; opponent: string | null };
  statLine: string;
  projectedFinal: number;
};

export type LiveSide = {
  rosterId: number;
  teamName: string;
  points: number;
  projectedFinal: number;
  stdDev: number;
  winProbability: number;
  playersYetToPlay: number;
  playersInProgress: number;
  starters: LivePlayer[];
  bench?: LivePlayer[];
};

export type LiveScoreboard = {
  season: number;
  week: number;
  updatedAt: string;
  scheduleKnown: boolean;
  isLive: boolean;
  isFinal: boolean;
  me: LiveSide;
  opponent: LiveSide | null;
};

export const LIVE_REFRESH_MS = 60 * 1000;

export async function fetchLiveScoreboard(leagueId: string, rosterId: number, week: number): Promise<LiveScoreboard> {
  const res = await fetch(`${getApiBaseUrl()}/live-matchup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leagueId, rosterId, week }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Live scoreboard failed');
  return data as LiveScoreboard;
}

// Player id -> live info for both sides, for decorating roster rows.
export function livePlayerMap(board: LiveScoreboard | null): Record<string, LivePlayer> {
  const map: Record<string, LivePlayer> = {};
  if (!board) return map;
  [board.me, board.opponent].forEach(side => {
    [...(side?.starters ?? []), ...(side?.bench ?? [])].forEach(p => (map[p.id] = p));
  });
  return map;
}
