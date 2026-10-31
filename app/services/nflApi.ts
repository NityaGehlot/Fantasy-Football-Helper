// app/services/nflApi.ts

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiBaseUrl } from "./apiBaseUrl";
import { getNFLState } from "./sleeperAPI";
import { createCache, MINUTE } from "./cache";

const cache = createCache({ storage: AsyncStorage, prefix: "ffh_nfl_cache_v1:" });

// ESPN scoreboard for one week. Short TTL so live game states stay fresh.
async function getEspnScoreboard(season: number, week: number, seasonType: 2 | 3 = 2): Promise<any> {
  return cache.get(`espn:${season}:${seasonType}:${week}`, 5 * MINUTE, async () => {
    const response = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=${seasonType}&week=${week}`
    );
    if (!response.ok) throw new Error(`Failed to fetch NFL schedule for ${season} week ${week}`);
    return response.json();
  });
}

// Team abbreviations (Sleeper style) that have a game in the given regular-season week.
// Any team missing from the set is on bye.
export async function getTeamsPlayingInWeek(season: number, week: number): Promise<Set<string>> {
  const data = await getEspnScoreboard(season, week);
  const aliases: Record<string, string> = { WSH: "WAS", JAC: "JAX", LA: "LAR" };
  const teams = new Set<string>();
  for (const event of data?.events ?? []) {
    for (const competitor of event?.competitions?.[0]?.competitors ?? []) {
      const abbr = String(competitor?.team?.abbreviation ?? "").toUpperCase();
      if (abbr) teams.add(aliases[abbr] ?? abbr);
    }
  }
  return teams;
}

export type WeekStatus = 'upcoming' | 'in_progress' | 'completed';

export async function getPlayerStats() {
  try {
    const response = await fetch(`${getApiBaseUrl()}/player-stats-all-weeks`);
    if (!response.ok) throw new Error("Failed to fetch all stats");
    return response.json();
  } catch (error) {
    console.error("❌ Failed to load NFL player stats:", error);
    return null;
  }
}

// NFL seasons are labeled by the year they start; Jan-Feb games belong to the previous season
export const getCurrentNFLSeason = (date: Date = new Date()) =>
  date.getMonth() + 1 >= 3 ? date.getFullYear() : date.getFullYear() - 1;

// Per-week fetch (used by FantasyScreen for injury badges)
export async function getPlayerStatsByWeek(week: number, season: number = getCurrentNFLSeason()): Promise<any[]> {
  return cache.get(`weekStats:${season}:${week}`, 10 * MINUTE, () => loadPlayerStatsByWeek(week, season));
}

async function loadPlayerStatsByWeek(week: number, season: number): Promise<any[]> {
  const response = await fetch(`${getApiBaseUrl()}/player-stats-week/${week}?season=${season}`);
  if (!response.ok) throw new Error(`Failed to fetch week ${week} stats`);

  const baseRows: any[] = await response.json();

  // Also fetch defensive week JSON directly from the GitHub repo where team defense rows live
  try {
    const DEF_BASE = `https://raw.githubusercontent.com/NityaGehlot/nfl-data/main/data/Stats/${season}%20Season/${season}%20Defense`;
    const fileName = `player_stats_${season}_week${String(week).padStart(2, '0')}.json`;
    const defResp = await fetch(`${DEF_BASE}/${fileName}`);
    if (defResp.ok) {
      const defData = await defResp.json();
      const defRows = Array.isArray(defData) ? defData : (Object.values(defData ?? {}).flat() as any[]);

      // Merge — prefer defensive file rows for team defense entries (player_id starting with 'DEF_')
      const map = new Map<string, any>();
      baseRows.forEach((r: any) => map.set(String(r.player_id), r));
      defRows.forEach((r: any) => {
        const id = String(r.player_id);
        if (id.startsWith('DEF_')) {
          map.set(id, r);
        } else {
          // also add any defensive individual rows if missing
          if (!map.has(id)) map.set(id, r);
        }
      });

      return Array.from(map.values());
    }
  } catch (err) {
    // non-fatal — fall back to base rows
    console.warn('Failed to fetch/merge defensive week file:', err);
  }

  return baseRows;
}

// Week status from ESPN game states (pre / in / post).
// seasonType 2 = regular season, 3 = postseason (ESPN postseason weeks: 1 WC, 2 DIV, 3 CONF, 4 Pro Bowl, 5 SB)
export async function getNFLWeekStatus(
  season: number,
  week: number,
  seasonType: 2 | 3 = 2
): Promise<WeekStatus | null> {
  const data = await getEspnScoreboard(season, week, seasonType);
  const states: string[] = (data?.events ?? []).map((e: any) => e?.status?.type?.state);
  if (states.length === 0) return null;
  if (states.every(s => s === 'pre')) return 'upcoming';
  if (states.every(s => s === 'post')) return 'completed';
  return 'in_progress';
}

// Map app weeks (1-18 regular, 19-22 postseason) to ESPN's season type + week
const toEspnWeek = (week: number): { seasonType: 2 | 3; espnWeek: number } =>
  week <= 18
    ? { seasonType: 2, espnWeek: week }
    : { seasonType: 3, espnWeek: ({ 19: 1, 20: 2, 21: 3, 22: 5 } as Record<number, number>)[week] };

// Status of every app week (1-22) for a season. Uses Sleeper's NFL state to narrow down
// which weeks could be unfinished, then asks ESPN only about those.
export async function getSeasonWeekStatuses(season: number): Promise<Record<number, WeekStatus>> {
  const weeks = Array.from({ length: 22 }, (_, i) => i + 1);
  const fill = (status: WeekStatus) =>
    Object.fromEntries(weeks.map(w => [w, status])) as Record<number, WeekStatus>;

  const state = await getNFLState();
  const currentSeason = Number(state?.season);
  if (!currentSeason || season < currentSeason) return fill('completed');
  if (season > currentSeason) return fill('upcoming');

  const seasonType = String(state?.season_type || '').toLowerCase();
  if (seasonType === 'pre') return fill('upcoming');

  const statuses: Record<number, WeekStatus> = {};
  const toCheck: number[] = [];
  const currentWeek = Number(state?.week) || 0;

  weeks.forEach(w => {
    if (seasonType === 'regular') {
      // Sleeper rolls `week` over early, so the current week may not have kicked off yet
      if (w < currentWeek) statuses[w] = 'completed';
      else if (w === currentWeek) toCheck.push(w);
      else statuses[w] = 'upcoming';
    } else {
      // postseason / offseason: regular season is done, check playoff rounds individually
      if (w <= 18) statuses[w] = 'completed';
      else toCheck.push(w);
    }
  });

  await Promise.all(
    toCheck.map(async w => {
      const { seasonType: espnType, espnWeek } = toEspnWeek(w);
      try {
        statuses[w] = (await getNFLWeekStatus(season, espnWeek, espnType)) ?? 'upcoming';
      } catch {
        statuses[w] = 'in_progress';
      }
    })
  );

  return statuses;
}

// All weeks combined (used by FantasyContext for chatbot)
export async function getAllPlayerStats(): Promise<any[]> {
  const response = await fetch(`${getApiBaseUrl()}/player-stats-all-weeks`);
  if (!response.ok) throw new Error("Failed to fetch all stats");
  return response.json();
}
