// app/services/nflApi.ts

export async function getPlayerStats() {
  try {
    const response = await fetch("http://127.0.0.1:4000/player-stats-all-weeks");
    if (!response.ok) throw new Error("Failed to fetch all stats");
    return response.json();
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
