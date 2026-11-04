// app/backend/services/leagueMoves.ts
// League activity: the roster moves (waiver claims, free-agent adds and drops) and trades the
// managers in your league made, newest first, from Sleeper's transactions.

export type MovePlayer = { id: string; name: string; position: string; team?: string };
export type MoveSide = {
  rosterId: number;
  teamName: string;
  adds: MovePlayer[];
  drops: MovePlayer[];
  // Draft picks a team receives in a trade ("2027 round 2 (Team 4's)")
  picks: string[];
  // FAAB budget a team receives in a trade
  faab: number;
};
export type LeagueMove = {
  id: string;
  type: "trade" | "waiver" | "free_agent" | "commissioner";
  // When it went through (ms since epoch)
  at: number;
  week: number;
  sides: MoveSide[];
  // Winning waiver bid (FAAB), if any
  bid?: number;
  involvesYou: boolean;
  // One-line summary ("Team 2 added Rico Dowdle and dropped Ty Johnson")
  summary: string;
};

const playerOf = (id: string, players: Record<string, any>): MovePlayer => {
  const p = players[id] ?? {};
  const position = String(p.position ?? (/^[A-Z]{2,3}$/.test(id) ? "DEF" : "")).toUpperCase();
  const defName = [p.first_name, p.last_name].filter(Boolean).join(" ");
  const name = p.full_name || (position === "DEF" ? defName || `${id} DEF` : id);
  return { id, name: String(name), position, team: p.team ?? undefined };
};

const names = (list: MovePlayer[]) => list.map(p => p.name).join(", ");
const money = (n: number) => "$" + String(n);

/**
 * Completed transactions -> readable moves. `teamNames` maps roster id -> team name.
 * Pending trade offers and failed waiver claims are left out (they didn't happen).
 */
export function describeMoves(
  transactions: any[],
  teamNames: Record<number, string>,
  players: Record<string, any>,
  myRosterId?: number | null
): LeagueMove[] {
  const seen = new Set<string>();
  const done = (transactions ?? []).filter(t => {
    if (!t || String(t.status) !== "complete") return false;
    const id = String(t.transaction_id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return done
    .map(t => {
      const rosterIds: number[] = [
        ...new Set<number>([...(t.roster_ids ?? []), ...Object.values(t.adds ?? {}), ...Object.values(t.drops ?? {})].map(Number)),
      ];
      const teamName = (rid: number) => teamNames[rid] ?? `Team ${rid}`;
      const sides: MoveSide[] = rosterIds.map(rid => ({
        rosterId: rid,
        teamName: teamName(rid),
        adds: Object.entries(t.adds ?? {})
          .filter(([, r]) => Number(r) === rid)
          .map(([id]) => playerOf(id, players)),
        drops: Object.entries(t.drops ?? {})
          .filter(([, r]) => Number(r) === rid)
          .map(([id]) => playerOf(id, players)),
        picks: (t.draft_picks ?? [])
          .filter((pk: any) => Number(pk.owner_id) === rid && Number(pk.previous_owner_id) !== rid)
          .map((pk: any) => `${pk.season} round ${pk.round}${Number(pk.roster_id) !== rid ? ` (${teamName(Number(pk.roster_id))}'s)` : ""}`),
        faab: (t.waiver_budget ?? [])
          .filter((w: any) => Number(w.receiver) === rid)
          .reduce((s: number, w: any) => s + Number(w.amount || 0), 0),
      }));
      const type = (["trade", "waiver", "free_agent", "commissioner"].includes(t.type) ? t.type : "free_agent") as LeagueMove["type"];
      const rawBid = Number(t.settings?.waiver_bid);
      const bid = type === "waiver" && Number.isFinite(rawBid) ? rawBid : undefined;
      return {
        id: String(t.transaction_id),
        type,
        at: Number(t.status_updated || t.created || 0),
        week: Number(t.leg ?? t.week ?? 0),
        sides,
        bid,
        involvesYou: myRosterId != null && rosterIds.includes(Number(myRosterId)),
        summary: summarize(type, sides, bid),
      };
    })
    .filter(m => m.sides.some(s => s.adds.length || s.drops.length || s.picks.length || s.faab))
    .sort((a, b) => b.at - a.at);
}

export function summarize(type: LeagueMove["type"], sides: MoveSide[], bid?: number): string {
  if (type === "trade") {
    const got = sides.map(s => {
      const parts = [names(s.adds), ...s.picks, s.faab ? `${money(s.faab)} FAAB` : ""].filter(Boolean);
      return `${s.teamName} gets ${parts.join(", ") || "nothing"}`;
    });
    return `Trade: ${got.join("; ")}`;
  }
  const s = sides[0];
  if (!s) return "Roster move";
  const parts: string[] = [];
  if (s.adds.length) parts.push(`${type === "waiver" ? "claimed" : "added"} ${names(s.adds)}${bid ? ` (${money(bid)})` : ""}`);
  if (s.drops.length) parts.push(`dropped ${names(s.drops)}`);
  return `${s.teamName} ${parts.join(" and ")}`;
}
