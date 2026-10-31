// app/backend/services/statsStore.ts
// Loads weekly stat files from the nfl-data repo with caching, so the chatbot and the
// trade agent don't re-download 44 files from GitHub on every request.

import fetch from "node-fetch";
import { createTtlCache, MINUTE } from "../utils/ttlCache";
import { getCurrentNFLSeason } from "../utils/season";

export const STATS_MIN_WEEK = 1;
export const STATS_MAX_WEEK = 22;
const STATS_ROOT_URL = "https://raw.githubusercontent.com/NityaGehlot/nfl-data/main/data/Stats";

const cache = createTtlCache();

const fileName = (week: number, season: number) =>
  `player_stats_${season}_week${String(week).padStart(2, "0")}.json`;

const offenseUrl = (week: number, season: number) =>
  `${STATS_ROOT_URL}/${season}%20Season/${season}%20Offense/${fileName(week, season)}`;

const defenseUrl = (week: number, season: number) =>
  `${STATS_ROOT_URL}/${season}%20Season/${season}%20Defense/${fileName(week, season)}`;

const toRows = (raw: any): any[] => (Array.isArray(raw) ? raw : (Object.values(raw ?? {}).flat() as any[]));

// Fields forced to numbers (missing -> 0), matching what the screens expect.
const OFFENSE_FIELDS = [
  "fantasy_points_ppr", "completions", "attempts", "passing_yards", "passing_tds", "passing_interceptions",
  "carries", "rushing_yards", "rushing_tds", "receptions", "targets", "receiving_yards", "receiving_tds",
  "fg_att", "fg_made", "fg_missed", "fg_made_0_19", "fg_made_20_29", "fg_made_30_39", "fg_made_40_49",
  "fg_made_50_59", "fg_made_60_", "pat_att", "pat_made",
];
const DEFENSE_FIELDS = [
  "fantasy_points_ppr", "def_tackles_solo", "def_tackles_with_assist", "def_tackles_for_loss",
  "def_tackles_for_loss_yards", "def_sacks", "def_sack_yards", "def_qb_hits", "def_fumbles_forced",
  "def_safeties", "def_tds", "def_interceptions", "def_interception_yards", "def_pass_defended",
  "fumble_recovery_opp", "fumble_recovery_yards_opp",
];

export function normalizeRows(raw: any, season: number, kind: "offense" | "defense" = "offense"): any[] {
  const fields = kind === "offense" ? OFFENSE_FIELDS : DEFENSE_FIELDS;
  return toRows(raw).map((row: any) => {
    const out: any = { ...row, week: Number(String(row.week).trim()) };
    // Rows for players who didn't play have season: null in the source files.
    out.season = Number(row.season) || season;
    for (const field of fields) out[field] = Number(row[field]) || 0;
    return out;
  });
}

async function fetchRows(url: string, season: number, kind: "offense" | "defense"): Promise<any[] | null> {
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`);
  return normalizeRows(await res.json(), season, kind);
}

// Offense + defense rows for one week. Missing weeks resolve to [] (cached briefly so a
// newly published week shows up within ~15 minutes).
export async function getWeekRows(week: number, season: number): Promise<any[]> {
  if (!Number.isFinite(week) || week < STATS_MIN_WEEK || week > STATS_MAX_WEEK) {
    throw new Error(`Week must be between ${STATS_MIN_WEEK} and ${STATS_MAX_WEEK}`);
  }
  return cache.get(`week:${season}:${week}`, 15 * MINUTE, async () => {
    const [offense, defense] = await Promise.all([
      fetchRows(offenseUrl(week, season), season, "offense"),
      fetchRows(defenseUrl(week, season), season, "defense").catch(() => null),
    ]);
    return [...(offense ?? []), ...(defense ?? [])];
  });
}

export async function getSeasonRows(season: number): Promise<any[]> {
  const weeks = Array.from({ length: STATS_MAX_WEEK - STATS_MIN_WEEK + 1 }, (_, i) => STATS_MIN_WEEK + i);
  const results = await Promise.allSettled(weeks.map(week => getWeekRows(week, season)));
  return results.flatMap((r, i) => {
    if (r.status === "fulfilled") return r.value;
    console.warn(`⚠️ Could not load ${season} week ${weeks[i]}:`, r.reason?.message ?? r.reason);
    return [];
  });
}

// The season the app should analyze: the current NFL season if any of its weeks are
// published yet, otherwise last season (offseason / before week 1 stats exist).
export async function resolveStatsSeason(requested?: unknown): Promise<number> {
  const asNumber = Number(requested);
  if (Number.isInteger(asNumber) && asNumber >= 1999 && asNumber <= 2100) return asNumber;

  const current = getCurrentNFLSeason();
  const week1 = await getWeekRows(1, current).catch(() => []);
  return week1.length > 0 ? current : current - 1;
}

export function latestWeekWithData(rows: any[]): number {
  const weeks = rows.filter(r => Number(r.fantasy_points_ppr) !== 0).map(r => Number(r.week));
  return weeks.length ? Math.min(Math.max(...weeks), STATS_MAX_WEEK) : 1;
}
