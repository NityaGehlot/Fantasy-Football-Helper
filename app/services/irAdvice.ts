// app/services/irAdvice.ts
// Client for the backend IR advice: who to move to an IR slot on Sleeper and who to pick up.

import { getApiBaseUrl } from './apiBaseUrl';

export type IrPlayer = { id: string; name: string; position: string; team?: string; injuryStatus?: string; value: number; inIrSlot?: boolean };

export type IrAdvice = {
  irSlots: number;
  irSlotsUsed: number;
  onIr: IrPlayer[];
  shouldMove: IrPlayer[];
  pickups: { add: IrPlayer; netGain: number }[];
  eligibleStatuses: string[];
};

export async function fetchIrAdvice(leagueId: string, rosterId: number, ownerId?: string): Promise<IrAdvice> {
  const res = await fetch(`${getApiBaseUrl()}/ir-advice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leagueId, rosterId, ownerId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'IR advice failed');
  return data as IrAdvice;
}

// Plain-English status for the IR card ("on IR", "out").
export function irStatusWord(status?: string): string {
  const s = String(status ?? '').toUpperCase();
  if (s === 'IR' || s === 'INJURED RESERVE') return 'on IR';
  if (s === 'NA' || s === 'NOT_ACTIVE') return 'not active';
  if (s === 'SUS' || s === 'SUSPENDED') return 'suspended';
  return s.toLowerCase();
}
