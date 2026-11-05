// app/services/teamNews.ts
// The "Team" news tab on a player's page: about 10 stories, the ones that matter most for THIS
// player (his name in the headline, news about players he competes with or depends on, like his
// QB) or that are big news for the team (injuries, returns, trades and signings, suspensions).
// Generic fantasy advice and game recaps about other teammates rank lower.

import { selectDiverseNews, type NewsItem } from './newsDiversity';

/** Name key used for matching teammates to articles. */
export const norm = (s: unknown) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[.'’-]/g, '')
    .replace(/\s+(jr|sr|ii|iii|iv|v)$/, '')
    .trim();

// How much each kind of story matters for the team.
const CATEGORY_WEIGHT: Record<string, number> = {
  injury: 3,
  injury_return: 3,
  transaction: 3,
  suspension: 3,
  performance: 1,
  fantasy_advice: 0,
  general: 0,
};

// Teammates whose news changes this player's outlook (same spot = competition for touches;
// the QB = who's throwing to him; receivers for a QB; etc.).
const RELATED: Record<string, string[]> = {
  QB: ['WR', 'TE', 'RB', 'OL', 'OT', 'G', 'C'],
  RB: ['RB', 'QB', 'OL', 'OT', 'G', 'C'],
  WR: ['WR', 'QB', 'TE'],
  TE: ['TE', 'QB', 'WR'],
  K: ['QB', 'K'],
  DEF: ['DL', 'DE', 'DT', 'LB', 'CB', 'S', 'DB'],
};

export type Teammate = { name: string; position?: string; depthOrder?: number | null };

/** Score one article for this player (higher = show first). */
export function teamNewsScore(
  a: NewsItem,
  { playerName, position, teammates, now = Date.now() }: { playerName: string; position: string; teammates: Map<string, Teammate>; now?: number }
): number {
  let score = CATEGORY_WEIGHT[a.category ?? 'general'] ?? 0;
  const title = norm(a.title);
  const last = norm(playerName).split(' ').pop() ?? '';
  if (last.length > 2 && title.includes(last)) score += 5; // the story mentions him
  const mate = teammates.get(norm(a.player));
  if (mate) {
    const pos = String(mate.position ?? '').toUpperCase();
    if (pos === String(position).toUpperCase()) score += 2; // same spot: his competition
    else if ((RELATED[String(position).toUpperCase()] ?? []).includes(pos)) score += pos === 'QB' ? 2 : 1;
    if (mate.depthOrder === 1) score += 1; // a starter
  }
  if (a.impact && a.impact !== 'neutral') score += 1;
  const t = Date.parse(String(a.published ?? ''));
  if (Number.isFinite(t)) {
    const days = (now - t) / 86_400_000;
    score += days <= 3 ? 2 : days <= 7 ? 1 : days > 21 ? -2 : 0;
  }
  return score;
}

/** Up to `limit` team stories, most relevant first, no near-duplicates, at most 2 per teammate. */
export function pickTeamNews(
  articles: NewsItem[],
  opts: { playerName: string; position: string; teammates: Map<string, Teammate>; now?: number },
  limit = 10
): NewsItem[] {
  const scored = articles
    .map(a => ({ a, s: teamNewsScore(a, opts) }))
    .sort((x, y) => y.s - x.s || String(y.a.published ?? '').localeCompare(String(x.a.published ?? '')));
  const perPlayer = new Map<string, number>();
  const pool: NewsItem[] = [];
  for (const { a } of scored) {
    const who = norm(a.player);
    if ((perPlayer.get(who) ?? 0) >= 2) continue;
    perPlayer.set(who, (perPlayer.get(who) ?? 0) + 1);
    pool.push(a);
  }
  // Drop near-duplicate headlines, keeping the higher-ranked one, then restore relevance order.
  const kept = new Set(selectDiverseNews(pool, pool.length));
  return pool.filter(a => kept.has(a)).slice(0, limit);
}
