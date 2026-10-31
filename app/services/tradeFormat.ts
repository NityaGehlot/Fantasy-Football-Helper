// app/services/tradeFormat.ts
// Trade idea types and text helpers shared by the trade agent screens (no React Native imports).

export type TradeIdeaPlayer = {
  id: string;
  name: string;
  position: string;
  team?: string;
  injuryStatus?: string;
  value: number;
};

export type TradeIdea = {
  id: string;
  partner: { rosterId: number; ownerId: string; teamName: string };
  give: TradeIdeaPlayer[];
  get: TradeIdeaPlayer[];
  myGain: number;
  theirGain: number;
  fairness: number;
  reasons: string[];
};

export function sleeperLeagueUrl(leagueId: string): string {
  return `https://sleeper.com/leagues/${encodeURIComponent(leagueId)}`;
}

export function buildTradeMessage(idea: TradeIdea): string {
  const names = (players: TradeIdea['give']) => players.map(p => `${p.name} (${p.position})`).join(' + ');
  const theirLine =
    idea.theirGain > 0
      ? `By my numbers it makes your starting lineup about ${(Math.round(idea.theirGain * 10) / 10).toFixed(1)} pts/week better.`
      : `It gives you depth without weakening your starters.`;
  return `Trade offer for ${idea.partner.teamName}: my ${names(idea.give)} for your ${names(idea.get)}. ${theirLine} Interested?`;
}

// Steps shown to the user, since Sleeper has no link that pre-fills a trade.
export function tradeSteps(idea: TradeIdea): string[] {
  return [
    `In Sleeper, open ${idea.partner.teamName}'s roster and tap "Trade".`,
    `Select: ${idea.get.map(p => p.name).join(', ')}.`,
    `Offer: ${idea.give.map(p => p.name).join(', ')}.`,
    'Paste the copied message as your trade note (or in league chat) and send.',
  ];
}

export type TradeScan = {
  generatedAt: string;
  leagueId: string;
  rosterId: number;
  ideas: TradeIdea[];
};

export const TRADE_SCAN_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function isScanStale(scan: TradeScan | null, now = Date.now()): boolean {
  if (!scan) return true;
  return now - new Date(scan.generatedAt).getTime() > TRADE_SCAN_INTERVAL_MS;
}

export function countUnseen(ideas: TradeIdea[], seenIds: string[]): number {
  const seen = new Set(seenIds);
  return ideas.filter(i => !seen.has(i.id)).length;
}
