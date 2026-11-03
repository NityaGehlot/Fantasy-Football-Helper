// app/services/favoritesFilter.ts
// Picks the news about players and teams you follow (pure, no storage).

import type { NewsItem } from './newsDiversity';
import type { Favorites } from './userService';

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z]/g, '');

/**
 * News about the players and teams you follow, newest first. `playersById` maps Sleeper ids to
 * players (for names and current teams).
 */
export function favoriteNews(news: NewsItem[], fav: Favorites, playersById: Record<string, any>, limit = 12): NewsItem[] {
  const followedNames = new Set(fav.players.map(id => norm(playersById[id]?.full_name)).filter(Boolean));
  const teams = new Set(fav.teams);
  const teamOfName = new Map<string, string>();
  if (teams.size) {
    for (const p of Object.values(playersById)) {
      if (p?.full_name && p?.team && teams.has(String(p.team).toUpperCase())) teamOfName.set(norm(p.full_name), String(p.team).toUpperCase());
    }
  }
  const seen = new Set<string>();
  return news
    .filter(a => followedNames.has(norm(a.player)) || teamOfName.has(norm(a.player)))
    .filter(a => {
      const key = a.link || a.title;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => String(b.published ?? '').localeCompare(String(a.published ?? '')))
    .slice(0, limit);
}

/** Why an article is in your feed: "Followed player" or the followed team. */
export function favoriteReason(a: NewsItem, fav: Favorites, playersById: Record<string, any>): string {
  const p = Object.entries(playersById).find(([, x]) => norm(x?.full_name) === norm(a.player));
  if (p && fav.players.includes(p[0])) return 'Following';
  const team = p?.[1]?.team ? String(p[1].team).toUpperCase() : '';
  return team && fav.teams.includes(team) ? `${team} news` : 'Following';
}
