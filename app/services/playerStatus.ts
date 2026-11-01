// app/services/playerStatus.ts
// Current injury designation + bye-week status for any player (pure helpers, no React).

import { currentInjury, indexInjuries } from './injuryFormat';

export const NFL_TEAMS = [
  'ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND','JAX','KC',
  'LAC','LAR','LV','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SEA','SF','TB','TEN','WAS',
];

export type PlayerStatusData = {
  injuries: ReturnType<typeof indexInjuries>;
  // Teams without a game this week (null when the schedule isn't known, e.g. offseason)
  byeTeams: Set<string> | null;
  week: number | null;
};

export const EMPTY_STATUS: PlayerStatusData = { injuries: indexInjuries(null), byeTeams: null, week: null };

const TEAM_ALIASES: Record<string, string> = { WSH: 'WAS', JAC: 'JAX', LA: 'LAR' };
const normTeam = (t: unknown) => {
  const s = String(t ?? '').trim().toUpperCase();
  return TEAM_ALIASES[s] ?? s;
};

// Everyone not in the week's schedule is on bye. An empty schedule means "unknown", not "all bye".
export function byeTeamsFrom(teamsPlaying: Set<string> | null): Set<string> | null {
  if (!teamsPlaying || teamsPlaying.size === 0) return null;
  const playing = new Set([...teamsPlaying].map(normTeam));
  return new Set(NFL_TEAMS.filter(t => !playing.has(t)));
}

export function statusForPlayer(data: PlayerStatusData, player: any): { injuryStatus: string; injury: string; onBye: boolean } {
  const { status, injury } = currentInjury(data.injuries, player);
  const team = normTeam(player?.team);
  return { injuryStatus: status, injury, onBye: !!team && !!data.byeTeams?.has(team) };
}
