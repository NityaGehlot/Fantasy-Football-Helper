// app/context/NotificationContext.tsx
// Watches your team while the app is open and keeps a list of notifications: lineup problems,
// injuries during games, open IR moves, new trade ideas and final scores. On the web you can
// also turn on browser notifications so they pop up while the app is in another tab.

import React, { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFantasy } from './FantasyContext';
import { auth } from '../services/firebase';
import { getNFLState } from '../services/sleeperAPI';
import { fetchLiveScoreboard } from '../services/liveMatchup';
import { getInjuryIndex } from '../services/injuryService';
import { currentInjury } from '../services/injuryFormat';
import { getLineupAlerts, type GameState } from '../services/lineupAlerts';
import { fetchIrAdvice } from '../services/irAdvice';
import { mergeNotifications, notificationsFromState, type AppNotification } from '../services/notifications';

const CHECK_EVERY_MS = 10 * 60 * 1000;
const listKey = (uid: string) => `ffh_notifications_v1:${uid}`;
const readKey = (uid: string) => `ffh_notifications_read_v1:${uid}`;
// Ids of notifications you cleared, so the same alert doesn't come back on the next check.
const dismissedKey = (uid: string) => `ffh_notifications_dismissed_v1:${uid}`;
const BROWSER_FLAG_KEY = 'ffh_browser_notifications_v1';

type BrowserPermission = 'unsupported' | 'default' | 'granted' | 'denied';

type NotificationContextType = {
  notifications: AppNotification[];
  unreadCount: number;
  isRead: (id: string) => boolean;
  markAllRead: () => void;
  clearAll: () => void;
  checkNow: () => Promise<void>;
  browserEnabled: boolean;
  browserPermission: BrowserPermission;
  setBrowserEnabled: (enabled: boolean) => Promise<void>;
};

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const browserApi = (): any => (Platform.OS === 'web' ? (globalThis as any).Notification : undefined);
const currentPermission = (): BrowserPermission => {
  const api = browserApi();
  return api ? (api.permission as BrowserPermission) : 'unsupported';
};

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { myTeam, leagues, unreadTradeIdeas, tradeScanAt } = useFantasy();
  const uid = auth.currentUser?.uid ?? 'anon';
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [browserEnabled, setBrowserEnabledState] = useState(false);
  const [browserPermission, setBrowserPermission] = useState<BrowserPermission>(currentPermission());
  const listRef = useRef<AppNotification[]>([]);
  const readRef = useRef<string[]>([]);
  const dismissedRef = useRef<string[]>([]);

  // Restore saved notifications for this account.
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    (async () => {
      try {
        const [list, read, dismissed, flag] = await Promise.all([
          AsyncStorage.getItem(listKey(uid)),
          AsyncStorage.getItem(readKey(uid)),
          AsyncStorage.getItem(dismissedKey(uid)),
          AsyncStorage.getItem(BROWSER_FLAG_KEY),
        ]);
        if (cancelled) return;
        const parsed = list ? JSON.parse(list) : [];
        listRef.current = Array.isArray(parsed) ? parsed : [];
        readRef.current = read ? JSON.parse(read) : [];
        dismissedRef.current = dismissed ? JSON.parse(dismissed) : [];
        setNotifications(listRef.current);
        setReadIds(readRef.current);
        setBrowserEnabledState(flag === '1' && currentPermission() === 'granted');
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
    AsyncStorage.setItem(readKey(uid), JSON.stringify(readRef.current.slice(-300))).catch(() => undefined);
    AsyncStorage.setItem(dismissedKey(uid), JSON.stringify(dismissedRef.current.slice(-300))).catch(() => undefined);
  };

  const showInBrowser = (added: AppNotification[]) => {
    const api = browserApi();
    if (!browserEnabled || !api || api.permission !== 'granted') return;
    added.slice(0, 3).forEach(n => {
      try {
        new api(n.title, { body: n.body, tag: n.id });
      } catch {
        // some browsers only allow notifications from a service worker
      }
    });
  };

  const addNotifications = (incoming: AppNotification[]) => {
    const dismissed = new Set(dismissedRef.current);
    const { list, added } = mergeNotifications(listRef.current, incoming.filter(n => !dismissed.has(n.id)));
    if (added.length === 0) return;
    listRef.current = list;
    setNotifications(list);
    save();
    showInBrowser(added);
  };

  const leagueName = leagues.find(l => l.leagueId === myTeam?.leagueId)?.name ?? '';

  // Look at your current matchup: lineup problems, in-game injuries, IR moves, final score.
  const checkNow = async () => {
    if (!myTeam?.leagueId || myTeam.rosterId === undefined) return;
    try {
      const state = await getNFLState();
      if (String(state?.season_type) !== 'regular') return;
      const week = Number(state?.week) || 1;
      const [board, injuryIndex, ir] = await Promise.all([
        fetchLiveScoreboard(myTeam.leagueId, myTeam.rosterId, week).catch(() => null),
        getInjuryIndex().catch(() => null),
        fetchIrAdvice(myTeam.leagueId, myTeam.rosterId, myTeam.ownerId).catch(() => null),
      ]);

      let alerts: ReturnType<typeof getLineupAlerts> = [];
      if (board) {
        const starters = board.me.starters;
        const playersById: Record<string, any> = {};
        const gameStates: Record<string, GameState> = {};
        const pointsById: Record<string, number> = {};
        starters.forEach(s => {
          const base = { player_id: s.id, full_name: s.name, team: s.team, position: s.position };
          const inj = injuryIndex ? currentInjury(injuryIndex, base) : { status: '', injury: '' };
          playersById[s.id] = { ...base, injury_status: inj.status, injury_body_part: inj.injury };
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
      }

      const open = ir ? Math.max(0, ir.irSlots - ir.irSlotsUsed) : 0;
      addNotifications(
        notificationsFromState({
          leagueId: myTeam.leagueId,
          leagueName,
          week,
          alerts,
          board,
          irMoves: (ir?.shouldMove ?? []).slice(0, open).map(p => ({ id: p.id, name: p.name, status: String(p.injuryStatus ?? '') })),
        })
      );
    } catch (err) {
      console.warn('Notification check failed:', err);
    }
  };

  // Check when the team changes and every 10 minutes while the app is open.
  useEffect(() => {
    if (!loaded || !myTeam?.leagueId) return;
    checkNow();
    const timer = setInterval(checkNow, CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, [loaded, myTeam?.leagueId, myTeam?.rosterId, browserEnabled]);

  // New trade ideas you haven't looked at yet (one notification per trade agent scan).
  useEffect(() => {
    if (!loaded || !myTeam?.leagueId || !tradeScanAt || unreadTradeIdeas === 0) return;
    addNotifications(
      notificationsFromState({ leagueId: myTeam.leagueId, leagueName, week: 0, newTradeIdeas: unreadTradeIdeas, tradeScanAt })
    );
  }, [loaded, tradeScanAt]);

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

  const setBrowserEnabled = async (enabled: boolean) => {
    const api = browserApi();
    if (!enabled || !api) {
      setBrowserEnabledState(false);
      await AsyncStorage.setItem(BROWSER_FLAG_KEY, '0').catch(() => undefined);
      return;
    }
    const permission: BrowserPermission = api.permission === 'granted' ? 'granted' : await api.requestPermission();
    setBrowserPermission(permission);
    const on = permission === 'granted';
    setBrowserEnabledState(on);
    await AsyncStorage.setItem(BROWSER_FLAG_KEY, on ? '1' : '0').catch(() => undefined);
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
        browserEnabled,
        browserPermission,
        setBrowserEnabled,
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
