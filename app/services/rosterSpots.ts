// app/services/rosterSpots.ts
// How many roster spots are open, counted from ONE Sleeper response so it can't mix old and new
// data (e.g. a fresh matchup that already has the player you just added, next to a cached roster
// that doesn't yet, which looks like an empty bench spot).
//
// Sleeper's roster size = every spot in roster_positions except IR and TAXI. Players in IR or
// taxi spots don't count against it.

export type SpotCount = {
  size: number; // starters + bench spots
  active: number; // players using those spots
  open: number; // empty spots in total
  emptyStarters: number; // starting spots set to "0" in Sleeper
  openBench: number; // empty bench spots
  benchSpots: number;
};

export function countSpots({
  rosterPositions,
  players,
  starters,
  reserve = [],
  taxi = [],
}: {
  rosterPositions: unknown;
  // Every player on the team (Sleeper's `players`, which includes IR and taxi players)
  players: unknown[];
  // Sleeper's `starters` ("0" = an empty starting spot)
  starters: unknown[];
  reserve?: unknown[] | null;
  taxi?: unknown[] | null;
}): SpotCount {
  const positions = Array.isArray(rosterPositions) ? rosterPositions.map(p => String(p).toUpperCase()) : [];
  const benchSpots = positions.filter(p => p === 'BN').length;
  const size = positions.filter(p => p !== 'IR' && p !== 'TAXI').length;
  const away = new Set([...(reserve ?? []), ...(taxi ?? [])].map(String));
  const ids = [...new Set((players ?? []).map(String))].filter(id => id && id !== '0' && !away.has(id));
  const starting = new Set((starters ?? []).map(String).filter(id => id && id !== '0'));
  const emptyStarters = (starters ?? []).filter(id => !id || String(id) === '0').length;
  const bench = ids.filter(id => !starting.has(id)).length;
  const openBench = Math.max(0, benchSpots - bench);
  const active = ids.length;
  return { size, active, open: size > 0 ? Math.max(0, size - active) : 0, emptyStarters, openBench, benchSpots };
}

/** Same players on both sides? (A difference means one of them is stale: refetch.) */
export function samePlayers(a: unknown[] | null | undefined, b: unknown[] | null | undefined): boolean {
  const x = new Set((a ?? []).map(String));
  const y = new Set((b ?? []).map(String));
  if (x.size !== y.size) return false;
  for (const id of x) if (!y.has(id)) return false;
  return true;
}

/** A short fingerprint of every team's players and starters, to notice adds, drops and trades. */
export function rosterSignature(rosters: { roster_id: number; players?: unknown[] | null; starters?: unknown[] | null; reserve?: unknown[] | null }[]): string {
  return (rosters ?? [])
    .map(r => `${r.roster_id}:${[...(r.players ?? [])].map(String).sort().join(',')}|${(r.starters ?? []).map(String).join(',')}|${[...(r.reserve ?? [])].map(String).sort().join(',')}`)
    .sort()
    .join(';');
}
