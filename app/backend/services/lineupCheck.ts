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
export type LineupSwap = { slot: string; start: CheckPlayer; bench: CheckPlayer | null; gain: number };

export type LineupCheck = {
  week: number;
  // Kickoff times (ISO) of games your players are in that haven't started yet, earliest first
  kickoffs: string[];
  currentPoints: number;
  bestPoints: number;
  swaps: LineupSwap[];
  // Starters who won't play (out / bye) and can't be fixed by a swap from your bench
  problems: string[];
};

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * Pure part: current starters vs best lineup. `locked` = players whose game has started.
 */
export function compareLineups(
  players: CheckPlayer[],
  currentStarterIds: string[],
  slots: SlotName[],
  locked: Set<string> = new Set(),
  // The slot each current starter is in (same order as currentStarterIds), when known
  starterSlots: string[] = []
): { swaps: LineupSwap[]; currentPoints: number; bestPoints: number } {
  const byId = new Map(players.map(p => [p.id, p]));
  const current = currentStarterIds.map(id => byId.get(String(id))).filter((p): p is CheckPlayer => !!p);
  const currentPoints = round(current.reduce((t, p) => t + p.value, 0));

  // Locked starters stay where they are; optimize the remaining slots with unlocked players.
  const lockedStarters = current.filter(p => locked.has(p.id));
  const freeSlots = [...slots];
  for (const p of lockedStarters) {
    // Free up the exact slot he's in when we know it; otherwise the first one he fits.
    const known = starterSlots[currentStarterIds.map(String).indexOf(p.id)];
    let i = known ? freeSlots.indexOf(known as SlotName) : -1;
    if (i < 0) i = freeSlots.findIndex(s => SLOT_ELIGIBILITY[s].includes(p.position));
    if (i >= 0) freeSlots.splice(i, 1);
  }
  const pool = players.filter(p => !locked.has(p.id) && !lockedStarters.includes(p));
  const best = optimizeLineup(pool, freeSlots);
  const bestPoints = round(lockedStarters.reduce((t, p) => t + p.value, 0) + best.reduce((t, a) => t + (a.player?.value ?? 0), 0));

  const currentIds = new Set(current.map(p => p.id));
  const bestIds = new Set(best.flatMap(a => (a.player ? [a.player.id] : [])));
  const toStart = best.filter(a => a.player && !currentIds.has(a.player.id));
  const toBench = current.filter(p => !locked.has(p.id) && !bestIds.has(p.id)).sort((a, b) => a.value - b.value);

  const swaps: LineupSwap[] = toStart.map((a, i) => {
    const start = byId.get(a.player!.id)!;
    const bench = toBench[i] ?? null;
    return { slot: a.slot, start, bench, gain: round(start.value - (bench?.value ?? 0)) };
  });
  // Never suggest a lineup that's worse than the one you have.
  if (bestPoints <= currentPoints) return { swaps: [], currentPoints, bestPoints: currentPoints };
  return { swaps: swaps.filter(s => s.gain > 0.05), currentPoints, bestPoints };
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
  const starterIds: string[] = (mine?.starters ?? []).map(String).filter((id: string) => id && id !== "0");

  const locked = new Set<string>();
  const kickoffs = new Set<string>();
  for (const p of weekly) {
    const g = p.team ? games?.get(p.team) : undefined;
    if (g && g.state !== "pre") locked.add(p.id);
    else if (g?.kickoff && Date.parse(g.kickoff) > Date.now()) kickoffs.add(g.kickoff);
  }

  const starterSlots = (mine?.starters ?? []).map((id: string, i: number) => [String(id), String(ctx.league?.roster_positions?.[i] ?? "").toUpperCase()] as const)
    .filter(([id]: readonly [string, string]) => id && id !== "0")
    .map(([, slot]: readonly [string, string]) => slot);
  const { swaps, currentPoints, bestPoints } = compareLineups(weekly, starterIds, ctx.slots, locked, starterSlots);
  const problems: string[] = [];
  const benchFixes = new Set(swaps.flatMap(s => (s.bench ? [s.bench.id] : [])));
  for (const id of starterIds) {
    const p = weekly.find(x => x.id === id);
    if (!p || locked.has(id) || benchFixes.has(id) || p.value > 0) continue;
    const why = teamsPlaying && p.team && !teamsPlaying.has(p.team) ? "is on bye" : `is ${String(p.injuryStatus ?? "out").toLowerCase()}`;
    problems.push(`${p.name} ${why} and nobody on your bench can replace him. Pick up a ${p.position}.`);
  }
  return { week, kickoffs: [...kickoffs].sort(), currentPoints, bestPoints, swaps, problems };
}
