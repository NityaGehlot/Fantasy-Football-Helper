// app/backend/services/matchupContext.ts
// Everything around a player's game this week, for start/sit answers:
// opponent defense rankings (vs pass, vs run, overall, fantasy points allowed to his
// position), game-time weather, and injuries on both teams with what they mean for him.

import { getAllPlayers } from "./sleeperServer";
import { getGameStates, GameState } from "./schedule";
import { getDefenseRankings, formatDefenseBlock, DefenseRankings } from "./defenseRankings";
import { getGameWeather, weatherEffect, weatherForPosition, GameWeather } from "./weather";
import { injuryImpacts, formatImpactBlock, netImpact, InjuredPlayer, ImpactNote } from "./injuryImpact";
import { lookupInjury } from "./injuryStore";
import { normalizePlayerName, normalizeTeam } from "../utils/names";

export type MatchupContext = {
  team: string;
  opponent: string | null;
  homeAway: "home" | "away" | null;
  kickoff: string | null;
  defense: DefenseRankings | null;
  weather: GameWeather | null;
  weatherScore: number;
  weatherNotes: string[];
  injuries: ImpactNote[];
  injuryScore: number;
};

const INJURED = new Set(["OUT", "IR", "PUP", "SUS", "NA", "DOUBTFUL", "QUESTIONABLE"]);

/** Injured players on one team from Sleeper's player database (all positions, with depth order). */
export function injuredOnTeam(players: Record<string, any>, team: string): InjuredPlayer[] {
  const t = normalizeTeam(team);
  const out: InjuredPlayer[] = [];
  for (const p of Object.values(players ?? {})) {
    if (normalizeTeam((p as any)?.team) !== t) continue;
    const status = String((p as any)?.injury_status ?? "").toUpperCase();
    if (!INJURED.has(status)) continue;
    out.push({
      name: String((p as any)?.full_name ?? ""),
      position: String((p as any)?.position ?? ""),
      status,
      injury: String((p as any)?.injury_body_part ?? ""),
      depthOrder: (p as any)?.depth_chart_order ?? null,
    });
  }
  return out;
}

export async function buildMatchupContext({
  playerName,
  position,
  team,
  season,
  week,
  statsRows,
}: {
  playerName: string;
  position: string;
  team: string | null;
  season: number;
  week: number;
  statsRows: any[];
}): Promise<MatchupContext | null> {
  const myTeam = normalizeTeam(team);
  if (!myTeam) return null;

  const [games, defense, players] = await Promise.all([
    getGameStates(season, week).catch(() => null),
    getDefenseRankings(season, statsRows),
    getAllPlayers().catch(() => ({} as Record<string, any>)),
  ]);
  const game: GameState | undefined = games?.get(myTeam);
  const opponent = game?.opponent ?? null;

  const weather = game ? await getGameWeather(game) : null;
  const effect = weatherEffect(weather);

  // His own status: the daily injury file first, then Sleeper.
  const sleeperSelf = Object.values(players ?? {}).find(
    (p: any) => normalizePlayerName(p?.full_name) === normalizePlayerName(playerName) && normalizeTeam(p?.team) === myTeam
  ) as any;
  const fileSelf = lookupInjury(playerName, position);
  const ownStatus = String(fileSelf?.status ?? sleeperSelf?.injury_status ?? "").toUpperCase();
  const ownInjury = String(fileSelf?.injury ?? sleeperSelf?.injury_body_part ?? "");

  const injuries = injuryImpacts({
    playerName,
    position,
    ownStatus,
    ownInjury,
    teammates: injuredOnTeam(players, myTeam),
    opponents: opponent ? injuredOnTeam(players, opponent) : [],
  });

  return {
    team: myTeam,
    opponent,
    homeAway: game?.homeAway ?? null,
    kickoff: game?.kickoff ?? null,
    defense,
    weather,
    weatherScore: weatherForPosition(position, effect),
    weatherNotes: effect.notes,
    injuries,
    injuryScore: netImpact(injuries).score,
  };
}

/** The block added to a player's data in the AI prompt. */
export function formatMatchupBlock(position: string, ctx: MatchupContext | null, week: number): string {
  if (!ctx) return "";
  const pos = String(position).toUpperCase();
  const where = ctx.opponent ? `${ctx.homeAway === "home" ? "vs" : "@"} ${ctx.opponent}` : "no game found (bye week?)";
  const kickoff = ctx.kickoff ? new Date(ctx.kickoff).toUTCString().replace(":00 GMT", " UTC") : "";

  const defenseLines =
    ctx.opponent && pos !== "DEF"
      ? formatDefenseBlock(ctx.opponent, pos, ctx.defense)
      : ctx.opponent
        ? `Opponent offense: ${ctx.opponent} (for a team defense, injuries on that offense below matter most).`
        : "";

  let weatherLine = "Weather: not available (no forecast for this game yet).";
  if (ctx.weather?.indoors) weatherLine = "Weather: indoors (dome or roof), so no weather effect.";
  else if (ctx.weather) {
    const effectWord = ctx.weatherScore < 0 ? "hurts" : ctx.weatherScore > 0 ? "helps" : "doesn't change";
    weatherLine =
      `Weather at kickoff: ${ctx.weather.summary}. For a ${pos} this ${effectWord} his outlook (${ctx.weatherScore > 0 ? "+" : ""}${ctx.weatherScore}).` +
      (ctx.weatherNotes.length ? ` Why: ${ctx.weatherNotes.join("; ")}.` : "");
  }

  return `
--- WEEK ${week} MATCHUP: ${ctx.team} ${where}${kickoff ? ` (${kickoff})` : ""} ---
${defenseLines}
${weatherLine}
--- INJURIES THAT AFFECT HIM (his team and the opponent) ---
${formatImpactBlock(ctx.injuries)}
`;
}

const ordinalOf = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

/** Defense rank that matters for this position (1 = toughest), or null. */
export function relevantDefenseRank(position: string, ctx: MatchupContext | null): number | null {
  const pos = String(position).toUpperCase();
  const d = ctx?.opponent ? ctx.defense?.teams?.[ctx.opponent] : null;
  if (!d) return null;
  if (pos === "QB" || pos === "WR" || pos === "TE" || pos === "RB" || pos === "K") return (d.ranks as any)[pos] ?? null;
  return null;
}

/**
 * How much to scale a player's usual points per game for this week's conditions.
 * Matchup: up to ±10% (32nd-ranked = easiest defense = +10%). Weather: 5% per point.
 * Injuries around him: 6% per point. Capped to 70%-130% of his usual output.
 */
export function matchupAdjustment(position: string, ctx: MatchupContext | null): { multiplier: number; parts: string[] } {
  if (!ctx) return { multiplier: 1, parts: [] };
  const parts: string[] = [];
  let m = 1;
  const rank = relevantDefenseRank(position, ctx);
  const teams = Object.keys(ctx.defense?.teams ?? {}).length || 32;
  if (rank !== null) {
    const pct = ((rank - (teams + 1) / 2) / ((teams - 1) / 2)) * 0.1;
    m += pct;
    parts.push(`${ctx.opponent} is ${ordinalOf(rank)} of ${teams} in points allowed to ${String(position).toUpperCase()}s (${pct >= 0 ? "+" : ""}${Math.round(pct * 100)}%)`);
  }
  if (ctx.weatherScore) {
    m += 0.05 * ctx.weatherScore;
    parts.push(`weather ${ctx.weatherScore > 0 ? "+" : ""}${ctx.weatherScore} (${ctx.weatherNotes[0] ?? "conditions"})`);
  }
  // His own Out/IR status is handled separately (he scores 0), so only use the rest here.
  const own = ctx.injuries.filter(n => n.source === "self" && n.weight > -3).reduce((t, n) => t + n.weight, 0);
  const others = Math.max(-3, Math.min(3, ctx.injuries.filter(n => n.source !== "self").reduce((t, n) => t + n.weight, 0)));
  const injury = Math.round((own + others) * 10) / 10;
  if (injury) {
    m += 0.06 * injury;
    const main = [...ctx.injuries].sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))[0];
    parts.push(`injuries ${injury > 0 ? "+" : ""}${injury} (${main?.source === "self" ? "his own injury" : `${main?.name} ${main?.status}`})`);
  }
  return { multiplier: Math.round(Math.max(0.7, Math.min(1.3, m)) * 100) / 100, parts };
}
