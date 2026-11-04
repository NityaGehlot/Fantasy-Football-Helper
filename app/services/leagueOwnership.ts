// app/services/leagueOwnership.ts
// Who owns each player in your league: your team, another team (by name), or nobody.

export type Ownership = { rosterId: number; teamName: string; mine: boolean };

export function ownershipMap(
  rosters: { roster_id: number; owner_id: string; players?: string[] | null; reserve?: string[] | null; taxi?: string[] | null }[],
  users: { user_id: string; display_name?: string; metadata?: { team_name?: string } }[],
  myOwnerId?: string | null
): Map<string, Ownership> {
  const nameOf = (ownerId: string) => {
    const u = users.find(x => String(x.user_id) === String(ownerId));
    return u?.metadata?.team_name || u?.display_name || 'Another team';
  };
  const map = new Map<string, Ownership>();
  for (const r of rosters ?? []) {
    const info = { rosterId: Number(r.roster_id), teamName: nameOf(r.owner_id), mine: !!myOwnerId && String(r.owner_id) === String(myOwnerId) };
    for (const id of [...(r.players ?? []), ...(r.reserve ?? []), ...(r.taxi ?? [])]) map.set(String(id), info);
  }
  return map;
}

/** Short label for a trending player's row. */
export function ownershipLabel(o: Ownership | undefined, leagueLoaded: boolean): string {
  if (!leagueLoaded) return '';
  if (!o) return 'Free agent in your league';
  return o.mine ? 'On your team' : `On ${o.teamName}`;
}
