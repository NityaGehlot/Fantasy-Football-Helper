// app/services/nflApi.ts

const PLAYER_STATS_URL =
  "https://raw.githubusercontent.com/NityaGehlot/nfl-data/main/data/player_stats_2025.json";

export async function getPlayerStats() {
  try {
    const response = await fetch(PLAYER_STATS_URL);
    const data = await response.json();
    return data;   // Array of all weekly player stats
  } catch (error) {
    console.error("❌ Failed to load NFL player stats:", error);
    return null;
  }
}

// Per-week fetch (used by FantasyScreen for injury badges)
export async function getPlayerStatsByWeek(week: number): Promise<any[]> {
  const response = await fetch(`http://127.0.0.1:4000/player-stats-week/${week}`);
  if (!response.ok) throw new Error(`Failed to fetch week ${week} stats`);
  return response.json();
}

// All weeks combined (used by FantasyContext for chatbot)
export async function getAllPlayerStats(): Promise<any[]> {
  const response = await fetch("http://127.0.0.1:4000/player-stats-all-weeks");
  if (!response.ok) throw new Error("Failed to fetch all stats");
  return response.json();
}
