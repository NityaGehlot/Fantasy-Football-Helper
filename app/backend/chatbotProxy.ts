// app/backend/chatbotProxy.ts

import express from "express";
import cors from "cors";
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

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const PORT = 4000;
const STATS_MIN_WEEK = 1;
const STATS_MAX_WEEK = 22;
const STATS_BASE_URL =
  "https://raw.githubusercontent.com/NityaGehlot/nfl-data/main/data/2025%20stats";

function getWeekStatsFileName(week: number): string {
  return `player_stats_2025_week${String(week).padStart(2, "0")}.json`;
}

function getWeekStatsUrl(week: number): string {
  return `${STATS_BASE_URL}/${getWeekStatsFileName(week)}`;
}

function normalizeWeekStats(raw: any): any[] {
  const rows = Array.isArray(raw) ? raw : (Object.values(raw ?? {}).flat() as any[]);

  return rows.map((player: any) => ({
    ...player,
    week: Number(String(player.week).trim()),
    fantasy_points_ppr: Number(player.fantasy_points_ppr) || 0,
    passing_yards: Number(player.passing_yards) || 0,
    passing_tds: Number(player.passing_tds) || 0,
    passing_interceptions: Number(player.passing_interceptions) || 0,
    rushing_yards: Number(player.rushing_yards) || 0,
    rushing_tds: Number(player.rushing_tds) || 0,
  }));
}

async function readWeekStatsFromSource(week: number): Promise<any[]> {
  if (!Number.isFinite(week) || week < STATS_MIN_WEEK || week > STATS_MAX_WEEK) {
    throw new Error(`Week must be between ${STATS_MIN_WEEK} and ${STATS_MAX_WEEK}`);
  }

  const response = await fetch(getWeekStatsUrl(week));
  if (!response.ok) {
    throw new Error(`Failed to fetch stats for week ${week}`);
  }

  const parsed = await response.json();
  return normalizeWeekStats(parsed);
}

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
// Shared Utilities
// ===============================

/**
 * Returns the current fantasy week, capped at 22
 */
function getCurrentFantasyWeek(playerStats: any[]): number {
  const MAX_WEEK = STATS_MAX_WEEK;
  const weeksWithData = playerStats
    .filter(p => Number(p.fantasy_points_ppr) > 0 && Number(p.week) <= MAX_WEEK)
    .map(p => Number(p.week));

  if (weeksWithData.length === 0) return 1;
  const latestWeekWithData = Math.max(...weeksWithData);
  return Math.min(latestWeekWithData, MAX_WEEK);
}

function getSeasonYear(playerStats: any[]): number {
  const seasons = playerStats
    .map(p => Number(p.season))
    .filter(year => Number.isFinite(year) && year > 0);

  return seasons.length > 0 ? Math.max(...seasons) : 2025;
}

function resolveAnalysisWeek(playerStats: any[], requestedWeek?: number): number {
  const MAX_WEEK = STATS_MAX_WEEK;

  if (Number.isFinite(requestedWeek) && Number(requestedWeek) > 0) {
    return Math.min(Number(requestedWeek), MAX_WEEK);
  }

  return getCurrentFantasyWeek(playerStats);
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

  const configured = myTeam?.starterSlotsByPosition?.[position];
  const rawCount = Number.isFinite(configured) && Number(configured) > 0
    ? Number(configured)
    : defaults[position];

  return Math.max(1, Math.min(rawCount, candidateCount));
}

async function fetchOpponentMap(
  seasonYear: number,
  week: number
): Promise<Map<string, { opponentAbbreviation: string; opponentTeam: string }>> {
  const scheduleUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${seasonYear}&seasontype=2&week=${week}`;
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
// ROUTES
// ===============================

// ===============================
// Per-week stats endpoint
// ===============================
app.get("/player-stats-week/:week", async (req, res) => {
  const week = Number(req.params.week);

  try {
    const cleaned = await readWeekStatsFromSource(week);
    res.json(cleaned);
  } catch (err) {
    console.error(`❌ Failed to load week ${week} stats:`, err);
    res.status(500).json({ error: `Failed to load week ${week} stats` });
  }
});

// ===============================
// All weeks combined (for chatbot)
// ===============================
app.get("/player-stats-all-weeks", async (req, res) => {
  try {
    const weekNumbers = Array.from(
      { length: STATS_MAX_WEEK - STATS_MIN_WEEK + 1 },
      (_, i) => STATS_MIN_WEEK + i
    );

    const allDataSettled = await Promise.allSettled(
      weekNumbers.map((week) => readWeekStatsFromSource(week))
    );

    const combined: any[] = [];

    allDataSettled.forEach((result, idx) => {
      if (result.status === "fulfilled") {
        combined.push(...result.value);
      } else {
        console.warn(
          `⚠️ Missing or invalid stats file for week ${weekNumbers[idx]} (${getWeekStatsFileName(weekNumbers[idx])})`
        );
      }
    });

    console.log("✅ All weeks combined (weeks 1-22):", combined.length, "rows");
    res.json(combined);
  } catch (err) {
    console.error("❌ Failed to load all weeks:", err);
    res.status(500).json({ error: "Failed to load all weeks" });
  }
});

// ===============================
// Fantasy Chatbot Endpoint
// ===============================

app.post("/fantasy-chat", async (req, res) => {
  console.log("➡️ /fantasy-chat hit");

  const { message, selectedWeek, myTeam } = req.body as {
    message: string;
    selectedWeek?: number;
    myTeam?: MyTeamPayload | null;
  };
  if (!message || message.trim() === "") {
    return res.status(400).json({ reply: "⚠️ No question provided." });
  }

  try {
    // Fetch all player stats
    const statsResponse = await fetch("http://127.0.0.1:4000/player-stats-all-weeks");
    if (!statsResponse.ok) throw new Error("Failed to fetch player stats");
    const playerStats = (await statsResponse.json()) as any[];

    const currentWeek = resolveAnalysisWeek(playerStats, selectedWeek);
    const seasonYear = getSeasonYear(playerStats);
    const opponentMap = await fetchOpponentMap(seasonYear, currentWeek);

    console.log(`📅 Fantasy matchup week: ${currentWeek}`);
    console.log("📦 Backend fetched stats:", playerStats.length);

    // Extract all mentioned players and their positions
    let mentionedPlayers = extractAllPlayers(message, playerStats);
    const requestedPosition = inferRequestedPosition(message);
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

    // Build contexts for all detected players
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

      // Build position-specific analysis block
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

    // Build comparisons if multiple players of same position
    let comparisonBlock = "";
    if (playerContexts.length >= 2) {
      const position = playerContexts[0].position;
      const samePosition = playerContexts.filter(p => p.position === position);

      if (samePosition.length === 2) {
        const [playerA, playerB] = samePosition;

        // Define stat comparisons based on position
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

    // Determine response format based on position
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

    const ollamaResponse = await fetch("http://127.0.0.1:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "mistral:latest",
        prompt,
        stream: false,
        temperature: 0.6,
      }),
    });

    if (!ollamaResponse.ok) {
      console.error("❌ Ollama error:", await ollamaResponse.text());
      return res.status(500).json({ reply: "⚠️ AI returned an error." });
    }

    const data = (await ollamaResponse.json()) as { response?: string };
    res.json({ reply: data.response ?? "⚠️ AI returned no text." });
  } catch (err) {
    console.error("❌ Backend error:", err);
    res.status(500).json({
      reply: "⚠️ Backend crashed while processing request.",
    });
  }
});

app.listen(PORT, () =>
  console.log(`🚀 Backend running at http://localhost:${PORT}`)
);