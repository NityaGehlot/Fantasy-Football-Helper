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
import { buildAnalysisPrompt, buildQBResponseFormat, buildSkillPositionResponseFormat } from "./services/promptBuilder";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const PORT = 4000;

// ===============================
// Shared Utilities
// ===============================

/**
 * Returns the current fantasy week, capped at 17
 */
function getCurrentFantasyWeek(playerStats: any[]): number {
  const MAX_WEEK = 17;
  const weeksWithData = playerStats
    .filter(p => Number(p.fantasy_points_ppr) > 0 && Number(p.week) <= MAX_WEEK)
    .map(p => Number(p.week));

  if (weeksWithData.length === 0) return 1;
  const latestWeekWithData = Math.max(...weeksWithData);
  return Math.min(latestWeekWithData, MAX_WEEK);
}

// ===============================
// ROUTES
// ===============================

// ===============================
// Per-week stats endpoint
// ===============================
app.get("/player-stats-week/:week", async (req, res) => {
  const week = Number(req.params.week);
  const weekStr = week < 10 ? `week ${week}` : `week${week}`;
  const url = `https://raw.githubusercontent.com/NityaGehlot/nfl-data/main/data/player_stats_2025_${weekStr}.json`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch week ${week}`);

    const raw = (await response.json()) as any;
    const data: any[] = Object.values(raw).flat();

    const cleaned = data.map((player) => ({
      ...player,
      week: Number(String(player.week).trim()),
      fantasy_points_ppr: Number(player.fantasy_points_ppr) || 0,
      passing_yards: Number(player.passing_yards) || 0,
      passing_tds: Number(player.passing_tds) || 0,
      passing_interceptions: Number(player.passing_interceptions) || 0,
      rushing_yards: Number(player.rushing_yards) || 0,
      rushing_tds: Number(player.rushing_tds) || 0,
    }));

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
    // ✅ Only fetch weeks 1-17 max
    const MAX_WEEK = 17;
    const weekNumbers = Array.from({ length: MAX_WEEK }, (_, i) => i + 1);

    const allData = await Promise.all(
      weekNumbers.map(async (week) => {
        const weekStr = week < 10 ? `week ${week}` : `week${week}`;
        const url = `https://raw.githubusercontent.com/NityaGehlot/nfl-data/main/data/player_stats_2025_${weekStr}.json`;
        try {
          const r = await fetch(url);
          if (!r.ok) return [];
          const raw = (await r.json()) as any;
          return (Object.values(raw).flat() as any[]).map((player: any) => ({
            ...player,
            week: Number(String(player.week).trim()),
            fantasy_points_ppr: Number(player.fantasy_points_ppr) || 0,
            passing_yards: Number(player.passing_yards) || 0,
            passing_tds: Number(player.passing_tds) || 0,
            passing_interceptions: Number(player.passing_interceptions) || 0,
            rushing_yards: Number(player.rushing_yards) || 0,
            rushing_tds: Number(player.rushing_tds) || 0,
          }));
        } catch {
          return [];
        }
      })
    );

    const combined = allData.flat();
    console.log("✅ All weeks combined (weeks 1-17):", combined.length, "rows");
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

  const { message } = req.body;
  if (!message || message.trim() === "") {
    return res.status(400).json({ reply: "⚠️ No question provided." });
  }

  try {
    // Fetch all player stats
    const statsResponse = await fetch("http://127.0.0.1:4000/player-stats-all-weeks");
    if (!statsResponse.ok) throw new Error("Failed to fetch player stats");
    const playerStats = (await statsResponse.json()) as any[];

    const currentWeek = getCurrentFantasyWeek(playerStats);
    console.log(`📅 Current fantasy week detected: ${currentWeek}`);
    console.log("📦 Backend fetched stats:", playerStats.length);

    // Extract all mentioned players and their positions
    const mentionedPlayers = extractAllPlayers(message, playerStats);
    if (mentionedPlayers.length === 0) {
      return res.json({
        reply: "⚠️ No recognizable players found in question.",
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
      const block = builder_fn(player.name, ctx, playerStats, currentWeek);
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
    const responseFormat =
      mainPosition === "QB"
        ? buildQBResponseFormat(playerNames)
        : buildSkillPositionResponseFormat(mainPosition, playerNames);

    const prompt = buildAnalysisPrompt({
      playerData: analysisBlock,
      comparisons: comparisonBlock,
      userQuestion: message,
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