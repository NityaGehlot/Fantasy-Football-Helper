// app/backend/services/playoffSchedule.ts
// How hard each player's fantasy-playoff matchups are (usually weeks 15-17): the opponents
// he faces in those weeks, ranked by fantasy points they allow to his position.
// Used in trade and waiver advice, because a player with three easy playoff matchups is
// worth more to a contender than his season average shows.

import { getGameStates } from "./schedule";
import { getDefenseRankings, DefenseRankings } from "./defenseRankings";
import { createTtlCache, HOUR } from "../utils/ttlCache";
import { normalizeTeam } from "../utils/names";
import type { TradePlayer } from "./tradeEngine";

const cache = createTtlCache();

export type PlayoffOutlook = {
  label: "easy" | "average" | "tough" | "unknown";
  // Average rank of his playoff opponents vs his position (32 = allows the most = easiest)
  avgRank: number | null;
  summary: string; // "W15 @BUF (6th) · W16 vs MIA (28th) · W17 BYE"
};

/** Fantasy playoff weeks from the league's settings (default weeks 15-17). */
export function playoffWeeks(league: any): number[] {
  const start = Number(league?.settings?.playoff_week_start) || 15;
  return [start, start + 1, start + 2].filter(w => w >= 1 && w <= 18);
}

/** team -> opponent (with home/away) for each playoff week. Missing team = bye. */
export async function playoffOpponents(season: number, weeks: number[]): Promise<Map<number, Map<string, { opponent: string; home: boolean }>>> {
  return cache.get(`opp:${season}:${weeks.join(",")}`, 12 * HOUR, async () => {
    const out = new Map<number, Map<string, { opponent: string; home: boolean }>>();
    for (const week of weeks) {
      const games = await getGameStates(season, week).catch(() => null);
      const map = new Map<string, { opponent: string; home: boolean }>();
      games?.forEach((g, team) => map.set(team, { opponent: g.opponent, home: g.homeAway === "home" }));
      out.set(week, map);
    }
    return out;
  });
}

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

export function playoffOutlook(
  team: string | undefined,
  position: string,
  opponents: Map<number, Map<string, { opponent: string; home: boolean }>>,
  defense: DefenseRankings | null
): PlayoffOutlook {
  const t = normalizeTeam(team);
  const pos = String(position).toUpperCase();
  if (!t || !defense) return { label: "unknown", avgRank: null, summary: "" };
  const ranks: number[] = [];
  const parts: string[] = [];
  for (const [week, games] of opponents) {
    if (games.size === 0) continue; // schedule not available for that week
    const g = games.get(t);
    if (!g) {
      parts.push(`W${week} BYE`);
      continue;
    }
    const d = defense.teams[g.opponent];
    // Team defenses face the other offense: use how much that offense gives up isn't tracked,
    // so use the opponent's overall defense rank only for skill players and kickers.
    const rank = d ? (pos in d.ranks ? (d.ranks as any)[pos] : d.ranks.overall) : null;
    if (rank) ranks.push(rank);
    parts.push(`W${week} ${g.home ? "vs" : "@"} ${g.opponent}${rank ? ` (${ordinal(rank)})` : ""}`);
  }
  if (ranks.length === 0) return { label: "unknown", avgRank: null, summary: parts.join(" · ") };
  const teams = Object.keys(defense.teams).length || 32;
  const avg = Math.round((ranks.reduce((a, b) => a + b, 0) / ranks.length) * 10) / 10;
  const third = teams / 3;
  const label = avg > teams - third ? "easy" : avg <= third ? "tough" : "average";
  return { label, avgRank: avg, summary: parts.join(" · ") };
}

/** Text added after a player in AI prompts. */
export const playoffNote = (o: PlayoffOutlook | undefined) =>
  o && o.label !== "unknown" ? `playoffs ${o.label} (avg opponent rank ${o.avgRank}/32: ${o.summary})` : "";

/**
 * Attach playoff outlooks to every player in the lists (mutates `playoff` on each player).
 * Skipped once the fantasy playoffs are over.
 */
export async function annotatePlayoffs(
  league: any,
  season: number,
  currentWeek: number,
  statsRows: any[],
  lists: TradePlayer[][]
): Promise<void> {
  const weeks = playoffWeeks(league).filter(w => w >= currentWeek);
  if (weeks.length === 0) return;
  const [opponents, defense] = await Promise.all([playoffOpponents(season, weeks), getDefenseRankings(season, statsRows)]);
  for (const list of lists) {
    for (const p of list) (p as any).playoff = playoffOutlook(p.team, p.position, opponents, defense);
  }
}

/** One trade-card reason comparing the playoff schedules of what you give and what you get. */
export function playoffTradeNote(give: TradePlayer[], get: TradePlayer[]): string | null {
  const avg = (list: TradePlayer[]) => {
    const r = list.map(p => p.playoff?.avgRank).filter((n): n is number => typeof n === "number");
    return r.length ? r.reduce((a, b) => a + b, 0) / r.length : null;
  };
  const a = avg(give);
  const b = avg(get);
  if (a === null || b === null || Math.abs(b - a) < 4) return null;
  const better = b > a;
  return `Playoff schedule (weeks 15-17): the players you ${better ? "get" : "give"} have easier matchups (avg opponent rank ${Math.round(Math.max(a, b))} vs ${Math.round(Math.min(a, b))}, 32 = easiest)${better ? ", a plus for your title run." : ", so this trade makes your playoff weeks a bit harder."}`;
}
