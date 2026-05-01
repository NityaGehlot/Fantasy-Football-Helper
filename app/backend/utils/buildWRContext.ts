// app/backend/utils/buildWRContext.ts
// Wide Receiver context builder (same pattern for TE, RB, etc.)

import {
  PlayerContext,
  sum,
  calculateConsistency,
  getLastNWeeks,
  filterByWeeks
} from "./statsFormatter";

export function buildWRContext(wrWeeks: any[]): PlayerContext | { error: string } {
  if (!wrWeeks || wrWeeks.length === 0) {
    return { error: "No WR data available" };
  }

  const filtered = filterByWeeks(wrWeeks, 16);

  if (filtered.length === 0) {
    return { error: "No WR data available within weeks 1-16" };
  }

  const sorted = [...filtered].sort((a, b) => Number(b.week) - Number(a.week));
  const last3 = getLastNWeeks(sorted, 3);
  const latest = sorted[0];

  const totalGames = sorted.length;

  // =====================
  // SEASON STATS
  // =====================
  const receivingYards = sum(sorted, "receivingYards");
  const receivingTD = sum(sorted, "receivingTD");
  const receptions = sum(sorted, "receptions");
  const targets = sum(sorted, "targets");
  const fumbles = sum(sorted, "fumbles");

  const targetShare = targets > 0 ? (receptions / targets) * 100 : 0;
  const fantasyAvg = sum(sorted, "fantasyPoints") / (totalGames || 1);
  const seasonPoints = sorted.map(w => Number(w.fantasyPoints) || 0);

  // =====================
  // LAST 3 WEEKS SUMMARY
  // =====================
  const last3ReceivingYards = sum(last3, "receivingYards");
  const last3ReceivingTD = sum(last3, "receivingTD");
  const last3Receptions = sum(last3, "receptions");
  const last3Targets = sum(last3, "targets");
  const last3Games = last3.length || 1;

  const last3Summary = {
    gamesIncluded: last3Games,
    weeksIncluded: last3.map(w => w.week).sort((a, b) => b - a),
    avgFantasyPts: Number((sum(last3, "fantasyPoints") / last3Games).toFixed(2)),
    avgReceivingYards: Number((last3ReceivingYards / last3Games).toFixed(1)),
    avgReceivingTD: Number((last3ReceivingTD / last3Games).toFixed(2)),
    avgReceptions: Number((last3Receptions / last3Games).toFixed(1)),
    avgTargets: Number((last3Targets / last3Games).toFixed(1)),
    targetShare: last3Targets > 0 ? Number(((last3Receptions / last3Targets) * 100).toFixed(1)) : 0,
    receptionRate: last3Targets > 0 ? Number(((last3Receptions / last3Targets) * 100).toFixed(1)) : 0,
  };

  // =====================
  // CONSISTENCY
  // =====================
  const consistencyScore = calculateConsistency(seasonPoints, fantasyAvg);

  // =====================
  // INJURY
  // =====================
  const injuryStatus = latest.injury_status || "ACTIVE";
  const practiceStatus = latest.practice_status || "";
  const injuryType =
    latest.primary_injury ||
    latest.secondary_injury ||
    latest.practice_primary_injury ||
    latest.practice_secondary_injury ||
    "None";

  return {
    gamesPlayed: totalGames,
    receivingYards,
    receivingTD,
    receptions,
    targets,
    targetShare: Number(targetShare.toFixed(1)),
    fumbles,
    fantasyAvg: Number(fantasyAvg.toFixed(2)),
    last3Avg: Number((sum(last3, "fantasyPoints") / last3Games).toFixed(2)),
    last3Summary,
    consistencyScore: Number(consistencyScore.toFixed(2)),
    injuryStatus,
    practiceStatus,
    injuryType,
  };
}
