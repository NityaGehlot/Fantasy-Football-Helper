// app/services/injuryFormat.ts
// Types and display helpers for the nfl-data injury file (no React Native imports).

export type InjuryHistoryEntry = {
  date: string;
  day: string;
  practice_status?: string; // DNP / LP / FP
  // "news" when the practice info came from a beat report, not the official injury report
  practice_source?: string;
  game_status?: string;
  status?: string;
  // Backfilled weeks (official final report): the injury and who it is
  injury?: string;
  name?: string;
  team?: string;
  position?: string;
};

export type InjuryNews = {
  title: string;
  source?: string;
  published?: string;
  impact?: string;
  summary?: string;
  link?: string;
  practice?: string; // DNP / LP / FP reported in the headline
};

export type InjuryRecord = {
  player_id: string;
  full_name: string;
  team: string;
  position: string;
  status: string; // QUESTIONABLE / DOUBTFUL / OUT / IR / PUP / SUSPENDED / NOT_ACTIVE
  game_status?: string;
  practice_status?: string;
  injury?: string;
  notes?: string;
  injury_start_date?: string;
  // Where the status comes from ("Carried over from his last game..." / official report)
  status_note?: string;
  // Newest injury headline about him (from nfl-data's news files)
  latest_news?: InjuryNews;
  history?: InjuryHistoryEntry[];
};

export type InjuryFile = {
  generated_at: string;
  season: number;
  week: number;
  players: InjuryRecord[];
};

const LABELS: Record<string, string> = {
  QUESTIONABLE: 'Questionable',
  DOUBTFUL: 'Doubtful',
  OUT: 'Out',
  IR: 'Injured Reserve',
  PUP: 'PUP list',
  SUSPENDED: 'Suspended',
  NOT_ACTIVE: 'Not active',
};

export const injuryLabel = (status?: string) => LABELS[String(status ?? '').toUpperCase()] ?? '';

// Short badge text used on player cards: Q, D, O, IR, PUP, SUS
export function injuryShort(status?: string): string {
  const s = String(status ?? '').toUpperCase();
  return ({ QUESTIONABLE: 'Q', DOUBTFUL: 'D', OUT: 'O', IR: 'IR', PUP: 'PUP', SUSPENDED: 'SUS', NOT_ACTIVE: 'NA' } as Record<string, string>)[s] ?? '';
}

export const isOutStatus = (status?: string) =>
  ['OUT', 'IR', 'PUP', 'SUSPENDED', 'NOT_ACTIVE', 'INJURED RESERVE', 'IR-R'].includes(String(status ?? '').toUpperCase());

export const PRACTICE_LABELS: Record<string, string> = {
  DNP: 'Did not practice',
  LP: 'Limited',
  FP: 'Full',
};

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * One row per day of the week's report, like a team's official injury report:
 * Wed / Thu / Fri practice participation and the game status listed that day.
 */
export function practiceTable(history: InjuryHistoryEntry[] = []) {
  return [...history]
    .sort((a, b) => a.date.localeCompare(b.date) || DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day))
    .map(e => ({
      day: e.day,
      date: e.date,
      practice: e.practice_status ?? '',
      // No entry = the team didn't publish a practice report that day (or he wasn't on it).
      practiceLabel: PRACTICE_LABELS[e.practice_status ?? '']
        ? `${PRACTICE_LABELS[e.practice_status!]}${e.practice_source === 'news' ? ' (news report)' : ''}`
        : 'No report',
      // A status with no official game status that day is left over from his last game.
      status: e.game_status
        ? injuryLabel(e.game_status) || e.game_status
        : injuryLabel(e.status)
          ? `${injuryLabel(e.status)}${['QUESTIONABLE', 'DOUBTFUL', 'OUT'].includes(String(e.status).toUpperCase()) ? ' (last game)' : ''}`
          : '—',
    }));
}

const norm = (s: string) =>
  String(s || '')
    .toLowerCase()
    .replace(/[.'’-]/g, '')
    .replace(/\s+(jr|sr|ii|iii|iv|v)$/, '')
    .trim();

export function indexInjuries(file: InjuryFile | null) {
  const byId: Record<string, InjuryRecord> = {};
  const byName: Record<string, InjuryRecord> = {};
  for (const p of file?.players ?? []) {
    byId[String(p.player_id)] = p;
    byName[`${norm(p.full_name)}|${String(p.team).toUpperCase()}`] = p;
  }
  return { byId, byName };
}

/**
 * The most current injury info for a player: the injury file first (by Sleeper id, then
 * name + team), then Sleeper's own live fields on the player object.
 */
export function currentInjury(
  index: ReturnType<typeof indexInjuries>,
  player: any
): { status: string; injury: string; record: InjuryRecord | null } {
  const id = String(player?.player_id ?? '');
  const record =
    index.byId[id] ??
    index.byName[`${norm(player?.full_name ?? '')}|${String(player?.team ?? '').toUpperCase()}`] ??
    null;
  if (record) return { status: record.status, injury: record.injury ?? '', record };
  const sleeperStatus = String(player?.injury_status ?? '').toUpperCase();
  const status = sleeperStatus === 'SUS' ? 'SUSPENDED' : sleeperStatus === 'NA' ? 'NOT_ACTIVE' : sleeperStatus;
  return { status, injury: String(player?.injury_body_part ?? ''), record: null };
}

// ---------- A past week's injury report ----------

export type InjuryHistoryFile = Record<string, InjuryHistoryEntry[]>;

/** nflverse practice text ("Limited Participation in Practice") -> DNP / LP / FP. */
export function practiceCode(text?: string): string {
  const t = String(text ?? '').toLowerCase();
  if (!t) return '';
  if (['dnp', 'lp', 'fp'].includes(t)) return t.toUpperCase();
  if (t.includes('did not') || t.includes('not participate')) return 'DNP';
  if (t.includes('limited')) return 'LP';
  if (t.includes('full')) return 'FP';
  return '';
}

/**
 * A player's entries in a week's history file. Live weeks are keyed by Sleeper id; backfilled
 * weeks by gsis id with the name and team stored, so those are matched by gsis id or name + team.
 */
export function historyEntriesFor(history: InjuryHistoryFile | null | undefined, player: any): InjuryHistoryEntry[] | null {
  if (!history) return null;
  const byId = history[String(player?.player_id ?? '')] ?? (player?.gsis_id ? history[String(player.gsis_id)] : undefined);
  if (byId?.length) return byId;
  const name = norm(player?.full_name ?? '');
  if (!name) return null;
  const team = String(player?.team ?? '').toUpperCase();
  let nameOnly: InjuryHistoryEntry[] | null = null;
  for (const entries of Object.values(history)) {
    const e = entries?.[0];
    if (!e?.name || norm(e.name) !== name) continue;
    if (!team || String(e.team ?? '').toUpperCase() === team) return entries;
    nameOnly = nameOnly ?? entries;
  }
  // Same name on another team: he may have changed teams since that season.
  return nameOnly;
}

export type WeekInjury = {
  // current: the live report (this week); past: what was reported that week; none: nothing saved
  mode: 'current' | 'past';
  status: string;
  injury: string;
  rows: ReturnType<typeof practiceTable>;
  record: InjuryRecord | null;
  // Where the past-week info comes from, shown under the status
  source?: string;
};

/**
 * The injury report for the week you're looking at. The current week (or no week) uses the live
 * file; a past week uses that week's saved day-by-day history, or the injury fields in that
 * week's stat line (official final report) when no history was saved.
 */
export function injuryForWeek({
  file,
  history,
  weekStats,
  player,
  season,
  week,
}: {
  file: InjuryFile | null;
  history?: InjuryHistoryFile | null;
  weekStats?: any;
  player: any;
  season?: number;
  week?: number;
}): WeekInjury {
  const sameSeason = !file || !season || Number(season) === Number(file.season);
  const isCurrent = !file || (sameSeason && (!week || Number(week) >= Number(file.week)));
  // A past season with no week picked: this week's report doesn't apply, and none was saved.
  if (!isCurrent && !week) return { mode: 'past', status: '', injury: '', record: null, rows: [] };
  if (isCurrent) {
    const { status, injury, record } = currentInjury(indexInjuries(file), player);
    return { mode: 'current', status, injury, record, rows: practiceTable(record?.history) };
  }
  const entries = historyEntriesFor(history, player);
  if (entries?.length) {
    const sorted = [...entries].sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')));
    const last = sorted[sorted.length - 1];
    return {
      mode: 'past',
      status: String(last.game_status || last.status || '').toUpperCase(),
      injury: String(last.injury ?? ''),
      record: null,
      rows: practiceTable(sorted),
      source: `Saved injury report for week ${week}`,
    };
  }
  const statusText = String(weekStats?.injury_status ?? weekStats?.report_status ?? '').toUpperCase().trim();
  const practice = practiceCode(weekStats?.practice_status);
  const injury = String(weekStats?.primary_injury || weekStats?.practice_primary_injury || weekStats?.report_primary_injury || '');
  const status = statusText === 'NONE' ? '' : statusText;
  return {
    mode: 'past',
    status,
    injury,
    record: null,
    rows: practice ? practiceTable([{ date: '', day: 'Final', practice_status: practice, game_status: status || undefined }]) : [],
    source: weekStats ? `Final injury report for week ${week}` : undefined,
  };
}
