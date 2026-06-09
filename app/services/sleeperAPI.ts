// app/services/sleeperAPI.ts

const SLEEPER_BASE = 'https://api.sleeper.app/v1';
const TRENDING_BASE_URL = 'https://raw.githubusercontent.com/NityaGehlot/nfl-data/main/data/sleeperAPI';

export type TrendType = 'add' | 'drop';

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

export async function getTrendingPlayers(type: TrendType = 'add', limit: number = 25) {
  const fileName = type === 'add' ? 'trending_adds.json' : 'trending_drops.json';
  const res = await fetch(`${TRENDING_BASE_URL}/${fileName}`);
  if (!res.ok) throw new Error(`Failed to fetch trending ${type}s from GitHub`);
  const source = await res.json();

  return normalizeTrendingRows(source)
    .sort((a, b) => Number(b.count) - Number(a.count))
    .slice(0, limit);
}

export async function getNFLState(): Promise<{
  season?: string;
  week?: number;
  season_type?: string;
}> {
  const res = await fetch(`${SLEEPER_BASE}/state/nfl`);
  if (!res.ok) throw new Error('Failed to fetch NFL state');
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


