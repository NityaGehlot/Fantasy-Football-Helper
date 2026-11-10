// app/backend/utils/leaguePoints.ts
// Fantasy points for a stat line with a league's own scoring settings, the way Sleeper scores
// (Sleeper's stat names are the same as its scoring-setting keys). Pure code: used by the backend
// (ranks, lineup check, live scores) and the app (projections on player pages).

/** Points for a stat line; falls back to Sleeper's PPR / half / standard totals when no stat matches. */
export function leaguePoints(stats: Record<string, number>, scoring?: Record<string, number> | null): number {
  if (scoring && Object.keys(scoring).length) {
    let total = 0;
    let matched = false;
    for (const [key, weight] of Object.entries(scoring)) {
      const v = Number(stats[key]);
      if (!Number.isFinite(v) || !Number.isFinite(Number(weight))) continue;
      total += v * Number(weight);
      matched = true;
    }
    if (matched) return Math.round(total * 100) / 100;
  }
  const rec = Number(scoring?.rec ?? 1);
  const key = rec >= 1 ? "pts_ppr" : rec >= 0.5 ? "pts_half_ppr" : "pts_std";
  return Math.round(Number(stats[key] ?? stats.pts_ppr ?? 0) * 100) / 100;
}
