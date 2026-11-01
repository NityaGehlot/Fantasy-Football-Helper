// app/backend/services/schedule.ts
// Which NFL teams play in a given week (teams missing from the list are on bye).

import fetch from "node-fetch";
import { createTtlCache, MINUTE } from "../utils/ttlCache";
import { normalizeTeam } from "../utils/names";

// Overridable for local testing.
const ESPN_SITE_API = process.env.ESPN_SITE_API || "https://site.api.espn.com/apis/site/v2/sports/football/nfl";

const cache = createTtlCache();

export async function getTeamsPlaying(season: number, week: number): Promise<Set<string>> {
  return cache.get(`teams:${season}:${week}`, 30 * MINUTE, async () => {
    const url = `${ESPN_SITE_API}/scoreboard?dates=${season}&seasontype=2&week=${week}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch NFL schedule for week ${week}`);
    const data = (await res.json()) as any;
    const teams = new Set<string>();
    for (const event of data?.events ?? []) {
      for (const c of event?.competitions?.[0]?.competitors ?? []) {
        const abbr = normalizeTeam(c?.team?.abbreviation);
        if (abbr) teams.add(abbr);
      }
    }
    return teams;
  });
}

export type GameState = {
  team: string;
  opponent: string;
  homeAway: "home" | "away";
  state: "pre" | "in" | "post";
  period: number;
  clock: string;
  // "Sun 1:00 PM", "Q3 4:12", "Halftime", "Final"
  detail: string;
  kickoff: string | null;
  teamScore: number | null;
  opponentScore: number | null;
};

// Turn one ESPN scoreboard event into a GameState for each team in it.
export function parseScoreboardEvent(event: any): GameState[] {
  const competition = event?.competitions?.[0];
  const competitors = competition?.competitors ?? [];
  if (competitors.length !== 2) return [];
  const status = competition?.status ?? event?.status ?? {};
  const rawState = String(status?.type?.state ?? "pre");
  const state: GameState["state"] = rawState === "in" ? "in" : rawState === "post" ? "post" : "pre";
  const detail = String(status?.type?.shortDetail ?? status?.type?.detail ?? "");

  return competitors.map((c: any, i: number) => {
    const other = competitors[1 - i];
    return {
      team: normalizeTeam(c?.team?.abbreviation),
      opponent: normalizeTeam(other?.team?.abbreviation),
      homeAway: c?.homeAway === "home" ? "home" : "away",
      state,
      period: Number(status?.period) || 0,
      clock: String(status?.displayClock ?? ""),
      detail,
      kickoff: event?.date ?? null,
      teamScore: state === "pre" ? null : Number(c?.score) || 0,
      opponentScore: state === "pre" ? null : Number(other?.score) || 0,
    };
  });
}

// Live game states for a week, keyed by team. Short TTL so clocks stay current.
export async function getGameStates(season: number, week: number): Promise<Map<string, GameState>> {
  return cache.get(`games:${season}:${week}`, 30 * 1000, async () => {
    const url = `${ESPN_SITE_API}/scoreboard?dates=${season}&seasontype=2&week=${week}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch NFL scoreboard for week ${week}`);
    const data = (await res.json()) as any;
    const map = new Map<string, GameState>();
    for (const event of data?.events ?? []) {
      for (const g of parseScoreboardEvent(event)) if (g.team) map.set(g.team, g);
    }
    return map;
  });
}
