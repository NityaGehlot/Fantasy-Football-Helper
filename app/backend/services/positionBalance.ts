// app/backend/services/positionBalance.ts
// How many players of each position a roster should carry, based on the league's starting
// lineup, and warnings when an add or drop takes a position outside that range.
//
// Common roster-construction advice (9 starters + 6-7 bench): use the bench mostly for RB and
// WR depth (bye weeks and injuries hit them most), carry at most one backup QB and TE (two in
// superflex / two-TE leagues), and never stockpile kickers or defenses: one of each is enough.

import type { SlotName } from "./lineup";
import type { TradePlayer } from "./tradeEngine";

export type Pos = "QB" | "RB" | "WR" | "TE" | "K" | "DEF";
export type Range = { min: number; max: number };
export const POSITIONS: Pos[] = ["QB", "RB", "WR", "TE", "K", "DEF"];

/** Recommended number of players per position for this lineup. */
export function positionTargets(slots: SlotName[]): Record<Pos, Range> {
  const n = (s: string) => slots.filter(x => x === s).length;
  const superflex = n("SUPER_FLEX");
  const flex = n("FLEX") + n("WRRB_FLEX");
  const recFlex = n("REC_FLEX");
  const qb = n("QB") + superflex;
  return {
    QB: { min: Math.max(1, qb), max: Math.max(1, qb) + 1 },
    RB: { min: n("RB") + 1, max: n("RB") + 3 + Math.min(flex, 1) },
    WR: { min: n("WR") + 1, max: n("WR") + 3 + Math.min(flex + recFlex, 1) },
    TE: { min: Math.max(1, n("TE")), max: Math.max(1, n("TE")) + 1 },
    K: { min: n("K") > 0 ? 1 : 0, max: n("K") },
    DEF: { min: n("DEF") > 0 ? 1 : 0, max: n("DEF") },
  };
}

export function positionCounts(players: { position: string }[]): Record<Pos, number> {
  const counts = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 } as Record<Pos, number>;
  for (const p of players) if ((POSITIONS as string[]).includes(p.position)) counts[p.position as Pos]++;
  return counts;
}

const plural = (pos: Pos, n: number) => (n === 1 ? pos : pos === "DEF" ? "defenses" : `${pos}s`);

/** Positions carrying more players than they need (candidates to drop from). */
export function surplusPositions(counts: Record<Pos, number>, targets: Record<Pos, Range>): Pos[] {
  return POSITIONS.filter(p => targets[p].max > 0 && counts[p] > targets[p].max);
}

/**
 * Warnings for a roster move: a drop that leaves a position thin, or an add that piles onto a
 * position you already have plenty of.
 */
export function moveWarnings(
  roster: { id: string; position: string }[],
  move: { add?: { position: string } | null; drop?: { id: string; position: string } | null },
  targets: Record<Pos, Range>
): string[] {
  const after = roster.filter(p => p.id !== move.drop?.id).concat(move.add ? [{ id: "new", position: move.add.position }] : []);
  const before = positionCounts(roster);
  const now = positionCounts(after);
  const out: string[] = [];
  for (const pos of POSITIONS) {
    const t = targets[pos];
    if (now[pos] < t.min && now[pos] < before[pos]) {
      out.push(`⚠️ This leaves you with ${now[pos]} ${plural(pos, now[pos])}; teams in this league usually need at least ${t.min} to cover bye weeks and injuries.`);
    }
    if (t.max > 0 && now[pos] > t.max && now[pos] > before[pos]) {
      out.push(`⚠️ This gives you ${now[pos]} ${plural(pos, now[pos])}; more than ${t.max} usually wastes a bench spot you could use on RB/WR depth.`);
    }
  }
  return out;
}

/** One-paragraph summary of the roster's balance for AI prompts. */
export function balanceSummary(roster: TradePlayer[], targets: Record<Pos, Range>): string {
  const counts = positionCounts(roster);
  const parts = POSITIONS.filter(p => targets[p].max > 0 || counts[p] > 0).map(p => {
    const t = targets[p];
    const flag = counts[p] > t.max ? " (TOO MANY)" : counts[p] < t.min ? " (TOO FEW)" : "";
    return `${p} ${counts[p]} (recommended ${t.min}${t.max !== t.min ? `-${t.max}` : ""})${flag}`;
  });
  return parts.join(" · ");
}

/** Why a surplus player is a good drop, in plain words. */
export function surplusReason(pos: Pos, count: number, targets: Record<Pos, Range>): string {
  const t = targets[pos];
  const need = t.min === t.max ? `${t.max}` : `${t.min}-${t.max}`;
  return `You have ${count} ${plural(pos, count)} and this league only needs about ${need}, so an extra ${pos} rarely plays: his roster spot is worth more as RB/WR depth.`;
}
