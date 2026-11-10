// app/backend/routes.ts
import { Router, Request, Response } from "express";
import fetch from "node-fetch";

// Import utilities
import {
  extractPlayerNames,
  extractAllPlayers,
  getPlayerWeeks,
  getPlayerTeam,
  Position,
} from "./utils/playerExtraction";
import { getContextBuilder } from "./utils/contextBuilder";
import {
  buildQBAnalysisBlock,
  buildWRAnalysisBlock,
  buildTEAnalysisBlock,
  buildRBAnalysisBlock,
  buildKAnalysisBlock,
  buildDEFAnalysisBlock,
} from "./services/playerAnalysis";
import { comparePlayerStats, formatComparisonBlock } from "./services/comparisonService";
import {
  buildAnalysisPrompt,
  buildQBResponseFormat,
  buildSkillPositionResponseFormat,
  buildRosterDecisionResponseFormat,
} from "./services/promptBuilder";
import {
  STATS_MIN_WEEK,
  STATS_MAX_WEEK,
  getWeekRows,
  getSeasonRows,
  resolveStatsSeason,
  latestWeekWithData,
} from "./services/statsStore";
import { detectIntent } from "./services/intent";
import { handleAdvisorQuestion, AdvisorResult, addPlayoffSchedules } from "./services/advisor";
import { playoffTradeNote } from "./services/playoffSchedule";
import { generateWithLLM, streamWithLLM } from "./services/llm";
import { getLeagueContext, toTradePlayer } from "./services/leagueContext";
import { lineupValue } from "./services/lineup";
import { rankDropCandidates } from "./services/waiver";
import { buildIrAdvice } from "./services/irAdvice";
import { buildMatchupContext, formatMatchupBlock } from "./services/matchupContext";
import { playedPoints, pointRange } from "./utils/pointRange";
import { imagesForArticles } from "./services/articleImages";
import { getAllPlayers, getLeague, getLeagueUsers, getNflState, getRosters, getTransactions, lastSource } from "./services/sleeperServer";
import { gradeProposal, gradeTrade, pendingTradesFor, tradeForPlayer } from "./services/tradeGrade";
import { getLineupCheck } from "./services/lineupCheck";
import { getPlayerRanks } from "./services/playerRanks";
import { describeMoves } from "./services/leagueMoves";
import { buildWaiverAdvice } from "./services/waiverAdvice";
import { getPlayerNotes } from "./services/playerNotes";
import { normalizePlayerName } from "./utils/names";
import { incompatibleStartSitReply } from "./utils/slotCompat";
import { generateTradeIdeas } from "./services/tradeEngine";
import { getLiveScoreboard } from "./services/liveScoreboard";
import { ensureInjuriesLoaded } from "./services/injuryStore";
import { getLeagueNews } from "./services/leagueNews";

// Overridable for local testing.
const ESPN_SITE_API = process.env.ESPN_SITE_API || "https://site.api.espn.com/apis/site/v2/sports/football/nfl";

// ===============================
// Types
// ===============================
type OpponentDefenseContext = {
  matchupWeek: number;
  opponentTeam: string;
  opponentAbbreviation: string;
  weeksIncluded: number[];
  avgRushingYardsAllowed: number;
  avgPassingYardsAllowed: number;
  avgRushingTDAllowed: number;
  avgPassingTDAllowed: number;
  avgInterceptions: number;
  avgFumblesForced: number;
  defenseStrengthScore: number;
};

type TeamPlayerPayload = {
  playerId: string;
  fullName: string;
  position: string;
  team: string;
  isStarter: boolean;
};

type MyTeamPayload = {
  leagueId: string;
  ownerId: string;
  rosterId: number;
  teamName: string;
  players: TeamPlayerPayload[];
  starters: string[];
  starterSlotsByPosition?: Partial<Record<"QB" | "RB" | "WR" | "TE" | "K" | "DEF", number>>;
  // league.roster_positions, for which positions can share a lineup spot
  rosterPositions?: string[];
};

// ===============================
// Utility Functions
// ===============================

function getCurrentFantasyWeek(playerStats: any[]): number {
  const weeksWithData = playerStats
    .filter(p => Number(p.fantasy_points_ppr) > 0 && Number(p.week) <= STATS_MAX_WEEK)
    .map(p => Number(p.week));

  if (weeksWithData.length === 0) return 1;
  const latestWeekWithData = Math.max(...weeksWithData);
  return Math.min(latestWeekWithData, STATS_MAX_WEEK);
}

function resolveAnalysisWeek(playerStats: any[], requestedWeek?: number): number {
  const latest = getCurrentFantasyWeek(playerStats);
  if (Number.isFinite(requestedWeek) && Number(requestedWeek) > 0) {
    // Never analyze past the next unplayed week (the app's default week can be stale).
    return Math.min(Number(requestedWeek), latest + 1, STATS_MAX_WEEK);
  }

  return latest;
}

function normalizeTeamAbbreviation(team: string | null | undefined): string {
  const normalized = String(team ?? "").trim().toUpperCase();
  const aliases: Record<string, string> = {
    WSH: "WAS",
    JAC: "JAX",
    LA: "LAR",
  };

  return aliases[normalized] ?? normalized;
}

function roundStat(value: number): number {
  return Number(value.toFixed(2));
}

function inferRequestedPosition(message: string): Position | null {
  const lower = message.toLowerCase();

  if (/\bqb\b|quarterback/.test(lower)) return "QB";
  if (/\brb\b|running back/.test(lower)) return "RB";
  if (/\bwr\b|wide receiver/.test(lower)) return "WR";
  if (/\bte\b|tight end/.test(lower)) return "TE";
  if (/\bk\b|kicker/.test(lower)) return "K";
  if (/\bdef\b|defense|dst|d\/st/.test(lower)) return "DEF";

  return null;
}

function canonicalizePlayerName(
  name: string,
  position: Position,
  playerStats: any[]
): string {
  const target = name.trim().toLowerCase();
  const positionRows = playerStats.filter(p => p.position === position && p.player_name);

  const exactMatch = positionRows.find(
    p => String(p.player_name).trim().toLowerCase() === target
  );
  if (exactMatch) return String(exactMatch.player_name).trim().toLowerCase();

  const fuzzyMatch = positionRows.find(p => {
    const candidate = String(p.player_name).trim().toLowerCase();
    return candidate.includes(target) || target.includes(candidate);
  });

  return String(fuzzyMatch?.player_name ?? name).trim().toLowerCase();
}

function inferPlayersFromMyTeam(
  message: string,
  myTeam: MyTeamPayload | null,
  playerStats: any[]
): { name: string; position: Position }[] {
  if (!myTeam || !Array.isArray(myTeam.players) || myTeam.players.length === 0) {
    return [];
  }

  const requestedPosition = inferRequestedPosition(message);
  if (!requestedPosition) {
    return [];
  }

  const teamPlayersAtPosition = myTeam.players.filter(
    p => String(p.position).toUpperCase() === requestedPosition
  );
  if (teamPlayersAtPosition.length === 0) {
    return [];
  }

  const sortedCandidates = [...teamPlayersAtPosition].sort((a, b) => {
    if (a.isStarter && !b.isStarter) return -1;
    if (!a.isStarter && b.isStarter) return 1;
    return a.fullName.localeCompare(b.fullName);
  });

  const seen = new Set<string>();
  const normalized = sortedCandidates
    .map(p => canonicalizePlayerName(p.fullName, requestedPosition, playerStats))
    .filter(name => {
      if (!name || seen.has(name)) return false;
      seen.add(name);
      return true;
    });

  return normalized.map(name => ({
    name,
    position: requestedPosition,
  }));
}

function getRosterStartCount(
  position: Position,
  myTeam: MyTeamPayload | null,
  candidateCount: number
): number {
  const defaults: Record<Position, number> = {
    QB: 1,
    RB: 2,
    WR: 2,
    TE: 1,
    K: 1,
    DEF: 1,
  };

  const configured = (myTeam?.starterSlotsByPosition as any)?.[position];
  const rawCount = Number.isFinite(configured) && Number(configured) > 0
    ? Number(configured)
    : defaults[position];

  return Math.max(1, Math.min(rawCount, candidateCount));
}

async function fetchOpponentMap(
  seasonYear: number,
  week: number
): Promise<Map<string, { opponentAbbreviation: string; opponentTeam: string }>> {
  const scheduleUrl = `${ESPN_SITE_API}/scoreboard?dates=${seasonYear}&seasontype=2&week=${week}`;
  const response = await fetch(scheduleUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch NFL schedule for week ${week}`);
  }

  const data = (await response.json()) as any;
  const opponentMap = new Map<string, { opponentAbbreviation: string; opponentTeam: string }>();

  for (const event of data.events ?? []) {
    const competitors = event?.competitions?.[0]?.competitors ?? [];
    if (competitors.length !== 2) continue;

    const [teamA, teamB] = competitors;
    const teamAAbbr = normalizeTeamAbbreviation(teamA?.team?.abbreviation);
    const teamBAbbr = normalizeTeamAbbreviation(teamB?.team?.abbreviation);

    opponentMap.set(teamAAbbr, {
      opponentAbbreviation: teamBAbbr,
      opponentTeam: teamB?.team?.displayName ?? teamBAbbr,
    });
    opponentMap.set(teamBAbbr, {
      opponentAbbreviation: teamAAbbr,
      opponentTeam: teamA?.team?.displayName ?? teamAAbbr,
    });
  }

  return opponentMap;
}

function getPlayerTeamForWeek(
  playerName: string,
  position: Position,
  playerStats: any[],
  week: number
): string | null {
  const row = playerStats
    .filter(
      p =>
        p.position === position &&
        p.player_name.toLowerCase() === playerName.toLowerCase() &&
        Number(p.week) <= week &&
        p.team
    )
    .sort((a, b) => Number(b.week) - Number(a.week))[0];

  return row?.team ?? null;
}

function calculateDefenseStrengthScore(defense: {
  avgRushingYardsAllowed: number;
  avgPassingYardsAllowed: number;
  avgRushingTDAllowed: number;
  avgPassingTDAllowed: number;
  avgInterceptions: number;
  avgFumblesForced: number;
}): number {
  const rushingYardsComponent = Math.max(0, Math.min(20, ((160 - defense.avgRushingYardsAllowed) / 160) * 20));
  const passingYardsComponent = Math.max(0, Math.min(25, ((320 - defense.avgPassingYardsAllowed) / 320) * 25));
  const rushingTDComponent = Math.max(0, Math.min(15, ((3 - defense.avgRushingTDAllowed) / 3) * 15));
  const passingTDComponent = Math.max(0, Math.min(15, ((3 - defense.avgPassingTDAllowed) / 3) * 15));
  const interceptionsComponent = Math.max(0, Math.min(15, (defense.avgInterceptions / 3) * 15));
  const fumblesComponent = Math.max(0, Math.min(10, (defense.avgFumblesForced / 3) * 10));

  return roundStat(
    rushingYardsComponent +
      passingYardsComponent +
      rushingTDComponent +
      passingTDComponent +
      interceptionsComponent +
      fumblesComponent
  );
}

function buildOpponentDefenseContext(
  playerName: string,
  playerStats: any[],
  matchupWeek: number,
  opponentMap: Map<string, { opponentAbbreviation: string; opponentTeam: string }>
): OpponentDefenseContext | null {
  const playerTeam = normalizeTeamAbbreviation(
    getPlayerTeamForWeek(playerName, "QB", playerStats, matchupWeek)
  );

  if (!playerTeam) {
    return null;
  }

  const opponent = opponentMap.get(playerTeam);
  if (!opponent) {
    return null;
  }

  const previousDefenseWeeks = playerStats
    .filter(
      p =>
        p.position === "DEF" &&
        normalizeTeamAbbreviation(p.team) === opponent.opponentAbbreviation &&
        Number(p.week) < matchupWeek
    )
    .sort((a, b) => Number(b.week) - Number(a.week))
    .slice(0, 3);

  const defenseWeeks =
    previousDefenseWeeks.length > 0
      ? previousDefenseWeeks
      : playerStats
          .filter(
            p =>
              p.position === "DEF" &&
              normalizeTeamAbbreviation(p.team) === opponent.opponentAbbreviation &&
              Number(p.week) <= matchupWeek
          )
          .sort((a, b) => Number(b.week) - Number(a.week))
          .slice(0, 3);

  if (defenseWeeks.length === 0) {
    return null;
  }

  const count = defenseWeeks.length;
  const sum = (key: string) =>
    defenseWeeks.reduce((total, row) => total + (Number(row[key]) || 0), 0);

  const summary = {
    matchupWeek,
    opponentTeam: opponent.opponentTeam,
    opponentAbbreviation: opponent.opponentAbbreviation,
    weeksIncluded: defenseWeeks.map(row => Number(row.week)).sort((a, b) => b - a),
    avgRushingYardsAllowed: roundStat(sum("rushing_yards_allowed") / count),
    avgPassingYardsAllowed: roundStat(sum("passing_yards_allowed") / count),
    avgRushingTDAllowed: roundStat(sum("rushing_tds_allowed") / count),
    avgPassingTDAllowed: roundStat(sum("passing_tds_allowed") / count),
    avgInterceptions: roundStat(sum("def_interceptions") / count),
    avgFumblesForced: roundStat(sum("def_fumbles_forced") / count),
  };

  return {
    ...summary,
    defenseStrengthScore: calculateDefenseStrengthScore(summary),
  };
}

// ===============================
// Route Registration
// ===============================
export function registerRoutes(router: Router): void {
  router.get("/", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      service: "ffh-api",
      message: "Fantasy Football Helper backend is running.",
    });
  });

  // ===============================
  // Proxy: News Data from nfl-data
  // ===============================
  router.get("/api/news/:position", async (req: Request, res: Response) => {
    const position = String(req.params.position).toLowerCase();
    
    const validPositions = ["qb", "rb", "wr", "te", "k", "def"];
    if (!validPositions.includes(position)) {
      return res.status(400).json({ error: "Invalid position. Must be one of: qb, rb, wr, te, k, def" });
    }

    try {
      const newsUrl = `https://raw.githubusercontent.com/NityaGehlot/nfl-data/main/data/news/news_${position}.json`;
      const response = await fetch(newsUrl);
      
      if (!response.ok) {
        console.warn(`⚠️ Failed to fetch news for position ${position}`);
        return res.status(404).json({ error: `News not found for position: ${position}` });
      }

      const data = await response.json();
      res.set("Cache-Control", "public, max-age=300");
      res.json(data);
    } catch (err) {
      console.error(`❌ Error fetching news for ${position}:`, err);
      res.status(500).json({ error: `Failed to fetch news for position: ${position}` });
    }
  });

  // ===============================
  // Proxy: Season Stats from nfl-data
  // ===============================
  router.get("/api/stats", async (req: Request, res: Response) => {
    try {
      const season = await resolveStatsSeason(req.query.season);
      const data = await getSeasonRows(season);
      res.set("Cache-Control", "public, max-age=300");
      res.json(data);
    } catch (err) {
      console.error("❌ Error fetching stats:", err);
      res.status(500).json({ error: "Failed to fetch season stats" });
    }
  });

  // ===============================
  // Proxy: Weekly Stats from nfl-data
  // ===============================
  router.get("/api/stats/:week", async (req: Request, res: Response) => {
    const week = Number(req.params.week);

    if (!Number.isFinite(week) || week < 1 || week > 22) {
      return res.status(400).json({ error: "Week must be between 1 and 22" });
    }

    try {
      const season = await resolveStatsSeason(req.query.season);
      const data = await getWeekRows(week, season);
      res.set("Cache-Control", "public, max-age=300");
      res.json(data);
    } catch (err) {
      console.error(`❌ Error fetching stats for week ${week}:`, err);
      res.status(500).json({ error: `Failed to fetch stats for week ${week}` });
    }
  });

  // ===============================
  // Per-week stats endpoint
  // ===============================
  router.get("/player-stats-week/:week", async (req: Request, res: Response) => {
    const week = Number(req.params.week);

    try {
      const season = await resolveStatsSeason(req.query.season);
      const cleaned = await getWeekRows(week, season);
      res.json(cleaned);
    } catch (err) {
      console.error(`❌ Failed to load week ${week} stats:`, err);
      res.status(500).json({ error: `Failed to load week ${week} stats` });
    }
  });

  // ===============================
  // All weeks combined (for chatbot)
  // ===============================
  router.get("/player-stats-all-weeks", async (req: Request, res: Response) => {
    try {
      const season = await resolveStatsSeason(req.query.season);
      const combined = await getSeasonRows(season);
      console.log(`✅ All weeks combined (${season}, weeks ${STATS_MIN_WEEK}-${STATS_MAX_WEEK}):`, combined.length, "rows");
      res.json(combined);
    } catch (err) {
      console.error("❌ Failed to load all weeks:", err);
      res.status(500).json({ error: "Failed to load all weeks" });
    }
  });

  // ===============================
  // League-wide news with cover images (trades, injuries, returns first)
  // ===============================
  router.get("/league-news", async (req: Request, res: Response) => {
    try {
      const limit = Math.min(40, Math.max(1, Number(req.query.limit) || 20));
      res.set("Cache-Control", "public, max-age=300");
      const news = await getLeagueNews(limit);
      res.json({ source: "espn", articles: news.top, pool: news.pool, fetchedAt: news.fetchedAt });
    } catch (err) {
      console.error("❌ League news failed:", err);
      res.status(502).json({ error: "League news unavailable" });
    }
  });

  // ===============================
  // Live scoreboard: current points, projected finals and win odds
  // ===============================
  router.post("/live-matchup", async (req: Request, res: Response) => {
    const { leagueId, rosterId, week } = (req.body ?? {}) as { leagueId?: string; rosterId?: number; week?: number };
    if (!leagueId || rosterId === undefined) {
      return res.status(400).json({ error: "leagueId and rosterId are required" });
    }
    try {
      res.json(await getLiveScoreboard(String(leagueId), Number(rosterId), week));
    } catch (err: any) {
      console.error("❌ Live matchup failed:", err);
      res.status(500).json({ error: err?.message || "Failed to load live matchup" });
    }
  });

  // ===============================
  // Cover images for news articles that don't have one
  // ===============================
  router.post("/article-images", async (req: Request, res: Response) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    try {
      res.json({ images: await imagesForArticles(items.map((i: any) => ({ link: String(i?.link ?? ""), player: i?.player ?? null }))) });
    } catch (err: any) {
      console.error("❌ Article images failed:", err);
      res.status(500).json({ error: "Failed to load article images" });
    }
  });

  // ===============================
  // Trade grader: every team's roster (to pick players) plus any pending offers from Sleeper
  // ===============================
  router.post("/league-teams", async (req: Request, res: Response) => {
    const { leagueId, rosterId, ownerId } = (req.body ?? {}) as { leagueId?: string; rosterId?: number; ownerId?: string };
    if (!leagueId) return res.status(400).json({ error: "leagueId is required" });
    try {
      const ctx = await getLeagueContext(String(leagueId), rosterId, ownerId);
      if (!ctx.me) return res.status(404).json({ error: "Your team was not found in this league." });
      await addPlayoffSchedules(ctx);
      const state = await getNflState().catch(() => null);
      const week = Number(state?.week) || 1;
      const transactions = (
        await Promise.all([week, week - 1].filter(w => w >= 1).map(w => getTransactions(String(leagueId), w).catch(() => [])))
      ).flat();
      const teamOf = (rid: number) => ctx.teams.find(t => t.rosterId === rid);
      const offers = pendingTradesFor(transactions, ctx.me.rosterId, ctx.me.ownerId).flatMap(t => {
        const partner = teamOf(t.partnerRosterId);
        if (!partner) return [];
        const give = ctx.me!.players.filter(p => t.give.includes(p.id));
        const get = partner.players.filter(p => t.get.includes(p.id));
        return [{ ...t, partnerName: partner.teamName, result: gradeTrade(ctx.me!, partner, give, get, ctx.slots) }];
      });
      res.json({
        myRosterId: ctx.me.rosterId,
        teams: ctx.teams.map(t => ({ rosterId: t.rosterId, teamName: t.teamName, players: t.players })),
        offers,
      });
    } catch (err: any) {
      console.error("❌ League teams failed:", err);
      res.status(500).json({ error: err?.message || "Failed to load league teams" });
    }
  });

  // Pending trade offers involving your team, each graded (with counter-offers when it's bad).
  router.post("/trade-offers", async (req: Request, res: Response) => {
    const { leagueId, rosterId, ownerId } = (req.body ?? {}) as { leagueId?: string; rosterId?: number; ownerId?: string };
    if (!leagueId) return res.status(400).json({ error: "leagueId is required" });
    try {
      const ctx = await getLeagueContext(String(leagueId), rosterId, ownerId);
      if (!ctx.me) return res.status(404).json({ error: "Your team was not found in this league." });
      const state = await getNflState().catch(() => null);
      const week = Number(state?.week) || 1;
      // Offers are filed under the week they were made; look at this week, last week and next.
      const weeks = [week - 1, week, week + 1].filter(w => w >= 1);
      const transactions = (await Promise.all(weeks.map(w => getTransactions(String(leagueId), w).catch(() => [])))).flat();
      // What Sleeper returned, so the app can show what was checked when no offer appears.
      const trades = transactions.filter((t: any) => t?.type === "trade");
      const statuses: Record<string, number> = {};
      trades.forEach((t: any) => (statuses[String(t?.status ?? "unknown")] = (statuses[String(t?.status ?? "unknown")] ?? 0) + 1));
      const mineCount = trades.filter((t: any) => (t?.roster_ids ?? []).map(Number).includes(ctx.me!.rosterId)).length;
      const checked = { weeks, transactions: transactions.length, trades: trades.length, statuses, involvingYou: mineCount };
      const pending = pendingTradesFor(transactions, ctx.me.rosterId, ctx.me.ownerId);
      if (pending.length) await addPlayoffSchedules(ctx);
      const offers = pending.flatMap(t => {
        const partner = ctx.teams.find(x => x.rosterId === t.partnerRosterId);
        if (!partner) return [];
        const give = ctx.me!.players.filter(p => t.give.includes(p.id));
        const get = partner.players.filter(p => t.get.includes(p.id));
        return [{ ...t, partnerName: partner.teamName, result: gradeTrade(ctx.me!, partner, give, get, ctx.slots) }];
      });
      res.json({ checkedAt: new Date().toISOString(), offers, checked });
    } catch (err: any) {
      console.error("❌ Trade offers failed:", err);
      res.status(500).json({ error: err?.message || "Failed to load trade offers" });
    }
  });

  // League activity: completed trades and roster moves by every manager, newest first.
  router.get("/league-moves", async (req: Request, res: Response) => {
    const leagueId = String(req.query.leagueId ?? "");
    if (!leagueId) return res.status(400).json({ error: "leagueId is required" });
    try {
      const myRosterId = req.query.rosterId !== undefined ? Number(req.query.rosterId) : null;
      const [state, users, rosters, players] = await Promise.all([
        getNflState().catch(() => null),
        getLeagueUsers(leagueId).catch(() => []),
        getRosters(leagueId).catch(() => []),
        getAllPlayers().catch(() => ({} as Record<string, any>)),
      ]);
      const week = Number(state?.week) || 1;
      const weeks = [week - 1, week].filter(w => w >= 1);
      const transactions = (await Promise.all(weeks.map(w => getTransactions(leagueId, w).catch(() => [])))).flat();
      const userById = new Map<string, any>((users ?? []).map((u: any) => [String(u.user_id), u]));
      const teamNames: Record<number, string> = {};
      for (const r of rosters ?? []) {
        const u = userById.get(String(r.owner_id));
        teamNames[Number(r.roster_id)] = String(u?.metadata?.team_name || u?.display_name || `Team ${r.roster_id}`);
      }
      res.json({ weeks, moves: describeMoves(transactions, teamNames, players, myRosterId).slice(0, 40) });
    } catch (err: any) {
      console.error("❌ League moves failed:", err);
      res.status(500).json({ error: err?.message || "Failed to load league moves" });
    }
  });

  // Waiver advice for a free agent: a FAAB bid (FAAB leagues) or whether to use your waiver
  // priority on him (rolling / reverse-standings leagues).
  router.post("/waiver-advice", async (req: Request, res: Response) => {
    const { leagueId, rosterId, ownerId, playerId } = (req.body ?? {}) as { leagueId?: string; rosterId?: number; ownerId?: string; playerId?: string };
    if (!leagueId || !playerId) return res.status(400).json({ error: "leagueId and playerId are required" });
    try {
      const ctx = await getLeagueContext(String(leagueId), rosterId, ownerId);
      if (!ctx.me) return res.status(404).json({ error: "Your team was not found in this league." });
      res.json(await buildWaiverAdvice(ctx, String(leagueId), String(playerId)));
    } catch (err: any) {
      console.error("❌ Waiver advice failed:", err);
      res.status(500).json({ error: err?.message || "Failed to build waiver advice" });
    }
  });

  // Latest analysis on a player: RotoWire notes and ESPN fantasy columns (via ESPN's public feed).
  router.get("/player-notes", async (req: Request, res: Response) => {
    const id = String(req.query.id ?? "");
    let name = String(req.query.name ?? "");
    let team = String(req.query.team ?? "");
    try {
      let espnId: string | null = null;
      if (id) {
        const players = await getAllPlayers().catch(() => ({} as Record<string, any>));
        const p = players[id];
        espnId = p?.espn_id ? String(p.espn_id) : null;
        name = name || p?.full_name || "";
        team = team || p?.team || "";
      }
      if (!name && !espnId) return res.status(400).json({ error: "id or name is required" });
      res.json(await getPlayerNotes({ espnId, name, team }));
    } catch (err: any) {
      console.error("❌ Player notes failed:", err);
      res.status(500).json({ error: err?.message || "Failed to load player notes" });
    }
  });

  // Fantasy ranks this season (overall and at each position) with the league's scoring.
  router.get("/player-ranks", async (req: Request, res: Response) => {
    try {
      const leagueId = String(req.query.leagueId ?? "");
      const league = leagueId ? await getLeague(leagueId).catch(() => null) : null;
      const state = await getNflState().catch(() => null);
      const season = Number(req.query.season) || Number(league?.season) || Number(state?.season) || new Date().getFullYear();
      const ranks = await getPlayerRanks(season, league?.scoring_settings ?? null);
      // source: which Sleeper endpoint answered ("none" = Sleeper returned nothing; see backend log)
      res.json({ season, scoring: league?.scoring_settings ? "league" : "ppr", ranks, source: lastSource.seasonStats ?? null });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Ranks unavailable" });
    }
  });

  // A trade proposal for one player on another team (from Home's trending list).
  router.post("/trade-for", async (req: Request, res: Response) => {
    const { leagueId, rosterId, ownerId, playerId } = (req.body ?? {}) as { leagueId?: string; rosterId?: number; ownerId?: string; playerId?: string };
    if (!leagueId || !playerId) return res.status(400).json({ error: "leagueId and playerId are required" });
    try {
      const ctx = await getLeagueContext(String(leagueId), rosterId, ownerId);
      if (!ctx.me) return res.status(404).json({ error: "Your team was not found in this league." });
      const owner = ctx.teams.find(t => t.players.some(p => p.id === String(playerId)));
      if (!owner) return res.json({ owner: null, ideas: [] });
      if (owner.rosterId === ctx.me.rosterId) return res.json({ owner: owner.teamName, mine: true, ideas: [] });
      await addPlayoffSchedules(ctx);
      res.json({ owner: owner.teamName, ideas: tradeForPlayer(ctx.me, owner, String(playerId), ctx.slots) });
    } catch (err: any) {
      console.error("❌ Trade-for failed:", err);
      res.status(500).json({ error: err?.message || "Failed to build a trade" });
    }
  });

  router.post("/grade-trade", async (req: Request, res: Response) => {
    const { leagueId, rosterId, ownerId, partnerRosterId, give, get, mode } = (req.body ?? {}) as {
      leagueId?: string; rosterId?: number; ownerId?: string; partnerRosterId?: number; give?: string[]; get?: string[];
      // "send": a trade you built (should you send it, or edit it?); otherwise an offer you got
      mode?: "send" | "receive";
    };
    if (!leagueId || partnerRosterId === undefined) return res.status(400).json({ error: "leagueId and partnerRosterId are required" });
    try {
      const ctx = await getLeagueContext(String(leagueId), rosterId, ownerId);
      if (!ctx.me) return res.status(404).json({ error: "Your team was not found in this league." });
      const partner = ctx.teams.find(t => t.rosterId === Number(partnerRosterId));
      if (!partner) return res.status(404).json({ error: "That team wasn't found in this league." });
      await addPlayoffSchedules(ctx);
      const giveIds = (give ?? []).map(String);
      const getIds = (get ?? []).map(String);
      const givePlayers = ctx.me.players.filter(p => giveIds.includes(p.id));
      const getPlayers = partner.players.filter(p => getIds.includes(p.id));
      if (givePlayers.length === 0 && getPlayers.length === 0) return res.status(400).json({ error: "Pick at least one player." });
      res.json(
        mode === "send"
          ? gradeProposal(ctx.me, partner, givePlayers, getPlayers, ctx.slots)
          : gradeTrade(ctx.me, partner, givePlayers, getPlayers, ctx.slots)
      );
    } catch (err: any) {
      console.error("❌ Grade trade failed:", err);
      res.status(500).json({ error: err?.message || "Failed to grade trade" });
    }
  });

  // ===============================
  // Lineup check: your set lineup vs the best lineup this week, and kickoff times
  // ===============================
  router.post("/lineup-check", async (req: Request, res: Response) => {
    const { leagueId, rosterId, ownerId } = (req.body ?? {}) as { leagueId?: string; rosterId?: number; ownerId?: string };
    if (!leagueId) return res.status(400).json({ error: "leagueId is required" });
    try {
      res.json(await getLineupCheck(String(leagueId), rosterId, ownerId));
    } catch (err: any) {
      console.error("❌ Lineup check failed:", err);
      res.status(500).json({ error: err?.message || "Failed to check lineup" });
    }
  });

  // ===============================
  // Help assistant: answers "how do I…" questions about the app from the guide topics the app
  // sends (the app picks the relevant ones), so answers stay accurate to how the app works.
  // ===============================
  router.post("/app-help", async (req: Request, res: Response) => {
    const { question, topics } = (req.body ?? {}) as { question?: string; topics?: { title?: string; answer?: string }[] };
    if (!question?.trim()) return res.status(400).json({ error: "question is required" });
    const guide = (Array.isArray(topics) ? topics : [])
      .slice(0, 4)
      .map(t => `## ${String(t.title ?? "").slice(0, 120)}\n${String(t.answer ?? "").slice(0, 1200)}`)
      .join("\n\n");
    const prompt = `You are the help assistant inside the Fantasy Football Helper app (a companion app for Sleeper fantasy football leagues).
Answer the user's question about how to use the app in 2-5 short sentences, using ONLY the guide below. Give exact taps/screens.
If the guide doesn't cover it, say you're not sure and suggest the closest feature. Don't give fantasy advice here.

GUIDE
${guide || "(no matching topics)"}

QUESTION
${question.trim().slice(0, 500)}

ANSWER:`;
    try {
      const reply = await generateWithLLM(prompt);
      res.json({ reply: reply?.trim() || null });
    } catch {
      res.json({ reply: null }); // the app shows the guide text instead
    }
  });

  // ===============================
  // Actual fantasy points for named players in a finished week (grades the AI's start/sit calls)
  // ===============================
  router.post("/player-week-points", async (req: Request, res: Response) => {
    const { season, week, names } = (req.body ?? {}) as { season?: number; week?: number; names?: string[] };
    if (!season || !week || !Array.isArray(names)) return res.status(400).json({ error: "season, week and names are required" });
    try {
      const rows = await getWeekRows(Number(week), Number(season));
      const points: Record<string, number | null> = {};
      for (const name of names.slice(0, 40)) {
        const key = normalizePlayerName(name);
        const row = rows.find(r => normalizePlayerName(r.player_name) === key);
        // A player who didn't play scored 0; a missing row means the week isn't published yet.
        points[name] = row ? Number(row.fantasy_points_ppr) || 0 : rows.length ? 0 : null;
      }
      res.json({ points });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to load points" });
    }
  });

  // ===============================
  // IR advice: who to move to an IR slot on Sleeper and who to pick up
  // ===============================
  router.post("/ir-advice", async (req: Request, res: Response) => {
    const { leagueId, rosterId, ownerId } = (req.body ?? {}) as { leagueId?: string; rosterId?: number; ownerId?: string };
    if (!leagueId) return res.status(400).json({ error: "leagueId is required" });
    try {
      const [ctx, rosters] = await Promise.all([getLeagueContext(String(leagueId), rosterId, ownerId), getRosters(String(leagueId))]);
      if (!ctx.me) return res.status(404).json({ error: "Your team was not found in this league." });
      const roster = (rosters ?? []).find((r: any) => Number(r.roster_id) === ctx.me!.rosterId) ?? {};
      // Make sure players sitting in IR slots are included even if Sleeper lists them separately.
      const known = new Set(ctx.me.players.map(p => p.id));
      const reserveOnly = (roster.reserve ?? [])
        .map(String)
        .filter((id: string) => !known.has(id))
        .map((id: string) => toTradePlayer(id, ctx.players[id] ?? { player_id: id }, ctx.values.index));
      res.json(
        buildIrAdvice({
          settings: ctx.league?.settings,
          roster,
          myPlayers: [...ctx.me.players, ...reserveOnly],
          freeAgents: ctx.freeAgents,
          slots: ctx.slots,
          rosterPositions: ctx.league?.roster_positions,
        })
      );
    } catch (err: any) {
      console.error("❌ IR advice failed:", err);
      res.status(500).json({ error: err?.message || "Failed to build IR advice" });
    }
  });

  // ===============================
  // Trade Agent: trade ideas for the user's team
  // ===============================
  router.post("/trade-ideas", async (req: Request, res: Response) => {
    const { leagueId, rosterId, ownerId, untouchable } = (req.body ?? {}) as {
      leagueId?: string;
      rosterId?: number;
      ownerId?: string;
      untouchable?: string[];
    };
    if (!leagueId) {
      return res.status(400).json({ error: "leagueId is required" });
    }

    try {
      const ctx = await getLeagueContext(String(leagueId), rosterId, ownerId);
      if (!ctx.me) {
        return res.status(404).json({ error: "Your team was not found in this league." });
      }
      await addPlayoffSchedules(ctx);
      const others = ctx.teams.filter(t => t.rosterId !== ctx.me!.rosterId);
      const ideas = generateTradeIdeas(ctx.me, others, ctx.slots, {
        maxIdeas: 6,
        perPartner: 2,
        untouchable: Array.isArray(untouchable) ? untouchable.map(String) : [],
      }).map(idea => {
        const note = playoffTradeNote(idea.give, idea.get);
        return note ? { ...idea, reasons: [...idea.reasons, note] } : idea;
      });
      res.json({
        generatedAt: new Date().toISOString(),
        season: ctx.values.season,
        leagueId: String(leagueId),
        ideas,
      });
    } catch (err) {
      console.error("❌ Trade ideas failed:", err);
      res.status(500).json({ error: "Failed to generate trade ideas" });
    }
  });

  // ===============================
  // Fantasy Chatbot Endpoint
  // ===============================
  router.post("/fantasy-chat", async (req: Request, res: Response) => {
    console.log("➡️ /fantasy-chat hit");

    const { message, selectedWeek, myTeam, stream } = req.body as {
      message: string;
      selectedWeek?: number;
      myTeam?: MyTeamPayload | null;
      stream?: boolean;
    };
    const FALLBACK_NOTE = "\n\n(AI explanation unavailable — showing the computed answer.)";

    // Send the model's answer. With stream: true the text is written as it's generated
    // (plain text), so the app can show words immediately instead of waiting for the end.
    // `prefix` is computed text shown before the model's words (e.g. the whole lineup).
    const answer = async (prompt: string, fallback = "", errorReply = "⚠️ AI returned an error.", prefix = "") => {
      if (!stream) {
        try {
          const text = await generateWithLLM(prompt);
          return res.json({ reply: prefix + (text || fallback || "⚠️ AI returned no text.") });
        } catch (err) {
          console.error("❌ Ollama error:", err);
          if (prefix) return res.json({ reply: prefix + fallback + FALLBACK_NOTE });
          return fallback ? res.json({ reply: fallback + FALLBACK_NOTE }) : res.status(500).json({ reply: errorReply });
        }
      }
      res.status(200);
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("X-Accel-Buffering", "no");
      let wrote = false;
      if (prefix) res.write(prefix);
      try {
        const full = await streamWithLLM(prompt, piece => {
          wrote = true;
          res.write(piece);
        });
        if (!full) res.write(fallback || (prefix ? "" : "⚠️ AI returned no text."));
      } catch (err) {
        console.error("❌ Ollama stream error:", err);
        if (!wrote) res.write(fallback ? fallback + FALLBACK_NOTE : prefix ? FALLBACK_NOTE.trim() : errorReply);
      }
      res.end();
    };
    if (!message || message.trim() === "") {
      return res.status(400).json({ reply: "⚠️ No question provided." });
    }

    try {
      const season = await resolveStatsSeason();
      const [playerStats] = await Promise.all([getSeasonRows(season), ensureInjuriesLoaded()]);

      const currentWeek = resolveAnalysisWeek(playerStats, selectedWeek);
      const seasonYear = season;

      console.log(`📅 Fantasy matchup week: ${currentWeek} (${seasonYear})`);
      console.log("📦 Backend fetched stats:", playerStats.length);

      const intent = detectIntent(message);
      let mentionedPlayers = extractAllPlayers(message, playerStats);
      const requestedPosition = inferRequestedPosition(message);
      console.log(`🧭 Intent: ${intent}`);

      // Lineup-wide, waiver, trade, draft and general questions use the league-aware advisor.
      // Start/sit questions about specific players or one position keep the detailed flow below.
      const wholeLineup = intent === "start_sit" && mentionedPlayers.length === 0 && !requestedPosition;
      const useAdvisor =
        intent === "waiver" ||
        intent === "trade" ||
        intent === "draft" ||
        wholeLineup ||
        (intent === "general" && mentionedPlayers.length === 0 && !requestedPosition);

      const advisor: AdvisorResult | null = useAdvisor
        ? await handleAdvisorQuestion(intent, message, myTeam ?? null, { wholeLineup }).catch((err): AdvisorResult => {
            console.error("❌ Advisor failed:", err);
            return { reply: "⚠️ I couldn't load your league data from Sleeper. Please try again in a minute.", fallback: "" };
          })
        : null;

      if (advisor) {
        if (advisor.reply) return res.json({ reply: advisor.reply });
        return answer(advisor.prompt ?? "", advisor.fallback, undefined, advisor.prefix ?? "");
      }

      const opponentMap = await fetchOpponentMap(seasonYear, currentWeek).catch(err => {
        console.warn("⚠️ Could not load opponents:", err);
        return new Map<string, { opponentAbbreviation: string; opponentTeam: string }>();
      });

      let usedRosterInference = false;

      if (mentionedPlayers.length === 0) {
        mentionedPlayers = inferPlayersFromMyTeam(message, myTeam ?? null, playerStats);
        if (mentionedPlayers.length > 0) {
          usedRosterInference = true;
          console.log("🤖 Using saved roster context for players:", mentionedPlayers);
        }
      }

      if (mentionedPlayers.length === 0) {
        return res.json({
          reply:
            "⚠️ I couldn't identify players from your question. Set your team in Fantasy and ask by position (for example: 'which qb should I start?') or mention player names.",
        });
      }

      console.log(`🔍 Detected ${mentionedPlayers.length} player(s):`, mentionedPlayers);

      // "Start A or B?" only makes sense when they can play the same lineup spot.
      if (intent === "start_sit" && mentionedPlayers.length === 2 && !usedRosterInference) {
        const [a, b] = mentionedPlayers;
        const reply = incompatibleStartSitReply(
          { name: a.name, position: String(a.position) },
          { name: b.name, position: String(b.position) },
          myTeam?.rosterPositions,
          myTeam?.players ?? []
        );
        if (reply) return res.json({ reply });
      }

      const playerContexts: {
        name: string;
        position: Position;
        ctx: any;
      }[] = [];
      let analysisBlock = "";

      for (const player of mentionedPlayers) {
        const weeks = getPlayerWeeks(player.name, player.position, playerStats);
        const builder = getContextBuilder(player.position);
        const ctx = builder(weeks);

        if ("error" in ctx) {
          analysisBlock += `\n${player.name.toUpperCase()} (${player.position})\nData: Not available\n`;
          continue;
        }

        playerContexts.push({
          name: player.name,
          position: player.position,
          ctx,
        });

        const getAnalysisBuilders: { [key in Position]: any } = {
          QB: buildQBAnalysisBlock,
          WR: buildWRAnalysisBlock,
          TE: buildTEAnalysisBlock,
          RB: buildRBAnalysisBlock,
          DEF: buildDEFAnalysisBlock,
          K: buildKAnalysisBlock,
        };

        const builder_fn = getAnalysisBuilders[player.position];
        const opponentDefense =
          player.position === "QB"
            ? buildOpponentDefenseContext(player.name, playerStats, currentWeek, opponentMap)
            : null;
        const block = builder_fn(
          player.name,
          ctx,
          playerStats,
          currentWeek,
          opponentDefense
        );
        // Opponent defense ranks, game-time weather and injuries on both teams.
        const matchup = await buildMatchupContext({
          playerName: player.name,
          position: player.position,
          team: getPlayerTeam(player.name, player.position, playerStats),
          season: seasonYear,
          week: currentWeek,
          statsRows: playerStats,
        }).catch(err => {
          console.warn("⚠️ Matchup context failed:", err?.message ?? err);
          return null;
        });
        // Floor and ceiling from his game log (safe vs boom/bust).
        const range = pointRange(playedPoints(weeks));
        analysisBlock +=
          block +
          `Weekly range:         ${range.summary}\n` +
          formatMatchupBlock(player.position, matchup, currentWeek);
      }

      let comparisonBlock = "";
      if (playerContexts.length >= 2) {
        const position = playerContexts[0].position;
        const samePosition = playerContexts.filter(p => p.position === position);

        if (samePosition.length === 2) {
          const [playerA, playerB] = samePosition;

          const statConfigs: {
            key: string;
            label: string;
            dataSource?: "last3Summary" | "season";
            higherIsBetter?: boolean;
          }[] =
            position === "QB"
              ? [
                  {
                    key: "avgPassYards",
                    label: "Avg Pass Yards",
                    dataSource: "last3Summary",
                  },
                  {
                    key: "avgRushYards",
                    label: "Avg Rush Yards",
                    dataSource: "last3Summary",
                  },
                  {
                    key: "tdIntRatio",
                    label: "TD:INT Ratio (Last 3)",
                    dataSource: "last3Summary",
                  },
                  {
                    key: "avgFantasyPts",
                    label: "Avg Fantasy Pts",
                    dataSource: "last3Summary",
                  },
                  { key: "tdIntRatio", label: "Season TD:INT Ratio" },
                  { key: "consistencyScore", label: "Consistency Score" },
                ]
              : position === "K"
              ? [
                  {
                    key: "avgFantasyPts",
                    label: "Avg Fantasy Pts",
                    dataSource: "last3Summary",
                  },
                  {
                    key: "avgFGMade",
                    label: "Avg FG Made",
                    dataSource: "last3Summary",
                  },
                  {
                    key: "avgPATMade",
                    label: "Avg PAT Made",
                    dataSource: "last3Summary",
                  },
                  {
                    key: "fgPct",
                    label: "FG Accuracy %",
                    dataSource: "last3Summary",
                  },
                  { key: "consistencyScore", label: "Consistency Score" },
                ]
              : position === "DEF"
              ? [
                  {
                    key: "avgFantasyPts",
                    label: "Avg Fantasy Pts",
                    dataSource: "last3Summary",
                  },
                  {
                    key: "avgSacks",
                    label: "Avg Sacks",
                    dataSource: "last3Summary",
                  },
                  {
                    key: "avgInterceptions",
                    label: "Avg Interceptions",
                    dataSource: "last3Summary",
                  },
                  {
                    key: "avgDefTD",
                    label: "Avg Defensive TD",
                    dataSource: "last3Summary",
                  },
                  {
                    key: "avgTotalYardsAllowed",
                    label: "Avg Yards Allowed",
                    dataSource: "last3Summary",
                    higherIsBetter: false,
                  },
                  { key: "consistencyScore", label: "Consistency Score" },
                ]
              : [
                  {
                    key: "avgFantasyPts",
                    label: "Avg Fantasy Pts",
                    dataSource: "last3Summary",
                  },
                  {
                    key: "avgReceivingYards",
                    label: "Avg Receiving Yds",
                    dataSource: "last3Summary",
                  },
                  {
                    key: "avgReceivingTD",
                    label: "Avg TD",
                    dataSource: "last3Summary",
                  },
                  {
                    key: "avgReceptions",
                    label: "Avg Receptions",
                    dataSource: "last3Summary",
                  },
                  { key: "consistencyScore", label: "Consistency Score" },
                ];

          const comparisons = comparePlayerStats(playerA, playerB, statConfigs);
          comparisonBlock = formatComparisonBlock(playerA, playerB, comparisons);
        }
      }

      console.log("📊 Player Analysis Block:\n", analysisBlock);

      const mainPosition =
        playerContexts.length > 0 ? playerContexts[0].position : "QB";
      const playerNames = playerContexts.map(p => p.name);
      const startCount = getRosterStartCount(mainPosition, myTeam ?? null, playerNames.length);

      let responseFormat =
        mainPosition === "QB"
          ? buildQBResponseFormat(playerNames)
          : buildSkillPositionResponseFormat(mainPosition, playerNames);

      if (usedRosterInference && requestedPosition && playerNames.length > 0) {
        responseFormat = buildRosterDecisionResponseFormat(mainPosition, playerNames, startCount);
      }

      const questionWithRosterInstruction =
        usedRosterInference && requestedPosition
          ? `${message}\n\nRoster Decision Requirement: Compare ALL listed ${requestedPosition} candidates and choose exactly ${startCount} starter(s).`
          : message;

      const prompt = buildAnalysisPrompt({
        playerData: analysisBlock,
        comparisons: comparisonBlock,
        userQuestion: questionWithRosterInstruction,
        responseFormat: responseFormat,
        positions: [mainPosition],
      });

      console.log("🤖 Calling Ollama...");

      return answer(prompt);
    } catch (err) {
      console.error("❌ Backend error:", err);
      if (res.headersSent) return res.end();
      res.status(500).json({
        reply: "⚠️ Backend crashed while processing request.",
      });
    }
  });
}
