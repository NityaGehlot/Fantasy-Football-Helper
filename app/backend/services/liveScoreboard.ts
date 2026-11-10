// app/backend/services/liveScoreboard.ts
// Gathers everything the live scoreboard needs for one roster's matchup in a given week.

import { buildLiveSide, LiveSide, winProbability } from "./liveMatchup";
import { getAllPlayers, getLeague, getLeagueUsers, getMatchups, getNflState, getProjections, getRosters, getWeekStats } from "./sleeperServer";
import { getGameStates } from "./schedule";
import { getValueContext } from "./leagueContext";
import { valueForSleeperPlayer } from "./playerValues";

export type LiveScoreboard = {
  season: number;
  week: number;
  updatedAt: string;
  scheduleKnown: boolean;
  isLive: boolean;
  isFinal: boolean;
  me: LiveSide;
  opponent: LiveSide | null;
};

export async function getLiveScoreboard(leagueId: string, rosterId: number, requestedWeek?: number): Promise<LiveScoreboard> {
  const [league, state] = await Promise.all([getLeague(leagueId), getNflState().catch(() => null)]);
  const season = Number(league?.season) || Number(state?.season) || new Date().getFullYear();
  const week = Number(requestedWeek) || Number(state?.week) || 1;

  const [users, rosters, matchups, players, projections, stats, games, values] = await Promise.all([
    getLeagueUsers(leagueId).catch(() => []),
    getRosters(leagueId),
    getMatchups(leagueId, week),
    getAllPlayers(),
    getProjections(season, week).catch(() => ({})),
    getWeekStats(season, week).catch(() => ({})),
    getGameStates(season, week).catch(() => null),
    getValueContext().catch(() => null),
  ]);

  const mine = (matchups ?? []).find((m: any) => Number(m.roster_id) === Number(rosterId));
  if (!mine) throw new Error(`No week ${week} matchup found for roster ${rosterId}`);
  const theirs = mine.matchup_id
    ? (matchups ?? []).find((m: any) => m.matchup_id === mine.matchup_id && Number(m.roster_id) !== Number(rosterId))
    : null;

  const teamName = (rid: number) => {
    const roster = (rosters ?? []).find((r: any) => Number(r.roster_id) === rid);
    const user = (users ?? []).find((u: any) => String(u.user_id) === String(roster?.owner_id));
    return String(user?.metadata?.team_name || user?.display_name || `Team ${rid}`);
  };

  const receptionPoints = league?.scoring_settings ?? 1;
  const fallbackProjection = (_id: string, player: any) =>
    (values && valueForSleeperPlayer(values.index, player)?.value) || 0;

  const side = (m: any) =>
    buildLiveSide({
      matchup: m,
      teamName: teamName(Number(m.roster_id)),
      rosterPositions: league?.roster_positions ?? [],
      players,
      projections,
      stats,
      games,
      receptionPoints,
      fallbackProjection,
    });

  const a = side(mine);
  const b = theirs ? side(theirs) : null;
  const all = [...a.starters, ...(b?.starters ?? [])];

  return {
    season,
    week,
    updatedAt: new Date().toISOString(),
    scheduleKnown: !!games && games.size > 0,
    isLive: all.some(p => p.game.state === "in"),
    isFinal: !!games && games.size > 0 && all.every(p => p.fractionRemaining === 0),
    // One probability for both sides, so the two always add up to exactly 100%.
    ...(() => {
      const p = b ? winProbability(a, b) : 1;
      return { me: { ...a, winProbability: p }, opponent: b ? { ...b, winProbability: 1 - p } : null };
    })(),
  };
}
