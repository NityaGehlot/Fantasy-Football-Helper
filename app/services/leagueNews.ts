// app/services/leagueNews.ts
// "Around the League" headlines for the Home screen. Uses the backend's ESPN-based feed
// (with cover images); if that's unavailable, builds a feed from nfl-data's news files.

import { getApiBaseUrl } from './apiBaseUrl';
import { getNewsFiles } from './newsService';
import type { NewsItem } from './newsDiversity';
import { selectDiverseNews } from './newsDiversity';

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

export async function getLeagueNews(): Promise<LeagueNewsArticle[]> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/league-news?limit=24`);
    if (!res.ok) throw new Error('league news unavailable');
    const data = await res.json();
    if (Array.isArray(data?.articles) && data.articles.length > 0) return data.articles;
    throw new Error('empty');
  } catch {
    return leagueNewsFromPlayerNews(await getNewsFiles(['qb', 'rb', 'wr', 'te', 'k']));
  }
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
