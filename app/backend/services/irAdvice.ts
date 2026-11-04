// app/backend/services/irAdvice.ts
// IR advice that follows how Sleeper's injured reserve actually works:
//
// • Who can go in an IR spot: players on the real NFL injured reserve (IR) or PUP list always;
//   Out, Doubtful, Suspended, NA (not active) and DNR (did not report) only when the
//   commissioner turns those on in league settings (reserve_allow_* fields).
// • A player in an IR spot can't be in your starting lineup and doesn't count toward your
//   roster size, so moving him there opens a roster spot for a pickup.
// • If a player in an IR spot is no longer eligible (he got healthy, or went from Out to
//   Questionable), Sleeper LOCKS your roster: no adds, waiver claims or roster moves until he
//   leaves the IR spot. With a full roster that means dropping someone first.
// • Out and Doubtful are week-to-week: these players often come back within a week or two,
//   which re-triggers the lock above, so they're worth moving only when you need the spot.

import { lineupValue, SlotName } from "./lineup";
import { POSITIONS, positionCounts, positionTargets, type Pos } from "./positionBalance";
import type { TradePlayer } from "./tradeEngine";
import { rankDropCandidates } from "./waiver";

export type IrCandidate = TradePlayer & {
  // True when he's already in one of your IR slots
  inIrSlot: boolean;
  // Plain-English advice for this player
  note?: string;
};

export type IrPickup = {
  add: TradePlayer;
  // Starting-lineup points per week gained by adding him to the open roster spot
  netGain: number;
};

export type IrLock = {
  player: IrCandidate;
  // Best player to drop so he can come off IR (lowest hit to your lineup)
  drop: TradePlayer | null;
  // Lineup points per week after activating him and dropping `drop`
  netGain: number | null;
};

export type IrAdvice = {
  irSlots: number;
  irSlotsUsed: number;
  // Players sitting in your IR slots right now
  onIr: IrCandidate[];
  // IR-eligible players still taking up an active roster spot
  shouldMove: IrCandidate[];
  pickups: IrPickup[];
  // Players in IR spots who aren't eligible anymore: Sleeper has locked your roster
  locked: IrLock[];
  eligibleStatuses: string[];
  // Empty roster spots (bench included) and who to pick up for them
  openSpots: OpenSpots;
};

export type OpenSpots = {
  // Players allowed on the active roster (starters + bench; IR and taxi spots don't count)
  size: number;
  used: number;
  open: number;
  // Positions you have fewer of than a balanced roster needs
  needs: Pos[];
  pickups: (IrPickup & { reason: string })[];
};

/**
 * Open roster spots: Sleeper's roster size is every spot in roster_positions except IR and
 * taxi, and players in IR or taxi spots don't count against it. Pickups fill what the team
 * needs most: a position you're short at first, then whoever helps the starting lineup most.
 */
export function openRosterSpots({
  rosterPositions,
  activePlayers,
  freeAgents,
  slots,
  limit = 3,
}: {
  rosterPositions: unknown;
  activePlayers: TradePlayer[];
  freeAgents: TradePlayer[];
  slots: SlotName[];
  limit?: number;
}): OpenSpots {
  const positions = Array.isArray(rosterPositions) ? rosterPositions.map(p => String(p).toUpperCase()) : [];
  const size = positions.filter(p => p !== "IR" && p !== "TAXI").length;
  const used = activePlayers.length;
  const open = size > 0 ? Math.max(0, size - used) : 0;
  const targets = positionTargets(slots);
  const counts = positionCounts(activePlayers);
  const needs = POSITIONS.filter(p => counts[p] < targets[p].min).sort(
    (a, b) => targets[b].min - counts[b] - (targets[a].min - counts[a])
  );
  if (open === 0) return { size, used, open, needs, pickups: [] };

  const base = lineupValue(activePlayers, slots);
  const healthy = freeAgents.filter(p => p.value > 0 && !["IR", "OUT", "PUP", "SUS", "SUSPENDED", "NA"].includes(String(p.injuryStatus ?? "").toUpperCase()));
  const scored = healthy
    .sort((a, b) => b.value - a.value)
    .slice(0, 80)
    .map(add => ({ add, netGain: round(lineupValue([...activePlayers, add], slots) - base) }));
  const reasonFor = (add: TradePlayer, netGain: number) => {
    const pos = add.position as Pos;
    const have = counts[pos] ?? 0;
    if (needs.includes(pos))
      return have === 0
        ? `You have no ${pos === "DEF" ? "defense" : pos} on your roster.`
        : `You only have ${have} ${pos}${have === 1 ? "" : "s"}; a balanced roster carries at least ${targets[pos].min}.`;
    if (netGain > 0) return `Would start for you: +${netGain.toFixed(2)} pts a week.`;
    return `Best available ${pos} for bench depth (${add.value.toFixed(2)} pts/g).`;
  };
  const picks: (IrPickup & { reason: string })[] = [];
  // One for each position you're short at, then the best lineup upgrades / depth.
  for (const pos of needs) {
    const best = scored.filter(s => s.add.position === pos).sort((a, b) => b.netGain - a.netGain || b.add.value - a.add.value)[0];
    if (best) picks.push({ ...best, reason: reasonFor(best.add, best.netGain) });
  }
  const rest = scored
    .filter(s => !picks.some(p => p.add.id === s.add.id))
    .sort((a, b) => b.netGain - a.netGain || b.add.value - a.add.value);
  // Once a need is covered, don't suggest more at that position; kickers and defenses only when
  // you're short (extra ones are wasted bench spots).
  const covered = (pos: string) => (counts[pos as Pos] ?? 0) + picks.filter(p => p.add.position === pos).length >= (targets[pos as Pos]?.min ?? 0);
  for (const s of rest) {
    if (picks.length >= Math.max(limit, needs.length)) break;
    const pos = s.add.position;
    if (["K", "DEF"].includes(pos) && covered(pos)) continue;
    if (needs.includes(pos as Pos) && covered(pos) && picks.some(p => p.add.position === pos)) continue;
    picks.push({ ...s, reason: reasonFor(s.add, s.netGain) });
  }
  return { size, used, open, needs, pickups: picks };
}

const round = (n: number) => Math.round(n * 100) / 100;

const LONG_TERM = new Set(["IR", "INJURED RESERVE", "PUP", "SUS", "SUSPENDED", "NA", "NOT_ACTIVE", "DNR"]);

/** Injury designations that may go on IR in this league. */
export function irEligibleStatuses(settings: Record<string, any> | undefined | null): string[] {
  const s = settings ?? {};
  const allowed = ["IR", "INJURED RESERVE", "PUP"];
  if (Number(s.reserve_allow_out)) allowed.push("OUT");
  if (Number(s.reserve_allow_doubtful)) allowed.push("DOUBTFUL");
  if (Number(s.reserve_allow_sus)) allowed.push("SUS", "SUSPENDED");
  if (Number(s.reserve_allow_na)) allowed.push("NA", "NOT_ACTIVE");
  if (Number(s.reserve_allow_dnr)) allowed.push("DNR");
  if (Number(s.reserve_allow_cov)) allowed.push("COV");
  return allowed;
}

/** Advice for moving one eligible player to IR, by how long he's likely out. */
export function moveNote(status: string): string {
  const s = String(status).toUpperCase();
  if (LONG_TERM.has(s)) return "He's out long-term, so his IR spot is safe to use.";
  if (s === "DOUBTFUL")
    return "Doubtful players sometimes play. In an IR spot he can't be started, and if he's upgraded to Questionable your roster locks until he comes off IR.";
  return "Out is week-to-week. When he's healthy again Sleeper locks your roster until he leaves the IR spot, so keep a bench spot in mind.";
}

export function buildIrAdvice({
  settings,
  roster,
  myPlayers,
  freeAgents,
  slots,
  pickupLimit = 3,
  rosterPositions,
}: {
  settings: Record<string, any> | undefined | null;
  roster: { players?: string[]; reserve?: string[] | null; taxi?: string[] | null };
  rosterPositions?: unknown;
  myPlayers: TradePlayer[];
  freeAgents: TradePlayer[];
  slots: SlotName[];
  pickupLimit?: number;
}): IrAdvice {
  const irSlots = Number(settings?.reserve_slots) || 0;
  const reserve = new Set((roster.reserve ?? []).map(String));
  const eligibleStatuses = irEligibleStatuses(settings);
  const statusOf = (p: TradePlayer) => String(p.injuryStatus ?? "").toUpperCase();
  const eligible = (p: TradePlayer) => eligibleStatuses.includes(statusOf(p));

  const onIr = myPlayers.filter(p => reserve.has(p.id)).map(p => ({ ...p, inIrSlot: true }));
  const active = myPlayers.filter(p => !reserve.has(p.id));

  // Sleeper locks the roster while an ineligible player sits in an IR spot.
  const locked: IrLock[] = onIr
    .filter(p => !eligible(p))
    .map(p => {
      const best = rankDropCandidates(active, p, slots)[0];
      return {
        player: { ...p, note: "No longer IR-eligible, so Sleeper has locked your roster until he comes off IR." },
        drop: best?.drop ?? null,
        netGain: best ? best.netGain : null,
      };
    });

  const openSlots = Math.max(0, irSlots - onIr.length);
  const shouldMove = active
    .filter(eligible)
    // Long-term injuries first (they won't trigger a lock soon), then the most valuable.
    .sort(
      (a, b) =>
        Number(LONG_TERM.has(statusOf(b))) - Number(LONG_TERM.has(statusOf(a))) ||
        eligibleStatuses.indexOf(statusOf(a)) - eligibleStatuses.indexOf(statusOf(b)) ||
        b.value - a.value
    )
    .map(p => ({ ...p, inIrSlot: false, note: moveNote(statusOf(p)) }));

  // Each player moved to IR frees one active roster spot for a free agent. No pickups while
  // the roster is locked, because Sleeper won't allow adds until that's fixed.
  const moving = locked.length ? [] : shouldMove.slice(0, openSlots);
  let pickups: IrPickup[] = [];
  if (moving.length > 0) {
    const movingIds = new Set(moving.map(p => p.id));
    const remaining = active.filter(p => !movingIds.has(p.id));
    const base = lineupValue(remaining, slots);
    const neededPositions = new Set(moving.map(p => p.position));
    const ranked = freeAgents
      .filter(p => p.value > 0 && !eligible(p))
      .sort((a, b) => b.value - a.value)
      .slice(0, 60)
      .map(add => ({ add, netGain: round(lineupValue([...remaining, add], slots) - base) }))
      .sort((a, b) => b.netGain - a.netGain || b.add.value - a.add.value);
    // Replacements at the injured player's position come first (up to two), then the single
    // best add anywhere (e.g. an empty kicker spot), so the list answers "who replaces him?".
    const samePosition = ranked.filter(p => neededPositions.has(p.add.position)).slice(0, Math.max(1, pickupLimit - 1));
    const rest = ranked.filter(p => !samePosition.includes(p));
    pickups = [...samePosition, ...rest].slice(0, pickupLimit);
  }

  const taxi = new Set((roster.taxi ?? []).map(String));
  const openSpots = openRosterSpots({
    rosterPositions,
    activePlayers: active.filter(p => !taxi.has(p.id)),
    // Adds aren't allowed while the roster is locked.
    freeAgents: locked.length ? [] : freeAgents,
    slots,
  });
  return { irSlots, irSlotsUsed: onIr.length, onIr, shouldMove, pickups, locked, eligibleStatuses, openSpots };
}
