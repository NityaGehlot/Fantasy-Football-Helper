// app/services/injuryService.ts
// Cached read of data/injuries/injuries_current.json from the nfl-data repo.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createCache, MINUTE } from './cache';
import { indexInjuries, type InjuryFile } from './injuryFormat';

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
