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
  const options = roster
    .filter(p => p.id !== target.id)
    .map(drop => {
      const notes: string[] = [];
      if (surplus.has(drop.position as Pos)) notes.push(surplusReason(drop.position as Pos, counts[drop.position as Pos], targets));
      notes.push(...moveWarnings(roster, { add: target, drop }, targets));
      return { drop, netGain: round(lineupValue([...roster.filter(p => p.id !== drop.id), target], slots) - before), notes };
    });
  // Best lineup first. Among drops that cost the lineup about the same (within 0.3 pts),
  // prefer a player from a position you have too many of, and avoid leaving a position thin.
  const score = (o: DropOption) =>
    o.netGain + (surplus.has(o.drop.position as Pos) ? 0.3 : 0) - ((o.notes ?? []).some(n => n.includes("leaves you with")) ? 0.3 : 0);
  return options.sort((a, b) => score(b) - score(a) || a.drop.value - b.drop.value);
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
