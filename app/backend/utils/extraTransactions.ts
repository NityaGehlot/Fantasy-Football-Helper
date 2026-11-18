// app/backend/utils/extraTransactions.ts
// Pending trades sent in by the FF Helper browser extension (Sleeper's public API never returns
// them). Validated before grading, and merged with what the public API returned.

const MAX_EXTRA = 50;

const isPlayerMap = (v: unknown) =>
  !!v && typeof v === "object" && !Array.isArray(v) && Object.values(v as object).every(r => typeof r === "number" && Number.isFinite(r));

/** Only well-formed trades that involve this roster (at most 50). */
export function validateExtraTransactions(raw: unknown, rosterId: number): any[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (t: any) =>
        t &&
        t.type === "trade" &&
        (typeof t.transaction_id === "string" || typeof t.transaction_id === "number") &&
        Array.isArray(t.roster_ids) &&
        t.roster_ids.every((r: unknown) => typeof r === "number") &&
        t.roster_ids.includes(Number(rosterId)) &&
        isPlayerMap(t.adds ?? {}) &&
        isPlayerMap(t.drops ?? {}) &&
        (t.draft_picks === undefined || Array.isArray(t.draft_picks))
    )
    .slice(0, MAX_EXTRA)
    .map((t: any) => ({
      transaction_id: String(t.transaction_id),
      type: "trade",
      status: String(t.status ?? "proposed"),
      creator: t.creator != null ? String(t.creator) : null,
      roster_ids: t.roster_ids,
      adds: t.adds ?? {},
      drops: t.drops ?? {},
      draft_picks: (t.draft_picks ?? []).slice(0, 20),
    }));
}

/** Public-API transactions plus extension ones; when both have a trade, the public one wins. */
export function mergeTransactions(publicTx: any[], extra: any[]): any[] {
  const seen = new Set(publicTx.map(t => String(t?.transaction_id)));
  return [...publicTx, ...extra.filter(t => !seen.has(String(t.transaction_id)))];
}

/**
 * True when every player the trade moves is on one of this league's rosters. Roster ids are
 * small numbers that repeat across leagues, so this is what catches a trade the extension saw
 * for a different league.
 */
export function tradeFitsLeague(t: any, rosteredIds: Set<string>): boolean {
  return [...Object.keys(t?.adds ?? {}), ...Object.keys(t?.drops ?? {})].every(id => rosteredIds.has(String(id)));
}
