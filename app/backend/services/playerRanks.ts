// app/backend/services/playerRanks.ts
// Fantasy rankings like Sleeper's: where a player ranks by fantasy points this season, among
// all players (overall) and among his position. Points use your league's own scoring settings
// (Sleeper's stat names match its scoring keys), so ranks match what you'd see in Sleeper.

import { getAllPlayers, getSeasonStatRows } from "./sleeperServer";
import { createTtlCache, HOUR } from "../utils/ttlCache";

export type PlayerRank = {
  points: number; // fantasy points this season
  games: number;
  overall: number; // 1 = most points among all players
  position: number; // 1 = most points at his position
  pos: string;
  positionCount: number; // how many players at his position scored points
};

const RANKED = new Set(["QB", "RB", "WR", "TE", "K", "DEF"]);
const cache = createTtlCache();

/** Fantasy points for a stat line with the league's scoring (falls back to Sleeper's PPR / half / standard totals). */
export function leaguePoints(stats: Record<string, number>, scoring?: Record<string, number> | null): number {
  if (scoring && Object.keys(scoring).length) {
    let total = 0;
    let matched = false;
    for (const [key, weight] of Object.entries(scoring)) {
      const v = Number(stats[key]);
      if (!Number.isFinite(v) || !Number.isFinite(Number(weight))) continue;
      total += v * Number(weight);
      matched = true;
    }
    if (matched) return Math.round(total * 100) / 100;
  }
  const rec = Number(scoring?.rec ?? 1);
  const key = rec >= 1 ? "pts_ppr" : rec >= 0.5 ? "pts_half_ppr" : "pts_std";
  return Math.round(Number(stats[key] ?? stats.pts_ppr ?? 0) * 100) / 100;
}

/** Overall and position ranks by points (ties share a rank, like 1, 2, 2, 4). */
export function computeRanks(
  rows: { id: string; position: string; stats: Record<string, number> }[],
  scoring?: Record<string, number> | null
): Record<string, PlayerRank> {
  const scored = rows
    .filter(r => RANKED.has(r.position))
    .map(r => ({ id: r.id, pos: r.position, points: leaguePoints(r.stats, scoring), games: Number(r.stats.gp ?? 0) }))
    .filter(r => r.points > 0)
    .sort((a, b) => b.points - a.points);
  const out: Record<string, PlayerRank> = {};
  const positionSeen: Record<string, { count: number; lastPoints: number; lastRank: number }> = {};
  const positionCount: Record<string, number> = {};
  scored.forEach(r => (positionCount[r.pos] = (positionCount[r.pos] ?? 0) + 1));
  let lastPoints = NaN;
  let lastRank = 0;
  scored.forEach((r, i) => {
    const overall = r.points === lastPoints ? lastRank : i + 1;
    lastPoints = r.points;
    lastRank = overall;
    const seen = (positionSeen[r.pos] ??= { count: 0, lastPoints: NaN, lastRank: 0 });
    seen.count += 1;
    const position = r.points === seen.lastPoints ? seen.lastRank : seen.count;
    seen.lastPoints = r.points;
    seen.lastRank = position;
    out[r.id] = { points: r.points, games: r.games, overall, position, pos: r.pos, positionCount: positionCount[r.pos] };
  });
  return out;
}

/** Ranks for a season with the given scoring (cached; never throws: empty when Sleeper is down). */
export async function getPlayerRanks(season: number, scoring?: Record<string, number> | null): Promise<Record<string, PlayerRank>> {
  const key = `${season}:${JSON.stringify(scoring ?? {})}`;
  try {
    return await cache.get(key, 3 * HOUR, async () => {
      const [rows, players] = await Promise.all([getSeasonStatRows(season), getAllPlayers().catch(() => ({} as Record<string, any>))]);
      const withPositions = rows.map(r => ({
        ...r,
        position: r.position || String(players[r.id]?.position ?? (/^[A-Z]{2,3}$/.test(r.id) ? "DEF" : "")).toUpperCase(),
      }));
      return computeRanks(withPositions, scoring);
    });
  } catch {
    return {};
  }
}

/** "RB12 · #48 overall" */
export const rankLabel = (r?: PlayerRank | null) => (r ? `${r.pos}${r.position} · #${r.overall} overall` : "");
