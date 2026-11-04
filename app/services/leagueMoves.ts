// app/services/leagueMoves.ts
// League activity from the backend: completed trades, waiver claims and free-agent moves by
// every manager in the league (last two weeks), newest first.

import { getApiBaseUrl } from './apiBaseUrl';

export type MovePlayer = { id: string; name: string; position: string; team?: string };
export type MoveSide = { rosterId: number; teamName: string; adds: MovePlayer[]; drops: MovePlayer[]; picks: string[]; faab: number };
export type LeagueMove = {
  id: string;
  type: 'trade' | 'waiver' | 'free_agent' | 'commissioner';
  at: number;
  week: number;
  sides: MoveSide[];
  bid?: number;
  involvesYou: boolean;
  summary: string;
};

export async function fetchLeagueMoves(leagueId: string, rosterId?: number | null): Promise<LeagueMove[]> {
  const qs = new URLSearchParams({ leagueId });
  if (rosterId !== undefined && rosterId !== null) qs.set('rosterId', String(rosterId));
  const res = await fetch(`${getApiBaseUrl()}/league-moves?${qs}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'League activity unavailable');
  return Array.isArray(data?.moves) ? data.moves : [];
}

export const MOVE_LABELS: Record<LeagueMove['type'], string> = {
  trade: 'Trade',
  waiver: 'Waiver claim',
  free_agent: 'Free agent',
  commissioner: 'Commissioner',
};

/** Moves by other managers made in the last `hours` (for notifications). */
export function recentMovesByOthers(moves: LeagueMove[], now = Date.now(), hours = 24): LeagueMove[] {
  return moves.filter(m => !m.involvesYou && m.at > 0 && now - m.at <= hours * 3_600_000);
}
