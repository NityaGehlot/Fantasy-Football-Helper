// app/context/NotificationContext.tsx
// Watches every league you've saved (not just the one open on screen) for the team you marked
// as yours in that league, and keeps one list of notifications labeled by league:
// lineup problems, injuries during games, IR moves and roster locks, big plays (touchdowns),
// win-odds swings, final scores, new trade ideas and the pre-kickoff lineup check.
//
// While games are on it checks every 2 minutes, otherwise every 10. Pop-up notifications:
// phones use Expo notifications (the lineup check is scheduled 90 minutes before each kickoff
// and fires even if the app is closed); the web uses browser notifications while a tab is open.

import React, { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFantasy } from './FantasyContext';
import { auth } from '../services/firebase';
import { getLeague, getNFLState, getRosters } from '../services/sleeperAPI';
import { fetchLiveScoreboard } from '../services/liveMatchup';
import { getInjuryIndex } from '../services/injuryService';
import { currentInjury } from '../services/injuryFormat';
import { getLineupAlerts, type GameState } from '../services/lineupAlerts';
import { fetchIrAdvice } from '../services/irAdvice';
import { fetchLineupCheck, lineupCheckTimes, LINEUP_CHECK_LEAD_MS } from '../services/lineupCheck';
import { fetchTradeOffers } from '../services/tradeGrader';
import { getFavoriteTeamForLeague } from '../services/userService';
import {
  bigPlayNotifications,
  lineupCheckNotification,
  mergeNotifications,
  notificationsFromState,
  oddsSwingNotification,
  snapshotOf,
  tradeOfferNotification,
  type AppNotification,
  type LiveSnapshot,
} from '../services/notifications';
import {
  cancelScheduled,
  getPushPermission,
  onNotificationTap,
  requestPushPermission,
  scheduleAt,
  showNow,
  type PushPermission,
} from '../services/pushNotifications';
import { openTab } from '../navigationRef';

const QUIET_CHECK_MS = 10 * 60 * 1000;
const LIVE_CHECK_MS = 2 * 60 * 1000;
const listKey = (uid: string) => `ffh_notifications_v1:${uid}`;
const readKey = (uid: string) => `ffh_notifications_read_v1:${uid}`;
// Ids of notifications you cleared, so the same alert doesn't come back on the next check.
const dismissedKey = (uid: string) => `ffh_notifications_dismissed_v1:${uid}`;
const PUSH_FLAG_KEY = 'ffh_browser_notifications_v1';

export type WatchedTeam = { leagueId: string; leagueName: string; rosterId: number; ownerId: string };

type NotificationContextType = {
  notifications: AppNotification[];
  unreadCount: number;
  isRead: (id: string) => boolean;
  markAllRead: () => void;
  clearAll: () => void;
  checkNow: () => Promise<void>;
  pushEnabled: boolean;
  pushPermission: PushPermission;
  setPushEnabled: (enabled: boolean) => Promise<void>;
  // Leagues being watched, for the league filter in the list
  watched: WatchedTeam[];
  // Open what a notification points to (switching league first when needed)
  openNotification: (n: AppNotification, askAI?: boolean) => void;
};

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { myTeam, leagues, activeLeagueId, setActiveLeagueId, unreadTradeIdeas, tradeScanAt } = useFantasy();
  const uid = auth.currentUser?.uid ?? 'anon';
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pushEnabled, setPushEnabledState] = useState(false);
  const [pushPermission, setPushPermission] = useState<PushPermission>('unsupported');
  const [watched, setWatched] = useState<WatchedTeam[]>([]);
  const [live, setLive] = useState(false);
  const listRef = useRef<AppNotification[]>([]);
  const readRef = useRef<string[]>([]);
  const dismissedRef = useRef<string[]>([]);
  const pushRef = useRef(false);
  // Last live snapshot and win odds per league (for big plays and odds swings)
  const snapshots = useRef<Record<string, { mine: LiveSnapshot; theirs: LiveSnapshot; odds: number }>>({});

  // Restore saved notifications for this account.
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    (async () => {
      try {
        const [list, read, dismissed, flag, permission] = await Promise.all([
          AsyncStorage.getItem(listKey(uid)),
          AsyncStorage.getItem(readKey(uid)),
          AsyncStorage.getItem(dismissedKey(uid)),
          AsyncStorage.getItem(PUSH_FLAG_KEY),
          getPushPermission().catch(() => 'unsupported' as PushPermission),
        ]);
        if (cancelled) return;
        const parsed = list ? JSON.parse(list) : [];
        // Older saved notifications didn't have a tone.
        listRef.current = (Array.isArray(parsed) ? parsed : []).map((n: AppNotification) => ({ ...n, tone: n.tone ?? 'info' }));
        readRef.current = read ? JSON.parse(read) : [];
        dismissedRef.current = dismissed ? JSON.parse(dismissed) : [];
        setNotifications(listRef.current);
        setReadIds(readRef.current);
        setPushPermission(permission);
        pushRef.current = flag === '1' && permission === 'granted';
        setPushEnabledState(pushRef.current);
      } catch {
        // start empty
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const save = () => {
    AsyncStorage.setItem(listKey(uid), JSON.stringify(listRef.current)).catch(() => undefined);
    AsyncStorage.setItem(readKey(uid), JSON.stringify(readRef.current.slice(-400))).catch(() => undefined);
    AsyncStorage.setItem(dismissedKey(uid), JSON.stringify(dismissedRef.current.slice(-400))).catch(() => undefined);
  };

  const addNotifications = (incoming: AppNotification[]) => {
    const dismissed = new Set(dismissedRef.current);
    const { list, added } = mergeNotifications(listRef.current, incoming.filter(n => !dismissed.has(n.id)));
    if (added.length === 0) return;
    listRef.current = list;
    setNotifications(list);
    save();
    if (pushRef.current) {
      added.slice(0, 3).forEach(n => showNow(n.leagueName ? `${n.title} · ${n.leagueName}` : n.title, n.body, { id: n.id }));
    }
  };

  // ---------- Which team to watch in each league ----------
  // The team you marked as yours in each saved league. The open league uses the team on
  // screen; the others come from what's saved in your account.
  const resolveWatched = async (): Promise<WatchedTeam[]> => {
    const state = await getNFLState().catch(() => null);
    const season = Number(state?.season);
    const out: WatchedTeam[] = [];
    for (const l of leagues) {
      try {
        const league = await getLeague(l.leagueId);
        // Only leagues in the current season have live matchups.
        if (season && Number(league?.season) !== season) continue;
        const owner =
          myTeam && l.leagueId === activeLeagueId ? myTeam.ownerId : (await getFavoriteTeamForLeague(uid, l.leagueId).catch(() => null))?.ownerId;
        if (!owner) continue;
        const rosters = await getRosters(l.leagueId);
        const roster = (rosters ?? []).find((r: any) => String(r.owner_id) === String(owner));
        if (roster) out.push({ leagueId: l.leagueId, leagueName: l.name, rosterId: Number(roster.roster_id), ownerId: String(owner) });
      } catch {
        // skip a league we can't load right now
      }
    }
    return out;
  };

  // ---------- One league ----------
  const checkLeague = async (t: WatchedTeam, week: number, injuryIndex: Awaited<ReturnType<typeof getInjuryIndex>> | null) => {
    const base = { leagueId: t.leagueId, leagueName: t.leagueName, week };
    const [board, ir, check, offers] = await Promise.all([
      fetchLiveScoreboard(t.leagueId, t.rosterId, week).catch(() => null),
      fetchIrAdvice(t.leagueId, t.rosterId, t.ownerId).catch(() => null),
      fetchLineupCheck(t.leagueId, t.rosterId, t.ownerId).catch(() => null),
      fetchTradeOffers(t.leagueId, t.rosterId, t.ownerId).catch(() => null),
    ]);
    const incoming: AppNotification[] = [];

    // Offers other managers sent you, graded.
    for (const o of offers?.offers ?? []) {
      if (o.direction !== 'received') continue;
      incoming.push(
        tradeOfferNotification(base, {
          transactionId: o.transactionId,
          partnerName: o.partnerName,
          grade: o.result.grade,
          headline: o.result.headline,
          give: o.result.idea.give.map(p => p.name),
          get: o.result.idea.get.map(p => p.name),
          counters: o.result.counters?.length ?? 0,
        })
      );
    }

    let alerts: ReturnType<typeof getLineupAlerts> = [];
    if (board) {
      const starters = board.me.starters;
      const playersById: Record<string, any> = {};
      const gameStates: Record<string, GameState> = {};
      const pointsById: Record<string, number> = {};
      starters.forEach(s => {
        const p = { player_id: s.id, full_name: s.name, team: s.team, position: s.position };
        const inj = injuryIndex ? currentInjury(injuryIndex, p) : { status: '', injury: '' };
        playersById[s.id] = { ...p, injury_status: inj.status, injury_body_part: inj.injury };
        gameStates[s.id] = s.game.state;
        pointsById[s.id] = s.points;
      });
      alerts = getLineupAlerts({
        starterIds: starters.map(s => s.id),
        rosterPositions: starters.map(s => s.slot),
        playersById,
        teamsPlaying: null,
        week: board.week,
        gameStates,
        pointsById,
      });

      // Big plays and odds swings compare against the last check in this session.
      const prev = snapshots.current[t.leagueId];
      const oppName = board.opponent?.teamName ?? 'Your opponent';
      if (board.isLive) {
        incoming.push(...bigPlayNotifications(base, prev?.mine ?? null, starters, board.opponent?.starters ?? [], oppName));
        const swing = oddsSwingNotification(base, prev?.odds ?? null, board.me.winProbability, oppName);
        if (swing) incoming.push(swing);
      }
      snapshots.current[t.leagueId] = {
        mine: snapshotOf(starters),
        theirs: snapshotOf(board.opponent?.starters ?? []),
        odds: board.me.winProbability,
      };
    }

    const open = ir ? Math.max(0, ir.irSlots - ir.irSlotsUsed) : 0;
    incoming.push(
      ...notificationsFromState({
        ...base,
        alerts,
        board,
        irMoves: (ir?.locked?.length ? [] : (ir?.shouldMove ?? []).slice(0, open)).map(p => ({ id: p.id, name: p.name, status: String(p.injuryStatus ?? '') })),
        irLocks: (ir?.locked ?? []).map(l => ({ id: l.player.id, name: l.player.name, status: String(l.player.injuryStatus ?? 'ACTIVE'), drop: l.drop?.name ?? null })),
      })
    );

    // Lineup check: in the 90 minutes before a kickoff window, say whether to change anything.
    if (check) {
      const now = Date.now();
      const soon = check.kickoffs.find(k => Date.parse(k) > now && Date.parse(k) - now <= LINEUP_CHECK_LEAD_MS + 5 * 60 * 1000);
      if (soon) {
        const gain = check.swaps.reduce((s, x) => s + x.gain, 0);
        incoming.push(lineupCheckNotification(base, check.swaps.length, gain, soon));
      }
      // Reminders 90 minutes before each kickoff window (phones: fires even if the app is closed).
      const times = lineupCheckTimes(check.kickoffs);
      const ids = times.map(x => `ffhcheck:${t.leagueId}:${x.kickoff}`);
      await cancelScheduled(`ffhcheck:${t.leagueId}:`, ids).catch(() => undefined);
      if (pushRef.current) {
        for (const [i, x] of times.entries()) {
          await scheduleAt(
            ids[i],
            x.at,
            `Lineup check · ${t.leagueName}`,
            'Games start in 90 minutes and inactive lists are out. Tap to see if your lineup needs a swap.',
            { leagueId: t.leagueId, openLineupCheck: true }
          ).catch(() => undefined);
        }
      }
    }

    addNotifications(incoming);
    return !!board?.isLive;
  };

  const checkNow = async () => {
    try {
      const state = await getNFLState();
      if (String(state?.season_type) !== 'regular') return;
      const week = Number(state?.week) || 1;
      const [teams, injuryIndex] = await Promise.all([resolveWatched(), getInjuryIndex().catch(() => null)]);
      setWatched(teams);
      const results = await Promise.all(teams.map(t => checkLeague(t, week, injuryIndex).catch(() => false)));
      setLive(results.some(Boolean));
    } catch (err) {
      console.warn('Notification check failed:', err);
    }
  };

  const leagueKey = leagues.map(l => l.leagueId).join(',');
  // Check when your leagues or team change, then every 2 minutes during games (10 otherwise).
  useEffect(() => {
    if (!loaded || leagues.length === 0) return;
    checkNow();
    const timer = setInterval(checkNow, live ? LIVE_CHECK_MS : QUIET_CHECK_MS);
    return () => clearInterval(timer);
  }, [loaded, leagueKey, myTeam?.ownerId, activeLeagueId, live, pushEnabled]);

  // New trade ideas you haven't looked at yet (one notification per trade agent scan).
  useEffect(() => {
    if (!loaded || !myTeam?.leagueId || !tradeScanAt || unreadTradeIdeas === 0) return;
    const leagueName = leagues.find(l => l.leagueId === activeLeagueId)?.name ?? '';
    addNotifications(
      notificationsFromState({ leagueId: activeLeagueId ?? myTeam.leagueId, leagueName, week: 0, newTradeIdeas: unreadTradeIdeas, tradeScanAt })
    );
  }, [loaded, tradeScanAt]);

  // ---------- Opening a notification ----------
  const pendingOpen = useRef<{ leagueId: string; run: () => void } | null>(null);
  const openNotification = (n: AppNotification, askAI = false) => {
    const run = () => {
      if (askAI && n.aiQuestion) openTab('ChatBot', { ask: n.aiQuestion, leagueId: n.leagueId, nonce: Date.now() });
      else if (n.openLineupCheck) openTab('Fantasy', { lineupCheck: Date.now() });
      else openTab(n.target);
    };
    // Switch to that league first, so the screen (and the AI's team context) match it.
    if (n.leagueId && leagues.some(l => l.leagueId === n.leagueId) && n.leagueId !== activeLeagueId) {
      pendingOpen.current = { leagueId: n.leagueId, run };
      setActiveLeagueId(n.leagueId);
      openTab(askAI ? 'ChatBot' : n.target);
    } else run();
  };
  useEffect(() => {
    if (pendingOpen.current && pendingOpen.current.leagueId === activeLeagueId && myTeam) {
      const run = pendingOpen.current.run;
      pendingOpen.current = null;
      run();
    }
  }, [activeLeagueId, myTeam]);

  // Tapping a phone notification.
  useEffect(
    () =>
      onNotificationTap(data => {
        const n = listRef.current.find(x => x.id === data.id);
        if (n) openNotification(n);
        else if (data.openLineupCheck) {
          if (data.leagueId && data.leagueId !== activeLeagueId) setActiveLeagueId(String(data.leagueId));
          openTab('Fantasy', { lineupCheck: Date.now() });
        }
      }),
    [activeLeagueId, leagueKey]
  );

  const readSet = new Set(readIds);
  const unreadCount = notifications.filter(n => !readSet.has(n.id)).length;

  const markAllRead = () => {
    readRef.current = [...new Set([...readRef.current, ...listRef.current.map(n => n.id)])];
    setReadIds(readRef.current);
    save();
  };

  const clearAll = () => {
    dismissedRef.current = [...new Set([...dismissedRef.current, ...listRef.current.map(n => n.id)])];
    listRef.current = [];
    setNotifications([]);
    save();
  };

  const setPushEnabled = async (enabled: boolean) => {
    if (!enabled) {
      pushRef.current = false;
      setPushEnabledState(false);
      await AsyncStorage.setItem(PUSH_FLAG_KEY, '0').catch(() => undefined);
      await cancelScheduled('ffhcheck:').catch(() => undefined);
      return;
    }
    const permission = await requestPushPermission();
    setPushPermission(permission);
    pushRef.current = permission === 'granted';
    setPushEnabledState(pushRef.current);
    await AsyncStorage.setItem(PUSH_FLAG_KEY, pushRef.current ? '1' : '0').catch(() => undefined);
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        isRead: id => readSet.has(id),
        markAllRead,
        clearAll,
        checkNow,
        pushEnabled,
        pushPermission,
        setPushEnabled,
        watched,
        openNotification,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
};
