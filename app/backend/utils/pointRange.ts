// app/backend/utils/pointRange.ts
// Floor and ceiling from a player's game log: what a bad week and a good week look like.
// Pure code with no Node imports, so the app screens use it too.

export type PointRange = {
  games: number;
  floor: number; // a bad week (20th percentile)
  median: number;
  ceiling: number; // a good week (80th percentile)
  label: "safe" | "steady" | "boom/bust" | "not enough games";
  // One-line explanation for screens and AI prompts
  summary: string;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/**
 * @param points fantasy points from games he actually played, most recent last
 * @param lastN  only use his most recent games (form changes during a season)
 */
export function pointRange(points: number[], lastN = 10): PointRange {
  const recent = points.filter(p => Number.isFinite(p)).slice(-lastN);
  const sorted = [...recent].sort((a, b) => a - b);
  const floor = round1(percentile(sorted, 0.2));
  const median = round1(percentile(sorted, 0.5));
  const ceiling = round1(percentile(sorted, 0.8));
  if (recent.length < 3) {
    return { games: recent.length, floor, median, ceiling, label: "not enough games", summary: "Not enough games yet to show a range." };
  }
  // How wide the range is compared with a normal week.
  const spread = (ceiling - floor) / Math.max(median, 4);
  const label: PointRange["label"] = spread <= 0.6 ? "safe" : spread >= 1.2 ? "boom/bust" : "steady";
  const meaning =
    label === "safe"
      ? "a safe, predictable start"
      : label === "boom/bust"
        ? "boom or bust: big weeks and duds"
        : "fairly steady with some swings";
  return {
    games: recent.length,
    floor,
    median,
    ceiling,
    label,
    summary: `Usually ${floor}–${ceiling} pts (bad week ${floor}, good week ${ceiling}, last ${recent.length} games): ${meaning}.`,
  };
}

/** Points by week from stat rows, only weeks he actually played, in week order. */
export function playedPoints(rows: { week?: unknown; fantasy_points_ppr?: unknown; fantasyPoints?: unknown; game_played?: unknown; team_status?: unknown }[]): number[] {
  return [...rows]
    .filter(r => r && r.game_played !== false && String(r.team_status ?? "played").toLowerCase() !== "bye")
    .filter(r => r.game_played === true || Number(r.fantasy_points_ppr ?? r.fantasyPoints) !== 0)
    .sort((a, b) => Number(a.week) - Number(b.week))
    .map(r => Number(r.fantasy_points_ppr ?? r.fantasyPoints) || 0);
}
