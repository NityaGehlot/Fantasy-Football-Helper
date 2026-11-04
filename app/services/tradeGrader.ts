// app/services/tradeGrader.ts
// Client for grading a specific trade offer with the backend's lineup math.

import { getApiBaseUrl } from './apiBaseUrl';
import type { TradeIdea, TradeIdeaPlayer } from './tradeFormat';

export type CounterOffer = { summary: string; idea: TradeIdea };

export type TradeGrade = {
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  // received offers: accept / consider / counter / decline; trades you build: send / edit
  verdict: 'accept' | 'consider' | 'counter' | 'decline' | 'send' | 'edit';
  // 'send' = a trade you built; otherwise an offer you got
  mode?: 'send' | 'receive';
  headline: string;
  idea: TradeIdea;
  notes: string[];
  // Better versions to send back when the offer isn't good for you
  counters?: CounterOffer[];
};

export type LeagueTeamRoster = { rosterId: number; teamName: string; players: TradeIdeaPlayer[] };

export type PendingOffer = {
  transactionId: string;
  status: string;
  direction: 'received' | 'sent';
  partnerRosterId: number;
  partnerName: string;
  give: string[];
  get: string[];
  result: TradeGrade;
};

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Request failed');
  return data as T;
}

export const fetchLeagueTeams = (leagueId: string, rosterId: number, ownerId?: string) =>
  post<{ myRosterId: number; teams: LeagueTeamRoster[]; offers: PendingOffer[] }>('/league-teams', { leagueId, rosterId, ownerId });

export const fetchTradeOffers = (leagueId: string, rosterId: number, ownerId?: string) =>
  post<{ checkedAt: string; offers: PendingOffer[]; checked?: OfferCheck }>('/trade-offers', { leagueId, rosterId, ownerId });

/** What the app found in Sleeper's transaction list (shown when no offer appears). */
export type OfferCheck = { weeks: number[]; transactions: number; trades: number; statuses: Record<string, number>; involvingYou: number };

export function describeOfferCheck(c: OfferCheck | undefined): string {
  if (!c) return '';
  const weeks = c.weeks.length > 1 ? `weeks ${c.weeks[0]}–${c.weeks[c.weeks.length - 1]}` : `week ${c.weeks[0]}`;
  const statuses = Object.entries(c.statuses).map(([s, n]) => `${n} ${s}`).join(', ');
  return `Checked Sleeper for ${weeks}: ${c.transactions} transaction${c.transactions === 1 ? '' : 's'}, ${c.trades} trade${c.trades === 1 ? '' : 's'}${statuses ? ` (${statuses})` : ''}, ${c.involvingYou} involving you.`;
}

/** Message to send the other manager with a counter-offer. */
export function counterMessage(partner: string, counter: CounterOffer): string {
  const give = counter.idea.give.map(p => p.name).join(' and ') || 'nothing';
  const get = counter.idea.get.map(p => p.name).join(' and ') || 'nothing';
  const theirs = counter.idea.theirGain;
  const why =
    theirs > 0.3
      ? `By my numbers it still makes your starting lineup about ${theirs.toFixed(1)} points a week better.`
      : 'It still gets you the player you were after.';
  return `Hey ${partner}, thanks for the offer! I can't do that one as is, but how about my ${give} for your ${get}? ${why} Let me know!`;
}

export const fetchTradeFor = (leagueId: string, rosterId: number, ownerId: string | undefined, playerId: string) =>
  post<{ owner: string | null; mine?: boolean; ideas: TradeIdea[] }>('/trade-for', { leagueId, rosterId, ownerId, playerId });

export const gradeTradeOffer = (args: { leagueId: string; rosterId: number; ownerId?: string; partnerRosterId: number; give: string[]; get: string[]; mode?: 'send' | 'receive' }) =>
  post<TradeGrade>('/grade-trade', args);

export const GRADE_COLORS: Record<TradeGrade['grade'], 'success' | 'primary' | 'warning' | 'danger'> = {
  A: 'success',
  B: 'success',
  C: 'warning',
  D: 'danger',
  F: 'danger',
};

/** Question for the AI assistant about this offer. */
export const askAboutOffer = (partner: string, give: string[], get: string[]) =>
  `${partner} offered me ${get.join(' and ') || 'nothing'} for ${give.join(' and ') || 'nothing'}. Should I accept this trade?`;

/** Message to propose a trade you built (or an edited version of it). */
export function proposalMessage(partner: string, idea: TradeIdea): string {
  const give = idea.give.map(p => p.name).join(' and ') || 'nothing';
  const get = idea.get.map(p => p.name).join(' and ') || 'nothing';
  const why =
    idea.theirGain > 0.3
      ? ` By my numbers it makes your starting lineup about ${idea.theirGain.toFixed(1)} points a week better.`
      : '';
  return `Hey ${partner}, would you do my ${give} for your ${get}?${why} Let me know!`;
}

/** Question for the AI about a trade you built. */
export const askAboutProposal = (partner: string, give: string[], get: string[]) =>
  `I'm thinking of sending ${partner} a trade: I give ${give.join(' and ') || 'nothing'} and get ${get.join(' and ') || 'nothing'}. Should I send it as is, or change it so they accept?`;
