// app/backend/services/sleeperServer.ts
// Cached Sleeper reads for the backend (trade agent, waiver and draft chat answers).

import fetch from "node-fetch";
import { createTtlCache, HOUR, MINUTE } from "../utils/ttlCache";

const SLEEPER_BASE = process.env.SLEEPER_API_URL || "https://api.sleeper.app/v1";
// Projections and live stats live outside /v1 (Sleeper's undocumented but public endpoints).
const SLEEPER_ROOT = SLEEPER_BASE.replace(/\/v1\/?$/, "");
const cache = createTtlCache();

async function fetchJson(url: string, timeoutMs = 20000): Promise<any> {
  // A timeout so a slow or unreachable endpoint can't stall every screen that needs league data.
  const res = await fetch(url, { timeout: timeoutMs });
  if (!res.ok) throw new Error(`Sleeper request failed (${res.status}): ${url}`);
  return res.json();
}

export const getLeague = (leagueId: string) =>
  cache.get(`league:${leagueId}`, 6 * HOUR, () => fetchJson(`${SLEEPER_BASE}/league/${leagueId}`));

export const getLeagueUsers = (leagueId: string) =>
  cache.get(`users:${leagueId}`, 6 * HOUR, () => fetchJson(`${SLEEPER_BASE}/league/${leagueId}/users`));

export const getRosters = (leagueId: string) =>
  // Short: adds, drops and trades should show up within a minute.
  cache.get(`rosters:${leagueId}`, 1 * MINUTE, () => fetchJson(`${SLEEPER_BASE}/league/${leagueId}/rosters`));

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

// Transactions for one week (trades, waivers, free-agent moves). Short TTL.
export const getTransactions = (leagueId: string, week: number): Promise<any[]> =>
  cache.get(`transactions:${leagueId}:${week}`, 2 * MINUTE, () =>
    fetchJson(`${SLEEPER_BASE}/league/${leagueId}/transactions/${week}`)
  );

// Live matchup scores. Short TTL so in-game points stay fresh.
export const getMatchups = (leagueId: string, week: number): Promise<any[]> =>
  cache.get(`matchups:${leagueId}:${week}`, 30 * 1000, () =>
    fetchJson(`${SLEEPER_BASE}/league/${leagueId}/matchups/${week}`)
  );

// Sleeper's stats and projections live outside the documented /v1 API and come in two forms:
//   newer:   {root}/stats/nfl/{season}/{week}?season_type=regular&position[]=QB...  -> array of { player_id, stats, player }
//   classic: {root}/v1/stats/nfl/regular/{season}/{week}                          -> { [player_id]: stats }
// (the classic form is what the open-source Sleeper clients use). Each read tries the newer form
// with position filters first and falls back to the classic one, so a change on Sleeper's side
// doesn't silently empty out rankings or projections.
const POSITION_QS = ["QB", "RB", "WR", "TE", "K", "DEF"].map(p => `position[]=${p}`).join("&");

export type StatRow = { id: string; position: string; stats: Record<string, number> };

/** Either response form -> rows with id, position (when Sleeper includes it) and stats. */
export function toStatRows(data: any): StatRow[] {
  const rows: any[] = Array.isArray(data)
    ? data
    : Object.entries(data ?? {}).map(([player_id, v]: [string, any]) => (v && typeof v === "object" && "stats" in v ? { player_id, ...v } : { player_id, stats: v }));
  return rows
    .filter(r => r?.player_id && r?.stats && typeof r.stats === "object")
    .map(r => ({ id: String(r.player_id), position: String(r.player?.position ?? r.position ?? "").toUpperCase(), stats: r.stats }));
}

/** First URL that returns rows; remembers which one worked (for diagnostics). */
export const lastSource: Record<string, string> = {};
async function firstRows(kind: string, urls: string[]): Promise<StatRow[]> {
  let lastError: unknown = null;
  for (const url of urls) {
    try {
      const rows = toStatRows(await fetchJson(url));
      if (rows.length) {
        lastSource[kind] = url.replace(SLEEPER_ROOT, "");
        return rows;
      }
    } catch (err) {
      lastError = err;
    }
  }
  lastSource[kind] = "none";
  // Throwing (instead of returning []) keeps an outage from being cached for hours.
  throw new Error(`Sleeper ${kind}: no endpoint returned data${lastError ? ` (${String((lastError as any)?.message ?? lastError)})` : ""}`);
}

const rowsToMap = (rows: StatRow[]): Record<string, any> => Object.fromEntries(rows.map(r => [r.id, r.stats]));

// Weekly projections keyed by player id ({ pts_ppr, pts_half_ppr, pts_std, ... }).
export const getProjections = (season: number, week: number): Promise<Record<string, any>> =>
  cache.get(`projections:${season}:${week}`, 30 * MINUTE, async () =>
    rowsToMap(
      await firstRows("projections", [
        `${SLEEPER_ROOT}/projections/nfl/${season}/${week}?season_type=regular&${POSITION_QS}`,
        `${SLEEPER_ROOT}/v1/projections/nfl/regular/${season}/${week}`,
      ])
    )
  );

// Live (in-game) stat lines keyed by player id ({ pass_yd, rush_yd, rec, rec_yd, pts_ppr, ... }).
export const getWeekStats = (season: number, week: number): Promise<Record<string, any>> =>
  cache.get(`stats:${season}:${week}`, 30 * 1000, async () =>
    rowsToMap(
      await firstRows("weekStats", [
        `${SLEEPER_ROOT}/stats/nfl/${season}/${week}?season_type=regular&${POSITION_QS}`,
        `${SLEEPER_ROOT}/v1/stats/nfl/regular/${season}/${week}`,
      ])
    )
  );

// The same weekly stats with the player's name, team and opponent kept (newer endpoint only).
// Used to fill in weeks nfl-data hasn't published yet. Short TTL so in-progress weeks stay fresh.
export const getWeekStatLines = (season: number, week: number): Promise<any[]> =>
  cache.get(`statLines:${season}:${week}`, 5 * MINUTE, async () => {
    const data = await fetchJson(`${SLEEPER_ROOT}/stats/nfl/${season}/${week}?season_type=regular&${POSITION_QS}`);
    return Array.isArray(data) ? data : [];
  });

// Season-to-date stat totals (one row per player). Refreshed every 3 hours.
export const getSeasonStatRows = (season: number): Promise<StatRow[]> =>
  cache.get(`seasonStats:${season}`, 3 * HOUR, () =>
    firstRows("seasonStats", [
      `${SLEEPER_ROOT}/stats/nfl/${season}?season_type=regular&${POSITION_QS}`,
      `${SLEEPER_ROOT}/v1/stats/nfl/regular/${season}`,
    ])
  );
