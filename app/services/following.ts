// app/services/following.ts
// Organizes the players and teams you follow (pure, no storage or network) for the Following
// screen. Players are grouped by what you can do with them in your league:
//   on your team -> manage them; free agents -> pickup ideas; on other teams -> trade targets.
// Without a league, everyone is in one "Following" group.

import type { Ownership } from './leagueOwnership';

export type FollowedPlayer = {
  id: string;
  name: string;
  position: string;
  team: string;
  // This week's Sleeper projection (null = not projected / no file yet)
  projection: number | null;
  // Short injury tag, like Q / D / O / IR (empty when healthy)
  injury: string;
  owner?: Ownership;
};

export type FollowGroup = { key: 'mine' | 'free' | 'others' | 'all'; title: string; hint: string; players: FollowedPlayer[] };

export const FOLLOW_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const;

const INJURY_TAGS: Record<string, string> = {
  QUESTIONABLE: 'Q', DOUBTFUL: 'D', OUT: 'O', IR: 'IR', 'INJURED RESERVE': 'IR', PUP: 'PUP', SUSPENDED: 'SUS', SUS: 'SUS', NA: 'NA',
};

export function injuryTag(status: unknown): string {
  const s = String(status ?? '').trim().toUpperCase();
  return INJURY_TAGS[s] ?? '';
}

export function positionOf(p: any): string {
  return String(p?.position_for_FFHelper || p?.position || p?.position_listed_on_sleeper || '').toUpperCase().trim();
}

/**
 * Followed players as rows, grouped and sorted (highest projection first, then name).
 * `ownership` is null when no league is open. `position` filters to one position ('ALL' = no filter).
 */
export function groupFollowing(
  playerIds: string[],
  players: Record<string, any>,
  ownership: Map<string, Ownership> | null,
  projections: Record<string, number | null>,
  position: string = 'ALL'
): FollowGroup[] {
  const rows: FollowedPlayer[] = playerIds.flatMap(id => {
    const p = players[id];
    const pos = positionOf(p);
    if (position !== 'ALL' && pos !== position) return [];
    return [
      {
        id,
        name: String(p?.full_name || [p?.first_name, p?.last_name].filter(Boolean).join(' ') || (pos === 'DEF' ? `${id} DEF` : id)),
        position: pos,
        team: String(p?.team || (pos === 'DEF' ? id : 'FA')).toUpperCase(),
        projection: projections[id] ?? null,
        injury: injuryTag(p?.injury_status),
        owner: ownership?.get(id),
      },
    ];
  });
  const sort = (list: FollowedPlayer[]) =>
    list.sort((a, b) => (b.projection ?? -1) - (a.projection ?? -1) || a.name.localeCompare(b.name));
  if (!ownership) return rows.length ? [{ key: 'all', title: 'Following', hint: '', players: sort(rows) }] : [];
  const groups: FollowGroup[] = [
    { key: 'mine', title: 'On your team', hint: 'Players you can start this week', players: sort(rows.filter(r => r.owner?.mine)) },
    { key: 'free', title: 'Free agents', hint: 'Pickup ideas: nobody in your league has them', players: sort(rows.filter(r => !r.owner)) },
    { key: 'others', title: 'On other teams', hint: 'Trade targets', players: sort(rows.filter(r => r.owner && !r.owner.mine)) },
  ];
  return groups.filter(g => g.players.length > 0);
}
