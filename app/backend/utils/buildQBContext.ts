export function buildQBContext(qbWeeks: any[]) {
  if (!qbWeeks || qbWeeks.length === 0) {
    return { error: "No QB data available" };
  }

  // Cap at week 16
  const filtered = qbWeeks.filter(w => Number(w.week) <= 16);

  if (filtered.length === 0) {
    return { error: "No QB data available within weeks 1-16" };
  }

  const sorted = [...filtered].sort((a, b) => Number(b.week) - Number(a.week));
  const last3 = sorted.slice(0, 3);
  const latest = sorted[0];

  const totalGames = sorted.length;

  const sum = (arr: any[], key: string) =>
    arr.reduce((s, w) => s + (Number(w[key]) || 0), 0);

  // =====================
  // SEASON STATS
  // =====================
  const passYards = sum(sorted, "passingYards");
  const rushYards = sum(sorted, "rushingYards");
  const passTD = sum(sorted, "passingTD");
  const rushTD = sum(sorted, "rushingTD");
  const interceptions = sum(sorted, "interceptions");
  const fumbles = sum(sorted, "fumbles");
  const completions = sum(sorted, "completions");
  const attempts = sum(sorted, "attempts");

  const completionPct = attempts > 0 ? (completions / attempts) * 100 : 0;
  const fantasyAvg = sum(sorted, "fantasyPoints") / (totalGames || 1);
  const last3Avg = sum(last3, "fantasyPoints") / (last3.length || 1);

  const totalTDs = passTD + rushTD;
  const tdIntRatio = interceptions === 0 ? totalTDs : totalTDs / interceptions;

  // =====================
  // LAST 3 WEEKS SUMMARY
  // =====================
  const last3PassYards = sum(last3, "passingYards");
  const last3RushYards = sum(last3, "rushingYards");
  const last3PassTD = sum(last3, "passingTD");
  const last3RushTD = sum(last3, "rushingTD");
  const last3INTs = sum(last3, "interceptions");
  const last3Completions = sum(last3, "completions");
  const last3Attempts = sum(last3, "attempts");
  const last3Games = last3.length || 1;

  const last3Summary = {
    gamesIncluded: last3Games,
    weeksIncluded: last3.map(w => w.week).sort((a, b) => b - a),
    avgFantasyPts: Number((sum(last3, "fantasyPoints") / last3Games).toFixed(2)),
    avgPassYards: Number((last3PassYards / last3Games).toFixed(1)),
    avgRushYards: Number((last3RushYards / last3Games).toFixed(1)),
    avgPassTD: Number((last3PassTD / last3Games).toFixed(2)),
    avgRushTD: Number((last3RushTD / last3Games).toFixed(2)),
    avgINTs: Number((last3INTs / last3Games).toFixed(2)),
    avgCompletionPct: last3Attempts > 0
      ? Number(((last3Completions / last3Attempts) * 100).toFixed(1))
      : 0,
    tdIntRatio: last3INTs === 0
      ? last3PassTD + last3RushTD
      : Number(((last3PassTD + last3RushTD) / last3INTs).toFixed(2)),
  };

  // =====================
  // CONSISTENCY
  // =====================
  const variance =
    sorted.reduce(
      (s, w) => s + Math.pow((Number(w.fantasyPoints) || 0) - fantasyAvg, 2),
      0
    ) / (totalGames || 1);
  const consistencyScore =
    fantasyAvg > 0 ? 1 - Math.sqrt(variance) / fantasyAvg : 0;

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
    completionPct: Number(completionPct.toFixed(1)),
    passYards,
    rushYards,
    passTD,
    rushTD,
    totalTDs,
    interceptions,
    tdIntRatio: Number(tdIntRatio.toFixed(2)),
    fumbles,
    fantasyAvg: Number(fantasyAvg.toFixed(2)),
    last3Avg: Number(last3Avg.toFixed(2)),
    last3Summary,                               // ✅ replaces last3Games array
    consistencyScore: Number(consistencyScore.toFixed(2)),
    injuryStatus,
    practiceStatus,
    injuryType,
  };
}