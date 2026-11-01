// app/services/leagueNews.ts
// "Around the League" headlines for the Home screen. Uses the backend's ESPN-based feed
// (with cover images); if that's unavailable, builds a feed from nfl-data's news files.

import { getApiBaseUrl } from './apiBaseUrl';
import { getNewsFiles, getNewsUpdatedAt } from './newsService';
import type { NewsItem } from './newsDiversity';
import { selectDiverseNews, titleSimilarity } from './newsDiversity';

export type LeagueNewsCategory = 'trade' | 'signing' | 'release' | 'injury' | 'return' | 'suspension' | 'other';

export type LeagueNewsArticle = {
  id: string;
  headline: string;
  description: string;
  published: string;
  image: string | null;
  link: string | null;
  category: LeagueNewsCategory;
  label: string;
  players: string[];
};

const FROM_PLAYER_NEWS: Record<string, LeagueNewsCategory> = {
  injury: 'injury',
  injury_return: 'return',
  transaction: 'signing',
  suspension: 'suspension',
};
const LABELS: Record<LeagueNewsCategory, string> = {
  trade: 'Trade', signing: 'Roster move', release: 'Release', injury: 'Injury', return: 'Returning', suspension: 'Suspension', other: 'News',
};

// Fallback: the most important player-tagged stories from nfl-data (no images).
export function leagueNewsFromPlayerNews(items: NewsItem[], limit = 20): LeagueNewsArticle[] {
  const important = items.filter(a => a.category && FROM_PLAYER_NEWS[a.category] && a.impact !== 'neutral');
  return selectDiverseNews(important, limit, { onePerPlayer: true }).map((a, i) => {
    const category = /\btrad(e|ed|es)\b/i.test(a.title) ? 'trade' : FROM_PLAYER_NEWS[a.category!];
    return {
      id: a.link ?? String(i),
      headline: a.title,
      description: a.summary ?? '',
      published: a.published ?? '',
      image: null,
      link: a.link ?? null,
      category,
      label: LABELS[category],
      players: a.player ? [a.player] : [],
    };
  });
}

export type LeagueNewsFeed = {
  // Biggest stories, for the unfiltered "Top stories" view
  top: LeagueNewsArticle[];
  // Everything available, for category filters
  pool: LeagueNewsArticle[];
  updatedAt: string | null;
  source: 'espn' | 'player-news';
};

// Add player-news stories to the ESPN pool, skipping ones that repeat an ESPN headline.
export function mergeNewsPools(primary: LeagueNewsArticle[], extra: LeagueNewsArticle[]): LeagueNewsArticle[] {
  const asItem = (a: LeagueNewsArticle) => ({ title: a.headline, player: a.players[0] });
  const merged = [...primary];
  for (const a of extra) {
    if (merged.some(m => m.link === a.link || titleSimilarity(asItem(m), asItem(a)) >= 0.5)) continue;
    merged.push(a);
  }
  return merged;
}

export const FILTER_LIMIT = 25;

// Articles for one filter: the top stories when unfiltered, otherwise everything in the pool
// for those categories (newest first), so filters aren't limited to what made the top list.
export function articlesForFilter(feed: LeagueNewsFeed, categories: LeagueNewsCategory[] | null, limit = FILTER_LIMIT) {
  if (!categories) return feed.top;
  return feed.pool
    .filter(a => categories.includes(a.category))
    .sort((a, b) => String(b.published).localeCompare(String(a.published)))
    .slice(0, limit);
}

export async function getLeagueNews(): Promise<LeagueNewsFeed> {
  const [espn, playerNews, newsUpdatedAt] = await Promise.all([
    fetch(`${getApiBaseUrl()}/league-news?limit=24`)
      .then(res => (res.ok ? res.json() : null))
      .catch(() => null),
    getNewsFiles(['qb', 'rb', 'wr', 'te', 'k']).catch(() => [] as NewsItem[]),
    getNewsUpdatedAt(),
  ]);
  const fromPlayers = leagueNewsFromPlayerNews(playerNews, 80);

  if (Array.isArray(espn?.articles) && espn.articles.length > 0) {
    const pool = Array.isArray(espn.pool) ? espn.pool : espn.articles;
    return {
      top: espn.articles,
      pool: mergeNewsPools(pool, fromPlayers),
      updatedAt: espn.fetchedAt ?? null,
      source: 'espn',
    };
  }
  return { top: fromPlayers.slice(0, 20), pool: fromPlayers, updatedAt: newsUpdatedAt, source: 'player-news' };
}

export function timeAgo(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const mins = Math.max(0, Math.round((now - t) / 60000));
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'Yesterday' : `${days}d ago`;
}
