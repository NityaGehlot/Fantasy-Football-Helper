// app/backend/services/defenseRankings.ts
// How tough each defense is (from nfl-data's data/defense/defense_rankings_current.json):
// yards, touchdowns and fantasy points it allows per game, overall and to each position,
// ranked 1 (toughest) to 32 (easiest). If the file isn't published yet, the same numbers are
// computed from the season's stats rows.

import fetch from "node-fetch";
import { createTtlCache, HOUR } from "../utils/ttlCache";
import { normalizeTeam } from "../utils/names";

const RANKINGS_URL = "https://raw.githubusercontent.com/NityaGehlot/nfl-data/main/data/defense/defense_rankings_current.json";
const cache = createTtlCache();

const POSITIONS = ["QB", "RB", "WR", "TE", "K"] as const;
type Pos = (typeof POSITIONS)[number];

export type DefenseEntry = {
  games: number;
  pass_yds_allowed: number;
  pass_td_allowed: number;
  rush_yds_allowed: number;
  rush_td_allowed: number;
  total_yds_allowed: number;
  fantasy_points_allowed: Record<Pos, number>;
  ranks: { pass: number; rush: number; overall: number } & Record<Pos, number>;
};

export type DefenseRankings = { season: number; through_week: number; teams: Record<string, DefenseEntry> };

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Same calculation as nfl-data's defense_helpers.R, from offensive player-week rows. */
export function computeDefenseRankings(rows: any[], season: number): DefenseRankings {
  const acc = new Map<string, { weeks: Set<number>; pass: number; passTd: number; rush: number; rushTd: number; fpa: Record<Pos, number> }>();
  let through = 0;
  for (const r of rows) {
    const def = normalizeTeam(r?.opponent_team);
    const pos = String(r?.position ?? "").toUpperCase();
    const week = Number(r?.week);
    if (!def || !Number.isFinite(week) || pos === "DEF" || r?.game_played === false) continue;
    through = Math.max(through, week);
    const a = acc.get(def) ?? { weeks: new Set<number>(), pass: 0, passTd: 0, rush: 0, rushTd: 0, fpa: { QB: 0, RB: 0, WR: 0, TE: 0, K: 0 } };
    a.weeks.add(week);
    if (pos === "QB") {
      a.pass += Number(r.passing_yards) || 0;
      a.passTd += Number(r.passing_tds) || 0;
    }
    a.rush += Number(r.rushing_yards) || 0;
    a.rushTd += Number(r.rushing_tds) || 0;
    if ((POSITIONS as readonly string[]).includes(pos)) a.fpa[pos as Pos] += Number(r.fantasy_points_ppr) || 0;
    acc.set(def, a);
  }

  const teams: Record<string, DefenseEntry> = {};
  for (const [def, a] of acc) {
    const g = a.weeks.size || 1;
    const pass = round1(a.pass / g);
    const rush = round1(a.rush / g);
    teams[def] = {
      games: a.weeks.size,
      pass_yds_allowed: pass,
      pass_td_allowed: round1(a.passTd / g),
      rush_yds_allowed: rush,
      rush_td_allowed: round1(a.rushTd / g),
      total_yds_allowed: round1(pass + rush),
      fantasy_points_allowed: Object.fromEntries(POSITIONS.map(p => [p, round1(a.fpa[p] / g)])) as Record<Pos, number>,
      ranks: {} as any,
    };
  }
  // Rank 1 = allows the least.
  const rankBy = (value: (e: DefenseEntry) => number) => {
    const vals = Object.values(teams).map(value);
    return (e: DefenseEntry) => 1 + vals.filter(v => v < value(e)).length;
  };
  const rankers = {
    pass: rankBy(e => e.pass_yds_allowed),
    rush: rankBy(e => e.rush_yds_allowed),
    overall: rankBy(e => e.total_yds_allowed),
    ...Object.fromEntries(POSITIONS.map(p => [p, rankBy(e => e.fantasy_points_allowed[p])])),
  } as Record<string, (e: DefenseEntry) => number>;
  for (const e of Object.values(teams)) {
    e.ranks = Object.fromEntries(Object.entries(rankers).map(([k, f]) => [k, f(e)])) as DefenseEntry["ranks"];
  }
  return { season, through_week: through, teams };
}

export async function getDefenseRankings(season: number, rows: any[] = []): Promise<DefenseRankings | null> {
  return cache
    .get(`def:${season}`, 6 * HOUR, async () => {
      try {
        const res = await fetch(RANKINGS_URL);
        if (res.ok) {
          const data = (await res.json()) as DefenseRankings;
          if (Number(data?.season) === season && data?.teams && Object.keys(data.teams).length > 0) return data;
        }
      } catch {
        // fall through to computing it
      }
      return rows.length > 0 ? computeDefenseRankings(rows, season) : null;
    })
    .catch(() => null);
}

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

export function tierFor(rank: number, teams = 32): "tough" | "average" | "easy" {
  const third = Math.ceil(teams / 3);
  return rank <= third ? "tough" : rank > teams - third ? "easy" : "average";
}

/** Lines for the AI prompt describing the opponent's defense from this position's view. */
export function formatDefenseBlock(opponent: string, position: string, rankings: DefenseRankings | null): string {
  const d = rankings?.teams?.[normalizeTeam(opponent)];
  if (!d) return `Opponent defense (${opponent}): rankings not available.`;
  const n = Object.keys(rankings!.teams).length || 32;
  const pos = String(position).toUpperCase() as Pos;
  const describe = (rank: number) => `${ordinal(rank)} of ${n} → ${tierFor(rank, n)} matchup`;
  const lines = [
    `Opponent defense: ${opponent} (season through week ${rankings!.through_week}; rank 1 = allows the least = toughest, ${n} = allows the most = easiest)`,
    `• vs the pass: ${d.pass_yds_allowed} passing yds/game allowed, ${d.pass_td_allowed} pass TD/game — ${describe(d.ranks.pass)}`,
    `• vs the run: ${d.rush_yds_allowed} rushing yds/game allowed, ${d.rush_td_allowed} rush TD/game — ${describe(d.ranks.rush)}`,
    `• overall: ${d.total_yds_allowed} total yds/game allowed — ${describe(d.ranks.overall)}`,
  ];
  if ((POSITIONS as readonly string[]).includes(pos)) {
    lines.push(`• fantasy points allowed to ${pos}s: ${d.fantasy_points_allowed[pos]} per game — ${describe(d.ranks[pos])}`);
  }
  return lines.join("\n");
}
