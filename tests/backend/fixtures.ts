import type { TradePlayer, LeagueTeam } from "../../app/backend/services/tradeEngine";

export const p = (id: string, position: string, value: number, extra: Partial<TradePlayer> = {}): TradePlayer => ({
  id,
  name: extra.name ?? `Player ${id}`,
  position,
  value,
  team: extra.team ?? "KC",
  injuryStatus: extra.injuryStatus ?? "ACTIVE",
});

export const team = (rosterId: number, teamName: string, players: TradePlayer[]): LeagueTeam => ({
  rosterId,
  ownerId: `owner${rosterId}`,
  teamName,
  players,
});

export const statRow = (name: string, position: string, week: number, ppr: number, extra: any = {}) => ({
  player_name: name,
  position,
  team: extra.team ?? "BUF",
  week,
  season: 2026,
  fantasy_points_ppr: ppr,
  game_played: extra.game_played ?? ppr !== 0,
  injury_status: extra.injury_status ?? "ACTIVE",
  player_id: extra.player_id ?? `00-${name}`,
});
