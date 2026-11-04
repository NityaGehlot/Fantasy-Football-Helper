// app/services/injuryService.ts
// Cached read of data/injuries/injuries_current.json from the nfl-data repo.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createCache, MINUTE } from './cache';
import { indexInjuries, type InjuryFile, type InjuryHistoryFile } from './injuryFormat';

const INJURY_URL = 'https://raw.githubusercontent.com/NityaGehlot/nfl-data/main/data/injuries/injuries_current.json';
const cache = createCache({ storage: AsyncStorage, prefix: 'ffh_injury_cache_v1:' });

export async function getInjuryFile(): Promise<InjuryFile | null> {
  try {
    return await cache.get('current', 30 * MINUTE, async () => {
      const res = await fetch(INJURY_URL);
      if (!res.ok) throw new Error('Injury file unavailable');
      return (await res.json()) as InjuryFile;
    }, { persist: true });
  } catch {
    return null; // file not published yet: callers fall back to Sleeper's live fields
  }
}

export async function getInjuryIndex() {
  return indexInjuries(await getInjuryFile());
}

const HISTORY_BASE = 'https://raw.githubusercontent.com/NityaGehlot/nfl-data/main/data/injuries/history';
const wk = (week: number) => String(week).padStart(2, '0');

/**
 * The injury report saved for a past week (null when that week wasn't saved). Files live in
 * history/{season}/week{NN}.json (every week since 2011); older files used history/{season}_week{NN}.json.
 */
export async function getInjuryHistory(season: number, week: number): Promise<InjuryHistoryFile | null> {
  try {
    return await cache.get(`history:${season}:${week}`, 6 * 60 * MINUTE, async () => {
      for (const url of [`${HISTORY_BASE}/${season}/week${wk(week)}.json`, `${HISTORY_BASE}/${season}_week${wk(week)}.json`]) {
        const res = await fetch(url);
        if (res.ok) return (await res.json()) as InjuryHistoryFile;
        if (res.status !== 404) throw new Error('Injury history unavailable');
      }
      return null;
    }, { persist: true });
  } catch {
    return null;
  }
}
