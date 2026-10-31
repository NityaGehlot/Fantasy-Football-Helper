// app/backend/services/sleeperServer.ts
// Cached Sleeper reads for the backend (trade agent, waiver and draft chat answers).

import fetch from "node-fetch";
import { createTtlCache, HOUR, MINUTE } from "../utils/ttlCache";

const SLEEPER_BASE = process.env.SLEEPER_API_URL || "https://api.sleeper.app/v1";
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
