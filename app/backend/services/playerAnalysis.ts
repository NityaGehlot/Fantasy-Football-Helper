// app/backend/services/playerAnalysis.ts
// Build analysis blocks for each player based on position

import {
  Position,
  getPlayerTeam,
  getPlayerInjuryStatus,
  getInjuredTeammates,
} from "../utils/playerExtraction";

/**
 * Build a formatted analysis block for a QB
 */
export function buildQBAnalysisBlock(
  playerName: string,
  ctx: any,
  playerStats: any[],
  currentWeek: number
): string {
  const team = getPlayerTeam(playerName, "QB", playerStats);
  const injuryInfo = getPlayerInjuryStatus(playerName, "QB", playerStats, currentWeek);

  let teammateInjuryBlock = "None reported";
  if (team && currentWeek) {
    const injured = getInjuredTeammates(team, playerStats, currentWeek, "QB");
    if (injured.length > 0) {
      teammateInjuryBlock = injured
        .map(
          t =>
            `  ${t.name} (${t.position}) — ${t.status} | ${t.injury}` +
            (t.practiceStatus ? ` | Practice: ${t.practiceStatus}` : "")
        )
        .join("\n");
    }
  }

  return `
${playerName.toUpperCase()}
--- SEASON (Wk 1-16) ---
Games Played:         ${ctx.gamesPlayed}
Season Avg (PPR):     ${ctx.fantasyAvg}
Completion %:         ${ctx.completionPct}%
Total Pass Yds:       ${ctx.passYards}
Total Rush Yds:       ${ctx.rushYards}
Total TDs:            ${ctx.totalTDs} (${ctx.passTD} pass / ${ctx.rushTD} rush)
Total INTs:           ${ctx.interceptions}
Season TD:INT Ratio:  ${ctx.tdIntRatio}
Consistency (0-1):    ${ctx.consistencyScore}

--- LAST 3 WEEKS AVG (Weeks: ${ctx.last3Summary.weeksIncluded.join(", ")}) ---
Avg Fantasy Pts:      ${ctx.last3Summary.avgFantasyPts}
Avg Pass Yards:       ${ctx.last3Summary.avgPassYards}
Avg Rush Yards:       ${ctx.last3Summary.avgRushYards}
Avg TDs/game:         ${(ctx.last3Summary.avgPassTD + ctx.last3Summary.avgRushTD).toFixed(2)} (${ctx.last3Summary.avgPassTD} pass / ${ctx.last3Summary.avgRushTD} rush)
Avg INTs/game:        ${ctx.last3Summary.avgINTs}
Last 3 TD:INT Ratio:  ${ctx.last3Summary.tdIntRatio}
Avg Completion %:     ${ctx.last3Summary.avgCompletionPct}%

--- INJURY (Week ${currentWeek} data) ---
QB Status:            ${injuryInfo.status}
QB Practice:          ${injuryInfo.practiceStatus}
QB Injury Type:       ${injuryInfo.injuryType}

Injured Teammates (Week ${currentWeek} only):
${teammateInjuryBlock}
`;
}

/**
 * Build a formatted analysis block for a WR
 */
export function buildWRAnalysisBlock(
  playerName: string,
  ctx: any,
  playerStats: any[],
  currentWeek: number
): string {
  const team = getPlayerTeam(playerName, "WR", playerStats);
  const injuryInfo = getPlayerInjuryStatus(playerName, "WR", playerStats, currentWeek);

  return `
${playerName.toUpperCase()} (WR)
--- SEASON (Wk 1-16) ---
Games Played:         ${ctx.gamesPlayed}
Season Avg (PPR):     ${ctx.fantasyAvg}
Total Rec Yds:        ${ctx.receivingYards}
Total Rec TD:         ${ctx.receivingTD}
Receptions:           ${ctx.receptions}
Targets:              ${ctx.targets}
Target Share:         ${ctx.targetShare}%
Consistency (0-1):    ${ctx.consistencyScore}

--- LAST 3 WEEKS AVG (Weeks: ${ctx.last3Summary.weeksIncluded.join(", ")}) ---
Avg Fantasy Pts:      ${ctx.last3Summary.avgFantasyPts}
Avg Rec Yds:          ${ctx.last3Summary.avgReceivingYards}
Avg Rec TD:           ${ctx.last3Summary.avgReceivingTD}
Avg Receptions:       ${ctx.last3Summary.avgReceptions}
Avg Targets:          ${ctx.last3Summary.avgTargets}
Reception Rate:       ${ctx.last3Summary.receptionRate}%

--- INJURY (Week ${currentWeek} data) ---
Status:               ${injuryInfo.status}
Practice:             ${injuryInfo.practiceStatus}
Injury Type:          ${injuryInfo.injuryType}
`;
}

/**
 * Build a formatted analysis block for a TE
 */
export function buildTEAnalysisBlock(
  playerName: string,
  ctx: any,
  playerStats: any[],
  currentWeek: number
): string {
  const team = getPlayerTeam(playerName, "TE", playerStats);
  const injuryInfo = getPlayerInjuryStatus(playerName, "TE", playerStats, currentWeek);

  return `
${playerName.toUpperCase()} (TE)
--- SEASON (Wk 1-16) ---
Games Played:         ${ctx.gamesPlayed}
Season Avg (PPR):     ${ctx.fantasyAvg}
Total Rec Yds:        ${ctx.receivingYards}
Total Rec TD:         ${ctx.receivingTD}
Receptions:           ${ctx.receptions}
Targets:              ${ctx.targets}
Consistency (0-1):    ${ctx.consistencyScore}

--- LAST 3 WEEKS AVG (Weeks: ${ctx.last3Summary.weeksIncluded.join(", ")}) ---
Avg Fantasy Pts:      ${ctx.last3Summary.avgFantasyPts}
Avg Rec Yds:          ${ctx.last3Summary.avgReceivingYards}
Avg Rec TD:           ${ctx.last3Summary.avgReceivingTD}
Avg Receptions:       ${ctx.last3Summary.avgReceptions}
Avg Targets:          ${ctx.last3Summary.avgTargets}
Reception Rate:       ${ctx.last3Summary.receptionRate}%

--- INJURY (Week ${currentWeek} data) ---
Status:               ${injuryInfo.status}
Practice:             ${injuryInfo.practiceStatus}
Injury Type:          ${injuryInfo.injuryType}
`;
}

/**
 * Build a formatted analysis block for a RB
 */
export function buildRBAnalysisBlock(
  playerName: string,
  ctx: any,
  playerStats: any[],
  currentWeek: number
): string {
  const team = getPlayerTeam(playerName, "RB", playerStats);
  const injuryInfo = getPlayerInjuryStatus(playerName, "RB", playerStats, currentWeek);

  return `
${playerName.toUpperCase()} (RB)
--- SEASON (Wk 1-16) ---
Games Played:         ${ctx.gamesPlayed}
Season Avg (PPR):     ${ctx.fantasyAvg}
Total Rush Yds:       ${ctx.rushingYards}
Total Rush TD:        ${ctx.rushingTD}
Total Rec Yds:        ${ctx.receivingYards}
Total Rec TD:         ${ctx.receivingTD}
Receptions:           ${ctx.receptions}
Targets:              ${ctx.targets}
Total Yds:            ${ctx.totalYards}
Total TD:             ${ctx.totalTD}
Consistency (0-1):    ${ctx.consistencyScore}

--- LAST 3 WEEKS AVG (Weeks: ${ctx.last3Summary.weeksIncluded.join(", ")}) ---
Avg Fantasy Pts:      ${ctx.last3Summary.avgFantasyPts}
Avg Rush Yds:         ${ctx.last3Summary.avgRushingYards}
Avg Rush TD:          ${ctx.last3Summary.avgRushingTD}
Avg Rec Yds:          ${ctx.last3Summary.avgReceivingYards}
Avg Rec TD:           ${ctx.last3Summary.avgReceivingTD}
Avg Receptions:       ${ctx.last3Summary.avgReceptions}
Avg Targets:          ${ctx.last3Summary.avgTargets}
Reception Rate:       ${ctx.last3Summary.receptionRate}%

--- INJURY (Week ${currentWeek} data) ---
Status:               ${injuryInfo.status}
Practice:             ${injuryInfo.practiceStatus}
Injury Type:          ${injuryInfo.injuryType}
`;
}

/**
 * Build a formatted analysis block for a K
 */
export function buildKAnalysisBlock(
  playerName: string,
  ctx: any,
  playerStats: any[],
  currentWeek: number
): string {
  const injuryInfo = getPlayerInjuryStatus(playerName, "K", playerStats, currentWeek);

  return `
${playerName.toUpperCase()} (K)
--- SEASON (Wk 1-16) ---
Games Played:         ${ctx.gamesPlayed}
Season Avg (PPR):     ${ctx.fantasyAvg}
FG Made/Att:          ${ctx.fgMade}/${ctx.fgAtt}
FG %:                 ${ctx.fgPct}%
50+ FGs Made:         ${ctx.fg50Plus}
PAT Made/Att:         ${ctx.patMade}/${ctx.patAtt}
PAT %:                ${ctx.patPct}%
Consistency (0-1):    ${ctx.consistencyScore}

--- LAST 3 WEEKS AVG (Weeks: ${ctx.last3Summary.weeksIncluded.join(", ")}) ---
Avg Fantasy Pts:      ${ctx.last3Summary.avgFantasyPts}
Avg FG Made/Att:      ${ctx.last3Summary.avgFGMade}/${ctx.last3Summary.avgFGAtt}
Avg 50+ FGs:          ${ctx.last3Summary.avgFG50PlusMade}
Avg PAT Made/Att:     ${ctx.last3Summary.avgPATMade}/${ctx.last3Summary.avgPATAtt}
Last 3 FG %:          ${ctx.last3Summary.fgPct}%
Last 3 PAT %:         ${ctx.last3Summary.patPct}%

--- INJURY (Week ${currentWeek} data) ---
Status:               ${injuryInfo.status}
Practice:             ${injuryInfo.practiceStatus}
Injury Type:          ${injuryInfo.injuryType}
`;
}

/**
 * Build a formatted analysis block for DEF
 */
export function buildDEFAnalysisBlock(
  playerName: string,
  ctx: any,
  playerStats: any[],
  currentWeek: number
): string {
  return `
${playerName.toUpperCase()} (DEF)
--- SEASON (Wk 1-16) ---
Games Played:         ${ctx.gamesPlayed}
Season Avg (PPR):     ${ctx.fantasyAvg}
Sacks:                ${ctx.defSacks}
Interceptions:        ${ctx.defInterceptions}
Def TD:               ${ctx.defTD}
Safeties:             ${ctx.defSafeties}
Fumbles Forced:       ${ctx.defFumblesForced}
Pass Yds Allowed:     ${ctx.passingYardsAllowed}
Rush Yds Allowed:     ${ctx.rushingYardsAllowed}
Total Yds Allowed:    ${ctx.totalYardsAllowed}
Total TD Allowed:     ${ctx.totalTDAllowed}
Consistency (0-1):    ${ctx.consistencyScore}

--- LAST 3 WEEKS AVG (Weeks: ${ctx.last3Summary.weeksIncluded.join(", ")}) ---
Avg Fantasy Pts:      ${ctx.last3Summary.avgFantasyPts}
Avg Sacks:            ${ctx.last3Summary.avgSacks}
Avg Interceptions:    ${ctx.last3Summary.avgInterceptions}
Avg Def TD:           ${ctx.last3Summary.avgDefTD}
Avg Safeties:         ${ctx.last3Summary.avgDefSafeties}
Avg Yds Allowed:      ${ctx.last3Summary.avgTotalYardsAllowed}

--- AVAILABILITY ---
Status:               N/A for team defense units
`;
}

/**
 * Get builder function for any position
 */
export function getAnalysisBuilder(position: Position) {
  const builders: { [key in Position]: any } = {
    QB: buildQBAnalysisBlock,
    WR: buildWRAnalysisBlock,
    TE: buildTEAnalysisBlock,
    RB: buildRBAnalysisBlock,
    DEF: buildDEFAnalysisBlock,
    K: buildKAnalysisBlock,
  };
  return builders[position];
}
