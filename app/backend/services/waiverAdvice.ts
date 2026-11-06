// app/backend/services/waiverAdvice.ts
// Waiver advice for a free agent, following how the league's waivers work in Sleeper:
//
//  • FAAB (settings.waiver_type 2): a suggested bid, from what similar players went for in THIS
//    league (completed waiver claims and their winning bids), scaled to how much budget you and
//    the league have left. With too little league history it falls back to common guidance:
//    a likely starter 15-25% of the budget, flex/depth 5-10%, a stash 1-3%.
//  • Rolling waivers (waiver_type 0) and reverse standings (1): no bids, a claim order. Your
//    priority is worth spending only on a player who clearly helps; otherwise wait until he clears
//    waivers and add him as a free agent, keeping your spot in line.

import type { TradePlayer } from "./tradeEngine";
import { toTradePlayer, type LeagueContext } from "./leagueContext";
import { lineupValue } from "./lineup";
import { getNflState, getRosters, getTransactions } from "./sleeperServer";
import { rankDropCandidates } from "./waiver";

export type WaiverClaim = { week: number; playerId: string; position: string; value: number; bid: number | null; won: boolean };

export type FaabAdvice = {
  type: "faab";
  budget: number;
  remaining: number;
  low: number;
  likely: number;
  high: number;
  // How the number was reached, in plain words
  basis: string;
  comparables: number;
};

export type PriorityAdvice = {
  type: "rolling" | "reverse";
  position: number | null; // 1 = first in line
  teams: number;
  useClaim: boolean;
  basis: string;
};

export type WaiverAdvice = (FaabAdvice | PriorityAdvice) & { lineupGain: number; summary: string };

const round = (n: number) => Math.round(n);
const pct = (sorted: number[], p: number) => {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};

/** Completed / failed waiver claims from Sleeper transactions, with each player's position and value. */
export function claimsFromTransactions(
  transactions: any[],
  players: Map<string, { position: string; value: number }>
): WaiverClaim[] {
  const out: WaiverClaim[] = [];
  for (const t of transactions ?? []) {
    if (t?.type !== "waiver") continue;
    const bid = Number(t?.settings?.waiver_bid);
    for (const id of Object.keys(t?.adds ?? {})) {
      const p = players.get(id);
      out.push({
        week: Number(t.leg ?? 0),
        playerId: id,
        position: p?.position ?? "",
        value: p?.value ?? 0,
        bid: Number.isFinite(bid) ? bid : null,
        won: t.status === "complete",
      });
    }
  }
  return out;
}

/**
 * Suggested FAAB bid. `starterValue` is roughly the points per game of the weakest starter at
 * his position in the league (above it he's a likely starter for many teams).
 */
export function faabBid({
  target,
  claims,
  budget,
  remaining,
  leagueRemainingAvg,
  minBid = 0,
  starterValue,
}: {
  target: { position: string; value: number };
  claims: WaiverClaim[];
  budget: number;
  remaining: number;
  leagueRemainingAvg: number;
  minBid?: number;
  starterValue: number;
}): Omit<FaabAdvice, "type"> {
  const won = claims.filter(c => c.won && c.bid !== null && c.bid > 0 && c.value > 0);
  const near = won.filter(c => c.position === target.position && Math.abs(c.value - target.value) <= Math.max(1.5, target.value * 0.35));
  // Later in the season everyone has less to spend: scale history by what's left now.
  const spendScale = budget > 0 ? Math.max(0.25, Math.min(1, leagueRemainingAvg / budget)) : 1;
  let low: number, likely: number, high: number, basis: string, comparables: number;
  if (near.length >= 3) {
    const bids = near.map(c => c.bid!).sort((a, b) => a - b);
    low = pct(bids, 0.25) * spendScale;
    likely = pct(bids, 0.5) * spendScale;
    high = pct(bids, 0.8) * spendScale;
    comparables = near.length;
    basis = `${near.length} ${target.position}s like him (${target.value.toFixed(1)} pts/g) went for $${round(pct(bids, 0.25))}-$${round(pct(bids, 0.8))} in your league`;
  } else if (won.length >= 5) {
    // Not enough at his position: what your league pays per point of value.
    const perPoint = won.map(c => c.bid! / c.value).sort((a, b) => a - b);
    likely = pct(perPoint, 0.5) * target.value * spendScale;
    low = likely * 0.7;
    high = likely * 1.4;
    comparables = won.length;
    basis = `your league pays about $${pct(perPoint, 0.5).toFixed(1)} per projected point on waivers (${won.length} winning bids)`;
  } else {
    // Common FAAB guidance when the league has little history.
    const share = target.value >= starterValue * 1.15 ? 0.2 : target.value >= starterValue * 0.85 ? 0.08 : 0.02;
    likely = budget * share * spendScale;
    low = likely * 0.6;
    high = likely * 1.5;
    comparables = 0;
    basis =
      share >= 0.2
        ? "he'd likely start for many teams; common guidance is 15-25% of the budget for that"
        : share >= 0.08
          ? "a flex / depth piece; common guidance is 5-10% of the budget"
          : "a stash; common guidance is 1-3% of the budget";
  }
  const cap = (n: number) => Math.max(minBid, Math.min(remaining, round(n)));
  return { budget, remaining, low: cap(low), likely: cap(likely), high: cap(Math.max(high, likely)), basis, comparables };
}

/** Rolling / reverse-standings waivers: is he worth your claim priority? */
export function priorityAdvice({
  position,
  teams,
  lineupGain,
  topPickup,
  dropName = null,
}: {
  position: number | null;
  teams: number;
  lineupGain: number;
  // Among the best few free agents right now
  topPickup: boolean;
  // Who you'd drop to make room (null = you have an open roster spot)
  dropName?: string | null;
}): Omit<PriorityAdvice, "type"> {
  const high = position !== null && position <= Math.max(2, Math.ceil(teams / 4));
  const low = position !== null && position > Math.ceil(teams / 2);
  let useClaim: boolean;
  let basis: string;
  if (lineupGain <= 0.05) {
    // No better lineup: only depth. Not worth a claim (or a roster spot) unless you have room.
    useClaim = false;
    basis = dropName
      ? `this pickup wouldn't improve your starting lineup (you'd have to drop someone like ${dropName} to make room), so there's no need to claim`
      : "this pickup wouldn't improve your starting lineup; add later as a free agent only if you want depth";
  } else if (lineupGain >= 1.5 || (topPickup && lineupGain > 0.5)) {
    useClaim = true;
    basis = `this pickup makes your lineup about ${lineupGain.toFixed(1)} pts/week better${dropName ? ` (dropping ${dropName})` : ""}, worth ${high ? "your high" : "your"} waiver priority`;
  } else if (low) {
    useClaim = true;
    basis = `a small upgrade (+${lineupGain.toFixed(1)} pts/week${dropName ? `, dropping ${dropName}` : ""}), and your priority is already low, so a claim costs you little`;
  } else if (high) {
    useClaim = false;
    basis = "save your high priority for a bigger pickup; if nobody claims this player, add him as a free agent once waivers clear";
  } else {
    useClaim = lineupGain > 0.5;
    basis = useClaim
      ? `a modest upgrade (+${lineupGain.toFixed(1)} pts/week); fine to claim`
      : "depth, not an upgrade; wait until waivers clear and add as a free agent";
  }
  return { position, teams, useClaim, basis };
}

export function waiverSummary(a: WaiverAdvice, name: string): string {
  if (a.type === "faab")
    return `Suggested FAAB bid for ${name}: $${a.likely} (range $${a.low}-$${a.high}, you have $${a.remaining} of $${a.budget} left). ${cap1(a.basis)}.`;
  const pos = a.position ? `You're #${a.position} of ${a.teams} in waiver priority. ` : "";
  return `${pos}${a.useClaim ? `Claim ${name}: ` : `Don't spend your claim on ${name}: `}${a.basis}.`;
}
const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Points per game of the weakest likely starter at a position across the league. */
export function starterValueAt(position: string, teams: { players: TradePlayer[] }[], startersPerTeam: number): number {
  const vals = teams
    .flatMap(t => t.players.filter(p => p.position === position).map(p => p.value))
    .sort((a, b) => b - a);
  const idx = Math.min(vals.length - 1, Math.max(0, teams.length * startersPerTeam - 1));
  return vals.length ? vals[idx] : 0;
}

/**
 * Everything the app shows for a free agent: FAAB bid or waiver-priority advice, how much he'd
 * help your lineup and who you'd drop. `{ rostered: true }` when he's on a team in the league.
 */
export async function buildWaiverAdvice(ctx: LeagueContext, leagueId: string, playerId: string): Promise<any> {
  const me = ctx.me!;
  const [rosters, state] = await Promise.all([getRosters(leagueId), getNflState().catch(() => null)]);
  const id = String(playerId);
  const owner = ctx.teams.find(t => t.players.some(p => p.id === id));
  if (owner) return { rostered: true, owner: owner.teamName };
  const target = ctx.freeAgents.find(p => p.id === id) ?? toTradePlayer(id, ctx.players[id] ?? { player_id: id }, ctx.values.index);

  // How much he'd help: straight into an open roster spot, or for your best drop.
  const myRoster = (rosters ?? []).find((r: any) => Number(r.roster_id) === me.rosterId) ?? {};
  const away = new Set([...(myRoster.reserve ?? []), ...(myRoster.taxi ?? [])].map(String));
  const active = me.players.filter(p => !away.has(p.id));
  const size = (ctx.league?.roster_positions ?? []).filter((x: string) => !["IR", "TAXI"].includes(String(x).toUpperCase())).length;
  const open = size > 0 && active.length < size;
  const bestDrop = open ? null : rankDropCandidates(active, target, ctx.slots)[0] ?? null;
  const lineupGain = open
    ? Math.round((lineupValue([...active, target], ctx.slots) - lineupValue(active, ctx.slots)) * 100) / 100
    : bestDrop?.netGain ?? 0;

  const settings = ctx.league?.settings ?? {};
  const waiverType = Number(settings.waiver_type ?? 0);
  let advice: any;
  if (waiverType === 2) {
    const week = Number(state?.week) || 1;
    const weeks = Array.from({ length: Math.max(1, week) }, (_, i) => i + 1);
    const transactions = (await Promise.all(weeks.map(w => getTransactions(leagueId, w).catch(() => [])))).flat();
    const known = new Map<string, { position: string; value: number }>();
    for (const p of [...ctx.teams.flatMap(t => t.players), ...ctx.freeAgents]) known.set(p.id, { position: p.position, value: p.value });
    for (const t of transactions)
      for (const pid of Object.keys(t?.adds ?? {}))
        if (!known.has(pid)) {
          const tp = toTradePlayer(pid, ctx.players[pid] ?? { player_id: pid }, ctx.values.index);
          known.set(pid, { position: tp.position, value: tp.value });
        }
    const budget = Number(settings.waiver_budget ?? 100);
    const used = (r: any) => Number(r?.settings?.waiver_budget_used ?? 0);
    const remaining = Math.max(0, budget - used(myRoster));
    const all = rosters ?? [];
    const leagueRemainingAvg = all.length ? all.reduce((t: number, r: any) => t + Math.max(0, budget - used(r)), 0) / all.length : budget;
    const startersPerTeam = Math.max(1, ctx.slots.filter(sl => sl === target.position).length);
    const bid = faabBid({
      target,
      claims: claimsFromTransactions(transactions, known),
      budget,
      remaining,
      leagueRemainingAvg,
      minBid: Number(settings.waiver_bid_min ?? 0),
      starterValue: starterValueAt(target.position, ctx.teams, startersPerTeam),
    });
    advice = { type: "faab", ...bid, lineupGain };
  } else {
    const topPickup = [...ctx.freeAgents].sort((a, b) => b.value - a.value).slice(0, 5).some(p => p.id === id);
    const pr = priorityAdvice({
      position: myRoster?.settings?.waiver_position ?? null,
      teams: (rosters ?? []).length || ctx.teams.length,
      lineupGain,
      topPickup,
      dropName: bestDrop?.drop.name ?? null,
    });
    advice = { type: waiverType === 1 ? "reverse" : "rolling", ...pr, lineupGain };
  }
  advice.summary = waiverSummary(advice, target.name);
  return {
    rostered: false,
    player: { id, name: target.name, position: target.position, value: target.value },
    openSpot: open,
    drop: bestDrop ? { id: bestDrop.drop.id, name: bestDrop.drop.name, position: bestDrop.drop.position } : null,
    ...advice,
  };
}
