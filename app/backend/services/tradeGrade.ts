// app/backend/services/tradeGrade.ts
// Grades a specific trade (one you were offered, or one you're thinking about) with the
// same lineup math as the trade agent: how your best starting lineup changes, how theirs
// changes, how even the values are, and the fantasy-playoff schedules involved.

import { evaluateTrade, LeagueTeam, TradeIdea, TradePlayer } from "./tradeEngine";
import type { SlotName } from "./lineup";
import { playoffTradeNote } from "./playoffSchedule";

export type TradeGrade = {
  grade: "A" | "B" | "C" | "D" | "F";
  verdict: "accept" | "consider" | "counter" | "decline";
  headline: string;
  idea: TradeIdea;
  notes: string[];
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
  return { grade, verdict, headline, idea, notes };
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
