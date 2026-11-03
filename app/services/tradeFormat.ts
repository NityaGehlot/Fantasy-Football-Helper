// app/services/tradeFormat.ts
// Trade idea types and text helpers shared by the trade agent screens (no React Native imports).

export type TradeIdeaPlayer = {
  id: string;
  name: string;
  position: string;
  team?: string;
  injuryStatus?: string;
  value: number;
  // Fantasy-playoff (weeks 15-17) schedule strength from the backend
  playoff?: { label: 'easy' | 'average' | 'tough' | 'unknown'; avgRank: number | null; summary: string };
};

export type LineupChange = { in: TradeIdeaPlayer | null; out: TradeIdeaPlayer | null };

export type TradeIdea = {
  id: string;
  partner: { rosterId: number; ownerId: string; teamName: string };
  give: TradeIdeaPlayer[];
  get: TradeIdeaPlayer[];
  myGain: number;
  theirGain: number;
  fairness: number;
  reasons: string[];
  // Older saved scans don't have these.
  myLineup?: LineupChange[];
  theirLineup?: LineupChange[];
};

const one = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const listNames = (players: TradeIdeaPlayer[]) =>
  players.length <= 1
    ? players.map(p => p.name).join('')
    : `${players.slice(0, -1).map(p => p.name).join(', ')} and ${players[players.length - 1].name}`;

export function sleeperLeagueUrl(leagueId: string): string {
  return `https://sleeper.com/leagues/${encodeURIComponent(leagueId)}`;
}

/**
 * A ready-to-send pitch for the other manager. It leads with what *they* get, which is what
 * gets trades accepted, and backs it with the lineup numbers.
 */
export function buildTradeMessage(idea: TradeIdea): string {
  const give = listNames(idea.give);
  const get = listNames(idea.get);
  const upgrades = (idea.theirLineup ?? []).filter(c => c.in && c.out);
  const fills = (idea.theirLineup ?? []).filter(c => c.in && !c.out);

  let why: string;
  if (upgrades.length > 0) {
    const u = upgrades[0];
    why = `${u.in!.name} would start for you over ${u.out!.name} (${one(u.in!.value)} vs ${one(u.out!.value)} pts/game)`;
    why += idea.theirGain > 0 ? `, which by my projections makes your lineup about ${one(idea.theirGain)} points a week better.` : '.';
  } else if (fills.length > 0) {
    why = `${fills[0].in!.name} fills an open spot in your starting lineup.`;
  } else {
    why = `It adds depth for bye weeks and injuries without costing you a starter.`;
  }

  const myNeed = (idea.myLineup ?? []).find(c => c.in)?.in?.position;
  const close = myNeed ? ` I'm looking to shore up ${myNeed}, so I think it works for both of us.` : ' I think it works for both of us.';
  return `Hey! Trade idea: my ${give} for your ${get}. ${why}${close} Let me know what you think!`;
}

// One plain-English line at the top of each trade card.
export function summarizeIdea(idea: TradeIdea): string {
  const mine = (idea.myLineup ?? []).find(c => c.in);
  const theirs = (idea.theirLineup ?? []).find(c => c.in);
  const myPart = mine?.in
    ? mine.out
      ? `${mine.in.name} replaces ${mine.out.name} in your lineup`
      : `${mine.in.name} fills an empty spot in your lineup`
    : `you get ${listNames(idea.get)}`;
  const theirPart = theirs?.in
    ? `${idea.partner.teamName} starts ${theirs.in.name}${theirs.out ? ` over ${theirs.out.name}` : ''}`
    : `${idea.partner.teamName} adds depth`;
  return `${myPart[0].toUpperCase()}${myPart.slice(1)} (+${one(idea.myGain)} pts/week), and ${theirPart}.`;
}

/**
 * How to send the trade in Sleeper. Sleeper's public API can't create trades, and trade
 * offers have no message box, so the pitch goes in a direct message after proposing.
 */
export function tradeSteps(idea: TradeIdea): string[] {
  return [
    `Open your league in the Sleeper app (or sleeper.com) and go to the League tab.`,
    `Tap ${idea.partner.teamName} in the standings to open their roster, then tap "Trade".`,
    `Select the player${idea.get.length > 1 ? 's' : ''} you want: ${listNames(idea.get)}.`,
    `Tap Next, then select the player${idea.give.length > 1 ? 's' : ''} you're offering: ${listNames(idea.give)}.`,
    ...(idea.give.length !== idea.get.length
      ? [`If Sleeper asks, choose who gets dropped to make roster room (the receiving team needs an open spot).`]
      : []),
    `Review the trade and tap "Propose Trade".`,
    `Open a direct message with ${idea.partner.teamName}'s manager (tap their avatar → Message) and paste the suggested message so they see why it helps them.`,
  ];
}

// Plain-English explanations for every number on the trade screen.
export const TRADE_METRIC_HELP = {
  myGain:
    'How many more fantasy points per week your best possible starting lineup is projected to score after this trade. Bigger is better for you.',
  theirGain:
    "The same number for the other team. If it's positive, the trade improves their lineup too, so they have a real reason to say yes.",
  fairness:
    'How even the trade looks on paper: the total projected points per game you give vs. what you get. 100% means equal. Below about 70% usually looks lopsided and gets rejected.',
  value:
    "Projected PPR points per game: this season's average blended with the last 3 games played, lowered if the player is injured.",
};

export const TRADE_SCREEN_GUIDE = [
  'The trade agent looks at every team in your league and finds trades that make your starting lineup better without making theirs worse.',
  'Each card shows who you give, who you get, and how both lineups change in points per week.',
  'Lock players you never want to trade with "Untouchable players" — they will be left out of every idea.',
  'Tap "Propose in Sleeper" for the steps and a ready-to-send message for the other manager.',
];

export type TradeScan = {
  generatedAt: string;
  leagueId: string;
  rosterId: number;
  ideas: TradeIdea[];
  // Sorted untouchable ids the scan was run with; a different set triggers a rescan.
  untouchableKey?: string;
};

export const TRADE_SCAN_INTERVAL_MS = 6 * 60 * 60 * 1000;

export const untouchableKey = (ids: string[]) => [...ids].map(String).sort().join(',');

export function isScanStale(scan: TradeScan | null, now = Date.now(), untouchable?: string[]): boolean {
  if (!scan) return true;
  if (untouchable && (scan.untouchableKey ?? '') !== untouchableKey(untouchable)) return true;
  return now - new Date(scan.generatedAt).getTime() > TRADE_SCAN_INTERVAL_MS;
}

export function countUnseen(ideas: TradeIdea[], seenIds: string[]): number {
  const seen = new Set(seenIds);
  return ideas.filter(i => !seen.has(i.id)).length;
}
