// app/services/lineupAlerts.ts
// Warn when someone in your starting lineup won't play: bye week, injury, or an empty slot.

export type LineupAlertKind = 'bye' | 'out' | 'doubtful' | 'questionable' | 'empty';

export type LineupAlert = {
  kind: LineupAlertKind;
  playerId: string | null;
  slot: string;
  message: string;
};

const OUT_STATUSES = ['OUT', 'IR', 'PUP', 'SUS', 'SUSPENDED', 'NA', 'NOT_ACTIVE', 'INJURED RESERVE'];
const SEVERITY: Record<LineupAlertKind, number> = { empty: 0, out: 1, bye: 2, doubtful: 3, questionable: 4 };

const TEAM_ALIASES: Record<string, string> = { WSH: 'WAS', JAC: 'JAX', LA: 'LAR' };
const normalizeTeam = (team: unknown) => {
  const t = String(team ?? '').trim().toUpperCase();
  return TEAM_ALIASES[t] ?? t;
};

/**
 * @param starterIds   Sleeper starters array (an empty slot is "0" or empty)
 * @param rosterPositions league.roster_positions (starter slots come first, in order)
 * @param playersById  Sleeper players keyed by id (needs full_name, team, injury_status)
 * @param teamsPlaying teams with a game this week, or null if the schedule is unknown
 */
export function getLineupAlerts({
  starterIds,
  rosterPositions = [],
  playersById,
  teamsPlaying,
  week,
}: {
  starterIds: (string | number)[];
  rosterPositions?: string[];
  playersById: Record<string, any>;
  teamsPlaying: Set<string> | null;
  week: number;
}): LineupAlert[] {
  const alerts: LineupAlert[] = [];

  starterIds.forEach((rawId, index) => {
    const id = String(rawId ?? '');
    const slot = String(rosterPositions[index] ?? 'Starter').toUpperCase();

    if (!id || id === '0') {
      alerts.push({ kind: 'empty', playerId: null, slot, message: `Your ${slot} slot is empty.` });
      return;
    }

    const player = playersById[id] ?? {};
    const name = player.full_name || (player.position === 'DEF' ? `${player.team || id} DEF` : `Player ${id}`);
    const team = normalizeTeam(player.team);
    const injury = String(player.injury_status ?? '').trim().toUpperCase();

    if (OUT_STATUSES.includes(injury)) {
      alerts.push({ kind: 'out', playerId: id, slot, message: `${name} is ${injury === 'NA' ? 'not active' : injury} — swap him out.` });
    } else if (teamsPlaying && teamsPlaying.size > 0 && team && !teamsPlaying.has(team)) {
      alerts.push({ kind: 'bye', playerId: id, slot, message: `${name} (${team}) is on bye in week ${week}.` });
    } else if (injury === 'DOUBTFUL') {
      alerts.push({ kind: 'doubtful', playerId: id, slot, message: `${name} is doubtful — have a backup ready.` });
    } else if (injury === 'QUESTIONABLE') {
      alerts.push({ kind: 'questionable', playerId: id, slot, message: `${name} is questionable — check before kickoff.` });
    }
  });

  return alerts.sort((a, b) => SEVERITY[a.kind] - SEVERITY[b.kind]);
}
