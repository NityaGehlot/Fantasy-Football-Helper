// app/services/sleeperAPI.ts

const SLEEPER_BASE = 'https://api.sleeper.app/v1';

export async function getLeague(leagueId: string) {
  const res = await fetch(`${SLEEPER_BASE}/league/${leagueId}`);
  if (!res.ok) throw new Error('Failed to fetch league');
  return res.json();
}

export async function getLeagueUsers(leagueId: string) {
  const res = await fetch(`${SLEEPER_BASE}/league/${leagueId}/users`);
  if (!res.ok) throw new Error('Failed to fetch users');
  return res.json();
}

export async function getRosters(leagueId: string) {
  const res = await fetch(`${SLEEPER_BASE}/league/${leagueId}/rosters`);
  if (!res.ok) throw new Error('Failed to fetch rosters');
  return res.json();
}

export async function getPlayers() {
  const res = await fetch(`${SLEEPER_BASE}/players/nfl`);
  if (!res.ok) throw new Error('Failed to fetch players');
  return res.json();
}

export async function getMatchups(leagueId: string, week: number) {
  const resp = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`);
  return await resp.json();
}

export async function getPlayerWeekStats(playerId: string, season: number, week: number) {
  const resp = await fetch(
    `https://api.sleeper.app/stats/nfl/player/${playerId}?season=${season}&week=${week}`
  );
  if (!resp.ok) throw new Error('Player stats fetch failed');
  return resp.json();
}

export async function getTrendingPlayers(lookback_hours: number = 24, limit: number = 25) {
  const res = await fetch(`${SLEEPER_BASE}/players/nfl/trending/add?lookback_hours=${lookback_hours}&limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch trending players');
  return res.json();
}

// ✅ Get league history by traversing previous_league_id
export async function getLeagueHistory(leagueId: string): Promise<Array<{ league_id: string; season: number; name: string }>> {
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


