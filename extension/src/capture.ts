// extension/src/capture.ts
// Finds Sleeper trades in a JSON response the Sleeper website already loaded, keeping only the
// trade fields FF Helper needs. Pure code: no DOM, no chrome APIs (unit-tested in tests/extension).

export type CapturedTrade = {
  transactionId: string;
  leagueId: string | null;
  status: string;
  type: 'trade';
  creator: string | null;
  rosterIds: number[];
  adds: Record<string, number>;
  drops: Record<string, number>;
  draftPicks: unknown[];
  waiverBudget: unknown[];
  created: number | null;
};

const MAX_DEPTH = 12;
const MAX_TRADES = 200;

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

function playerMap(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObj(v)) return out;
  for (const [k, r] of Object.entries(v)) if (Number.isFinite(Number(r))) out[String(k)] = Number(r);
  return out;
}

function toCaptured(o: Record<string, any>, pageLeagueId: string | null): CapturedTrade {
  return {
    transactionId: String(o.transaction_id),
    leagueId: o.league_id != null ? String(o.league_id) : pageLeagueId,
    status: String(o.status ?? 'unknown'),
    type: 'trade',
    creator: o.creator != null ? String(o.creator) : null,
    rosterIds: (o.roster_ids as unknown[]).map(Number).filter(Number.isFinite),
    adds: playerMap(o.adds),
    drops: playerMap(o.drops),
    draftPicks: Array.isArray(o.draft_picks) ? o.draft_picks : [],
    waiverBudget: Array.isArray(o.waiver_budget) ? o.waiver_budget : [],
    created: Number.isFinite(Number(o.created)) ? Number(o.created) : null,
  };
}

const looksLikeTrade = (o: Record<string, any>) =>
  o.type === 'trade' && (typeof o.transaction_id === 'string' || typeof o.transaction_id === 'number') && Array.isArray(o.roster_ids);

/** Every trade-shaped object in a response (depth ≤ 12, at most 200, no duplicates). */
export function findTrades(json: unknown, pageLeagueId: string | null = null): CapturedTrade[] {
  const out = new Map<string, CapturedTrade>();
  const walk = (v: unknown, depth: number) => {
    if (out.size >= MAX_TRADES || depth > MAX_DEPTH || !v || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      for (const item of v) walk(item, depth + 1);
      return;
    }
    if (looksLikeTrade(v as Record<string, any>)) {
      const t = toCaptured(v as Record<string, any>, pageLeagueId);
      if (!out.has(t.transactionId)) out.set(t.transactionId, t);
      return;
    }
    for (const child of Object.values(v)) walk(child, depth + 1);
  };
  try {
    walk(json, 0);
  } catch {
    // never break the Sleeper page
  }
  return [...out.values()];
}

/** The league id in a Sleeper page address, like https://sleeper.com/leagues/123/trades. */
export function leagueIdFromUrl(url: string): string | null {
  const m = /\/leagues\/(\d+)/.exec(String(url ?? ''));
  return m ? m[1] : null;
}

/** Back to Sleeper's transaction shape, which the FF Helper backend grades. */
export function toTransaction(t: CapturedTrade): Record<string, unknown> {
  return {
    transaction_id: t.transactionId,
    type: 'trade',
    status: t.status,
    creator: t.creator,
    roster_ids: t.rosterIds,
    adds: t.adds,
    drops: t.drops,
    draft_picks: t.draftPicks,
    waiver_budget: t.waiverBudget,
    created: t.created,
  };
}
