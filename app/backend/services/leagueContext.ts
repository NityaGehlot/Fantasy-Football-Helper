// app/backend/services/leagueContext.ts
// Everything the roster-aware features need about a Sleeper league: every team's
// players with value estimates, free agents, starting slots, and who is on bye.

import { parseRosterSlots, SlotName } from "./lineup";
import { buildValueIndex, isOutStatus, PlayerValue, valueForSleeperPlayer, FANTASY_POSITIONS } from "./playerValues";
import { getPlayerRanks } from "./playerRanks";
import { getAllPlayers, getLeague, getLeagueUsers, getRosters } from "./sleeperServer";
import { getSeasonRows, resolveStatsSeason } from "./statsStore";
import type { LeagueTeam, TradePlayer } from "./tradeEngine";
import { createTtlCache, MINUTE } from "../utils/ttlCache";
import { normalizeTeam } from "../utils/names";

const cache = createTtlCache();

export type ValueContext = { season: number; rows: any[]; index: Map<string, PlayerValue> };

export async function getValueContext(requestedSeason?: unknown): Promise<ValueContext> {
  const season = await resolveStatsSeason(requestedSeason);
  return cache.get(`values:${season}`, 15 * MINUTE, async () => {
    const [rows, priorRows] = await Promise.all([getSeasonRows(season), getSeasonRows(season - 1)]);
    return { season, rows, index: buildValueIndex(rows, priorRows) };
  });
}

export function toTradePlayer(id: string, sleeperPlayer: any, index: Map<string, PlayerValue>): TradePlayer {
  const valued = valueForSleeperPlayer(index, sleeperPlayer);
  const position = String(sleeperPlayer?.position ?? valued?.position ?? "").toUpperCase();
  return {
    id: String(id),
    // Defenses are named like Sleeper shows them ("Houston Texans"); Sleeper has no full_name for them.
    name: String(
      sleeperPlayer?.full_name ||
        (position === "DEF"
          ? sleeperPlayer?.first_name && sleeperPlayer?.last_name
            ? `${sleeperPlayer.first_name} ${sleeperPlayer.last_name}`
            : `${id} DEF`
          : valued?.name || id)
    ),
    position,
    team: normalizeTeam(sleeperPlayer?.team ?? valued?.team),
    injuryStatus: String(sleeperPlayer?.injury_status || valued?.injuryStatus || "ACTIVE").toUpperCase(),
    value: valued?.value ?? 0,
  };
}

// Points per game for THIS week: zero when the player is out or his team is on bye.
export function weeklyValue(player: TradePlayer, teamsPlaying: Set<string> | null): number {
  if (isOutStatus(player.injuryStatus)) return 0;
  if (teamsPlaying && teamsPlaying.size > 0 && player.team && !teamsPlaying.has(player.team)) return 0;
  return player.value;
}

export type LeagueContext = {
  league: any;
  slots: SlotName[];
  teams: LeagueTeam[];
  me: LeagueTeam | null;
  freeAgents: TradePlayer[];
  values: ValueContext;
  players: Record<string, any>;
};

export async function getLeagueContext(leagueId: string, myRosterId?: number, myOwnerId?: string): Promise<LeagueContext> {
  const [league, users, rosters, players, values] = await Promise.all([
    getLeague(leagueId),
    getLeagueUsers(leagueId).catch(() => []),
    getRosters(leagueId),
    getAllPlayers(),
    getValueContext(),
  ]);
  // Season fantasy points and ranks with this league's scoring (empty if Sleeper is unavailable).
  const ranks = await getPlayerRanks(Number(league?.season) || values.season, league?.scoring_settings);
  const withRank = (p: TradePlayer): TradePlayer => (ranks[p.id] ? { ...p, rank: ranks[p.id] } : p);

  const userById = new Map<string, any>((users ?? []).map((u: any) => [String(u.user_id), u]));
  const rostered = new Set<string>();

  const teams: LeagueTeam[] = (rosters ?? []).map((roster: any) => {
    const user = userById.get(String(roster.owner_id));
    const ids: string[] = (roster.players ?? []).map(String);
    ids.forEach(id => rostered.add(id));
    return {
      rosterId: Number(roster.roster_id),
      ownerId: String(roster.owner_id ?? ""),
      teamName: String(user?.metadata?.team_name || user?.display_name || `Team ${roster.roster_id}`),
      players: ids.map(id => withRank(toTradePlayer(id, players[id] ?? { player_id: id }, values.index))),
    };
  });

  const me =
    teams.find(t => myRosterId !== undefined && t.rosterId === Number(myRosterId)) ??
    teams.find(t => myOwnerId && t.ownerId === String(myOwnerId)) ??
    null;

  const freeAgents = Object.entries(players)
    .filter(([id, p]) => !rostered.has(id) && p?.team && FANTASY_POSITIONS.includes(String(p?.position).toUpperCase()))
    .map(([id, p]) => withRank(toTradePlayer(id, p, values.index)))
    .filter(p => p.value > 0);

  return { league, slots: parseRosterSlots(league?.roster_positions), teams, me, freeAgents, values, players };
}
