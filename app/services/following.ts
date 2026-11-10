// app/services/following.ts
// The "Following" screen's logic (no React Native imports): your followed players grouped and
// sorted, with each one's team, this week's opponent / projection and injury; your followed teams
// with this week's opponent and how many of your followed players play for them.

export type FollowedPlayer = {
  id: string;
  name: string;
  position: string;
  team: string;
  opponent?: string | null; // this week ("BYE" when his team is off)
  projection?: number | null; // Sleeper projection in your league's scoring
  injury?: string; // Q / D / O / IR ...
};

export type FollowedTeam = { team: string; name: string; opponent?: string | null; players: number; headline?: string | null };

export type SortMode = 'position' | 'team' | 'name';

const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const posIndex = (p: string) => {
  const i = POSITION_ORDER.indexOf(String(p).toUpperCase());
  return i < 0 ? POSITION_ORDER.length : i;
};

/** Sections for the players list: by position (QB first), by team, or one A-Z list. */
export function groupFollowed(players: FollowedPlayer[], mode: SortMode): { title: string; players: FollowedPlayer[] }[] {
  const byName = (a: FollowedPlayer, b: FollowedPlayer) => a.name.localeCompare(b.name);
  if (mode === 'name') return players.length ? [{ title: 'A-Z', players: [...players].sort(byName) }] : [];
  const key = (p: FollowedPlayer) => (mode === 'position' ? String(p.position || 'Other').toUpperCase() : String(p.team || 'Free agents').toUpperCase());
  const groups = new Map<string, FollowedPlayer[]>();
  for (const p of players) groups.set(key(p), [...(groups.get(key(p)) ?? []), p]);
  const titles = [...groups.keys()].sort((a, b) => (mode === 'position' ? posIndex(a) - posIndex(b) : a.localeCompare(b)));
  return titles.map(title => ({
    title,
    // Within a position, the highest projection first; within a team, by position.
    players: [...groups.get(title)!].sort((a, b) =>
      mode === 'position' ? (b.projection ?? -1) - (a.projection ?? -1) || byName(a, b) : posIndex(a.position) - posIndex(b.position) || byName(a, b)
    ),
  }));
}

/** This week's opponent for each team, from the week's projections (teams not in it are on bye). */
export function opponentsFromProjections(players: Record<string, { team?: string; opp?: string }> | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const p of Object.values(players ?? {})) if (p.team && p.opp) out.set(String(p.team).toUpperCase(), String(p.opp).toUpperCase());
  return out;
}

/** Players on your fantasy roster you don't follow yet ("Follow my roster"). */
export function rosterToFollow(rosterIds: string[], followed: string[]): string[] {
  const have = new Set(followed.map(String));
  return [...new Set(rosterIds.map(String))].filter(id => id && id !== '0' && !have.has(id));
}
