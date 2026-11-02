// app/backend/services/articleImages.ts
// Cover images for news articles that don't come with one (the player news from nfl-data
// links through Google News). We follow the link to the real article and read its
// og:image / twitter:image, the same picture you see when you open the article.
// If that fails, the player's headshot is used so every card still has an image.

import fetch from "node-fetch";
import { createTtlCache, HOUR } from "../utils/ttlCache";
import { getAllPlayers } from "./sleeperServer";
import { normalizePlayerName } from "../utils/names";

const cache = createTtlCache();
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const TIMEOUT_MS = 6000;

async function getText(url: string, init: any = {}): Promise<{ text: string; finalUrl: string } | null> {
  try {
    const res = await fetch(url, { timeout: TIMEOUT_MS, redirect: "follow", ...init, headers: { "User-Agent": UA, ...(init.headers ?? {}) } } as any);
    if (!res.ok) return null;
    // Only the <head> matters; cap the size so a huge page doesn't slow things down.
    const text = (await res.text()).slice(0, 400_000);
    return { text, finalUrl: res.url || url };
  } catch {
    return null;
  }
}

const decodeEntities = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** The article's share image (og:image, then twitter:image), as an absolute https URL. */
export function extractShareImage(html: string, pageUrl: string): string | null {
  const metas = html.match(/<meta\b[^>]*>/gi) ?? [];
  const find = (names: string[]) => {
    for (const tag of metas) {
      const key = (tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1] ?? "").toLowerCase();
      if (!names.includes(key)) continue;
      const content = tag.match(/\bcontent\s*=\s*["']([^"']+)["']/i)?.[1];
      if (content) return decodeEntities(content.trim());
    }
    return null;
  };
  const raw = find(["og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src"]);
  if (!raw) return null;
  try {
    const abs = new URL(raw, pageUrl);
    if (abs.protocol === "http:") abs.protocol = "https:";
    return abs.protocol === "https:" ? abs.toString() : null;
  } catch {
    return null;
  }
}

// ---------- Google News links ----------

export const isGoogleNewsLink = (url: string) => /^https?:\/\/news\.google\.com\/(rss\/)?articles\//i.test(url);

export function googleArticleId(url: string): string | null {
  return url.match(/\/articles\/([^?/#]+)/)?.[1] ?? null;
}

/** Signature + timestamp Google puts on the article page, needed to look up the real URL. */
export function extractDecodingParams(html: string): { signature: string; timestamp: string } | null {
  const signature = html.match(/data-n-a-sg="([^"]+)"/)?.[1];
  const timestamp = html.match(/data-n-a-ts="([^"]+)"/)?.[1];
  return signature && timestamp ? { signature, timestamp } : null;
}

export function buildBatchRequest(id: string, timestamp: string, signature: string): string {
  const inner = `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${id}",${timestamp},"${signature}"]`;
  return `f.req=${encodeURIComponent(JSON.stringify([[["Fbv4je", inner]]]))}`;
}

/** Pull the article URL out of Google's batchexecute response. */
export function parseBatchResponse(text: string): string | null {
  try {
    const chunk = text.split("\n\n")[1] ?? text.replace(/^\)\]\}'\s*/, "");
    const outer = JSON.parse(chunk);
    const payload = JSON.parse(outer[0][2]);
    const url = payload?.[1];
    return typeof url === "string" && /^https?:\/\//.test(url) ? url : null;
  } catch {
    return null;
  }
}

async function resolveGoogleNewsLink(url: string): Promise<string | null> {
  const id = googleArticleId(url);
  if (!id) return null;
  const page = await getText(`https://news.google.com/rss/articles/${id}`);
  // Some links redirect straight to the article.
  if (page && !/news\.google\.com/.test(page.finalUrl)) return page.finalUrl;
  const params = page ? extractDecodingParams(page.text) : null;
  if (!params) return null;
  const res = await getText("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: buildBatchRequest(id, params.timestamp, params.signature),
  });
  return res ? parseBatchResponse(res.text) : null;
}

/** The share image for one article link, or null. Cached for a day. */
export async function imageForArticle(link: string): Promise<string | null> {
  if (!/^https?:\/\//i.test(link)) return null;
  return cache.get(`img:${link}`, 24 * HOUR, async () => {
    const articleUrl = isGoogleNewsLink(link) ? await resolveGoogleNewsLink(link) : link;
    if (!articleUrl) return null;
    const page = await getText(articleUrl);
    return page ? extractShareImage(page.text, page.finalUrl) : null;
  });
}

// ---------- Headshot fallback ----------

export function headshotFor(player: any): string | null {
  if (!player) return null;
  if (player.espn_id) return `https://a.espncdn.com/i/headshots/nfl/players/full/${player.espn_id}.png`;
  if (player.player_id) return `https://sleepercdn.com/content/nfl/players/${player.player_id}.jpg`;
  return null;
}

async function headshotIndex(): Promise<Map<string, any>> {
  return cache.get("headshots", 24 * HOUR, async () => {
    const players = await getAllPlayers();
    const map = new Map<string, any>();
    for (const [id, p] of Object.entries(players ?? {})) {
      const name = normalizePlayerName(String((p as any)?.full_name ?? ""));
      // Prefer active players with a team when two share a name.
      if (name && (!map.has(name) || (p as any)?.team)) map.set(name, { ...(p as any), player_id: id });
    }
    return map;
  });
}

export type ImageRequest = { link: string; player?: string | null };

/**
 * Images for many articles at once: the article's own image when we can get it, otherwise the
 * player's headshot. Returns link -> image URL (null only when there's nothing at all).
 */
export async function imagesForArticles(items: ImageRequest[], concurrency = 6): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  const unique = [...new Map(items.filter(i => i?.link).map(i => [i.link, i])).values()].slice(0, 60);
  const heads = await headshotIndex().catch(() => new Map<string, any>());
  let next = 0;
  const worker = async () => {
    while (next < unique.length) {
      const item = unique[next++];
      const image = await imageForArticle(item.link).catch(() => null);
      out[item.link] = image ?? headshotFor(heads.get(normalizePlayerName(String(item.player ?? "")))) ?? null;
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, worker));
  return out;
}
