// app/backend/services/playerNotes.ts
// "Latest analysis" for a player: RotoWire's player notes (the news in one line plus a paragraph
// of fantasy analysis) and ESPN's fantasy columns that discuss him, from ESPN's public fantasy
// news feed. Players are matched to ESPN by the ESPN id Sleeper has for them, or by name + team
// on ESPN's team rosters (Sleeper only has ESPN ids for some players).

import fetch from "node-fetch";
import { createTtlCache, HOUR, MINUTE } from "../utils/ttlCache";
import { normalizePlayerName } from "../utils/names";

const ESPN = process.env.ESPN_API_ROOT || "https://site.api.espn.com/apis";
const cache = createTtlCache();

export type PlayerNote = {
  kind: "note" | "article";
  headline: string;
  // RotoWire: the analysis paragraph; ESPN column: its summary
  analysis: string;
  published: string;
  source: string;
  link?: string;
  image?: string;
};

// ESPN and Sleeper spell a few teams differently.
const TEAM_ALIASES: Record<string, string> = { WSH: "WAS", JAC: "JAX", LA: "LAR" };
const teamKey = (t: unknown) => {
  const s = String(t ?? "").toUpperCase();
  return TEAM_ALIASES[s] ?? s;
};

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { timeout: 15000 });
  if (!res.ok) throw new Error(`ESPN request failed (${res.status})`);
  return res.json();
}

/** name|TEAM -> ESPN athlete id (and name -> id when unique), from all 32 team rosters. */
export async function espnRosterIndex(): Promise<Map<string, string>> {
  return cache.get("rosters", 12 * HOUR, async () => {
    const teams = await getJson(`${ESPN}/site/v2/sports/football/nfl/teams`);
    const list: any[] = teams?.sports?.[0]?.leagues?.[0]?.teams?.map((t: any) => t.team) ?? [];
    const index = new Map<string, string>();
    const nameCount = new Map<string, number>();
    await Promise.all(
      list.map(async t => {
        const roster = await getJson(`${ESPN}/site/v2/sports/football/nfl/teams/${t.id}/roster`).catch(() => null);
        for (const group of roster?.athletes ?? [])
          for (const a of group?.items ?? []) {
            const name = normalizePlayerName(a.fullName ?? "");
            if (!name || !a.id) continue;
            index.set(`${name}|${teamKey(t.abbreviation)}`, String(a.id));
            index.set(name, String(a.id));
            nameCount.set(name, (nameCount.get(name) ?? 0) + 1);
          }
      })
    );
    // A name shared by two players can't be matched without the team.
    for (const [name, n] of nameCount) if (n > 1) index.delete(name);
    return index;
  });
}

export function resolveEspnId(index: Map<string, string>, p: { espnId?: string | null; name: string; team?: string | null }): string | null {
  if (p.espnId) return String(p.espnId);
  const name = normalizePlayerName(p.name);
  return index.get(`${name}|${teamKey(p.team)}`) ?? index.get(name) ?? null;
}

const stripHtml = (html: string) =>
  String(html ?? "")
    .replace(/<(photo|video)\d+>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

/** ESPN's fantasy news feed for one player -> notes (newest first). */
export function parsePlayerNews(data: any, playerName: string, { notes = 5, articles = 3 } = {}): PlayerNote[] {
  const last = normalizePlayerName(playerName).split(" ").pop() ?? "";
  const out: PlayerNote[] = [];
  let nNotes = 0;
  let nArticles = 0;
  for (const a of data?.feed ?? []) {
    if (!a?.headline || String(a.premium) === "true") continue;
    if (a.type === "Rotowire") {
      if (nNotes >= notes) continue;
      nNotes++;
      out.push({
        kind: "note",
        headline: stripHtml(a.headline),
        analysis: stripHtml(a.story ?? ""),
        published: String(a.published ?? a.lastModified ?? ""),
        source: "RotoWire",
      });
    } else {
      // ESPN columns: only ones that actually talk about him.
      const text = normalizePlayerName(`${a.headline} ${a.description ?? ""} ${stripHtml(a.story ?? "").slice(0, 4000)}`);
      if (nArticles >= articles || !last || !` ${text} `.includes(` ${last} `)) continue;
      nArticles++;
      out.push({
        kind: "article",
        headline: stripHtml(a.headline),
        analysis: stripHtml(a.description ?? ""),
        published: String(a.published ?? ""),
        source: a.byline ? `ESPN · ${a.byline}` : "ESPN",
        link: a.links?.web?.href,
        image: a.images?.[0]?.url,
      });
    }
  }
  return out.sort((x, y) => y.published.localeCompare(x.published));
}

/** Latest analysis for a player (cached 30 minutes). Empty when ESPN doesn't know him. */
export async function getPlayerNotes(p: { espnId?: string | null; name: string; team?: string | null }): Promise<{ espnId: string | null; notes: PlayerNote[] }> {
  const index = p.espnId ? new Map<string, string>() : await espnRosterIndex().catch(() => new Map<string, string>());
  const espnId = resolveEspnId(index, p);
  if (!espnId) return { espnId: null, notes: [] };
  const notes = await cache.get(`notes:${espnId}`, 30 * MINUTE, async () =>
    parsePlayerNews(await getJson(`${ESPN}/fantasy/v2/games/ffl/news/players?limit=25&playerId=${espnId}`), p.name)
  );
  return { espnId, notes };
}
