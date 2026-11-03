// app/services/aiRecord.ts
// The AI's start/sit track record. Every "start A or B?" answer is saved with the pick; after
// that week's games the actual fantasy points decide whether the pick was right.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiBaseUrl } from './apiBaseUrl';

export type AiCall = {
  id: string;
  leagueId: string;
  season: number;
  week: number;
  askedAt: string;
  pick: string; // player the AI said to start
  other: string; // player it said to sit
  result?: 'right' | 'wrong' | 'push';
  pickPoints?: number;
  otherPoints?: number;
};

const key = (uid: string) => `ffh_ai_record_v1:${uid}`;
const MAX_CALLS = 200;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

/**
 * The pick from an answer like "▶ VERDICT: START JA'MARR CHASE over GARRETT WILSON — Confidence 7/10".
 * `names` are the players from the question, so the saved names are spelled properly.
 */
export function parseVerdict(answer: string, names: string[] = []): { pick: string; other: string } | null {
  const m = answer.match(/VERDICT:\s*START\s+(.+?)\s+over\s+(.+?)(?:\s+[—–-]\s+|\s*\n|\s*$|\s+Confidence)/i);
  if (!m) return null;
  const clean = (s: string) => s.replace(/[*_[\]]/g, '').trim();
  const spell = (s: string) => names.find(n => norm(n) === norm(clean(s))) ?? clean(s);
  const pick = spell(m[1]);
  const other = spell(m[2]);
  if (!pick || !other || norm(pick) === norm(other)) return null;
  return { pick, other };
}

/** Player names in a "Should I start A or B" question. */
export function namesInQuestion(question: string): string[] {
  const m = question.match(/start\s+(.+?)\s+or\s+(.+?)(?:\s+this week|\?|$)/i);
  return m ? [m[1].trim(), m[2].trim()] : [];
}

export function gradeCall(call: AiCall, points: Record<string, number | null>): AiCall {
  const a = points[norm(call.pick)];
  const b = points[norm(call.other)];
  if (a === null || a === undefined || b === null || b === undefined) return call;
  const result: AiCall['result'] = a > b ? 'right' : a < b ? 'wrong' : 'push';
  return { ...call, result, pickPoints: a, otherPoints: b };
}

export function summarizeRecord(calls: AiCall[]): { right: number; wrong: number; push: number; pending: number; pct: number | null } {
  const right = calls.filter(c => c.result === 'right').length;
  const wrong = calls.filter(c => c.result === 'wrong').length;
  const push = calls.filter(c => c.result === 'push').length;
  const pending = calls.filter(c => !c.result).length;
  return { right, wrong, push, pending, pct: right + wrong ? Math.round((right / (right + wrong)) * 100) : null };
}

export async function loadCalls(uid: string): Promise<AiCall[]> {
  try {
    const raw = await AsyncStorage.getItem(key(uid));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveCalls(uid: string, calls: AiCall[]) {
  await AsyncStorage.setItem(key(uid), JSON.stringify(calls.slice(-MAX_CALLS))).catch(() => undefined);
}

/** Actual fantasy points (PPR) for players in a finished week, keyed by normalized name. */
export async function fetchWeekPoints(season: number, week: number, names: string[]): Promise<Record<string, number | null>> {
  const res = await fetch(`${getApiBaseUrl()}/player-week-points`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ season, week, names }),
  });
  if (!res.ok) return {};
  const data = await res.json();
  return Object.fromEntries(Object.entries(data?.points ?? {}).map(([n, p]) => [norm(n), p as number | null]));
}

/** Grade every saved call whose week is over (stats files come out on Tuesdays). */
export async function gradePending(calls: AiCall[], currentSeason: number, currentWeek: number): Promise<AiCall[]> {
  const due = calls.filter(c => !c.result && (c.season < currentSeason || c.week < currentWeek));
  const groups = new Map<string, AiCall[]>();
  due.forEach(c => groups.set(`${c.season}:${c.week}`, [...(groups.get(`${c.season}:${c.week}`) ?? []), c]));
  const graded = new Map<string, AiCall>();
  for (const [k, list] of groups) {
    const [season, week] = k.split(':').map(Number);
    const points = await fetchWeekPoints(season, week, [...new Set(list.flatMap(c => [c.pick, c.other]))]).catch(() => ({}));
    list.forEach(c => graded.set(c.id, gradeCall(c, points)));
  }
  return calls.map(c => graded.get(c.id) ?? c);
}
