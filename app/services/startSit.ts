// app/services/startSit.ts
// Which of your players can take each other's lineup spot, for the start/sit picker.

// Lineup slot -> positions that can play it (same rules as Sleeper and the backend).
export const SLOT_POSITIONS: Record<string, string[]> = {
  QB: ['QB'],
  RB: ['RB'],
  WR: ['WR'],
  TE: ['TE'],
  K: ['K'],
  DEF: ['DEF'],
  FLEX: ['RB', 'WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  REC_FLEX: ['WR', 'TE'],
  WRRB_FLEX: ['WR', 'RB'],
};

const DEFAULT_SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'];

const SLOT_NAMES: Record<string, string> = {
  FLEX: 'FLEX (RB/WR/TE)',
  SUPER_FLEX: 'SUPER FLEX (QB/RB/WR/TE)',
  REC_FLEX: 'W/T FLEX',
  WRRB_FLEX: 'W/R FLEX',
};

/** Starting slots in this league (bench/IR/taxi removed). */
export function startingSlots(rosterPositions?: string[] | null): string[] {
  const slots = (rosterPositions ?? []).map(s => String(s).toUpperCase()).filter(s => s in SLOT_POSITIONS);
  return slots.length ? slots : DEFAULT_SLOTS;
}

/** Every distinct lineup slot this position can fill. */
export function slotsFor(position: string, rosterPositions?: string[] | null): string[] {
  const pos = String(position).toUpperCase();
  return [...new Set(startingSlots(rosterPositions).filter(s => SLOT_POSITIONS[s].includes(pos)))];
}

/** Slots both players could fill, i.e. where one could start instead of the other. */
export function sharedSlots(a: string, b: string, rosterPositions?: string[] | null): string[] {
  const bs = new Set(slotsFor(b, rosterPositions));
  return slotsFor(a, rosterPositions).filter(s => bs.has(s));
}

export type SwapOption<P> = { player: P; slots: string[] };

/**
 * Split the rest of the roster into players who can take `picked`'s spot and players who can't.
 */
export function swapOptions<P extends { playerId: string; position: string }>(
  picked: P,
  roster: P[],
  rosterPositions?: string[] | null
): { eligible: SwapOption<P>[]; ineligible: P[] } {
  const eligible: SwapOption<P>[] = [];
  const ineligible: P[] = [];
  for (const p of roster) {
    if (p.playerId === picked.playerId) continue;
    const slots = sharedSlots(picked.position, p.position, rosterPositions);
    if (slots.length) eligible.push({ player: p, slots });
    else ineligible.push(p);
  }
  return { eligible, ineligible };
}

/** "RB or FLEX (RB/WR/TE)" style description of where a position can play. */
export function describeSlots(position: string, rosterPositions?: string[] | null): string {
  const slots = slotsFor(position, rosterPositions).map(s => SLOT_NAMES[s] ?? s);
  if (slots.length === 0) return 'no starting spot in this league';
  return slots.length === 1 ? slots[0] : `${slots.slice(0, -1).join(', ')} or ${slots[slots.length - 1]}`;
}

export const startSitQuestion = (a: string, b: string) => `Should I start ${a} or ${b} this week?`;
