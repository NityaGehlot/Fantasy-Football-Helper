// app/backend/services/leagueNews.ts
// League-wide headlines with cover images (ESPN's public news feed), tagged by what the story
// is about and ranked so the biggest fantasy news (trades, injuries, returns) comes first.

import fetch from "node-fetch";
import { createTtlCache, MINUTE } from "../utils/ttlCache";

// Overridable for local testing.
const ESPN_SITE_API = process.env.ESPN_SITE_API || "https://site.api.espn.com/apis/site/v2/sports/football/nfl";

const ESPN_NEWS_URL = `${ESPN_SITE_API}/news?limit=100`;
const cache = createTtlCache();

export type LeagueNewsCategory = "trade" | "signing" | "release" | "injury" | "return" | "suspension" | "other";

export type LeagueNewsArticle = {
  id: string;
  headline: string;
  description: string;
  published: string;
  image: string | null;
  link: string | null;
  // A video (ESPN \"Media\"); the image is its cover
  video?: boolean;
  category: LeagueNewsCategory;
  label: string;
  importance: number;
  players: string[];
  teams: string[];
};

const LABELS: Record<LeagueNewsCategory, string> = {
  trade: "Trade",
  signing: "Signing",
  release: "Release",
  injury: "Injury",
  return: "Returning",
  suspension: "Suspension",
  other: "News",
};

// Order matters: a "returns from injury" story is a return, not an injury.
const RULES: [LeagueNewsCategory, RegExp, number][] = [
  ["suspension", /\bsuspen(d|ded|sion)\b/, 4],
  ["trade", /\btrad(e|ed|es|ing)\b|\bacquir(e|es|ed|ing)\b|\bdeal (for|with)\b/, 5],
  ["return", /\bactivated\b|\breturns? (to|from)\b|\bcleared\b|\bback at practice\b|\bexpected to (play|return)\b|\bwill play\b|\boff (the )?injury report\b/, 3],
  ["injury", /\binjur|\binjured reserve\b|\bir\b|\bruled out\b|\bout for\b|\btorn\b|\btears?\b|\bsurgery\b|\bquestionable\b|\bdoubtful\b|\bsprain|\bconcussion\b|\bhamstring\b|\bankle\b|\bknee\b|\bfracture/, 4],
  ["release", /\b(release[sd]?|waive[sd]?|cut)\b/, 2],
  ["signing", /\bsign(s|ed|ing)?\b|\bextension\b|\bcontract\b|\bclaim(s|ed)?\b|\bpromot(e|ed)\b/, 3],
];

function classifyText(text: string): { category: LeagueNewsCategory; label: string; importance: number } | null {
  // "trade deadline" talk isn't a trade
  const t = text.toLowerCase().replace(/\btrade deadline\b/g, "deadline");
  for (const [category, pattern, importance] of RULES) {
    if (pattern.test(t)) {
      const severe = category === "injury" && /season[- ]ending|torn|out for (the )?season|injured reserve|\bir\b/.test(t);
      return { category, label: LABELS[category], importance: importance + (severe ? 1 : 0) };
    }
  }
  return null;
}

// The headline decides; the description is only used when the headline alone is unclear.
export function classifyLeagueHeadline(headline: string, description = ""): { category: LeagueNewsCategory; label: string; importance: number } {
  return classifyText(headline) ?? classifyText(description) ?? { category: "other", label: LABELS.other, importance: 1 };
}

const pickImage = (images: any[]): string | null => {
  if (!Array.isArray(images) || images.length === 0) return null;
  const header = images.find(i => i?.type === "header") ?? images[0];
  return header?.url ?? null;
};

export function parseEspnNews(data: any): LeagueNewsArticle[] {
  const articles = Array.isArray(data?.articles) ? data.articles : [];
  return articles
    // Videos ("Media") are kept when they have a cover image, and marked as video.
    .filter((a: any) => a?.headline && (a?.type !== "Media" || pickImage(a.images)))
    .map((a: any, i: number) => {
      const cls = classifyLeagueHeadline(String(a.headline), String(a.description ?? ""));
      const cats = Array.isArray(a.categories) ? a.categories : [];
      return {
        id: String(a.id ?? a.dataSourceIdentifier ?? i),
        headline: String(a.headline),
        description: String(a.description ?? ""),
        published: String(a.published ?? a.lastModified ?? ""),
        image: pickImage(a.images),
        link: a?.links?.web?.href ?? a?.links?.mobile?.href ?? null,
        video: a?.type === "Media",
        ...cls,
        players: cats.filter((c: any) => c?.type === "athlete" && c?.description).map((c: any) => String(c.description)),
        teams: cats.filter((c: any) => c?.type === "team" && c?.description).map((c: any) => String(c.description)),
      };
    });
}

// Biggest news first: importance, then recency.
export function rankLeagueNews(articles: LeagueNewsArticle[], limit = 20): LeagueNewsArticle[] {
  return [...articles]
    .sort((a, b) => b.importance - a.importance || b.published.localeCompare(a.published))
    .slice(0, limit);
}

type EspnFeed = { articles: LeagueNewsArticle[]; fetchedAt: string };

async function getEspnFeed(): Promise<EspnFeed> {
  return cache.get("espn", 10 * MINUTE, async () => {
    const res = await fetch(ESPN_NEWS_URL);
    if (!res.ok) throw new Error(`ESPN news failed (${res.status})`);
    return { articles: parseEspnNews(await res.json()), fetchedAt: new Date().toISOString() };
  });
}

/**
 * top: the biggest stories for the unfiltered view.
 * pool: every parsed article, ranked, so category filters have plenty to show.
 */
export async function getLeagueNews(limit = 20): Promise<{ top: LeagueNewsArticle[]; pool: LeagueNewsArticle[]; fetchedAt: string }> {
  const feed = await getEspnFeed();
  const ranked = rankLeagueNews(feed.articles, feed.articles.length);
  return { top: ranked.slice(0, limit), pool: ranked, fetchedAt: feed.fetchedAt };
}
