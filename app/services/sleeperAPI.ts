// app/services/sleeperAPI.ts

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createCache, MINUTE, HOUR } from './cache';

const SLEEPER_BASE = 'https://api.sleeper.app/v1';
const TRENDING_BASE_URL = 'https://raw.githubusercontent.com/NityaGehlot/nfl-data/main/data/sleeperAPI';
const PLAYERS_BASE_URL = 'https://raw.githubusercontent.com/NityaGehlot/nfl-data/refs/heads/main/data/sleeperAPI';

export type TrendType = 'add' | 'drop';

// Every Sleeper / GitHub request below goes through this cache so screens can call these
// functions freely without re-downloading the same data on every week or screen change.
const cache = createCache({ storage: AsyncStorage });

const TTL = {
  league: 6 * HOUR,
  users: 6 * HOUR,
  rosters: 5 * MINUTE,
  matchups: 2 * MINUTE,
  players: 24 * HOUR, // Sleeper asks apps to fetch /players/nfl at most once per day
  nflState: 15 * MINUTE,
  leagueHistory: 24 * HOUR,
  trending: 30 * MINUTE,
};

export type FetchOptions = { force?: boolean };

async function fetchJson(url: string, errorMessage: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(errorMessage);
  return res.json();
}

// Force the next league/roster/matchup reads to hit Sleeper (used by the Refresh button).
export async function refreshLeagueCache(leagueId: string) {
  await cache.invalidate(`league:${leagueId}`);
}

function normalizeTrendingRows(raw: any): any[] {
  const rows = Array.isArray(raw) ? raw : Object.values(raw ?? {});

  return rows
    .map((row: any) => ({
      ...row,
      count: Number(row?.count) || 0,
      player_id: String(row?.player_id ?? ''),
    }))
    .filter((row: any) => row.player_id.length > 0);
}

function normalizePlayersToIndex(raw: any): Record<string, any> {
  const rows = Array.isArray(raw)
    ? raw
    : Object.entries(raw ?? {}).map(([player_id, player]) => ({ player_id, ...(player as any) }));

  return rows.reduce((acc: Record<string, any>, row: any) => {
    const playerId = String(row?.player_id ?? '').trim();
    if (!playerId) return acc;

    const normalizedStatus = String(row?.status ?? '').toLowerCase();
    const isActive = typeof row?.active === 'boolean'
      ? row.active
      : normalizedStatus === 'active';

    acc[playerId] = {
      ...row,
      player_id: playerId,
      active: isActive,
    };

    return acc;
  }, {});
}

export async function getLeague(leagueId: string, { force }: FetchOptions = {}) {
  return cache.get(
    `league:${leagueId}:info`,
    TTL.league,
    () => fetchJson(`${SLEEPER_BASE}/league/${leagueId}`, 'Failed to fetch league'),
    { persist: true, force }
  );
}

export async function getLeagueUsers(leagueId: string, { force }: FetchOptions = {}) {
  return cache.get(
    `league:${leagueId}:users`,
    TTL.users,
    () => fetchJson(`${SLEEPER_BASE}/league/${leagueId}/users`, 'Failed to fetch users'),
    { persist: true, force }
  );
}

export async function getRosters(leagueId: string, { force }: FetchOptions = {}) {
  return cache.get(
    `league:${leagueId}:rosters`,
    TTL.rosters,
    () => fetchJson(`${SLEEPER_BASE}/league/${leagueId}/rosters`, 'Failed to fetch rosters'),
    { persist: true, force }
  );
}

// Full Sleeper player database (~5MB). Cached in memory only: it is too large for web storage.
export async function getPlayers({ force }: FetchOptions = {}) {
  return cache.get(
    'players:sleeper',
    TTL.players,
    () => fetchJson(`${SLEEPER_BASE}/players/nfl`, 'Failed to fetch players'),
    { force }
  );
}

export async function getPlayersFromGithub(): Promise<Record<string, any>> {
  return cache.get('players:github', TTL.players, async () => {
    const source = await fetchJson(`${PLAYERS_BASE_URL}/sleeper_players.json`, 'Failed to fetch players from GitHub');
    return normalizePlayersToIndex(source);
  });
}

export async function getMatchups(leagueId: string, week: number, { force }: FetchOptions = {}) {
  return cache.get(
    `league:${leagueId}:matchups:${week}`,
    TTL.matchups,
    () => fetchJson(`${SLEEPER_BASE}/league/${leagueId}/matchups/${week}`, 'Failed to fetch matchups'),
    { persist: true, force }
  );
}

export async function getPlayerWeekStats(playerId: string, season: number, week: number) {
  return cache.get(
    `playerWeek:${playerId}:${season}:${week}`,
    TTL.matchups,
    () => fetchJson(
      `https://api.sleeper.app/stats/nfl/player/${playerId}?season=${season}&week=${week}`,
      'Player stats fetch failed'
    )
  );
}

export async function getTrendingPlayers(type: TrendType = 'add', limit: number = 25) {
  const fileName = type === 'add' ? 'trending_adds.json' : 'trending_drops.json';
  const source = await cache.get(`trending:${type}`, TTL.trending, () =>
    fetchJson(`${TRENDING_BASE_URL}/${fileName}`, `Failed to fetch trending ${type}s from GitHub`)
  );

  return normalizeTrendingRows(source)
    .sort((a, b) => Number(b.count) - Number(a.count))
    .slice(0, limit);
}

export async function getNFLState(): Promise<{
  season?: string;
  week?: number;
  season_type?: string;
}> {
  return cache.get(
    'nflState',
    TTL.nflState,
    () => fetchJson(`${SLEEPER_BASE}/state/nfl`, 'Failed to fetch NFL state'),
    { persist: true }
  );
}

// ✅ Get league history by traversing previous_league_id
export async function getLeagueHistory(leagueId: string): Promise<Array<{ league_id: string; season: number; name: string }>> {
  return cache.get(`leagueHistory:${leagueId}`, TTL.leagueHistory, () => loadLeagueHistory(leagueId), { persist: true });
}

async function loadLeagueHistory(leagueId: string): Promise<Array<{ league_id: string; season: number; name: string }>> {
  const history: Array<{ league_id: string; season: number; name: string }> = [];
  let currentLeagueId = leagueId;
  const visited = new Set<string>();

  while (currentLeagueId && !visited.has(currentLeagueId)) {
    visited.add(currentLeagueId);
    try {
      const leagueData = await getLeague(currentLeagueId);
      history.push({
        league_id: currentLeagueId,
        season: leagueData.season,
        name: `${leagueData.season} Season`
      });
      currentLeagueId = leagueData.previous_league_id;
    } catch (err) {
      console.log('Reached end of league history');
      break;
    }
  }

  return history;
}


