// app/services/lineupAlerts.ts
// Warn when someone in your starting lineup won't play: bye week, injury, or an empty slot.
// Once a player's game has kicked off his spot is locked, so injury alerts change from
// "check before kickoff" to what actually happened in the game.

export type LineupAlertKind = 'bye' | 'out' | 'doubtful' | 'questionable' | 'empty' | 'hurt_in_game';

export type GameState = 'pre' | 'in' | 'post' | 'bye';

export type LineupAlert = {
  kind: LineupAlertKind;
  playerId: string | null;
  slot: string;
  message: string;
  // True when the player's game has started, so the lineup spot can't be changed anymore
  locked?: boolean;
};

const OUT_STATUSES = ['OUT', 'IR', 'PUP', 'SUS', 'SUSPENDED', 'NA', 'NOT_ACTIVE', 'INJURED RESERVE'];
const SEVERITY: Record<LineupAlertKind, number> = { empty: 0, out: 1, bye: 2, doubtful: 3, questionable: 4, hurt_in_game: 5 };

const TEAM_ALIASES: Record<string, string> = { WSH: 'WAS', JAC: 'JAX', LA: 'LAR' };
const normalizeTeam = (team: unknown) => {
  const t = String(team ?? '').trim().toUpperCase();
  return TEAM_ALIASES[t] ?? t;
};

const STATUS_WORDS: Record<string, string> = {
  IR: 'on injured reserve',
  'INJURED RESERVE': 'on injured reserve',
  PUP: 'on the PUP list',
  SUS: 'suspended',
  SUSPENDED: 'suspended',
  NA: 'not active',
  NOT_ACTIVE: 'not active',
  OUT: 'out',
};

/**
 * @param starterIds   Sleeper starters array (an empty slot is "0" or empty)
 * @param rosterPositions league.roster_positions (starter slots come first, in order)
 * @param playersById  Sleeper players keyed by id (needs full_name, team, injury_status; injury_body_part is shown when present)
 * @param teamsPlaying teams with a game this week, or null if the schedule is unknown
 * @param gameStates   player id -> state of that player's game this week, when known
 */
export function getLineupAlerts({
  starterIds,
  rosterPositions = [],
  playersById,
  teamsPlaying,
  week,
  gameStates = {},
  pointsById = {},
}: {
  starterIds: (string | number)[];
  rosterPositions?: string[];
  playersById: Record<string, any>;
  teamsPlaying: Set<string> | null;
  week: number;
  gameStates?: Record<string, GameState | undefined>;
  // Points scored so far this week (tells "hurt during the game" apart from "never played")
  pointsById?: Record<string, number | undefined>;
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
    const bodyPart = String(player.injury_body_part ?? player.injury ?? '').trim();
    const who = bodyPart ? `${name} (${bodyPart})` : name;
    const game = gameStates[id];
    const started = game === 'in' || game === 'post';

    // His game already kicked off: the spot is locked, so say what happened instead of
    // asking you to check before kickoff.
    const longTerm = ['IR', 'INJURED RESERVE', 'PUP', 'SUS', 'SUSPENDED', 'NA', 'NOT_ACTIVE'].includes(injury);
    const scored = Number(pointsById[id] ?? 0) !== 0;
    if (started && (longTerm || (injury === 'OUT' && !scored))) {
      alerts.push({
        kind: 'out',
        playerId: id,
        slot,
        locked: true,
        message: `${who} is ${STATUS_WORDS[injury] ?? injury.toLowerCase()} and isn't playing, but he was left in your lineup. His spot is locked now; take him out before next week.`,
      });
      return;
    }
    if (started && injury && injury !== 'ACTIVE') {
      const label = injury === 'QUESTIONABLE' ? 'questionable to return' : injury === 'DOUBTFUL' ? 'doubtful to return' : STATUS_WORDS[injury] ?? injury.toLowerCase();
      const message =
        game === 'in'
          ? `${who} got hurt during his game and is ${label}. His spot is locked until the game ends; his points so far still count.`
          : `${who} got hurt in his game (${label}). Watch his status before next week's lineup.`;
      alerts.push({ kind: 'hurt_in_game', playerId: id, slot, message, locked: true });
      return;
    }
    if (started) return;

    if (OUT_STATUSES.includes(injury)) {
      alerts.push({ kind: 'out', playerId: id, slot, message: `${who} is ${STATUS_WORDS[injury] ?? injury.toLowerCase()} — swap him out.` });
    } else if (game === 'bye' || (teamsPlaying && teamsPlaying.size > 0 && team && !teamsPlaying.has(team))) {
      alerts.push({ kind: 'bye', playerId: id, slot, message: `${name}${team ? ` (${team})` : ''} is on bye in week ${week}.` });
    } else if (injury === 'DOUBTFUL') {
      alerts.push({ kind: 'doubtful', playerId: id, slot, message: `${who} is doubtful — have a backup ready.` });
    } else if (injury === 'QUESTIONABLE') {
      alerts.push({ kind: 'questionable', playerId: id, slot, message: `${who} is questionable — check before kickoff.` });
    }
  });

  return alerts.sort((a, b) => SEVERITY[a.kind] - SEVERITY[b.kind]);
}
