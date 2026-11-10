// app/backend/services/playerInsights.ts
// "Expert takes" on a player: ESPN's fantasy player feed, which has RotoWire's updates (the news
// plus a paragraph on what it means for fantasy) and ESPN analysts' columns that discuss him.
// Used in place of X posts: X's API costs money to read, and its posts are mostly reposted
// headlines; these are short, current and written for fantasy managers.

import fetch from "node-fetch";
import { createTtlCache, MINUTE } from "../utils/ttlCache";
import { getAllPlayers } from "./sleeperServer";

const FEED_URL = "https://site.api.espn.com/apis/fantasy/v2/games/ffl/news/players";
const cache = createTtlCache();

export type PlayerInsight = {
  id: string;
  // update: a RotoWire news note; article: an ESPN analyst column that discusses him
  kind: "update" | "article";
  headline: string;
  analysis: string;
  published: string;
  source: string;
  author?: string;
  link: string | null;
  premium: boolean;
};

/** Plain text from ESPN's story HTML (paragraphs kept as line breaks, photo tags dropped). */
export function plainText(html: unknown): string {
  return String(html ?? "")
    .replace(/<photo\d*>|<video\d*>|<alsosee>|<inline\d*>/gi, "")
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The paragraph of an analyst column about this player (columns cover several players). */
export function excerptAbout(text: string, name: string, max = 420): string {
  const last = name.trim().split(/\s+/).pop() ?? "";
  const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  const hit = paragraphs.find(p => p.includes(name)) ?? (last.length > 2 ? paragraphs.find(p => p.includes(last)) : undefined);
  const out = hit ?? "";
  return out.length > max ? `${out.slice(0, max).replace(/\s+\S*$/, "")}…` : out;
}

export function parsePlayerFeed(data: any, playerName = ""): PlayerInsight[] {
  const feed: any[] = Array.isArray(data?.feed) ? data.feed : [];
  return feed
    .filter(x => x?.headline)
    .map((x, i): PlayerInsight => {
      const rotowire = String(x.type) === "Rotowire";
      const link = x?.links?.web?.href ?? null;
      return rotowire
        ? {
            id: String(x.id ?? x.dataSourceIdentifier ?? i),
            kind: "update",
            headline: plainText(x.headline),
            analysis: plainText(x.story ?? x.description),
            published: String(x.published ?? x.lastModified ?? ""),
            source: "RotoWire",
            link,
            premium: !!x.premium,
          }
        : {
            id: String(x.id ?? x.dataSourceIdentifier ?? i),
            kind: "article",
            headline: plainText(x.headline),
            // What the column says about him, or ESPN's summary when it doesn't name him.
            analysis: excerptAbout(plainText(x.story), playerName) || plainText(x.description),
            published: String(x.published ?? x.lastModified ?? ""),
            source: "ESPN",
            author: x.byline ? String(x.byline) : undefined,
            link,
            premium: !!x.premium,
          };
    })
    .sort((a, b) => b.published.localeCompare(a.published));
}

/** ESPN's id for a Sleeper player (Sleeper's player database carries it). */
async function espnIdFor(sleeperId: string): Promise<string | null> {
  const players = await getAllPlayers().catch(() => ({} as Record<string, any>));
  const id = players?.[sleeperId]?.espn_id;
  return id ? String(id) : null;
}

export async function getPlayerInsights(opts: { espnId?: string; sleeperId?: string; name?: string; limit?: number }): Promise<PlayerInsight[]> {
  const espnId = opts.espnId || (opts.sleeperId ? await espnIdFor(opts.sleeperId) : null);
  if (!espnId || !/^\d+$/.test(espnId)) return [];
  const limit = Math.min(20, Math.max(1, opts.limit ?? 8));
  return cache.get(`insights:${espnId}:${limit}`, 10 * MINUTE, async () => {
    const res = await fetch(`${FEED_URL}?limit=${limit}&playerId=${espnId}`, { timeout: 15000 });
    if (!res.ok) throw new Error(`ESPN player news failed (${res.status})`);
    return parsePlayerFeed(await res.json(), opts.name ?? "");
  });
}
