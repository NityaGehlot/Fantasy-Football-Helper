// app/services/playerInsights.ts
// Client for the backend's "expert takes" on a player: RotoWire updates (news + what it means
// for fantasy) and ESPN analyst columns that discuss him. Replaces the old "Latest on X" link.

import { getApiBaseUrl } from './apiBaseUrl';
import { createCache, MINUTE } from './cache';

const cache = createCache();

export type PlayerInsight = {
  id: string;
  kind: 'update' | 'article';
  headline: string;
  analysis: string;
  published: string;
  source: string;
  author?: string;
  link: string | null;
  premium: boolean;
};

export async function fetchPlayerInsights(player: { player_id?: string; espn_id?: string | number; full_name?: string }): Promise<PlayerInsight[]> {
  const params = new URLSearchParams();
  if (player.espn_id) params.set('espnId', String(player.espn_id));
  if (player.player_id) params.set('sleeperId', String(player.player_id));
  if (player.full_name) params.set('name', player.full_name);
  if (!params.has('espnId') && !params.has('sleeperId')) return [];
  const key = `insights:${params.toString()}`;
  return cache.get(key, 10 * MINUTE, async () => {
    const res = await fetch(`${getApiBaseUrl()}/player-insights?${params.toString()}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Expert takes unavailable');
    return (data?.insights ?? []) as PlayerInsight[];
  });
}
