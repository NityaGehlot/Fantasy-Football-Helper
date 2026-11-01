// app/hooks/usePlayerStatus.ts
// Loads current injuries and this week's bye teams once and shares them with every player card.

import { useEffect, useState } from 'react';
import { getInjuryIndex } from '../services/injuryService';
import { getNFLState } from '../services/sleeperAPI';
import { getTeamsPlayingInWeek } from '../services/nflApi';
import { byeTeamsFrom, EMPTY_STATUS, type PlayerStatusData } from '../services/playerStatus';

let shared: PlayerStatusData = EMPTY_STATUS;
let loading: Promise<void> | null = null;
let loadedAt = 0;
const listeners = new Set<(d: PlayerStatusData) => void>();
const REFRESH_MS = 30 * 60 * 1000;

async function load() {
  const [injuries, byeInfo] = await Promise.all([
    getInjuryIndex().catch(() => EMPTY_STATUS.injuries),
    (async () => {
      const state = await getNFLState().catch(() => null);
      const week = Number(state?.week) || null;
      const season = Number(state?.season);
      if (!week || !season || String(state?.season_type) !== 'regular') return { byeTeams: null, week };
      const playing = await getTeamsPlayingInWeek(season, week).catch(() => null);
      return { byeTeams: byeTeamsFrom(playing), week };
    })(),
  ]);
  shared = { injuries, ...byeInfo };
  loadedAt = Date.now();
  listeners.forEach(l => l(shared));
}

export function usePlayerStatus(): PlayerStatusData {
  const [data, setData] = useState(shared);
  useEffect(() => {
    listeners.add(setData);
    if (!loading || Date.now() - loadedAt > REFRESH_MS) {
      loading = load().catch(() => undefined) as Promise<void>;
    } else {
      setData(shared);
    }
    return () => {
      listeners.delete(setData);
    };
  }, []);
  return data;
}
