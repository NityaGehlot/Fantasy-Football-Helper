// app/backend/services/tradeEngine.ts
// Finds trades that improve your starting lineup without hurting your trade partner's,
// so the ideas are ones the other manager has a reason to accept.

import { LineupPlayer, SlotName, lineupValue, optimizeLineup } from "./lineup";

export type TradePlayer = LineupPlayer & {
  team?: string;
  injuryStatus?: string;
  // Fantasy-playoff schedule strength, when known (see playoffSchedule.ts)
  playoff?: { label: "easy" | "average" | "tough" | "unknown"; avgRank: number | null; summary: string };
};

export type LeagueTeam = {
  rosterId: number;
  ownerId: string;
  teamName: string;
  players: TradePlayer[];
};

export type TradeIdea = {
  id: string;
  partner: { rosterId: number; ownerId: string; teamName: string };
  give: TradePlayer[];
  get: TradePlayer[];
  // Change in projected starting-lineup points per week.
  myGain: number;
  theirGain: number;
  // 0-1: how close the raw player values on each side are (1 = identical).
  fairness: number;
  reasons: string[];
  // Who moves into / out of each starting lineup (for the pitch message and summary).
  myLineup: LineupChange[];
  theirLineup: LineupChange[];
};

export type LineupChange = { in: TradePlayer | null; out: TradePlayer | null };

export type TradeSearchOptions = {
  maxIdeas?: number;
  perPartner?: number;
  minGain?: number;
  candidatesPerTeam?: number;
  // Only consider trades that include these player ids (used for "trade for X" questions).
  mustGive?: string[];
  mustGet?: string[];
  // Your players that must never be offered.
  untouchable?: string[];
};

// Kickers and defenses are rarely traded and add noise, so they are left out of searches.
const TRADEABLE_POSITIONS = new Set(["QB", "RB", "WR", "TE"]);

const round = (n: number) => Math.round(n * 100) / 100;
const sum = (players: TradePlayer[]) => players.reduce((t, p) => t + p.value, 0);

function combos<T>(items: T[], size: 1 | 2): T[][] {
  if (size === 1) return items.map(i => [i]);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) out.push([items[i], items[j]]);
  }
  return out;
}

function swap(roster: TradePlayer[], outgoing: TradePlayer[], incoming: TradePlayer[]): TradePlayer[] {
  const outIds = new Set(outgoing.map(p => p.id));
  return [...roster.filter(p => !outIds.has(p.id)), ...incoming];
}

function starterIds(players: TradePlayer[], slots: SlotName[]): Set<string> {
  return new Set(optimizeLineup(players, slots).flatMap(a => (a.player ? [a.player.id] : [])));
}

const describe = (p: TradePlayer) => `${p.name} (${p.position}, ${p.value.toFixed(1)} pts/g)`;

// Explain who moves into and out of the starting lineup for one side of the trade.
// Pair up who enters and who leaves the starting lineup.
function lineupChanges(before: TradePlayer[], after: TradePlayer[], slots: SlotName[]): LineupChange[] {
  const beforeStarters = starterIds(before, slots);
  const afterStarters = starterIds(after, slots);
  const added = after.filter(p => afterStarters.has(p.id) && !beforeStarters.has(p.id));
  const removed = before.filter(p => beforeStarters.has(p.id) && !afterStarters.has(p.id));
  const changes: LineupChange[] = added.map((p, i) => ({ in: p, out: removed[i] ?? null }));
  removed.slice(added.length).forEach(p => changes.push({ in: null, out: p }));
  return changes;
}

function lineupReasons(label: string, changes: LineupChange[]): string[] {
  if (changes.length === 0) return [`${label} starting lineup is unchanged; the trade only affects bench depth.`];
  return changes.map(c =>
    c.in && c.out
      ? `${label} lineup: ${describe(c.in)} starts instead of ${describe(c.out)}.`
      : c.in
      ? `${label} lineup: ${describe(c.in)} fills an open starting spot.`
      : `${label} lineup loses ${describe(c.out!)}.`
  );
}

export function evaluateTrade(
  me: LeagueTeam,
  partner: LeagueTeam,
  give: TradePlayer[],
  get: TradePlayer[],
  slots: SlotName[]
): TradeIdea {
  const myAfter = swap(me.players, give, get);
  const theirAfter = swap(partner.players, get, give);
  const myGain = lineupValue(myAfter, slots) - lineupValue(me.players, slots);
  const theirGain = lineupValue(theirAfter, slots) - lineupValue(partner.players, slots);
  const giveValue = sum(give);
  const getValue = sum(get);
  const fairness = Math.max(giveValue, getValue) > 0 ? Math.min(giveValue, getValue) / Math.max(giveValue, getValue) : 0;

  const myLineup = lineupChanges(me.players, myAfter, slots);
  const theirLineup = lineupChanges(partner.players, theirAfter, slots);
  const reasons = [...lineupReasons("Your", myLineup), ...lineupReasons(`${partner.teamName}'s`, theirLineup)];
  if (give.length !== get.length) {
    const receiver = get.length > give.length ? "You" : partner.teamName;
    reasons.push(`${receiver} will need to drop a bench player to make roster room.`);
  }

  return {
    id: `${partner.rosterId}:${give.map(p => p.id).sort().join("+")}>${get.map(p => p.id).sort().join("+")}`,
    partner: { rosterId: partner.rosterId, ownerId: partner.ownerId, teamName: partner.teamName },
    give,
    get,
    myGain: round(myGain),
    theirGain: round(theirGain),
    fairness: round(fairness),
    reasons,
    myLineup,
    theirLineup,
  };
}

export function generateTradeIdeas(
  me: LeagueTeam,
  others: LeagueTeam[],
  slots: SlotName[],
  {
    maxIdeas = 5,
    perPartner = 2,
    minGain = 0.5,
    candidatesPerTeam = 12,
    mustGive = [],
    mustGet = [],
    untouchable = [],
  }: TradeSearchOptions = {}
): TradeIdea[] {
  const required = new Set([...mustGive, ...mustGet]);
  const candidates = (team: LeagueTeam) => {
    const top = team.players
      .filter(p => TRADEABLE_POSITIONS.has(p.position) && p.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, candidatesPerTeam);
    // Make sure explicitly requested players are always in the pool.
    const extras = team.players.filter(p => required.has(p.id) && !top.some(t => t.id === p.id));
    return [...top, ...extras];
  };
  const includesAll = (players: TradePlayer[], ids: string[]) => ids.every(id => players.some(p => p.id === id));
  const ownsAny = (team: LeagueTeam) => mustGet.length === 0 || team.players.some(p => mustGet.includes(p.id));

  const locked = new Set(untouchable.filter(id => !mustGive.includes(id)));
  const mine = candidates(me).filter(p => !locked.has(p.id));
  const scored: { idea: TradeIdea; score: number }[] = [];

  for (const partner of others.filter(ownsAny)) {
    const theirs = candidates(partner);
    const shapes: [1 | 2, 1 | 2][] = [[1, 1], [2, 1], [1, 2]];
    const partnerIdeas: { idea: TradeIdea; score: number }[] = [];

    for (const [giveCount, getCount] of shapes) {
      for (const give of combos(mine, giveCount)) {
        if (!includesAll(give, mustGive)) continue;
        for (const get of combos(theirs, getCount)) {
          if (!includesAll(get, mustGet)) continue;
          const idea = evaluateTrade(me, partner, give, get, slots);
          // Must help you, must not hurt them, and must not look lopsided on paper.
          if (idea.myGain < minGain || idea.theirGain < 0 || idea.fairness < 0.65) continue;
          const score = idea.myGain + 0.5 * Math.min(idea.theirGain, idea.myGain) + idea.fairness;
          partnerIdeas.push({ idea, score });
        }
      }
    }

    partnerIdeas.sort((a, b) => b.score - a.score);
    scored.push(...partnerIdeas.slice(0, perPartner));
  }

  scored.sort((a, b) => b.score - a.score);

  // Avoid showing the same target player over and over.
  const seenTargets = new Set<string>();
  const ideas: TradeIdea[] = [];
  for (const { idea } of scored) {
    const targetKey = idea.get.map(p => p.id).sort().join("+");
    if (seenTargets.has(targetKey)) continue;
    seenTargets.add(targetKey);
    ideas.push(idea);
    if (ideas.length >= maxIdeas) break;
  }
  return ideas;
}
