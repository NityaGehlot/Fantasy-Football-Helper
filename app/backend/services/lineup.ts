// app/backend/services/lineup.ts
// Turn a Sleeper roster_positions list into starting slots and pick the best lineup.

export type SlotName = "QB" | "RB" | "WR" | "TE" | "K" | "DEF" | "FLEX" | "SUPER_FLEX" | "REC_FLEX" | "WRRB_FLEX";

export const SLOT_ELIGIBILITY: Record<SlotName, string[]> = {
  QB: ["QB"],
  RB: ["RB"],
  WR: ["WR"],
  TE: ["TE"],
  K: ["K"],
  DEF: ["DEF"],
  FLEX: ["RB", "WR", "TE"],
  SUPER_FLEX: ["QB", "RB", "WR", "TE"],
  REC_FLEX: ["WR", "TE"],
  WRRB_FLEX: ["RB", "WR"],
};

// Standard 1QB / 2RB / 2WR / 1TE / 1FLEX / K / DEF when a league's settings are unknown.
export const DEFAULT_SLOTS: SlotName[] = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF"];

export function parseRosterSlots(rosterPositions: unknown): SlotName[] {
  if (!Array.isArray(rosterPositions)) return DEFAULT_SLOTS;
  const slots = rosterPositions
    .map(p => String(p).toUpperCase())
    .filter((p): p is SlotName => p in SLOT_ELIGIBILITY);
  return slots.length > 0 ? slots : DEFAULT_SLOTS;
}

export type LineupPlayer = { id: string; name: string; position: string; value: number };
export type LineupAssignment = { slot: SlotName; player: LineupPlayer | null };

// Fill fixed position slots first, then flex slots (narrowest flex first), always with the
// highest-value eligible player left. Greedy is optimal for standard leagues (flex sets are nested).
export function optimizeLineup(players: LineupPlayer[], slots: SlotName[]): LineupAssignment[] {
  const remaining = [...players].sort((a, b) => b.value - a.value);
  const order = [...slots].sort((a, b) => SLOT_ELIGIBILITY[a].length - SLOT_ELIGIBILITY[b].length);
  const assignments: LineupAssignment[] = [];

  for (const slot of order) {
    const idx = remaining.findIndex(p => SLOT_ELIGIBILITY[slot].includes(p.position));
    assignments.push({ slot, player: idx >= 0 ? remaining.splice(idx, 1)[0] : null });
  }

  return assignments;
}

export function lineupValue(players: LineupPlayer[], slots: SlotName[]): number {
  return optimizeLineup(players, slots).reduce((sum, a) => sum + (a.player?.value ?? 0), 0);
}
