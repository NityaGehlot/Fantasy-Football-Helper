// app/backend/services/draft.ts
// Value-over-replacement draft board: how much better a player is than the last
// starter-quality player at his position in a league of this size.

import { SlotName } from "./lineup";
import type { PlayerValue } from "./playerValues";

export type DraftBoardEntry = PlayerValue & { vor: number; positionRank: number; fillsNeed: boolean };

// How flex slots are typically filled across a league.
const FLEX_SHARE: Partial<Record<SlotName, Record<string, number>>> = {
  FLEX: { RB: 0.45, WR: 0.45, TE: 0.1 },
  SUPER_FLEX: { QB: 0.8, RB: 0.1, WR: 0.1 },
  REC_FLEX: { WR: 0.8, TE: 0.2 },
  WRRB_FLEX: { RB: 0.5, WR: 0.5 },
};

export function startersPerTeam(slots: SlotName[]): Record<string, number> {
  const counts: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
  for (const slot of slots) {
    const share = FLEX_SHARE[slot];
    if (share) Object.entries(share).forEach(([pos, s]) => (counts[pos] += s));
    else counts[slot] += 1;
  }
  return counts;
}

export function buildDraftBoard(
  players: PlayerValue[],
  {
    teams = 12,
    slots,
    excludeKeys = new Set<string>(),
    myPositionCounts,
    limit = 15,
  }: {
    teams?: number;
    slots: SlotName[];
    excludeKeys?: Set<string>;
    // Omit when the user's roster is unknown; then nothing is flagged as filling a need.
    myPositionCounts?: Record<string, number>;
    limit?: number;
  }
): DraftBoardEntry[] {
  const starters = startersPerTeam(slots);
  const available = players.filter(p => !excludeKeys.has(p.key) && p.value > 0 && p.position in starters);
  const byPosition = new Map<string, PlayerValue[]>();
  available.forEach(p => byPosition.set(p.position, [...(byPosition.get(p.position) ?? []), p]));

  const board: DraftBoardEntry[] = [];
  byPosition.forEach((list, position) => {
    list.sort((a, b) => b.value - a.value);
    const replacementIndex = Math.max(0, Math.ceil(teams * starters[position]) - 1);
    const replacement = list[Math.min(replacementIndex, list.length - 1)]?.value ?? 0;
    const needed = Math.ceil(starters[position]);
    list.forEach((p, i) =>
      board.push({
        ...p,
        vor: Math.round((p.value - replacement) * 100) / 100,
        positionRank: i + 1,
        fillsNeed: myPositionCounts !== undefined && (myPositionCounts[position] ?? 0) < needed,
      })
    );
  });

  return board.sort((a, b) => b.vor - a.vor).slice(0, limit);
}
