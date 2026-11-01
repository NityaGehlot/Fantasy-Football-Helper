// app/backend/services/sleeperServer.ts
// Cached Sleeper reads for the backend (trade agent, waiver and draft chat answers).

import fetch from "node-fetch";
import { createTtlCache, HOUR, MINUTE } from "../utils/ttlCache";

const SLEEPER_BASE = process.env.SLEEPER_API_URL || "https://api.sleeper.app/v1";
// Projections and live stats live outside /v1 (Sleeper's undocumented but public endpoints).
const SLEEPER_ROOT = SLEEPER_BASE.replace(/\/v1\/?$/, "");
const cache = createTtlCache();

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sleeper request failed (${res.status}): ${url}`);
  return res.json();
}

export const getLeague = (leagueId: string) =>
  cache.get(`league:${leagueId}`, 6 * HOUR, () => fetchJson(`${SLEEPER_BASE}/league/${leagueId}`));

export const getLeagueUsers = (leagueId: string) =>
  cache.get(`users:${leagueId}`, 6 * HOUR, () => fetchJson(`${SLEEPER_BASE}/league/${leagueId}/users`));

export const getRosters = (leagueId: string) =>
  cache.get(`rosters:${leagueId}`, 5 * MINUTE, () => fetchJson(`${SLEEPER_BASE}/league/${leagueId}/rosters`));

// Full player database (~5MB). Sleeper asks for this to be fetched at most once per day.
export const getAllPlayers = (): Promise<Record<string, any>> =>
  cache.get("players", 24 * HOUR, () => fetchJson(`${SLEEPER_BASE}/players/nfl`));

export const getDraftPicks = (draftId: string): Promise<any[]> =>
  cache.get(`draftPicks:${draftId}`, 1 * MINUTE, () => fetchJson(`${SLEEPER_BASE}/draft/${draftId}/picks`));

export const getTrendingAdds = (): Promise<{ player_id: string; count: number }[]> =>
  cache.get("trendingAdds", 30 * MINUTE, () =>
    fetchJson(`${SLEEPER_BASE}/players/nfl/trending/add?lookback_hours=24&limit=25`)
  );

export const getNflState = (): Promise<{ season?: string; week?: number; season_type?: string }> =>
  cache.get("nflState", 15 * MINUTE, () => fetchJson(`${SLEEPER_BASE}/state/nfl`));

// Live matchup scores. Short TTL so in-game points stay fresh.
export const getMatchups = (leagueId: string, week: number): Promise<any[]> =>
  cache.get(`matchups:${leagueId}:${week}`, 30 * 1000, () =>
    fetchJson(`${SLEEPER_BASE}/league/${leagueId}/matchups/${week}`)
  );

const asPlayerMap = (rows: any): Record<string, any> => {
  if (!Array.isArray(rows)) return rows ?? {};
  const map: Record<string, any> = {};
  for (const row of rows) if (row?.player_id) map[String(row.player_id)] = row.stats ?? {};
  return map;
};

// Weekly projections keyed by player id ({ pts_ppr, pts_half_ppr, pts_std, ... }).
export const getProjections = (season: number, week: number): Promise<Record<string, any>> =>
  cache.get(`projections:${season}:${week}`, 30 * MINUTE, async () =>
    asPlayerMap(await fetchJson(`${SLEEPER_ROOT}/projections/nfl/${season}/${week}?season_type=regular`))
  );

// Live (in-game) stat lines keyed by player id ({ pass_yd, rush_yd, rec, rec_yd, pts_ppr, ... }).
export const getWeekStats = (season: number, week: number): Promise<Record<string, any>> =>
  cache.get(`stats:${season}:${week}`, 30 * 1000, async () =>
    asPlayerMap(await fetchJson(`${SLEEPER_ROOT}/stats/nfl/${season}/${week}?season_type=regular`))
  );
