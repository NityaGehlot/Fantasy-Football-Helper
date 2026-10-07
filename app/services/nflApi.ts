// app/services/nflApi.ts

import { getApiBaseUrl } from "./apiBaseUrl";
import { getNFLState } from "./sleeperAPI";

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

// Per-week fetch (used by FantasyScreen for injury badges)
export async function getPlayerStatsByWeek(week: number, season: number = 2025): Promise<any[]> {
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
  const response = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=${seasonType}&week=${week}`
  );
  if (!response.ok) throw new Error(`Failed to fetch NFL schedule for ${season} week ${week}`);

  const data = await response.json();
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
