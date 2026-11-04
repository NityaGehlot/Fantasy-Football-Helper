// app/services/playerRanks.ts
// Fantasy ranks like Sleeper's (from the backend): where each player ranks by fantasy points
// this season, overall and at his position, using your league's scoring.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiBaseUrl } from './apiBaseUrl';
import { createCache, MINUTE } from './cache';

export type PlayerRank = { points: number; games: number; overall: number; position: number; pos: string; positionCount: number };
export type RankFile = { season: number; scoring: 'league' | 'ppr'; ranks: Record<string, PlayerRank> };

const cache = createCache({ storage: AsyncStorage, prefix: 'ffh_ranks_v1:' });

/** Ranks for a league (its scoring) or standard PPR when no league is given. Null if unavailable. */
export async function getPlayerRanks(leagueId?: string | null, season?: number): Promise<RankFile | null> {
  const key = `${leagueId ?? 'ppr'}:${season ?? 'current'}`;
  try {
    return await cache.get(
      key,
      60 * MINUTE,
      async () => {
        const qs = new URLSearchParams();
        if (leagueId) qs.set('leagueId', leagueId);
        if (season) qs.set('season', String(season));
        const res = await fetch(`${getApiBaseUrl()}/player-ranks?${qs}`);
        if (!res.ok) throw new Error('Ranks unavailable');
        return (await res.json()) as RankFile;
      },
      { persist: true }
    );
  } catch {
    return null;
  }
}

/** Ordinal for a rank: 1st, 2nd, 3rd, 11th, 22nd. */
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** "RB12" */
export const positionRankLabel = (r?: PlayerRank | null) => (r ? `${r.pos}${r.position}` : '');
