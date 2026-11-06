// app/services/waiverAdvice.ts
// Client for the backend's waiver advice: a FAAB bid range, or whether to spend your waiver
// priority on a free agent (rolling / reverse-standings waivers).

import { getApiBaseUrl } from './apiBaseUrl';

export type WaiverAdvice = {
  rostered: boolean;
  owner?: string;
  type?: 'faab' | 'rolling' | 'reverse';
  summary?: string;
  lineupGain?: number;
  openSpot?: boolean;
  drop?: { id: string; name: string; position: string } | null;
  // FAAB
  budget?: number;
  remaining?: number;
  low?: number;
  likely?: number;
  high?: number;
  basis?: string;
  // Rolling / reverse
  position?: number | null;
  teams?: number;
  useClaim?: boolean;
};

export async function fetchWaiverAdvice(leagueId: string, rosterId: number, ownerId: string | undefined, playerId: string): Promise<WaiverAdvice> {
  const res = await fetch(`${getApiBaseUrl()}/waiver-advice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leagueId, rosterId, ownerId, playerId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Waiver advice unavailable');
  return data as WaiverAdvice;
}
