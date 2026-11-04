// app/services/notifications.ts
// Turns what the app knows about each of your teams (lineup alerts, IR, trade ideas, live
// scoring, results) into notifications. Each one has a stable id, so the same thing is only
// announced once, a tone (good / bad / info) so you can tell at a glance whether it's good
// news, and usually an action: a question for the AI assistant or a screen to open.

import type { LineupAlert } from './lineupAlerts';

export type NotificationKind = 'lineup' | 'injury' | 'ir' | 'trade' | 'result' | 'big_play' | 'odds' | 'lineup_check' | 'drops';
export type NotificationTone = 'good' | 'bad' | 'info';

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  tone: NotificationTone;
  title: string;
  body: string;
  createdAt: string;
  // Where tapping it takes you
  target: 'Fantasy' | 'Trades' | 'ChatBot' | 'Home';
  leagueId: string;
  leagueName?: string;
  // Question sent to the AI assistant from the "Ask AI" button
  aiQuestion?: string;
  // Opens the lineup check sheet on the Fantasy tab
  openLineupCheck?: boolean;
};

export const MAX_NOTIFICATIONS = 60;

export const TONE_LABELS: Record<NotificationTone, string> = { good: 'Good news', bad: 'Heads up', info: 'Update' };

type Board = {
  week: number;
  isFinal: boolean;
  me: { teamName: string; points: number; winProbability?: number };
  opponent: { teamName: string; points: number } | null;
};

type Base = { leagueId: string; leagueName: string; now?: string };

const make = (b: Base, n: Omit<AppNotification, 'createdAt' | 'leagueId' | 'leagueName'>): AppNotification => ({
  ...n,
  createdAt: b.now ?? new Date().toISOString(),
  leagueId: b.leagueId,
  leagueName: b.leagueName || undefined,
});

export function notificationsFromState({
  leagueId,
  leagueName,
  week,
  alerts = [],
  board = null,
  irMoves = [],
  irLocks = [],
  newTradeIdeas = 0,
  tradeScanAt = null,
  now = new Date().toISOString(),
}: {
  leagueId: string;
  leagueName: string;
  week: number;
  alerts?: LineupAlert[];
  board?: Board | null;
  irMoves?: { id: string; name: string; status: string }[];
  irLocks?: { id: string; name: string; status: string; drop?: string | null }[];
  newTradeIdeas?: number;
  tradeScanAt?: string | null;
  now?: string;
}): AppNotification[] {
  const b: Base = { leagueId, leagueName, now };
  const out: AppNotification[] = [];

  for (const a of alerts) {
    const title =
      a.kind === 'hurt_in_game' ? 'Injury during his game'
      : a.kind === 'empty' ? 'Empty lineup spot'
      : a.kind === 'bye' ? 'Starter on bye'
      : a.kind === 'out' ? 'Starter is out'
      : a.kind === 'doubtful' ? 'Starter is doubtful'
      : 'Starter is questionable';
    const who = a.message.split(' (')[0].split(' is ')[0];
    out.push(
      make(b, {
        // Questionable -> Out for the same player is a new notification.
        id: `alert:${leagueId}:${week}:${a.playerId ?? a.slot}:${a.kind}`,
        kind: a.kind === 'hurt_in_game' ? 'injury' : 'lineup',
        tone: 'bad',
        title,
        body: a.message,
        target: 'Fantasy',
        aiQuestion: a.locked
          ? `${who} got hurt during his game. What should I do with my lineup and roster going forward?`
          : a.kind === 'empty'
            ? `My ${a.slot} spot is empty. Who should I start or pick up?`
            : `${who} ${a.kind === 'bye' ? 'is on bye' : `is ${a.kind}`} this week. Who should I start instead?`,
      })
    );
  }

  for (const p of irLocks) {
    out.push(
      make(b, {
        id: `irlock:${leagueId}:${p.id}:${p.status}`,
        kind: 'ir',
        tone: 'bad',
        title: 'Your Sleeper roster is locked',
        body: `${p.name} is in an IR spot but isn't IR-eligible anymore, so Sleeper blocks adds and roster moves.${p.drop ? ` Drop ${p.drop}, then move ${p.name} back to your bench.` : ` Make room, then move ${p.name} back to your bench.`}`,
        target: 'Fantasy',
        aiQuestion: `${p.name} is healthy and in my IR spot, so my roster is locked. Who should I drop to activate him?`,
      })
    );
  }

  for (const p of irMoves) {
    out.push(
      make(b, {
        id: `ir:${leagueId}:${p.id}:${p.status}`,
        kind: 'ir',
        tone: 'info',
        title: 'Open IR spot',
        body: `${p.name} can go on IR. Move him there in Sleeper and use his roster spot for a pickup.`,
        target: 'Fantasy',
        aiQuestion: `${p.name} is ${p.status.toLowerCase()} and I have an open IR spot. Who should I pick up with the free roster spot?`,
      })
    );
  }

  if (newTradeIdeas > 0 && tradeScanAt) {
    out.push(
      make(b, {
        id: `trade:${leagueId}:${tradeScanAt}`,
        kind: 'trade',
        tone: 'good',
        title: 'New trade ideas',
        body: `The trade agent found ${newTradeIdeas} new ${newTradeIdeas === 1 ? 'trade' : 'trades'} that would improve your lineup.`,
        target: 'Trades',
      })
    );
  }

  if (board?.isFinal && board.opponent) {
    const mine = board.me.points;
    const theirs = board.opponent.points;
    const verb = mine > theirs ? 'won' : mine < theirs ? 'lost' : 'tied';
    out.push(
      make(b, {
        id: `final:${leagueId}:${board.week}`,
        kind: 'result',
        tone: mine > theirs ? 'good' : mine < theirs ? 'bad' : 'info',
        title: `Week ${board.week} final: you ${verb}`,
        body: `You ${verb} ${mine.toFixed(2)} to ${theirs.toFixed(2)} against ${board.opponent.teamName}.`,
        target: 'Fantasy',
        aiQuestion: verb === 'lost' ? 'I lost this week. What should I change on my roster before next week?' : undefined,
      })
    );
  }

  return out;
}

// ---------- Live scoring: big plays and win-odds swings ----------

export type LiveSnapshot = Record<string, { points: number; touchdowns: number }>;

type LivePlayerLike = { id: string; name: string; points: number; touchdowns?: number; game?: { state: string } };

/**
 * Compare two live snapshots and announce touchdowns and big point jumps, for your starters
 * (good news) and your opponent's (bad news).
 */
export function bigPlayNotifications(
  b: Base & { week: number },
  previous: LiveSnapshot | null,
  mine: LivePlayerLike[],
  theirs: LivePlayerLike[],
  opponentName = 'Your opponent'
): AppNotification[] {
  if (!previous) return []; // first look this session: nothing to compare against
  const out: AppNotification[] = [];
  const check = (p: LivePlayerLike, isMine: boolean) => {
    const before = previous[p.id];
    if (!before || p.id === '0') return;
    const tds = (p.touchdowns ?? 0) - before.touchdowns;
    const jump = Math.round((p.points - before.points) * 10) / 10;
    if (tds <= 0 && jump < 8) return;
    const what = tds > 0 ? (tds > 1 ? `${tds} touchdowns` : 'a touchdown') : `${jump} points`;
    out.push(
      make(b, {
        id: `play:${b.leagueId}:${b.week}:${p.id}:${p.touchdowns ?? 0}:${Math.floor(p.points / 8)}`,
        kind: 'big_play',
        tone: isMine ? 'good' : 'bad',
        title: isMine ? (tds > 0 ? 'Touchdown!' : 'Big play') : `${opponentName} scored`,
        body: isMine
          ? `${p.name} just scored ${what} for you. He's at ${p.points.toFixed(1)} pts.`
          : `${opponentName}'s ${p.name} just scored ${what} (${p.points.toFixed(1)} pts).`,
        target: 'Fantasy',
      })
    );
  };
  mine.forEach(p => check(p, true));
  theirs.forEach(p => check(p, false));
  return out;
}

export function snapshotOf(players: LivePlayerLike[]): LiveSnapshot {
  return Object.fromEntries(players.map(p => [p.id, { points: p.points, touchdowns: p.touchdowns ?? 0 }]));
}

/** Tell you when your win odds cross 50% during the games. */
export function oddsSwingNotification(b: Base & { week: number }, before: number | null, after: number, opponentName: string): AppNotification | null {
  if (before === null || (before < 0.5) === (after < 0.5) || after === 0.5) return null;
  const ahead = after > 0.5;
  const pct = Math.round(after * 100);
  return make(b, {
    id: `odds:${b.leagueId}:${b.week}:${ahead ? 'up' : 'down'}:${Math.floor(Date.parse(b.now ?? new Date().toISOString()) / 600000)}`,
    kind: 'odds',
    tone: ahead ? 'good' : 'bad',
    title: ahead ? "You're now favored to win" : "You're now projected to lose",
    body: `Win odds against ${opponentName}: ${pct}%.`,
    target: 'Fantasy',
    aiQuestion: ahead ? undefined : `I'm projected to lose this week (${pct}% to win). Is there anything I can still change in my lineup?`,
  });
}

export function lineupCheckNotification(b: Base & { week: number }, swaps: number, gain: number, kickoff: string): AppNotification {
  return make(b, {
    id: `check:${b.leagueId}:${b.week}:${kickoff}`,
    kind: 'lineup_check',
    tone: swaps > 0 ? 'bad' : 'good',
    title: swaps > 0 ? 'Lineup check: changes recommended' : 'Lineup check: you\'re all set',
    body:
      swaps > 0
        ? `${swaps} swap${swaps === 1 ? '' : 's'} would add about ${gain.toFixed(1)} pts. Tap to see them before kickoff.`
        : 'Your lineup is already the best one for this week.',
    target: 'Fantasy',
    openLineupCheck: true,
  });
}

/** A trade offer someone sent you, graded. */
export function tradeOfferNotification(
  b: Base,
  offer: { transactionId: string; partnerName: string; grade: string; headline: string; give: string[]; get: string[]; counters: number }
): AppNotification {
  const good = offer.grade === 'A' || offer.grade === 'B';
  const bad = offer.grade === 'D' || offer.grade === 'F';
  return make(b, {
    id: `offer:${b.leagueId}:${offer.transactionId}`,
    kind: 'trade',
    tone: good ? 'good' : bad ? 'bad' : 'info',
    title: `Trade offer from ${offer.partnerName}: grade ${offer.grade}`,
    body: `${offer.headline}${bad && offer.counters ? ` ${offer.counters} counter-offer${offer.counters === 1 ? '' : 's'} suggested.` : ''}`,
    target: 'Trades',
    aiQuestion: `${offer.partnerName} offered me ${offer.get.join(' and ') || 'nothing'} for ${offer.give.join(' and ') || 'nothing'}. Should I accept this trade?`,
  });
}

/** Add new notifications to the saved list (newest first), skipping ids already seen. */
export function mergeNotifications(
  existing: AppNotification[],
  incoming: AppNotification[]
): { list: AppNotification[]; added: AppNotification[] } {
  const known = new Set(existing.map(n => n.id));
  const added = incoming.filter((n, i) => !known.has(n.id) && incoming.findIndex(m => m.id === n.id) === i);
  const list = [...added, ...existing]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_NOTIFICATIONS);
  return { list, added };
}

/** "Sun 1:42 PM" for today/this week, "Oct 26, 1:42 PM" for older. */
export function formatStamp(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const days = (now.getTime() - d.getTime()) / 86_400_000;
  if (days < 6) return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${time}`;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`;
}
