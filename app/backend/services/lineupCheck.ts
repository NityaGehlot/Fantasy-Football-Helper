// app/backend/services/lineupCheck.ts
// "Lineup check" (sent about 90 minutes before kickoff, when inactive lists come out):
// compares the lineup you have set in Sleeper with the best lineup for this week, and lists
// the swaps to make. Players whose game already started are locked and left alone.

import { alignStarters, optimizeLineup, SlotName, SLOT_ELIGIBILITY } from "./lineup";
import { decide } from "./lineupFactors";
import { getLeagueContext } from "./leagueContext";
import { getGameStates } from "./schedule";
import { getMatchups, getProjections, getRosters } from "./sleeperServer";
import { projectionFor } from "./liveMatchup";
import { ensureInjuriesLoaded, injuryNote, lookupInjury } from "./injuryStore";
import { weeklyAdjustedPlayers } from "./advisor";

// value: what decides who starts (Sleeper's projection adjusted for matchup and injuries);
// projection: Sleeper's projection itself (the number shown, like in Sleeper).
export type CheckPlayer = {
  id: string;
  name: string;
  position: string;
  team?: string;
  value: number;
  injuryStatus?: string;
  projection?: number;
  reasons?: string[];
  tier?: string;
};

export type CloseCall = { slot: string; starter: CheckPlayer; bench: CheckPlayer; diff: number };
export type LineupSwap = {
  slot: string;
  start: CheckPlayer;
  // Who comes out of that slot (null = the slot is empty in Sleeper now)
  bench: CheckPlayer | null;
  gain: number;
  // The starting player is moving over from another slot
  from?: string;
  // The player coming out isn't benched, he moves to another slot
  movesTo?: string;
};

export type LineupCheck = {
  week: number;
  // Kickoff times (ISO) of games your players are in that haven't started yet, earliest first
  kickoffs: string[];
  currentPoints: number;
  bestPoints: number;
  swaps: LineupSwap[];
  // Starters who won't play (out / bye) and can't be fixed by a swap from your bench
  problems: string[];
  // Starting slots that are empty in Sleeper right now
  emptySlots: string[];
  // The best lineup, slot by slot in Sleeper's order (labels like "FLEX 1" / "FLEX 2")
  lineup: LineupSlot[];
  // Injury and practice news for your starters and bench (Sleeper + nfl-data report)
  injuryNotes: string[];
  // Your other healthy players, best first
  bench: CheckPlayer[];
  // Bench players within a point of a starter whose slot they can actually play
  closeCalls: CloseCall[];
  // Sleeper projections (what you'd see in Sleeper) for the lineup now and the best lineup
  currentProjected: number;
  bestProjected: number;
  // Why a player's points were scaled this week (matchup, weather, injuries around him), by id
  matchupNotes: Record<string, string>;
};

export type LineupSlot = { slot: string; label: string; player: CheckPlayer | null; locked: boolean; changed: boolean };

/** "WR 1", "WR 2", "FLEX 1", "FLEX 2" when a slot appears more than once, as in Sleeper's list. */
export function slotLabels(slots: string[]): string[] {
  const total = new Map<string, number>();
  slots.forEach(s => total.set(s, (total.get(s) ?? 0) + 1));
  const seen = new Map<string, number>();
  return slots.map(s => {
    const n = (seen.get(s) ?? 0) + 1;
    seen.set(s, n);
    const name = s === "SUPER_FLEX" ? "SUPERFLEX" : s;
    return (total.get(s) ?? 0) > 1 ? `${name} ${n}` : name;
  });
}

const round = (n: number) => Math.round(n * 100) / 100;
const KEEP_MARGIN = 0.25;

/**
 * Pure part: the lineup set in Sleeper vs the best lineup, slot by slot.
 *
 * `currentStarterIds` is Sleeper's starters array, in the same order as `slots` (the league's
 * starting slots), with "0" (or "") for an empty slot. Players whose game started (`locked`)
 * stay in their slot. Every swap pairs a player with a slot he can actually play: the player
 * coming out was in a slot the new starter is eligible for, or the slot was empty.
 */
export function compareLineups(
  players: CheckPlayer[],
  currentStarterIds: string[],
  slots: SlotName[],
  locked: Set<string> = new Set()
): { swaps: LineupSwap[]; currentPoints: number; bestPoints: number; emptySlots: string[]; lineup: LineupSlot[] } {
  const byId = new Map(players.map(p => [p.id, p]));
  const current = slots.map((slot, i) => {
    const id = String(currentStarterIds[i] ?? "");
    const player = id && id !== "0" ? byId.get(id) ?? null : null;
    return { slot, player, locked: !!player && locked.has(player.id) };
  });
  const emptySlots = current.filter(c => !c.player).map(c => c.slot);
  const currentPoints = round(current.reduce((t, c) => t + (c.player?.value ?? 0), 0));

  // Locked starters keep their slot; fill the other slots with the best unlocked players.
  const lockedIds = new Set(current.filter(c => c.locked).map(c => c.player!.id));
  const openSlots = current.filter(c => !c.locked).map(c => c.slot);
  const pool = players.filter(p => !locked.has(p.id) && !lockedIds.has(p.id));
  const best = optimizeLineup(pool, openSlots);
  const bestPoints = round(
    current.filter(c => c.locked).reduce((t, c) => t + c.player!.value, 0) + best.reduce((t, a) => t + (a.player?.value ?? 0), 0)
  );
  const labels = slotLabels(slots);
  if (bestPoints <= currentPoints && emptySlots.length === 0)
    return {
      swaps: [],
      currentPoints,
      bestPoints: currentPoints,
      emptySlots,
      lineup: current.map((c, i) => ({ slot: c.slot, label: labels[i], player: c.player, locked: c.locked, changed: false })),
    };

  // Put the best players into slots while keeping as many current starters where they already
  // are as possible, so the advice is the fewest swaps (e.g. "Vele in for Shakir", not a
  // three-way shuffle between WR and FLEX that ends in the same lineup).
  const open = current.filter(c => !c.locked);
  const chosen = best.flatMap(a => (a.player ? [byId.get(a.player.id)!] : []));
  const assignment = assignKeepingCurrent(chosen, open.map(c => ({ slot: c.slot, current: c.player?.id ?? null })));

  const swaps: LineupSwap[] = [];
  const newSlotOf = new Map<string, string>();
  assignment.forEach((id, i) => id && newSlotOf.set(id, open[i].slot));
  const oldSlotOf = new Map(open.flatMap(c => (c.player ? [[c.player.id, c.slot] as const] : [])));
  assignment.forEach((id, i) => {
    const before = open[i].player;
    if ((before?.id ?? null) === id) return;
    if (!id) return; // a slot nobody can fill stays empty (reported as a problem)
    const start = byId.get(id)!;
    const bench = before ?? null;
    const swap: LineupSwap = { slot: open[i].slot, start, bench, gain: round(start.value - (bench?.value ?? 0)) };
    if (oldSlotOf.has(start.id)) swap.from = oldSlotOf.get(start.id);
    if (bench && newSlotOf.has(bench.id)) swap.movesTo = newSlotOf.get(bench.id);
    swaps.push(swap);
  });
  let openIndex = 0;
  const lineup: LineupSlot[] = current.map((c, i) => {
    if (c.locked) return { slot: c.slot, label: labels[i], player: c.player, locked: true, changed: false };
    const id = assignment[openIndex++];
    const player = id ? byId.get(id) ?? null : null;
    return { slot: c.slot, label: labels[i], player, locked: false, changed: (player?.id ?? null) !== (c.player?.id ?? null) };
  });
  return { swaps: swaps.sort((a, b) => b.gain - a.gain), currentPoints, bestPoints: Math.max(bestPoints, currentPoints), emptySlots, lineup };
}

/**
 * Assign `players` (the best lineup) to `slots`, keeping each slot's current player when he's
 * still in the best lineup. Returns the player id for each slot (null = empty).
 */
export function assignKeepingCurrent(
  players: CheckPlayer[],
  slots: { slot: SlotName; current: string | null }[]
): (string | null)[] {
  let best: (string | null)[] | null = null;
  let bestKeeps = -1;
  const used = new Set<string>();
  const pick: (string | null)[] = slots.map(() => null);

  // Every chosen player must get a slot; among those arrangements keep the most current starters.
  const search = (i: number, keeps: number, placed: number) => {
    const remaining = slots.length - i;
    if (placed + remaining < players.length) return; // can't fit everyone anymore
    if (keeps + remaining <= bestKeeps) return; // can't beat the best arrangement found
    if (i === slots.length) {
      best = [...pick];
      bestKeeps = keeps;
      return;
    }
    const { slot, current } = slots[i];
    // Try the current starter first.
    const candidates = players
      .filter(p => !used.has(p.id) && SLOT_ELIGIBILITY[slot].includes(p.position))
      .sort((a, b) => Number(b.id === current) - Number(a.id === current));
    for (const p of candidates) {
      used.add(p.id);
      pick[i] = p.id;
      search(i + 1, keeps + (p.id === current ? 1 : 0), placed + 1);
      used.delete(p.id);
    }
    pick[i] = null;
    search(i + 1, keeps, placed);
  };
  search(0, 0, 0);
  return best ?? slots.map(() => null);
}

export async function getLineupCheck(leagueId: string, rosterId?: number, ownerId?: string): Promise<LineupCheck> {
  const ctx = await getLeagueContext(leagueId, rosterId, ownerId);
  if (!ctx.me) throw new Error("Your team was not found in this league.");
  const { week, teamsPlaying, matchups: matchupAdj, weekly: adjusted } = await weeklyAdjustedPlayers(ctx, ctx.me);
  const [matchups, games, projections, rosters] = await Promise.all([
    getMatchups(leagueId, week).catch(() => []),
    getGameStates(ctx.values.season, week).catch(() => null),
    getProjections(ctx.values.season, week).catch(() => ({} as Record<string, any>)),
    getRosters(leagueId).catch(() => []),
  ]);
  // Use Sleeper's own projection for this week (what you see in Sleeper and next to each player
  // in this app), to the hundredth. Players who are out or on bye stay at 0; our own estimate is
  // only a fallback for players Sleeper doesn't project. Players in IR spots can't be started.
  const receptionPoints = Number(ctx.league?.scoring_settings?.rec ?? 1);
  const reserve = new Set(((rosters ?? []).find((r: any) => Number(r.roster_id) === ctx.me!.rosterId)?.reserve ?? []).map(String));
  // Who starts is decided by that projection adjusted for the defense (weighed by how good the
  // player is), weather and injuries around him (see lineupFactors.ts).
  const weekly: CheckPlayer[] = adjusted
    .filter(p => !reserve.has(p.id))
    .map(p => {
      const adj = matchupAdj.get(p.id);
      if (p.value === 0) return { ...p, value: 0, projection: 0, reasons: [] };
      const sleeper = projectionFor(projections[p.id], receptionPoints);
      // Our own estimate already includes the matchup; take it back out before re-applying.
      const projection = Math.round((sleeper ?? p.value / (adj?.multiplier || 1)) * 100) / 100;
      const d = decide(projection, p.position, adj?.components, (p as any).rank, adj?.injuryNotes ?? []);
      return { ...p, value: d.score, projection, reasons: d.reasons, tier: d.tier };
    });
  const mine = (matchups ?? []).find((m: any) => Number(m.roster_id) === ctx.me!.rosterId);
  // Sleeper's starters follow every starting spot in roster_positions; pair them up so a slot type
  // this app doesn't model can't shift players into the wrong spots. "0" = an empty slot.
  const { slots, ids: starterIds } = alignStarters(ctx.league?.roster_positions, mine?.starters ?? []);
  // A swap has to be clearly better to be worth making: current starters keep their spot unless
  // someone beats them by more than KEEP_MARGIN (no "swap for +0.05").
  const startingNow = new Set(starterIds.filter(id => id && id !== "0"));
  for (const p of weekly) if (startingNow.has(p.id) && p.value > 0) p.value = round(p.value + KEEP_MARGIN);

  const locked = new Set<string>();
  const kickoffs = new Set<string>();
  for (const p of weekly) {
    const g = p.team ? games?.get(p.team) : undefined;
    if (g && g.state !== "pre") locked.add(p.id);
    else if (g?.kickoff && Date.parse(g.kickoff) > Date.now()) kickoffs.add(g.kickoff);
  }

  const { swaps, currentPoints, bestPoints, emptySlots, lineup } = compareLineups(weekly, starterIds, slots, locked);
  const byId = new Map(weekly.map(p => [p.id, p]));
  const currentProjected = round(starterIds.reduce((t, id) => t + (byId.get(id)?.projection ?? 0), 0));
  const bestProjected = round(lineup.reduce((t, l) => t + (l.player?.projection ?? 0), 0));
  const problems: string[] = [];
  // Empty slots nobody on the roster can fill.
  const unfilled = [...emptySlots];
  for (const s of swaps.filter(x => !x.bench)) {
    const i = unfilled.indexOf(s.slot);
    if (i >= 0) unfilled.splice(i, 1);
  }
  if (unfilled.length) {
    problems.push(
      `Your ${unfilled.join(", ")} spot${unfilled.length > 1 ? "s are" : " is"} empty and nobody on your roster can fill ${unfilled.length > 1 ? "them" : "it"}. Pick up a ${unfilled
        .map(sl => (SLOT_ELIGIBILITY as any)[sl]?.join("/") ?? sl)
        .join(" and a ")} from waivers.`
    );
  }
  const benchFixes = new Set(swaps.flatMap(s => (s.bench ? [s.bench.id] : [])));
  for (const id of starterIds) {
    const p = weekly.find(x => x.id === id);
    if (!p || locked.has(id) || benchFixes.has(id) || p.value > 0) continue;
    const why = teamsPlaying && p.team && !teamsPlaying.has(p.team) ? "is on bye" : `is ${String(p.injuryStatus ?? "out").toLowerCase()}`;
    problems.push(`${p.name} ${why} and nobody on your bench can replace him. Pick up a ${p.position}.`);
  }
  await ensureInjuriesLoaded();
  const injuryNotes = weekly.flatMap(p => {
    const note = injuryNote(p, lookupInjury(p.name, p.position));
    return note ? [note] : [];
  });
  const starting = new Set(lineup.flatMap(l => (l.player ? [l.player.id] : [])));
  const bench = weekly
    .filter(p => !starting.has(p.id) && ["QB", "RB", "WR", "TE", "K", "DEF"].includes(p.position))
    .sort((a, b) => b.value - a.value);
  const matchupNotes: Record<string, string> = {};
  matchupAdj.forEach((m, id) => {
    if (m.parts.length) matchupNotes[id] = `x${m.multiplier.toFixed(2)} this week: ${m.parts.join("; ")}`;
  });
  const closeCalls = findCloseCalls(lineup, bench);
  return {
    week,
    kickoffs: [...kickoffs].sort(),
    currentPoints,
    bestPoints,
    currentProjected,
    bestProjected,
    swaps,
    problems,
    emptySlots,
    lineup,
    injuryNotes,
    bench,
    closeCalls,
    matchupNotes,
  };
}

/** Bench players within a point of a starter, only where the bench player can play that slot. */
export function findCloseCalls(lineup: LineupSlot[], bench: CheckPlayer[], margin = 1, limit = 3): CloseCall[] {
  const out: CloseCall[] = [];
  for (const l of lineup) {
    if (!l.player || l.locked) continue;
    const eligible = SLOT_ELIGIBILITY[l.slot as SlotName] ?? [];
    for (const b of bench) {
      if (!eligible.includes(b.position) || b.value <= 0) continue;
      const diff = round(l.player.value - b.value);
      if (diff >= 0 && diff <= margin) out.push({ slot: l.label, starter: l.player, bench: b, diff });
    }
  }
  const seen = new Set<string>();
  return out
    .sort((a, b) => a.diff - b.diff)
    .filter(c => (seen.has(c.bench.id) ? false : (seen.add(c.bench.id), true)))
    .slice(0, limit);
}
