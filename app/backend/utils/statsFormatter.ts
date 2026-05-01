// app/backend/utils/statsFormatter.ts
// Generic stats formatting for any position

/**
 * Standard context returned for any position player
 */
export interface PlayerContext {
  gamesPlayed: number;
  fantasyAvg: number;
  last3Avg: number;
  last3Summary: {
    gamesIncluded: number;
    weeksIncluded: number[];
    avgFantasyPts: number;
    [key: string]: any; // Position-specific stats
  };
  consistencyScore: number;
  // Injury info
  injuryStatus: string;
  practiceStatus: string;
  injuryType: string;
  // Position-specific stats will be added by position builders
  [key: string]: any;
}

/**
 * Sum helper for stats across weeks
 */
export function sum(arr: any[], key: string): number {
  return arr.reduce((s, w) => s + (Number(w[key]) || 0), 0);
}

/**
 * Calculate consistency score (how stable a player is week-to-week)
 * 0 = highly volatile, 1 = perfectly consistent
 */
export function calculateConsistency(
  weeklyPoints: number[],
  average: number
): number {
  if (weeklyPoints.length === 0 || average === 0) return 0;

  const variance =
    weeklyPoints.reduce(
      (s, p) => s + Math.pow(p - average, 2),
      0
    ) / weeklyPoints.length;

  const consistency = 1 - Math.sqrt(variance) / average;
  return Math.max(0, Math.min(1, consistency)); // Clamp 0-1
}

/**
 * Get last N weeks of data
 */
export function getLastNWeeks(data: any[], n: number = 3) {
  const sorted = [...data].sort(
    (a, b) => Number(b.week) - Number(a.week)
  );
  return sorted.slice(0, n);
}

/**
 * Filter data to specific weeks (default 1-16)
 */
export function filterByWeeks(data: any[], maxWeek: number = 16) {
  return data.filter(w => Number(w.week) <= maxWeek);
}
