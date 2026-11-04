// app/backend/services/lineupCheck.ts
// "Lineup check" (sent about 90 minutes before kickoff, when inactive lists come out):
// compares the lineup you have set in Sleeper with the best lineup for this week, and lists
// the swaps to make. Players whose game already started are locked and left alone.

import { optimizeLineup, SlotName, SLOT_ELIGIBILITY } from "./lineup";
import { getLeagueContext } from "./leagueContext";
import { getGameStates } from "./schedule";
import { getMatchups } from "./sleeperServer";
import { weeklyAdjustedPlayers } from "./advisor";

export type CheckPlayer = { id: string; name: string; position: string; team?: string; value: number; injuryStatus?: string };
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
};

const round = (n: number) => Math.round(n * 10) / 10;

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
): { swaps: LineupSwap[]; currentPoints: number; bestPoints: number; emptySlots: string[] } {
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
  if (bestPoints <= currentPoints && emptySlots.length === 0) return { swaps: [], currentPoints, bestPoints: currentPoints, emptySlots };

  // Compare slot type by slot type, keeping players who are already in the right kind of slot.
  const swaps: LineupSwap[] = [];
  for (const slot of [...new Set(openSlots)]) {
    const now = current.filter(c => !c.locked && c.slot === slot).map(c => c.player);
    const want = best.filter(a => a.slot === slot).map(a => a.player);
    const wantIds = new Set(want.flatMap(p => (p ? [p.id] : [])));
    const nowIds = new Set(now.flatMap(p => (p ? [p.id] : [])));
    const incoming = want.filter((p): p is CheckPlayer => !!p && !nowIds.has(p.id)).map(p => byId.get(p.id)!);
    // Empty spots get filled first, then the lowest-value player in that kind of slot comes out.
    const outgoing = now.filter(p => !p || !wantIds.has(p.id)).sort((a, b) => (a ? a.value : -1) - (b ? b.value : -1));
    incoming.forEach((start, i) => {
      const bench = outgoing[i] ?? null;
      swaps.push({ slot, start, bench, gain: round(start.value - (bench?.value ?? 0)) });
    });
  }
  // Label players who just change slots ("move Wilson from FLEX to WR") instead of "bench".
  const startSlot = new Map(swaps.map(s => [s.start.id, s.slot]));
  const currentSlot = new Map(current.flatMap(c => (c.player ? [[c.player.id, c.slot] as const] : [])));
  for (const s of swaps) {
    if (currentSlot.has(s.start.id)) s.from = currentSlot.get(s.start.id);
    if (s.bench && startSlot.has(s.bench.id)) s.movesTo = startSlot.get(s.bench.id);
  }
  const meaningful = swaps.filter(s => !s.bench || s.gain > 0.05 || s.movesTo || s.from);
  return { swaps: meaningful.sort((a, b) => b.gain - a.gain), currentPoints, bestPoints: Math.max(bestPoints, currentPoints), emptySlots };
}

export async function getLineupCheck(leagueId: string, rosterId?: number, ownerId?: string): Promise<LineupCheck> {
  const ctx = await getLeagueContext(leagueId, rosterId, ownerId);
  if (!ctx.me) throw new Error("Your team was not found in this league.");
  const { week, teamsPlaying, weekly } = await weeklyAdjustedPlayers(ctx, ctx.me);
  const [matchups, games] = await Promise.all([
    getMatchups(leagueId, week).catch(() => []),
    getGameStates(ctx.values.season, week).catch(() => null),
  ]);
  const mine = (matchups ?? []).find((m: any) => Number(m.roster_id) === ctx.me!.rosterId);
  // Keep "0" entries: they are empty starting slots in Sleeper.
  const starterIds: string[] = (mine?.starters ?? []).map(String);

  const locked = new Set<string>();
  const kickoffs = new Set<string>();
  for (const p of weekly) {
    const g = p.team ? games?.get(p.team) : undefined;
    if (g && g.state !== "pre") locked.add(p.id);
    else if (g?.kickoff && Date.parse(g.kickoff) > Date.now()) kickoffs.add(g.kickoff);
  }

  const { swaps, currentPoints, bestPoints, emptySlots } = compareLineups(weekly, starterIds, ctx.slots, locked);
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
  return { week, kickoffs: [...kickoffs].sort(), currentPoints, bestPoints, swaps, problems, emptySlots };
}
