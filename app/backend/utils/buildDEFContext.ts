// app/backend/utils/buildDEFContext.ts
// Defense context builder

import {
  PlayerContext,
  sum,
  calculateConsistency,
  getLastNWeeks,
  filterByWeeks,
} from "./statsFormatter";

export function buildDEFContext(defWeeks: any[]): PlayerContext | { error: string } {
  if (!defWeeks || defWeeks.length === 0) {
    return { error: "No DEF data available" };
  }

  const filtered = filterByWeeks(defWeeks, 16);
  if (filtered.length === 0) {
    return { error: "No DEF data available within weeks 1-16" };
  }

  const sorted = [...filtered].sort((a, b) => Number(b.week) - Number(a.week));
  const last3 = getLastNWeeks(sorted, 3);
  const latest = sorted[0];

  const totalGames = sorted.length;

  const defSacks = sum(sorted, "defSacks");
  const defInterceptions = sum(sorted, "defInterceptions");
  const defTD = sum(sorted, "defTD");
  const defSafeties = sum(sorted, "defSafeties");
  const defFumblesForced = sum(sorted, "defFumblesForced");
  const fumbleRecoveryOpp = sum(sorted, "fumbleRecoveryOpp");
  const passingYardsAllowed = sum(sorted, "passingYardsAllowed");
  const rushingYardsAllowed = sum(sorted, "rushingYardsAllowed");
  const totalYardsAllowed = passingYardsAllowed + rushingYardsAllowed;
  const passingTDAllowed = sum(sorted, "passingTDAllowed");
  const rushingTDAllowed = sum(sorted, "rushingTDAllowed");
  const totalTDAllowed = passingTDAllowed + rushingTDAllowed;

  const fantasyAvg = sum(sorted, "fantasyPoints") / (totalGames || 1);
  const seasonPoints = sorted.map((w) => Number(w.fantasyPoints) || 0);

  const last3Games = last3.length || 1;
  const avgPointsAllowed =
    (sum(last3, "passingYardsAllowed") + sum(last3, "rushingYardsAllowed")) /
    last3Games;

  const last3Summary = {
    gamesIncluded: last3Games,
    weeksIncluded: last3.map((w) => w.week).sort((a, b) => b - a),
    avgFantasyPts: Number((sum(last3, "fantasyPoints") / last3Games).toFixed(2)),
    avgSacks: Number((sum(last3, "defSacks") / last3Games).toFixed(2)),
    avgInterceptions: Number((sum(last3, "defInterceptions") / last3Games).toFixed(2)),
    avgDefTD: Number((sum(last3, "defTD") / last3Games).toFixed(2)),
    avgDefSafeties: Number((sum(last3, "defSafeties") / last3Games).toFixed(2)),
    avgTotalYardsAllowed: Number(avgPointsAllowed.toFixed(1)),
  };

  const consistencyScore = calculateConsistency(seasonPoints, fantasyAvg);

  return {
    gamesPlayed: totalGames,
    defSacks,
    defInterceptions,
    defTD,
    defSafeties,
    defFumblesForced,
    fumbleRecoveryOpp,
    passingYardsAllowed,
    rushingYardsAllowed,
    totalYardsAllowed,
    passingTDAllowed,
    rushingTDAllowed,
    totalTDAllowed,
    fantasyAvg: Number(fantasyAvg.toFixed(2)),
    last3Avg: Number((sum(last3, "fantasyPoints") / last3Games).toFixed(2)),
    last3Summary,
    consistencyScore: Number(consistencyScore.toFixed(2)),
    injuryStatus: "N/A",
    practiceStatus: "N/A",
    injuryType: "N/A",
  };
}
