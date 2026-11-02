// app/backend/services/irAdvice.ts
// IR advice: which of your players can go in an IR slot on Sleeper, and who to pick up with
// the roster spot that frees.
//
// Sleeper's league settings decide who is IR-eligible: players designated IR always are,
// and the commissioner can also allow Out, Doubtful, Suspended and Not Active (NA) players.

import { lineupValue, SlotName } from "./lineup";
import type { TradePlayer } from "./tradeEngine";

export type IrCandidate = TradePlayer & {
  // True when he's already in one of your IR slots
  inIrSlot: boolean;
};

export type IrPickup = {
  add: TradePlayer;
  // Starting-lineup points per week gained by adding him to the open roster spot
  netGain: number;
};

export type IrAdvice = {
  irSlots: number;
  irSlotsUsed: number;
  // Players sitting in your IR slots right now
  onIr: IrCandidate[];
  // IR-eligible players still taking up an active roster spot
  shouldMove: IrCandidate[];
  pickups: IrPickup[];
  eligibleStatuses: string[];
};

const round = (n: number) => Math.round(n * 100) / 100;

/** Injury designations that may go on IR in this league. */
export function irEligibleStatuses(settings: Record<string, any> | undefined | null): string[] {
  const s = settings ?? {};
  const allowed = ["IR", "INJURED RESERVE"];
  if (Number(s.reserve_allow_out)) allowed.push("OUT");
  if (Number(s.reserve_allow_doubtful)) allowed.push("DOUBTFUL");
  if (Number(s.reserve_allow_sus)) allowed.push("SUS", "SUSPENDED");
  if (Number(s.reserve_allow_na)) allowed.push("NA", "NOT_ACTIVE");
  if (Number(s.reserve_allow_cov)) allowed.push("COV");
  return allowed;
}

export function buildIrAdvice({
  settings,
  roster,
  myPlayers,
  freeAgents,
  slots,
  pickupLimit = 3,
}: {
  settings: Record<string, any> | undefined | null;
  roster: { players?: string[]; reserve?: string[] | null };
  myPlayers: TradePlayer[];
  freeAgents: TradePlayer[];
  slots: SlotName[];
  pickupLimit?: number;
}): IrAdvice {
  const irSlots = Number(settings?.reserve_slots) || 0;
  const reserve = new Set((roster.reserve ?? []).map(String));
  const eligibleStatuses = irEligibleStatuses(settings);
  const eligible = (p: TradePlayer) => eligibleStatuses.includes(String(p.injuryStatus).toUpperCase());

  const onIr = myPlayers.filter(p => reserve.has(p.id)).map(p => ({ ...p, inIrSlot: true }));
  const openSlots = Math.max(0, irSlots - onIr.length);
  const shouldMove = myPlayers
    .filter(p => !reserve.has(p.id) && eligible(p))
    // Move the player who is out the longest first (IR before Out before Doubtful).
    .sort((a, b) => eligibleStatuses.indexOf(String(a.injuryStatus).toUpperCase()) - eligibleStatuses.indexOf(String(b.injuryStatus).toUpperCase()) || b.value - a.value)
    .map(p => ({ ...p, inIrSlot: false }));

  // Each player moved to IR frees one active roster spot for a free agent.
  const moving = shouldMove.slice(0, openSlots);
  let pickups: IrPickup[] = [];
  if (moving.length > 0) {
    const movingIds = new Set(moving.map(p => p.id));
    const active = myPlayers.filter(p => !reserve.has(p.id) && !movingIds.has(p.id));
    const base = lineupValue(active, slots);
    const neededPositions = new Set(moving.map(p => p.position));
    const ranked = freeAgents
      .filter(p => p.value > 0 && !eligible(p))
      .sort((a, b) => b.value - a.value)
      .slice(0, 60)
      .map(add => ({ add, netGain: round(lineupValue([...active, add], slots) - base) }))
      .sort((a, b) => b.netGain - a.netGain || b.add.value - a.add.value);
    // Replacements at the injured player's position come first (up to two), then the single
    // best add anywhere (e.g. an empty kicker spot), so the list answers "who replaces him?".
    const samePosition = ranked.filter(p => neededPositions.has(p.add.position)).slice(0, Math.max(1, pickupLimit - 1));
    const rest = ranked.filter(p => !samePosition.includes(p));
    pickups = [...samePosition, ...rest].slice(0, pickupLimit);
  }

  return { irSlots, irSlotsUsed: onIr.length, onIr, shouldMove, pickups, eligibleStatuses };
}
