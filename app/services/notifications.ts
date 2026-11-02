// app/services/notifications.ts
// Turns what the app already knows about your team (lineup alerts, IR advice, trade ideas,
// matchup results) into notifications. Each one has a stable id, so the same problem is
// only announced once.

import type { LineupAlert } from './lineupAlerts';

export type NotificationKind = 'lineup' | 'injury' | 'ir' | 'trade' | 'result';

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: string;
  // Where tapping it takes you
  target: 'Fantasy' | 'Trades';
  leagueId: string;
};

export const MAX_NOTIFICATIONS = 50;

type Board = {
  week: number;
  isFinal: boolean;
  me: { teamName: string; points: number };
  opponent: { teamName: string; points: number } | null;
};

export function notificationsFromState({
  leagueId,
  leagueName,
  week,
  alerts = [],
  board = null,
  irMoves = [],
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
  newTradeIdeas?: number;
  tradeScanAt?: string | null;
  now?: string;
}): AppNotification[] {
  const out: AppNotification[] = [];
  const base = { createdAt: now, leagueId };
  const where = leagueName ? ` (${leagueName})` : '';

  for (const a of alerts) {
    const kind: NotificationKind = a.kind === 'hurt_in_game' ? 'injury' : 'lineup';
    const title =
      a.kind === 'hurt_in_game' ? 'Injury in a live game'
      : a.kind === 'empty' ? 'Empty lineup spot'
      : a.kind === 'bye' ? 'Starter on bye'
      : a.kind === 'out' ? 'Starter is out'
      : 'Starter injury designation';
    out.push({
      ...base,
      // Questionable -> Out for the same player is a new notification.
      id: `alert:${leagueId}:${week}:${a.playerId ?? a.slot}:${a.kind}`,
      kind,
      title: `${title}${where}`,
      body: a.message,
      target: 'Fantasy',
    });
  }

  for (const p of irMoves) {
    out.push({
      ...base,
      id: `ir:${leagueId}:${p.id}:${p.status}`,
      kind: 'ir',
      title: `Open IR spot${where}`,
      body: `${p.name} can go on IR. Move him there in Sleeper and use his roster spot for a pickup.`,
      target: 'Fantasy',
    });
  }

  if (newTradeIdeas > 0 && tradeScanAt) {
    out.push({
      ...base,
      id: `trade:${leagueId}:${tradeScanAt}`,
      kind: 'trade',
      title: `New trade ideas${where}`,
      body: `The trade agent found ${newTradeIdeas} new ${newTradeIdeas === 1 ? 'trade' : 'trades'} that would improve your lineup.`,
      target: 'Trades',
    });
  }

  if (board?.isFinal && board.opponent) {
    const mine = board.me.points;
    const theirs = board.opponent.points;
    const verb = mine > theirs ? 'won' : mine < theirs ? 'lost' : 'tied';
    out.push({
      ...base,
      id: `final:${leagueId}:${board.week}`,
      kind: 'result',
      title: `Week ${board.week} final${where}`,
      body: `You ${verb} ${mine.toFixed(2)} to ${theirs.toFixed(2)} against ${board.opponent.teamName}.`,
      target: 'Fantasy',
    });
  }

  return out;
}

/** Add new notifications to the saved list (newest first), skipping ids already seen. */
export function mergeNotifications(
  existing: AppNotification[],
  incoming: AppNotification[]
): { list: AppNotification[]; added: AppNotification[] } {
  const known = new Set(existing.map(n => n.id));
  const added = incoming.filter(n => !known.has(n.id));
  const list = [...added, ...existing]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_NOTIFICATIONS);
  return { list, added };
}
