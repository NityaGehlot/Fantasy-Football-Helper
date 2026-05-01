// app/backend/utils/buildKContext.ts
// Kicker context builder

import {
  PlayerContext,
  sum,
  calculateConsistency,
  getLastNWeeks,
  filterByWeeks,
} from "./statsFormatter";

export function buildKContext(kWeeks: any[]): PlayerContext | { error: string } {
  if (!kWeeks || kWeeks.length === 0) {
    return { error: "No K data available" };
  }

  const filtered = filterByWeeks(kWeeks, 16);
  if (filtered.length === 0) {
    return { error: "No K data available within weeks 1-16" };
  }

  const sorted = [...filtered].sort((a, b) => Number(b.week) - Number(a.week));
  const last3 = getLastNWeeks(sorted, 3);
  const latest = sorted[0];

  const totalGames = sorted.length;

  const fgMade = sum(sorted, "fgMade");
  const fgAtt = sum(sorted, "fgAtt");
  const fgMissed = sum(sorted, "fgMissed");
  const fg50Plus = sum(sorted, "fg50PlusMade");
  const patMade = sum(sorted, "patMade");
  const patAtt = sum(sorted, "patAtt");
  const patMissed = sum(sorted, "patMissed");

  const fgPct = fgAtt > 0 ? (fgMade / fgAtt) * 100 : 0;
  const patPct = patAtt > 0 ? (patMade / patAtt) * 100 : 0;
  const fantasyAvg = sum(sorted, "fantasyPoints") / (totalGames || 1);
  const seasonPoints = sorted.map((w) => Number(w.fantasyPoints) || 0);

  const last3Games = last3.length || 1;
  const last3Summary = {
    gamesIncluded: last3Games,
    weeksIncluded: last3.map((w) => w.week).sort((a, b) => b - a),
    avgFantasyPts: Number((sum(last3, "fantasyPoints") / last3Games).toFixed(2)),
    avgFGMade: Number((sum(last3, "fgMade") / last3Games).toFixed(2)),
    avgFGAtt: Number((sum(last3, "fgAtt") / last3Games).toFixed(2)),
    avgFG50PlusMade: Number((sum(last3, "fg50PlusMade") / last3Games).toFixed(2)),
    avgPATMade: Number((sum(last3, "patMade") / last3Games).toFixed(2)),
    avgPATAtt: Number((sum(last3, "patAtt") / last3Games).toFixed(2)),
    fgPct: Number((
      (sum(last3, "fgMade") / Math.max(1, sum(last3, "fgAtt"))) * 100
    ).toFixed(1)),
    patPct: Number((
      (sum(last3, "patMade") / Math.max(1, sum(last3, "patAtt"))) * 100
    ).toFixed(1)),
  };

  const consistencyScore = calculateConsistency(seasonPoints, fantasyAvg);

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
    fgMade,
    fgAtt,
    fgMissed,
    fg50Plus,
    fgPct: Number(fgPct.toFixed(1)),
    patMade,
    patAtt,
    patMissed,
    patPct: Number(patPct.toFixed(1)),
    fantasyAvg: Number(fantasyAvg.toFixed(2)),
    last3Avg: Number((sum(last3, "fantasyPoints") / last3Games).toFixed(2)),
    last3Summary,
    consistencyScore: Number(consistencyScore.toFixed(2)),
    injuryStatus,
    practiceStatus,
    injuryType,
  };
}
