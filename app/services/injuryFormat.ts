// app/services/injuryFormat.ts
// Types and display helpers for the nfl-data injury file (no React Native imports).

export type InjuryHistoryEntry = {
  date: string;
  day: string;
  practice_status?: string; // DNP / LP / FP
  game_status?: string;
  status?: string;
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
      practiceLabel: PRACTICE_LABELS[e.practice_status ?? ''] ?? 'No report',
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
