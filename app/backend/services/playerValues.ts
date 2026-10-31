// app/backend/services/playerValues.ts
// Per-player value estimates (expected PPR points per game) built from nfl-data stat rows.
// Shared by the chatbot (start/sit, waivers, draft) and the trade agent.

import { normalizePosition, normalizeTeam, playerKey } from "../utils/names";

export const FANTASY_POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"];

export type PlayerValue = {
  key: string;
  name: string;
  position: string;
  team: string;
  gamesPlayed: number;
  seasonAvg: number;
  last3Avg: number;
  priorSeasonAvg: number | null;
  injuryStatus: string;
  // Rest-of-season points per game estimate (injury-adjusted).
  value: number;
};

const OUT_STATUSES = new Set(["OUT", "IR", "PUP", "SUSPENDED", "NA", "INJURED RESERVE", "IR-R"]);

export function isOutStatus(status: unknown): boolean {
  return OUT_STATUSES.has(String(status ?? "").trim().toUpperCase());
}

// Discount applied to rest-of-season value for a current injury designation.
export function injuryMultiplier(status: unknown): number {
  const s = String(status ?? "").trim().toUpperCase();
  if (s === "IR" || s === "INJURED RESERVE" || s === "PUP" || s === "SUSPENDED") return 0.4;
  if (s === "OUT") return 0.75;
  if (s === "DOUBTFUL") return 0.85;
  if (s === "QUESTIONABLE") return 0.95;
  return 1;
}

const round = (n: number) => Math.round(n * 100) / 100;

const played = (row: any) =>
  row.game_played === true || String(row.game_played).toLowerCase() === "true" || Number(row.fantasy_points_ppr) !== 0;

function seasonAverages(rows: any[]): Map<string, { avg: number; games: number }> {
  const byKey = new Map<string, number[]>();
  for (const row of rows) {
    if (!FANTASY_POSITIONS.includes(normalizePosition(row.position)) || !played(row)) continue;
    const key = playerKey(row.player_name, row.position, row.team);
    const list = byKey.get(key) ?? [];
    list.push(Number(row.fantasy_points_ppr) || 0);
    byKey.set(key, list);
  }
  const out = new Map<string, { avg: number; games: number }>();
  byKey.forEach((pts, key) => out.set(key, { avg: pts.reduce((a, b) => a + b, 0) / pts.length, games: pts.length }));
  return out;
}

/**
 * Build a value index from the current season's rows (and optionally last season's rows,
 * used to stabilize players with fewer than 3 games this year).
 */
export function buildValueIndex(currentRows: any[], priorRows: any[] = []): Map<string, PlayerValue> {
  const prior = seasonAverages(priorRows);
  const byKey = new Map<string, any[]>();

  for (const row of currentRows) {
    if (!FANTASY_POSITIONS.includes(normalizePosition(row.position))) continue;
    const key = playerKey(row.player_name, row.position, row.team);
    const list = byKey.get(key) ?? [];
    list.push(row);
    byKey.set(key, list);
  }

  const index = new Map<string, PlayerValue>();

  byKey.forEach((rows, key) => {
    rows.sort((a, b) => Number(a.week) - Number(b.week));
    const latest = rows[rows.length - 1];
    const games = rows.filter(played).map(r => Number(r.fantasy_points_ppr) || 0);
    const seasonAvg = games.length ? games.reduce((a, b) => a + b, 0) / games.length : 0;
    const last3 = games.slice(-3);
    const last3Avg = last3.length ? last3.reduce((a, b) => a + b, 0) / last3.length : 0;
    const priorAvg = prior.get(key)?.avg ?? null;

    let base = games.length ? 0.6 * seasonAvg + 0.4 * last3Avg : 0;
    if (games.length < 3 && priorAvg !== null) {
      base = (games.length * base + (3 - games.length) * priorAvg) / 3;
    }

    const injuryStatus = String(latest?.injury_status ?? "ACTIVE").toUpperCase();
    index.set(key, {
      key,
      name: String(latest.player_name),
      position: normalizePosition(latest.position),
      team: normalizeTeam(latest.team),
      gamesPlayed: games.length,
      seasonAvg: round(seasonAvg),
      last3Avg: round(last3Avg),
      priorSeasonAvg: priorAvg === null ? null : round(priorAvg),
      injuryStatus,
      value: round(base * injuryMultiplier(injuryStatus)),
    });
  });

  // Players with no rows this season yet (e.g. preseason) still get last season's average.
  prior.forEach(({ avg, games }, key) => {
    if (index.has(key)) return;
    const [position] = key.split("|");
    const sample = priorRows.find(r => playerKey(r.player_name, r.position, r.team) === key);
    index.set(key, {
      key,
      name: String(sample?.player_name ?? key),
      position,
      team: normalizeTeam(sample?.team),
      gamesPlayed: 0,
      seasonAvg: 0,
      last3Avg: 0,
      priorSeasonAvg: round(avg),
      injuryStatus: "ACTIVE",
      value: round(games >= 4 ? avg : avg * 0.8),
    });
  });

  return index;
}

// Look up a Sleeper player object ({ full_name, position, team, injury_status }).
// Sleeper's live injury status takes priority over the weekly stats file.
export function valueForSleeperPlayer(index: Map<string, PlayerValue>, player: any): PlayerValue | null {
  const position = normalizePosition(player?.position ?? player?.position_for_FFHelper);
  if (!FANTASY_POSITIONS.includes(position)) return null;
  const name = player?.full_name ?? `${player?.first_name ?? ""} ${player?.last_name ?? ""}`;
  const found = index.get(playerKey(name, position, player?.team ?? player?.player_id));
  if (!found) return null;

  // Sleeper sends injury_status: null for healthy players, so a present-but-empty field means ACTIVE.
  const hasLiveStatus = player && typeof player === "object" && "injury_status" in player;
  const liveStatus = hasLiveStatus ? String(player.injury_status || "ACTIVE").toUpperCase() : null;
  if (!liveStatus || liveStatus === found.injuryStatus) return found;

  const healthy = found.value / injuryMultiplier(found.injuryStatus);
  return { ...found, injuryStatus: liveStatus, value: round(healthy * injuryMultiplier(liveStatus)) };
}
