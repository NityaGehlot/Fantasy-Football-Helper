// app/backend/services/schedule.ts
// Which NFL teams play in a given week (teams missing from the list are on bye).

import fetch from "node-fetch";
import { createTtlCache, MINUTE } from "../utils/ttlCache";
import { normalizeTeam } from "../utils/names";

const cache = createTtlCache();

export async function getTeamsPlaying(season: number, week: number): Promise<Set<string>> {
  return cache.get(`teams:${season}:${week}`, 30 * MINUTE, async () => {
    const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=2&week=${week}`;
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
