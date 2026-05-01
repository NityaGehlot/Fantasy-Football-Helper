// app/backend/utils/playerExtraction.ts
// Generic player extraction utilities for all positions

export type Position = "QB" | "WR" | "TE" | "RB" | "DEF" | "K";

/**
 * Extract player names of a given position from player stats
 */
export function extractPlayerNames(
  message: string,
  playerStats: any[],
  position: Position
): string[] {
  const lowerMessage = message.toLowerCase();
  const playerNames = [
    ...new Set(
      playerStats
        .filter(p => p.position === position)
        .map(p => p.player_name.toLowerCase())
    )
  ];
  return playerNames.filter(name => lowerMessage.includes(name));
}

/**
 * Extract all mentioned players (any position) from message
 */
export function extractAllPlayers(
  message: string,
  playerStats: any[]
): { name: string; position: Position }[] {
  const lowerMessage = message.toLowerCase();
  const positions: Position[] = ["QB", "WR", "TE", "RB", "DEF", "K"];
  const mentionedPlayers: { name: string; position: Position }[] = [];
  const seen = new Set<string>();

  for (const position of positions) {
    const playerNames = playerStats
      .filter(p => p.position === position)
      .map(p => p.player_name.toLowerCase());

    for (const name of playerNames) {
      if (lowerMessage.includes(name) && !seen.has(name)) {
        mentionedPlayers.push({ name, position });
        seen.add(name);
      }
    }
  }

  return mentionedPlayers;
}

/**
 * Get formatted weeks data for a specific player
 */
export function getPlayerWeeks(
  fullName: string,
  position: Position,
  playerStats: any[]
) {
  return playerStats
    .filter(
      (p: any) =>
        p.position === position &&
        p.player_name.toLowerCase() === fullName.toLowerCase()
    )
    .map((p: any) => ({
      week: Number(p.week),
      fantasyPoints: Number(p.fantasy_points_ppr ?? 0),
      // Offensive stats
      passingYards: Number(p.passing_yards ?? 0),
      passingTD: Number(p.passing_tds ?? 0),
      interceptions: Number(p.passing_interceptions ?? 0),
      completions: Number(p.completions ?? 0),
      attempts: Number(p.attempts ?? 0),
      rushingYards: Number(p.rushing_yards ?? 0),
      rushingTD: Number(p.rushing_tds ?? 0),
      receivingYards: Number(p.receiving_yards ?? 0),
      receivingTD: Number(p.receiving_tds ?? 0),
      receptions: Number(p.receptions ?? 0),
      targets: Number(p.targets ?? 0),
      // Defense/Special Teams
      defFumblesForced: Number(p.def_fumbles_forced ?? 0),
      defSacks: Number(p.def_sacks ?? 0),
      defInterceptions: Number(p.def_interceptions ?? 0),
      defTD: Number(p.def_tds ?? 0),
      defSafeties: Number(p.def_safeties ?? 0),
      fumbleRecoveryOpp: Number(p.fumble_recovery_opp ?? 0),
      passingYardsAllowed: Number(p.passing_yards_allowed ?? 0),
      passingTDAllowed: Number(p.passing_tds_allowed ?? 0),
      rushingYardsAllowed: Number(p.rushing_yards_allowed ?? 0),
      rushingTDAllowed: Number(p.rushing_tds_allowed ?? 0),
      // Kicker
      fgMade: Number(p.fg_made ?? 0),
      fgAtt: Number(p.fg_att ?? 0),
      fgMissed: Number(p.fg_missed ?? 0),
      fgMade0_19: Number(p.fg_made_0_19 ?? 0),
      fgMade30_39: Number(p.fg_made_30_39 ?? 0),
      fgMade40_49: Number(p.fg_made_40_49 ?? 0),
      fgMade50_59: Number(p.fg_made_50_59 ?? 0),
      fgMade60Plus: Number(p.fg_made_60_ ?? 0),
      fg50PlusMade: Number(p.fg_made_50_59 ?? 0) + Number(p.fg_made_60_ ?? 0),
      patMade: Number(p.pat_made ?? 0),
      patAtt: Number(p.pat_att ?? 0),
      patMissed: Number(p.pat_missed ?? 0),
      // Misc
      fumbles: Number(p.fumbles ?? 0),
      fieldGoals: Number(p.fg_made ?? p.field_goals ?? 0),
      fieldGoalAttempts: Number(p.fg_att ?? p.field_goal_attempts ?? 0),
      extraPoints: Number(p.pat_made ?? p.extra_points ?? 0),
      // Injury fields
      injury_status: p.injury_status ?? "ACTIVE",
      practice_status: p.practice_status ?? "",
      primary_injury: p.primary_injury ?? "",
      secondary_injury: p.secondary_injury ?? "",
      practice_primary_injury: p.practice_primary_injury ?? "",
      practice_secondary_injury: p.practice_secondary_injury ?? "",
    }));
}

/**
 * Get injured teammates for a given team
 */
export function getInjuredTeammates(
  teamName: string,
  playerStats: any[],
  currentWeek: number,
  excludePosition?: Position
) {
  console.log(
    `🔍 Checking teammates for team: ${teamName}, week: ${currentWeek}`
  );

  const teammates = playerStats.filter((p: any) => {
    const sameTeam = String(p.team).toUpperCase() === String(teamName).toUpperCase();
    const isSkill = ["WR", "TE", "RB"].includes(p.position);
    const isCorrectWeek = Number(p.week) === Number(currentWeek);
    const notExcluded = !excludePosition || p.position !== excludePosition;

    const status = String(p.injury_status ?? "").trim().toUpperCase();
    const isInjured =
      status !== "" && status !== "ACTIVE" && status !== "N/A";

    return sameTeam && isSkill && isCorrectWeek && isInjured && notExcluded;
  });

  console.log(
    `🏥 Injured teammates found for ${teamName} week ${currentWeek}:`,
    teammates.map(t => `${t.player_name} (${t.injury_status})`)
  );

  return teammates.map((p: any) => ({
    name: p.player_name,
    position: p.position,
    status: p.injury_status,
    injury: p.primary_injury || p.practice_primary_injury || "Unknown",
    practiceStatus: p.practice_status || "No practice data",
  }));
}

/**
 * Get player's team (most recent week)
 */
export function getPlayerTeam(
  playerName: string,
  position: Position,
  playerStats: any[]
): string | null {
  const teamRow = playerStats
    .filter(
      (p: any) =>
        p.player_name.toLowerCase() === playerName.toLowerCase() &&
        p.position === position &&
        p.team &&
        p.team !== ""
    )
    .sort((a: any, b: any) => Number(b.week) - Number(a.week))[0];

  return teamRow?.team ?? null;
}

/**
 * Get player's current week injury info
 */
export function getPlayerInjuryStatus(
  playerName: string,
  position: Position,
  playerStats: any[],
  currentWeek: number
) {
  const injuryRow = playerStats.find(
    (p: any) =>
      p.player_name.toLowerCase() === playerName.toLowerCase() &&
      p.position === position &&
      Number(p.week) === currentWeek
  );

  return {
    status: injuryRow?.injury_status ?? "ACTIVE",
    practiceStatus: injuryRow?.practice_status || "Full",
    injuryType:
      injuryRow?.primary_injury ||
      injuryRow?.practice_primary_injury ||
      "None",
  };
}
