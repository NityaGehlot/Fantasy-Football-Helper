// app/backend/services/liveMatchup.ts
// Live scoreboard for a Sleeper matchup: current points, projected finals and win odds.
//
// Win odds model: each side's final score = current points + projected points still to come.
// "Still to come" is a player's weekly projection scaled by how much of his game is left.
// Uncertainty: a player's weekly score varies by roughly half his projection (plus a floor),
// and only the remaining part of the game can still change, so variance scales with the
// fraction remaining. The difference of two such totals is ~normal, giving P(win).

import type { GameState } from "./schedule";

export type LivePlayer = {
  id: string;
  name: string;
  position: string;
  slot: string;
  team: string;
  points: number;
  projectedTotal: number;
  projectedRemaining: number;
  fractionRemaining: number;
  game: { state: "pre" | "in" | "post" | "bye"; detail: string; opponent: string | null };
  statLine: string;
};

export type LiveSide = {
  rosterId: number;
  teamName: string;
  points: number;
  projectedFinal: number;
  stdDev: number;
  winProbability: number;
  playersYetToPlay: number;
  playersInProgress: number;
  starters: LivePlayer[];
};

const round = (n: number, digits = 2) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

// Share of a game still to be played: 1 before kickoff, 0 when final or on bye.
export function fractionRemaining(game: GameState | undefined | null): number {
  if (!game) return 0; // no game this week (bye)
  if (game.state === "pre") return 1;
  if (game.state === "post") return 0;
  const [mm, ss] = String(game.clock || "0:00").split(":").map(n => Number(n) || 0);
  const clockMinutes = Math.min(15, mm + ss / 60);
  if (game.period >= 5) return 0.02; // overtime
  if (game.period <= 0) return 1;
  const elapsed = (game.period - 1) * 15 + (15 - clockMinutes);
  return Math.max(0.01, Math.min(1, (60 - elapsed) / 60));
}

// Pick the projection that matches the league's reception scoring.
export function projectionFor(stats: any, receptionPoints: number): number | null {
  if (!stats) return null;
  const key = receptionPoints >= 1 ? "pts_ppr" : receptionPoints >= 0.5 ? "pts_half_ppr" : "pts_std";
  const value = Number(stats[key] ?? stats.pts_ppr);
  return Number.isFinite(value) ? value : null;
}

// Approximate standard normal CDF (Abramowitz & Stegun 7.1.26, error < 1.5e-7).
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t *
    Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

export function playerStdDev(projectedTotal: number, fraction: number): number {
  const fullGame = 0.5 * Math.max(0, projectedTotal) + 2.5;
  return fullGame * Math.sqrt(Math.max(0, fraction));
}

export function winProbability(
  a: { projectedFinal: number; stdDev: number },
  b: { projectedFinal: number; stdDev: number }
): number {
  const spread = Math.sqrt(a.stdDev ** 2 + b.stdDev ** 2);
  const diff = a.projectedFinal - b.projectedFinal;
  if (diff === 0) return 0.5;
  if (spread < 0.01) return diff > 0 ? 1 : 0; // everyone has played
  // Keep live odds off the absolute extremes until it's actually over.
  return Math.min(0.995, Math.max(0.005, normalCdf(diff / spread)));
}

// Short live stat line, e.g. "18/27, 241 YD, 2 TD" or "6 REC, 84 YD, 1 TD".
export function formatStatLine(position: string, s: any): string {
  if (!s) return "";
  const n = (k: string) => Number(s[k]) || 0;
  const parts: string[] = [];
  if (position === "QB") {
    if (n("pass_att")) parts.push(`${n("pass_cmp")}/${n("pass_att")}, ${n("pass_yd")} YD`);
    if (n("pass_td")) parts.push(`${n("pass_td")} TD`);
    if (n("pass_int")) parts.push(`${n("pass_int")} INT`);
    if (n("rush_yd")) parts.push(`${n("rush_yd")} RUSH YD`);
  } else if (position === "K") {
    if (n("fgm") || n("fga")) parts.push(`${n("fgm")}/${n("fga")} FG`);
    if (n("xpm")) parts.push(`${n("xpm")} XP`);
  } else if (position === "DEF") {
    if (n("sack")) parts.push(`${n("sack")} SACK`);
    if (n("int")) parts.push(`${n("int")} INT`);
    if (n("fum_rec")) parts.push(`${n("fum_rec")} FR`);
    if (n("def_td")) parts.push(`${n("def_td")} TD`);
    if ("pts_allow" in s) parts.push(`${n("pts_allow")} PA`);
  } else {
    if (n("rush_att")) parts.push(`${n("rush_att")} CAR, ${n("rush_yd")} YD`);
    if (n("rec") || n("rec_tgt")) parts.push(`${n("rec")}/${n("rec_tgt")} REC, ${n("rec_yd")} YD`);
    const tds = n("rush_td") + n("rec_td");
    if (tds) parts.push(`${tds} TD`);
  }
  return parts.join(", ");
}

const gameDetail = (game: GameState | undefined): LivePlayer["game"] => {
  if (!game) return { state: "bye", detail: "Bye", opponent: null };
  const vs = `${game.homeAway === "home" ? "vs" : "@"} ${game.opponent}`;
  if (game.state === "pre") return { state: "pre", detail: vs, opponent: game.opponent };
  const score = game.teamScore !== null ? ` ${game.teamScore}-${game.opponentScore}` : "";
  return { state: game.state, detail: `${game.detail}${score} ${vs}`.trim(), opponent: game.opponent };
};

/**
 * Build one side of the scoreboard from Sleeper's matchup row.
 * fallbackProjection is used when Sleeper has no projection for a player (e.g. our pts/g value).
 */
export function buildLiveSide({
  matchup,
  teamName,
  rosterPositions,
  players,
  projections,
  stats,
  games,
  receptionPoints,
  fallbackProjection,
}: {
  matchup: any;
  teamName: string;
  rosterPositions: string[];
  players: Record<string, any>;
  projections: Record<string, any>;
  stats: Record<string, any>;
  games: Map<string, GameState> | null;
  receptionPoints: number;
  fallbackProjection: (playerId: string, player: any) => number;
}): Omit<LiveSide, "winProbability"> {
  const starterIds: string[] = (matchup?.starters ?? []).map(String);
  const pointsById: Record<string, number> = matchup?.players_points ?? {};

  const starters: LivePlayer[] = starterIds.map((id, i) => {
    const p = players[id] ?? {};
    const position = String(p.position ?? "").toUpperCase();
    const team = String(p.team ?? (position === "DEF" ? id : "")).toUpperCase();
    const game = games ? games.get(team) : undefined;
    const knownSchedule = games !== null && games.size > 0;
    const projectedTotal =
      id === "0" ? 0 : projectionFor(projections[id], receptionPoints) ?? fallbackProjection(id, p);
    const points = Number(pointsById[id]) || 0;
    // Without the NFL schedule we can't see game clocks, so assume points scored so far are
    // part of the projection and only the rest is still to come.
    const fraction =
      id === "0" ? 0
      : knownSchedule ? fractionRemaining(game)
      : projectedTotal > 0 ? Math.max(0, projectedTotal - points) / projectedTotal : 0;
    return {
      id,
      name: id === "0" ? "Empty slot" : p.full_name || (position === "DEF" ? `${team} DEF` : id),
      position,
      slot: String(rosterPositions[i] ?? position).toUpperCase(),
      team,
      points: round(points),
      projectedTotal: round(projectedTotal),
      projectedRemaining: round(projectedTotal * fraction),
      fractionRemaining: round(fraction, 3),
      game: knownSchedule ? gameDetail(game) : { state: "pre", detail: "", opponent: null },
      statLine: formatStatLine(position, stats[id]),
    };
  });

  const points = starters.reduce((t, s) => t + s.points, 0);
  const remaining = starters.reduce((t, s) => t + s.projectedRemaining, 0);
  const variance = starters.reduce((t, s) => t + playerStdDev(s.projectedTotal, s.fractionRemaining) ** 2, 0);

  return {
    rosterId: Number(matchup?.roster_id),
    teamName,
    points: round(points),
    projectedFinal: round(points + remaining),
    stdDev: round(Math.sqrt(variance)),
    playersYetToPlay: starters.filter(s => s.id !== "0" && s.game.state === "pre" && s.fractionRemaining > 0).length,
    playersInProgress: starters.filter(s => s.game.state === "in").length,
    starters,
  };
}
