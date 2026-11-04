// app/services/gamesPlayed.ts
// Did the player actually play in a week? Used for "Games" and for per-game averages, so a week he
// missed with an injury doesn't count as a game (his team playing that week isn't enough).

const NON_STAT_KEYS = new Set([
  'player_id', 'player_name', 'team', 'position', 'opponent', 'opp_team', 'week', 'season', 'game_id', 'headshot_url',
  'injury_status', 'practice_status', 'practice_primary_injury', 'practice_secondary_injury', 'primary_injury',
  'secondary_injury', 'report_primary_injury', 'report_status', 'status', 'number', 'age', 'years_exp', 'college',
  'height', 'weight', 'opponent_team', 'team_status', 'game_played', 'snap_count', '_team_def', 'season_type',
]);

/** Any real stat (yards, catches, tackles...) recorded for him that week. */
export function hasPlayedStats(row: any): boolean {
  if (!row || typeof row !== 'object') return false;
  return Object.entries(row).some(([k, v]) => {
    if (NON_STAT_KEYS.has(k) || k.startsWith('_')) return false;
    const n = Number(v);
    return Number.isFinite(n) && n !== 0 && !k.startsWith('fantasy_points');
  });
}

/**
 * One week of a player's game log -> did he play?
 *  - bye weeks never count;
 *  - a team defense counts when its team played;
 *  - otherwise only HIS participation counts: game_played / snaps / any stat. A week where he was
 *    ruled out or inactive (no snaps, no stats) is a missed game even though his team played.
 */
export function playedInWeek(row: any, { teamDefense = false }: { teamDefense?: boolean } = {}): boolean {
  const data = row ?? {};
  const teamStatus = String(data.team_status ?? data._team_def?.team_status ?? '').toLowerCase().trim();
  if (teamStatus.includes('bye') || teamStatus === 'eliminated') return false;
  if (teamDefense) return teamStatus === 'played' || !!data._team_def || hasPlayedStats(data);
  if (data.game_played === true || Number(data.snap_count) > 0) return true;
  return hasPlayedStats(data);
}

/** Games played, and games missed (his team played but he didn't), for a set of weeks. */
export function gamesSummary(weeks: { num: number; data: any }[], opts: { teamDefense?: boolean } = {}): { played: number; missed: number } {
  let played = 0;
  let missed = 0;
  for (const w of weeks) {
    const data = w.data ?? {};
    const teamStatus = String(data.team_status ?? data._team_def?.team_status ?? '').toLowerCase().trim();
    if (teamStatus.includes('bye') || teamStatus === 'eliminated') continue;
    if (playedInWeek(data, { teamDefense: opts.teamDefense })) played++;
    else if (Object.keys(data).length > 0) missed++;
  }
  return { played, missed };
}
