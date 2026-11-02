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
  yetToPlayPositions?: string[];
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

// Whole-number percentages for both sides that always add up to 100.
export function oddsPercents(p: number): [number, number] {
  const mine = Math.round(Math.min(1, Math.max(0, p)) * 100);
  return [mine, 100 - mine];
}

// "QB, 2 WR" style summary of positions still to play, in lineup order.
export function summarizePositions(positions: string[]): string {
  const order = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
  const counts = new Map<string, number>();
  positions.forEach(p => counts.set(p, (counts.get(p) ?? 0) + 1));
  return [...counts.entries()]
    .sort((a, b) => (order.indexOf(a[0]) + 99) % 99 - (order.indexOf(b[0]) + 99) % 99)
    .map(([pos, n]) => (n > 1 ? `${n} ${pos}` : pos))
    .join(', ');
}

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
