// app/backend/services/statsStore.ts
// Loads weekly stat files from the nfl-data repo with caching, so the chatbot and the
// trade agent don't re-download 44 files from GitHub on every request.

import fetch from "node-fetch";
import { createTtlCache, MINUTE } from "../utils/ttlCache";
import { getCurrentNFLSeason } from "../utils/season";
import { getAllPlayers, getNflState, getWeekStatLines } from "./sleeperServer";

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
    if (offense) return [...offense, ...(defense ?? [])];
    // nfl-data publishes a week's offense file after the week is over, so the week in progress
    // (and a just-finished one) would show no stats at all. Fill it from Sleeper's stat lines.
    const fromSleeper = await sleeperWeekRows(week, season).catch(err => {
      console.warn(`⚠️ Sleeper stats for ${season} week ${week} unavailable:`, err?.message ?? err);
      return [] as any[];
    });
    // Sleeper's team defense rows replace nfl-data's placeholder ones (all zeros until published).
    const sleeperDefs = new Set(fromSleeper.filter(r => r.position === "DEF").map(r => r.player_id));
    return [...fromSleeper, ...(defense ?? []).filter(r => !sleeperDefs.has(String(r.player_id)))];
  });
}

/** Only weeks that have started can have stats: skip Sleeper for future weeks and seasons. */
async function weekHasStarted(week: number, season: number): Promise<boolean> {
  const state = await getNflState().catch(() => null);
  const current = Number(state?.season);
  if (!current) return false;
  if (season !== current) return season < current;
  const type = String(state?.season_type ?? "").toLowerCase();
  if (type === "pre") return false;
  if (type !== "regular") return true;
  return week <= (Number(state?.week) || 0);
}

const num = (v: unknown) => Number(v) || 0;

/** One Sleeper stat line (from /stats/nfl/{season}/{week}) in nfl-data's row format. */
export function sleeperLineToRow(line: any, season: number, week: number, gsisById: Record<string, string> = {}): any | null {
  const s = line?.stats ?? {};
  const position = String(line?.player?.position ?? "").toUpperCase();
  const team = String(line?.team ?? line?.player?.team ?? "").toUpperCase();
  if (!["QB", "RB", "WR", "TE", "K", "DEF"].includes(position)) return null;
  // Sleeper lists everyone on a roster; only keep players who actually got into the game.
  if (!num(s.gp) && !num(s.gms_active) && !num(s.pts_ppr)) return null;
  const base = {
    season,
    week,
    position,
    team,
    opponent_team: String(line?.opponent ?? "").toUpperCase(),
    headshot_url: "",
    fantasy_points_ppr: num(s.pts_ppr),
    game_played: true,
    team_status: "played",
    injury_status: "ACTIVE",
    practice_status: "",
    primary_injury: "",
    secondary_injury: "",
    practice_primary_injury: "",
    practice_secondary_injury: "",
    source: "sleeper",
  };
  if (position === "DEF") {
    return {
      ...base,
      player_id: `DEF_${team}`,
      player_name: `${team} DEF`,
      def_sacks: num(s.sack),
      def_fumbles_forced: num(s.ff),
      def_safeties: num(s.safe),
      def_tds: num(s.def_td) + num(s.def_st_td),
      def_interceptions: num(s.int),
      fumble_recovery_opp: num(s.fum_rec),
      points_allowed: num(s.pts_allow),
      yards_allowed: num(s.yds_allow),
    };
  }
  const name = [line?.player?.first_name, line?.player?.last_name].filter(Boolean).join(" ");
  const fgAtt = num(s.fga);
  const fgMade = num(s.fgm);
  return {
    ...base,
    player_id: gsisById[String(line?.player_id)] || String(line?.player_id),
    sleeper_id: String(line?.player_id),
    player_name: name,
    snap_count: num(s.off_snp),
    completions: num(s.pass_cmp),
    attempts: num(s.pass_att),
    passing_yards: num(s.pass_yd),
    passing_tds: num(s.pass_td),
    passing_interceptions: num(s.pass_int),
    carries: num(s.rush_att),
    rushing_yards: num(s.rush_yd),
    rushing_tds: num(s.rush_td),
    receptions: num(s.rec),
    targets: num(s.rec_tgt),
    receiving_yards: num(s.rec_yd),
    receiving_tds: num(s.rec_td),
    fumbles: num(s.fum_lost),
    fg_att: fgAtt,
    fg_made: fgMade,
    fg_missed: Math.max(0, fgAtt - fgMade),
    fg_pct: fgAtt ? fgMade / fgAtt : 0,
    fg_made_0_19: num(s.fgm_0_19),
    fg_made_20_29: num(s.fgm_20_29),
    fg_made_30_39: num(s.fgm_30_39),
    fg_made_40_49: num(s.fgm_40_49),
    fg_made_50_59: num(s.fgm_50_59) || (num(s.fgm_60p) ? 0 : num(s.fgm_50p)),
    fg_made_60_: num(s.fgm_60p),
    pat_att: num(s.xpa),
    pat_made: num(s.xpm),
    pat_missed: Math.max(0, num(s.xpa) - num(s.xpm)),
  };
}

async function sleeperWeekRows(week: number, season: number): Promise<any[]> {
  if (!(await weekHasStarted(week, season))) return [];
  const [lines, players] = await Promise.all([
    getWeekStatLines(season, week),
    getAllPlayers().catch(() => ({} as Record<string, any>)),
  ]);
  // nfl-data rows use GSIS ids; keep that id when Sleeper knows it so rows join the same way.
  const gsisById: Record<string, string> = {};
  for (const [id, p] of Object.entries(players ?? {})) if ((p as any)?.gsis_id) gsisById[id] = String((p as any).gsis_id).trim();
  return lines.flatMap(l => {
    const row = sleeperLineToRow(l, season, week, gsisById);
    return row ? [row] : [];
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
