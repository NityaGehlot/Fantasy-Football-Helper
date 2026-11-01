// app/backend/routes.ts
import { Router, Request, Response } from "express";
import fetch from "node-fetch";

// Import utilities
import {
  extractPlayerNames,
  extractAllPlayers,
  getPlayerWeeks,
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
import { handleAdvisorQuestion, AdvisorResult } from "./services/advisor";
import { generateWithLLM, streamWithLLM } from "./services/llm";
import { getLeagueContext } from "./services/leagueContext";
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
      res.json({ source: "espn", articles: await getLeagueNews(limit) });
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
      const others = ctx.teams.filter(t => t.rosterId !== ctx.me!.rosterId);
      const ideas = generateTradeIdeas(ctx.me, others, ctx.slots, {
        maxIdeas: 6,
        perPartner: 2,
        untouchable: Array.isArray(untouchable) ? untouchable.map(String) : [],
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
    const answer = async (prompt: string, fallback = "", errorReply = "⚠️ AI returned an error.") => {
      if (!stream) {
        try {
          const text = await generateWithLLM(prompt);
          return res.json({ reply: text || fallback || "⚠️ AI returned no text." });
        } catch (err) {
          console.error("❌ Ollama error:", err);
          return fallback ? res.json({ reply: fallback + FALLBACK_NOTE }) : res.status(500).json({ reply: errorReply });
        }
      }
      res.status(200);
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("X-Accel-Buffering", "no");
      let wrote = false;
      try {
        const full = await streamWithLLM(prompt, piece => {
          wrote = true;
          res.write(piece);
        });
        if (!full) res.write(fallback || "⚠️ AI returned no text.");
      } catch (err) {
        console.error("❌ Ollama stream error:", err);
        if (!wrote) res.write(fallback ? fallback + FALLBACK_NOTE : errorReply);
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
        return answer(advisor.prompt ?? "", advisor.fallback);
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
        analysisBlock += block;
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
