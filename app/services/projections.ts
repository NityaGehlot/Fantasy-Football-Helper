// app/services/projections.ts
// Projected fantasy points for upcoming weeks, read from nfl-data's saved copy of Sleeper's
// projections (data/projections/{season}/week{NN}.json, refreshed every 4 hours by a GitHub
// workflow). The app never calls Sleeper for these.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createCache, HOUR } from './cache';

export type ProjectionEntry = {
  name?: string;
  pos?: string;
  team?: string;
  opp?: string;
  ppr: number;
  half: number;
  std: number;
  stats?: Record<string, number>;
};

export type ProjectionFile = {
  season: number;
  week: number;
  generated_at: string;
  players: Record<string, ProjectionEntry>;
};

const BASE = 'https://raw.githubusercontent.com/NityaGehlot/nfl-data/main/data/projections';
const cache = createCache({ storage: AsyncStorage, prefix: 'ffh_proj_v2:' });

class NotSavedYet extends Error {}

/**
 * One week's projections (null when that week hasn't been saved yet). Found files are cached for
 * 2 hours; "not saved yet" is never cached, so a week shows up as soon as the workflow saves it.
 */
export async function getWeekProjections(season: number, week: number): Promise<ProjectionFile | null> {
  try {
    return await cache.get(
      `${season}:${week}`,
      2 * HOUR,
      async () => {
        const res = await fetch(`${BASE}/${season}/week${String(week).padStart(2, '0')}.json`);
        if (res.status === 404) throw new NotSavedYet();
        if (!res.ok) throw new Error('Projections unavailable');
        const file = (await res.json()) as ProjectionFile;
        if (!file?.players || Object.keys(file.players).length === 0) throw new NotSavedYet();
        return file;
      },
      { persist: true }
    );
  } catch {
    return null;
  }
}

/** Points in the league's format: full PPR (1 per catch), half PPR (0.5) or standard (0). */
export function projectedPoints(entry: ProjectionEntry, receptionPoints = 1): number {
  if (receptionPoints >= 1) return entry.ppr;
  if (receptionPoints >= 0.5) return entry.half;
  return entry.std;
}

export const scoringLabel = (receptionPoints = 1) => (receptionPoints >= 1 ? 'PPR' : receptionPoints >= 0.5 ? 'Half PPR' : 'Standard');

const n1 = (v?: number) => (v === undefined ? '' : Number.isInteger(v) ? String(v) : v.toFixed(1));

/** The projected stat line, e.g. ["7.5 car, 29 yd, 0.2 TD", "1.8 rec, 13.5 yd"]. */
export function projectedStatLine(position: string | undefined, s: Record<string, number> = {}): string[] {
  const pos = String(position ?? '').toUpperCase();
  const lines: string[] = [];
  if (s.pass_yd || s.pass_att) lines.push(`${n1(s.pass_cmp)}/${n1(s.pass_att)} cmp, ${n1(s.pass_yd)} yd, ${n1(s.pass_td ?? 0)} TD, ${n1(s.pass_int ?? 0)} INT`);
  if (s.rush_att || s.rush_yd) lines.push(`${n1(s.rush_att ?? 0)} car, ${n1(s.rush_yd ?? 0)} yd${s.rush_td ? `, ${n1(s.rush_td)} TD` : ''}`);
  if (s.rec || s.rec_yd) lines.push(`${n1(s.rec ?? 0)} rec${s.rec_tgt ? ` (${n1(s.rec_tgt)} tgt)` : ''}, ${n1(s.rec_yd ?? 0)} yd${s.rec_td ? `, ${n1(s.rec_td)} TD` : ''}`);
  if (pos === 'K' && (s.fgm || s.xpm)) lines.push(`${n1(s.fgm ?? 0)} FG${s.fga ? ` of ${n1(s.fga)}` : ''}, ${n1(s.xpm ?? 0)} XP`);
  if (pos === 'DEF') {
    const parts = [s.def_sack ? `${n1(s.def_sack)} sacks` : '', s.def_int ? `${n1(s.def_int)} INT` : '', s.def_fum_rec ? `${n1(s.def_fum_rec)} fum rec` : '', s.pts_allow ? `${n1(s.pts_allow)} pts allowed` : ''].filter(Boolean);
    if (parts.length) lines.push(parts.join(', '));
  }
  return lines;
}
