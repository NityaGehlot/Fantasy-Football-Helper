// app/services/nflApi.ts

import { getApiBaseUrl } from "./apiBaseUrl";

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
  // Backend exposes /player-stats-week/:week — keep using that to avoid 404
  const response = await fetch(`${getApiBaseUrl()}/player-stats-week/${week}`);
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

// All weeks combined (used by FantasyContext for chatbot)
export async function getAllPlayerStats(): Promise<any[]> {
  const response = await fetch(`${getApiBaseUrl()}/player-stats-all-weeks`);
  if (!response.ok) throw new Error("Failed to fetch all stats");
  return response.json();
}
