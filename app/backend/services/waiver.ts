// app/backend/services/waiver.ts
// Decide who to drop for a pickup, and which free agents are worth adding.

import { SlotName, lineupValue } from "./lineup";
import type { TradePlayer } from "./tradeEngine";
import { moveWarnings, positionCounts, positionTargets, surplusPositions, surplusReason, type Pos } from "./positionBalance";

export type DropOption = {
  drop: TradePlayer;
  // Change in projected starting-lineup points per week after the add/drop.
  netGain: number;
  // Roster-balance notes: why this drop is smart (surplus position) or a warning (too few left)
  notes?: string[];
};

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Rank every player on the roster as a drop candidate for adding `target`.
 * The best drop is the one that leaves the strongest starting lineup; ties go to
 * dropping the lower-value (less useful as depth) player.
 */
export function rankDropCandidates(roster: TradePlayer[], target: TradePlayer, slots: SlotName[]): DropOption[] {
  const before = lineupValue(roster, slots);
  const targets = positionTargets(slots);
  const counts = positionCounts(roster);
  const surplus = new Set(surplusPositions(counts, targets));
  // At a position you have too many of, the one scoring the fewest fantasy points this season
  // is the natural cut.
  const worstAt = new Map<string, TradePlayer>();
  for (const pos of surplus) {
    const group = roster.filter(p => p.position === pos && p.id !== target.id);
    const worst = [...group].sort((a, b) => seasonPoints(a) - seasonPoints(b) || a.value - b.value)[0];
    if (worst) worstAt.set(pos, worst);
  }
  const options = roster
    .filter(p => p.id !== target.id)
    .map(drop => {
      const notes: string[] = [];
      if (surplus.has(drop.position as Pos)) {
        notes.push(surplusReason(drop.position as Pos, counts[drop.position as Pos], targets));
        if (worstAt.get(drop.position)?.id === drop.id) notes.push(worstPerformerNote(drop, roster));
      }
      notes.push(...moveWarnings(roster, { add: target, drop }, targets));
      return { drop, netGain: round(lineupValue([...roster.filter(p => p.id !== drop.id), target], slots) - before), notes };
    });
  // Best lineup first. Among drops that cost the lineup about the same (within ~0.3-0.6 pts),
  // prefer a player from a position you have too many of (most of all the lowest scorer there),
  // and avoid leaving a position thin.
  const score = (o: DropOption) =>
    o.netGain +
    (surplus.has(o.drop.position as Pos) ? 0.3 : 0) +
    (worstAt.get(o.drop.position)?.id === o.drop.id ? 0.3 : 0) -
    ((o.notes ?? []).some(n => n.includes("leaves you with")) ? 0.3 : 0);
  return options.sort((a, b) => score(b) - score(a) || seasonPoints(a.drop) - seasonPoints(b.drop) || a.drop.value - b.drop.value);
}

const seasonPoints = (p: TradePlayer) => p.rank?.points ?? 0;

/** "Lowest scorer of your 4 QBs: 54.20 pts this season (QB28)." */
export function worstPerformerNote(p: TradePlayer, roster: TradePlayer[]): string {
  const group = roster.filter(r => r.position === p.position);
  const pts = p.rank ? `${p.rank.points.toFixed(2)} pts this season (${p.rank.pos}${p.rank.position})` : "no fantasy points yet this season";
  return `Lowest scorer of your ${group.length} ${p.position}s: ${pts}.`;
}

export type PickupSuggestion = DropOption & { add: TradePlayer };

export function suggestPickups(
  roster: TradePlayer[],
  freeAgents: TradePlayer[],
  slots: SlotName[],
  limit = 5
): PickupSuggestion[] {
  return freeAgents
    .filter(p => p.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 40)
    .map(add => ({ add, ...rankDropCandidates(roster, add, slots)[0] }))
    .filter(s => s.drop && (s.netGain > 0 || s.add.value > s.drop.value))
    .sort((a, b) => b.netGain - a.netGain || (b.add.value - b.drop.value) - (a.add.value - a.drop.value))
    // Keep the list varied: at most two suggestions per position.
    .filter((s, _, all) => all.filter(o => o.add.position === s.add.position).indexOf(s) < 2)
    .slice(0, limit);
}
