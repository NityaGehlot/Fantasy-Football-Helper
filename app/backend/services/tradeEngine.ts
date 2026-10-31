// app/backend/services/tradeEngine.ts
// Finds trades that improve your starting lineup without hurting your trade partner's,
// so the ideas are ones the other manager has a reason to accept.

import { LineupPlayer, SlotName, lineupValue, optimizeLineup } from "./lineup";

export type TradePlayer = LineupPlayer & { team?: string; injuryStatus?: string };

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
};

export type TradeSearchOptions = {
  maxIdeas?: number;
  perPartner?: number;
  minGain?: number;
  candidatesPerTeam?: number;
  // Only consider trades that include these player ids (used for "trade for X" questions).
  mustGive?: string[];
  mustGet?: string[];
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
function lineupReasons(
  label: string,
  before: TradePlayer[],
  after: TradePlayer[],
  slots: SlotName[]
): string[] {
  const beforeStarters = starterIds(before, slots);
  const afterStarters = starterIds(after, slots);
  const added = after.filter(p => afterStarters.has(p.id) && !beforeStarters.has(p.id));
  const removed = before.filter(p => beforeStarters.has(p.id) && !afterStarters.has(p.id));

  if (added.length === 0 && removed.length === 0) {
    return [`${label} starting lineup is unchanged; the trade only affects bench depth.`];
  }

  const reasons: string[] = [];
  added.forEach((p, i) => {
    const replaced = removed[i];
    reasons.push(
      replaced
        ? `${label} lineup: ${describe(p)} starts instead of ${describe(replaced)}.`
        : `${label} lineup: ${describe(p)} fills an open starting spot.`
    );
  });
  removed.slice(added.length).forEach(p => reasons.push(`${label} lineup loses ${describe(p)}.`));
  return reasons;
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

  const reasons = [
    ...lineupReasons("Your", me.players, myAfter, slots),
    ...lineupReasons(`${partner.teamName}'s`, partner.players, theirAfter, slots),
  ];
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

  const mine = candidates(me);
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
