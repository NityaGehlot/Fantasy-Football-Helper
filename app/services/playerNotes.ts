// app/services/playerNotes.ts
// Client for "Latest analysis": RotoWire player notes and ESPN fantasy columns about a player.

import { getApiBaseUrl } from './apiBaseUrl';
import { createCache, MINUTE } from './cache';

export type PlayerNote = {
  kind: 'note' | 'article';
  headline: string;
  analysis: string;
  published: string;
  source: string;
  link?: string;
  image?: string;
};

const cache = createCache({ prefix: 'ffh_notes_v1:' });

export async function fetchPlayerNotes(playerId: string, name?: string, team?: string): Promise<PlayerNote[]> {
  try {
    return await cache.get(`${playerId}`, 20 * MINUTE, async () => {
      const qs = new URLSearchParams({ id: playerId });
      if (name) qs.set('name', name);
      if (team) qs.set('team', team);
      const res = await fetch(`${getApiBaseUrl()}/player-notes?${qs}`);
      if (!res.ok) throw new Error('Notes unavailable');
      const data = await res.json();
      return Array.isArray(data?.notes) ? (data.notes as PlayerNote[]) : [];
    });
  } catch {
    return [];
  }
}
