// app/backend/services/tradeGrade.ts
// Grades a specific trade (one you were offered, or one you're thinking about) with the
// same lineup math as the trade agent: how your best starting lineup changes, how theirs
// changes, how even the values are, and the fantasy-playoff schedules involved.

import { evaluateTrade, generateTradeIdeas, LeagueTeam, TradeIdea, TradePlayer } from "./tradeEngine";
import type { SlotName } from "./lineup";
import { playoffTradeNote } from "./playoffSchedule";

export type CounterOffer = {
  // What changes compared with their offer, in plain words
  summary: string;
  idea: TradeIdea;
};

export type TradeGrade = {
  grade: "A" | "B" | "C" | "D" | "F";
  verdict: "accept" | "consider" | "counter" | "decline";
  headline: string;
  idea: TradeIdea;
  notes: string[];
  // Better versions of the trade to send back (only when it isn't already good for you)
  counters: CounterOffer[];
};

export function gradeFromGain(myGain: number): TradeGrade["grade"] {
  if (myGain >= 3) return "A";
  if (myGain >= 1) return "B";
  if (myGain > -0.5) return "C";
  if (myGain > -2) return "D";
  return "F";
}

export function gradeTrade(me: LeagueTeam, partner: LeagueTeam, give: TradePlayer[], get: TradePlayer[], slots: SlotName[]): TradeGrade {
  const idea = evaluateTrade(me, partner, give, get, slots);
  const grade = gradeFromGain(idea.myGain);
  const notes: string[] = [];
  const playoff = playoffTradeNote(give, get);
  if (playoff) notes.push(playoff);
  const injuredGet = get.filter(p => p.injuryStatus && !["ACTIVE", "QUESTIONABLE"].includes(String(p.injuryStatus).toUpperCase()));
  if (injuredGet.length) notes.push(`You'd be getting ${injuredGet.map(p => `${p.name} (${p.injuryStatus})`).join(", ")}, so the gain may not show up right away.`);
  if (give.length !== get.length) {
    notes.push(
      give.length > get.length
        ? "You get fewer players than you give, which opens a roster spot for a waiver pickup."
        : "You get more players than you give, so you'll have to drop someone to make room."
    );
  }

  let verdict: TradeGrade["verdict"];
  let headline: string;
  if (idea.myGain >= 1 && idea.fairness >= 0.7) {
    verdict = "accept";
    headline = `Accept: your lineup gets about ${idea.myGain.toFixed(1)} points a week better.`;
  } else if (idea.myGain >= 1) {
    verdict = "accept";
    headline = `Accept quickly: it helps you by ${idea.myGain.toFixed(1)} pts/week and looks lopsided in your favor.`;
  } else if (idea.myGain > -0.5) {
    verdict = "consider";
    headline = "About even for your lineup. Take it only if you like the players or the depth.";
  } else if (idea.myGain > -2 || idea.fairness >= 0.8) {
    verdict = "counter";
    headline = `It costs your lineup ${Math.abs(idea.myGain).toFixed(1)} pts/week. Counter by asking for a bit more.`;
  } else {
    verdict = "decline";
    headline = `Decline: your lineup would lose about ${Math.abs(idea.myGain).toFixed(1)} points a week.`;
  }
  return { grade, verdict, headline, idea, notes, counters: verdict === "accept" ? [] : counterOffers(me, partner, give, get, slots, idea) };
}

const TRADEABLE = new Set(["QB", "RB", "WR", "TE"]);
const names = (list: TradePlayer[]) => list.map(p => p.name).join(" and ");

function combos<T>(items: T[], size: 1 | 2): T[][] {
  if (size === 1) return items.map(i => [i]);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) out.push([items[i], items[j]]);
  return out;
}

/**
 * Counter-offers for a trade that isn't good for you: keep most of what they proposed but
 * ask for more, give less, or swap one player, so the trade helps your lineup (or, for an
 * offer that was already OK, helps it by another point a week) without costing their lineup
 * much more than their own offer did.
 */
export function counterOffers(
  me: LeagueTeam,
  partner: LeagueTeam,
  give: TradePlayer[],
  get: TradePlayer[],
  slots: SlotName[],
  original: TradeIdea,
  limit = 3
): CounterOffer[] {
  const top = (team: LeagueTeam) =>
    team.players.filter(p => TRADEABLE.has(p.position) && p.value > 0).sort((a, b) => b.value - a.value).slice(0, 12);
  const mine = top(me);
  const theirs = top(partner);
  const giveIds = new Set(give.map(p => p.id));
  const getIds = new Set(get.map(p => p.id));
  // A bad offer just needs to become a good one for you; an OK one should get clearly better.
  const target = original.myGain < 0 ? 0.3 : original.myGain + 1;
  // How much a counter may cost their lineup: 2 points a week, plus however far their own
  // offer was from even (an offer that helped them a lot, or one they were willing to lose
  // points on, leaves room to ask for more).
  const theirFloor = -(2 + Math.abs(original.theirGain));
  const options: { summary: string; idea: TradeIdea; score: number }[] = [];
  const consider = (g: TradePlayer[], r: TradePlayer[], summary: string) => {
    if (g.length === 0 && r.length === 0) return;
    const idea = evaluateTrade(me, partner, g, r, slots);
    if (idea.myGain < target || idea.theirGain < theirFloor || idea.fairness < 0.55) return;
    options.push({ summary, idea, score: idea.myGain + 0.5 * Math.min(idea.theirGain - theirFloor, idea.myGain) + idea.fairness });
  };

  // 1. Same players from them, but you give something else.
  for (const size of [1, 2] as const) {
    for (const g of combos(mine.filter(p => !getIds.has(p.id)), size)) {
      if (g.length === give.length && g.every(p => giveIds.has(p.id))) continue;
      consider(g, get, `Give ${names(g)} instead of ${names(give) || "nothing"} for the same players.`);
    }
  }
  // 2. Same players from you, but ask for one more of theirs.
  for (const extra of theirs.filter(p => !getIds.has(p.id))) {
    consider(give, [...get, extra], `Ask for ${extra.name} too.`);
  }
  // 3. Same players from you, but ask for a different player.
  for (const r of combos(theirs.filter(p => !getIds.has(p.id)), 1)) {
    consider(give, r, `Ask for ${names(r)} instead of ${names(get) || "nothing"}.`);
  }

  const seen = new Set<string>();
  return options
    .sort((a, b) => b.score - a.score)
    .filter(o => {
      const key = `${o.idea.give.map(p => p.id).sort()}|${o.idea.get.map(p => p.id).sort()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map(({ summary, idea }) => ({ summary, idea }));
}

export type PendingTrade = {
  transactionId: string;
  status: string;
  direction: "received" | "sent";
  partnerRosterId: number;
  give: string[];
  get: string[];
};

/**
 * Trades in Sleeper's transaction list that involve your roster and aren't finished.
 * Sleeper's public API mostly lists completed moves, so this is often empty: offers can
 * also be entered by hand in the app.
 */
export function pendingTradesFor(transactions: any[], rosterId: number, ownerId?: string): PendingTrade[] {
  return (transactions ?? [])
    .filter(t => t?.type === "trade" && !["complete", "failed"].includes(String(t?.status)))
    .filter(t => (t?.roster_ids ?? []).map(Number).includes(Number(rosterId)))
    .map(t => {
      const adds = Object.entries(t?.adds ?? {}) as [string, number][];
      const drops = Object.entries(t?.drops ?? {}) as [string, number][];
      const partner = (t.roster_ids as number[]).map(Number).find(r => r !== Number(rosterId)) ?? 0;
      return {
        transactionId: String(t.transaction_id ?? ""),
        status: String(t.status ?? "pending"),
        direction: ownerId && String(t.creator) === String(ownerId) ? "sent" : "received",
        partnerRosterId: partner,
        get: adds.filter(([, r]) => Number(r) === Number(rosterId)).map(([id]) => id),
        give: drops.filter(([, r]) => Number(r) === Number(rosterId)).map(([id]) => id),
      } as PendingTrade;
    });
}

/**
 * Offers to send for one player on another team: first trades that help both lineups (the
 * trade agent's rules), then, if none exist, the cheapest fair-value offer for him.
 */
export function tradeForPlayer(me: LeagueTeam, owner: LeagueTeam, playerId: string, slots: SlotName[], limit = 3): TradeIdea[] {
  const target = owner.players.find(p => p.id === playerId);
  if (!target) return [];
  // Win-win trades the trade agent finds that include him...
  const winWin = generateTradeIdeas(me, [owner], slots, { mustGet: [playerId], maxIdeas: 8, perPartner: 8, minGain: -3 });
  // ...plus simple offers for just him: about his value (95-130%) from your roster.
  const mine = me.players.filter(p => TRADEABLE.has(p.position) && p.value > 0).sort((a, b) => b.value - a.value).slice(0, 12);
  const simple: TradeIdea[] = [];
  for (const size of [1, 2] as const) {
    for (const g of combos(mine, size)) {
      const total = g.reduce((t, p) => t + p.value, 0);
      if (total < target.value * 0.95 || total > target.value * 1.3) continue;
      simple.push(evaluateTrade(me, owner, g, [target], slots));
    }
  }
  const seen = new Set<string>();
  return [...winWin, ...simple]
    .filter(i => {
      const key = `${i.give.map(p => p.id).sort()}|${i.get.map(p => p.id).sort()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    // Just him first, then offers that don't hurt your lineup, then the best for you.
    .sort(
      (a, b) =>
        Number(a.get.length > 1) - Number(b.get.length > 1) ||
        Number(b.myGain >= 0) - Number(a.myGain >= 0) ||
        Number(b.theirGain >= 0) - Number(a.theirGain >= 0) ||
        b.myGain - a.myGain
    )
    .slice(0, limit);
}
