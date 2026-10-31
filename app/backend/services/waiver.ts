// app/backend/services/waiver.ts
// Decide who to drop for a pickup, and which free agents are worth adding.

import { SlotName, lineupValue } from "./lineup";
import type { TradePlayer } from "./tradeEngine";

export type DropOption = {
  drop: TradePlayer;
  // Change in projected starting-lineup points per week after the add/drop.
  netGain: number;
};

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Rank every player on the roster as a drop candidate for adding `target`.
 * The best drop is the one that leaves the strongest starting lineup; ties go to
 * dropping the lower-value (less useful as depth) player.
 */
export function rankDropCandidates(roster: TradePlayer[], target: TradePlayer, slots: SlotName[]): DropOption[] {
  const before = lineupValue(roster, slots);
  return roster
    .filter(p => p.id !== target.id)
    .map(drop => ({
      drop,
      netGain: round(lineupValue([...roster.filter(p => p.id !== drop.id), target], slots) - before),
    }))
    .sort((a, b) => b.netGain - a.netGain || a.drop.value - b.drop.value);
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
