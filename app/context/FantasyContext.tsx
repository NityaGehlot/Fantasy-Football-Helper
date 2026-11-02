import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
  useMemo,
  useRef
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { auth } from "../services/firebase";
import { getLeague } from "../services/sleeperAPI";
import { streamFantasyChatResponse } from "../services/FantasyChatbot";
import { getApiBaseUrl } from "../services/apiBaseUrl";
import {
  countUnseen,
  isScanStale,
  loadSavedScan,
  loadSeenIdeaIds,
  loadUntouchables,
  runTradeScan,
  saveSeenIdeaIds,
  saveUntouchables,
  type TradeIdea,
} from "../services/tradeAgent";
import {
  addLeagueForUser,
  removeLeagueForUser,
  listUserLeagues,
  setFavoriteTeamForLeague,
  getFavoriteTeamForLeague,
  getLastLeagueForUser,
  setLastLeagueForUser,
  type FavoriteTeam,
} from "../services/userService";
import { pickStartingLeague } from "../services/leagueInput";

// Before chats were split by league, everything was saved under this one key.
const LEGACY_CHAT_STORAGE_KEY = "fantasy_chat_messages_v1";
// Each league has its own conversation with the assistant.
const chatStorageKey = (uid: string, leagueKey: string) => `fantasy_chat_messages_v2:${uid}:${leagueKey}`;
const NO_LEAGUE = "none";
const lastLeagueStorageKey = (uid: string) => `ffh_last_league_v1:${uid}`;
const CHAT_PERSISTENCE_FLAG_KEY = "fantasy_chat_persistence_enabled_v1";
// Local snapshot of the user's team per league, so roster-aware features work
// immediately on app open without waiting for Sleeper.
const myTeamStorageKey = (uid: string, leagueId: string) => `ffh_my_team_v1:${uid}:${leagueId}`;

export type ChatMessage = {
  id: string;
  role: "user" | "bot";
  text: string;
};

export type FantasyTeamPlayer = {
  playerId: string;
  fullName: string;
  position: string;
  team: string;
  isStarter: boolean;
};

export type MyFantasyTeam = {
  leagueId: string;
  ownerId: string;
  rosterId: number;
  teamName: string;
  players: FantasyTeamPlayer[];
  starters: string[];
  starterSlotsByPosition?: Partial<Record<"QB" | "RB" | "WR" | "TE" | "K" | "DEF", number>>;
  // league.roster_positions (starting slots, then BN/IR), for flex eligibility
  rosterPositions?: string[];
  // Players sitting in IR spots (they can't be started)
  reserve?: string[];
};

interface League {
  leagueId: string;
  name: string;
}

interface FantasyContextType {
  playerStats2025: any[];
  setPlayerStats2025: React.Dispatch<React.SetStateAction<any[]>>;
  matchups: any[];
  setMatchups: React.Dispatch<React.SetStateAction<any[]>>;
  selectedWeek: number;
  setSelectedWeek: React.Dispatch<React.SetStateAction<number>>;
  leagues: League[];
  activeLeagueId: string | null;
  addLeague: (leagueId: string) => Promise<void>;
  deleteLeague: (leagueId: string) => Promise<void>;
  setActiveLeagueId: (id: string | null) => void;
  chatMessages: ChatMessage[];
  isChatTyping: boolean;
  unreadBotMessages: number;
  markChatAsRead: () => void;
  clearChatHistory: () => Promise<void>;
  chatPersistenceEnabled: boolean;
  setChatPersistenceEnabled: (enabled: boolean) => Promise<void>;
  sendChatMessage: (text: string) => Promise<void>;
  myTeam: MyFantasyTeam | null;
  favoriteTeam: FavoriteTeam | null;
  setMyTeam: (team: MyFantasyTeam, options?: { persist?: boolean }) => Promise<void>;
  clearMyTeam: () => Promise<void>;
  // Trade agent
  tradeIdeas: TradeIdea[];
  tradeScanAt: string | null;
  isTradeScanning: boolean;
  tradeScanError: string | null;
  unreadTradeIdeas: number;
  refreshTradeIdeas: (force?: boolean) => Promise<void>;
  markTradeIdeasSeen: () => void;
  untouchablePlayerIds: string[];
  toggleUntouchable: (playerId: string) => void;
}

const FantasyContext = createContext<FantasyContextType | undefined>(undefined);

export const FantasyProvider = ({ children }: { children: ReactNode }) => {
  const [playerStats2025, setPlayerStats2025] = useState<any[]>([]);
  const [matchups, setMatchups] = useState<any[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<number>(17);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [activeLeagueId, setActiveLeagueIdState] = useState<string | null>(null);
  // Conversations keyed by league, so each league has its own chat with the assistant.
  const [chatByLeague, setChatByLeague] = useState<Record<string, ChatMessage[]>>({});
  const [typingLeague, setTypingLeague] = useState<string | null>(null);
  const [seenBotByLeague, setSeenBotByLeague] = useState<Record<string, number>>({});
  const [chatPersistenceEnabled, setChatPersistenceEnabledState] = useState(true);
  const [loadedChatKeys, setLoadedChatKeys] = useState<Record<string, boolean>>({});
  const [myTeam, setMyTeamState] = useState<MyFantasyTeam | null>(null);
  const [favoriteTeam, setFavoriteTeam] = useState<FavoriteTeam | null>(null);

  const [tradeIdeas, setTradeIdeas] = useState<TradeIdea[]>([]);
  const [tradeScanAt, setTradeScanAt] = useState<string | null>(null);
  const [isTradeScanning, setIsTradeScanning] = useState(false);
  const [tradeScanError, setTradeScanError] = useState<string | null>(null);
  const [seenTradeIdeaIds, setSeenTradeIdeaIds] = useState<string[]>([]);
  const [untouchablePlayerIds, setUntouchablePlayerIds] = useState<string[]>([]);
  const [untouchablesLoaded, setUntouchablesLoaded] = useState(false);

  const typingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatIdCounterRef = useRef(0);

  const user = auth.currentUser;
  const uid = user?.uid ?? "anon";
  const chatKey = activeLeagueId ?? NO_LEAGUE;
  const chatMessages = chatByLeague[chatKey] ?? [];
  const isChatTyping = typingLeague !== null;

  const totalBotMessages = useMemo(
    () => chatMessages.filter(msg => msg.role === "bot").length,
    [chatMessages]
  );

  const unreadBotMessages = Math.max(0, totalBotMessages - (seenBotByLeague[chatKey] ?? 0));

  // Switch leagues and remember the choice (on this device right away, and in Firestore so a
  // refresh or another device reopens the same league).
  const setActiveLeagueId = (id: string | null) => {
    setActiveLeagueIdState(id);
    if (!user?.uid) return;
    const key = lastLeagueStorageKey(user.uid);
    (id ? AsyncStorage.setItem(key, id) : AsyncStorage.removeItem(key)).catch(() => undefined);
    setLastLeagueForUser(user.uid, id).catch(err => console.warn("Failed to save last league:", err));
  };

  const nextChatMessageId = () => {
    chatIdCounterRef.current += 1;
    return `${Date.now()}-${chatIdCounterRef.current}`;
  };

  const stopTypingInterval = () => {
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }
  };

  // Replies are written to the league the question was asked in, even if you switch leagues
  // while the answer is still coming in.
  const updateBotMessage = (leagueKey: string, messageId: string, text: string) => {
    setChatByLeague(prev => ({
      ...prev,
      [leagueKey]: (prev[leagueKey] ?? []).map(msg => (msg.id === messageId ? { ...msg, text } : msg)),
    }));
  };

  // Reveal a non-streamed reply quickly (whole answer in about a second at most),
  // instead of one character every 15ms, which made long answers take 30+ seconds to show.
  const revealBotReply = (leagueKey: string, messageId: string, reply: string) => {
    stopTypingInterval();
    if (!reply) {
      setTypingLeague(null);
      return;
    }
    const step = Math.max(8, Math.ceil(reply.length / 60));
    let idx = 0;
    typingIntervalRef.current = setInterval(() => {
      idx = Math.min(reply.length, idx + step);
      updateBotMessage(leagueKey, messageId, reply.slice(0, idx));
      if (idx >= reply.length) {
        stopTypingInterval();
        setTypingLeague(null);
      }
    }, 16);
  };

  const sendChatMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isChatTyping) return;

    const userMessageId = nextChatMessageId();
    const botMessageId = nextChatMessageId();
    const leagueKey = chatKey;

    setChatByLeague(prev => ({
      ...prev,
      [leagueKey]: [
        ...(prev[leagueKey] ?? []),
        { id: userMessageId, role: "user", text: trimmed },
        { id: botMessageId, role: "bot", text: "" },
      ],
    }));
    setTypingLeague(leagueKey);

    try {
      let streamedUpdates = 0;
      const reply = await streamFantasyChatResponse(
        trimmed,
        textSoFar => {
          streamedUpdates += 1;
          updateBotMessage(leagueKey, botMessageId, textSoFar);
        },
        selectedWeek,
        myTeam
      );
      if (streamedUpdates > 0) {
        // Streamed live: text is already on screen.
        updateBotMessage(leagueKey, botMessageId, reply);
        setTypingLeague(null);
      } else {
        revealBotReply(leagueKey, botMessageId, reply);
      }
    } catch (err) {
      console.error("Failed to send chat message:", err);
      updateBotMessage(leagueKey, botMessageId, "⚠️ Failed to reach AI.");
      setTypingLeague(null);
    }
  };

  const markChatAsRead = () => {
    setSeenBotByLeague(prev => (prev[chatKey] === totalBotMessages ? prev : { ...prev, [chatKey]: totalBotMessages }));
  };

  // Clears only this league's conversation.
  const clearChatHistory = async () => {
    if (typingLeague === chatKey) {
      stopTypingInterval();
      setTypingLeague(null);
    }
    setChatByLeague(prev => ({ ...prev, [chatKey]: [] }));
    setSeenBotByLeague(prev => ({ ...prev, [chatKey]: 0 }));

    try {
      await AsyncStorage.removeItem(chatStorageKey(uid, chatKey));
    } catch (err) {
      console.error("Failed to clear saved chat history:", err);
    }
  };

  const setChatPersistenceEnabled = async (enabled: boolean) => {
    setChatPersistenceEnabledState(enabled);

    try {
      await AsyncStorage.setItem(CHAT_PERSISTENCE_FLAG_KEY, enabled ? "1" : "0");
      const keys = Object.keys(chatByLeague);
      if (enabled) {
        await Promise.all(keys.map(k => AsyncStorage.setItem(chatStorageKey(uid, k), JSON.stringify(chatByLeague[k] ?? []))));
      } else {
        await Promise.all(keys.map(k => AsyncStorage.removeItem(chatStorageKey(uid, k))));
      }
    } catch (err) {
      console.error("Failed to update chat persistence setting:", err);
    }
  };

  // =====================
  // Load leagues for user
  // =====================
  useEffect(() => {
    if (!user) return;

    const loadLeagues = async () => {
      try {
        const [loaded, localLast, savedLast] = await Promise.all([
          listUserLeagues(user.uid),
          AsyncStorage.getItem(lastLeagueStorageKey(user.uid)).catch(() => null),
          getLastLeagueForUser(user.uid).catch(() => null),
        ]);
        setLeagues(loaded as League[]);
        const ids = loaded.map((l: League) => l.leagueId);
        // Reopen the league you were last on (this device first, then your account).
        setActiveLeagueIdState(prev => pickStartingLeague(ids, prev, localLast, savedLast));
      } catch (err) {
        console.error("Error loading leagues:", err);
      }
    };

    loadLeagues();
  }, [user?.uid]);

  useEffect(() => {
    return () => {
      stopTypingInterval();
    };
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(CHAT_PERSISTENCE_FLAG_KEY)
      .then(flag => setChatPersistenceEnabledState(flag !== "0"))
      .catch(() => undefined);
  }, []);

  // Load the saved conversation for the league you're on (once per league per session).
  useEffect(() => {
    const storageKey = chatStorageKey(uid, chatKey);
    if (loadedChatKeys[storageKey]) return;
    let cancelled = false;

    const loadChat = async () => {
      try {
        const enabled = (await AsyncStorage.getItem(CHAT_PERSISTENCE_FLAG_KEY)) !== "0";
        if (!enabled) return;
        let saved = await AsyncStorage.getItem(storageKey);
        // One-time move of the old single chat into the league that's open now.
        if (!saved && chatKey !== NO_LEAGUE) {
          const legacy = await AsyncStorage.getItem(LEGACY_CHAT_STORAGE_KEY);
          if (legacy) {
            saved = legacy;
            await AsyncStorage.setItem(storageKey, legacy);
            await AsyncStorage.removeItem(LEGACY_CHAT_STORAGE_KEY);
          }
        }
        const parsed = saved ? (JSON.parse(saved) as ChatMessage[]) : [];
        const safeMessages = Array.isArray(parsed)
          ? parsed.filter(
              m => m && typeof m.id === "string" && (m.role === "user" || m.role === "bot") && typeof m.text === "string"
            )
          : [];
        if (cancelled) return;
        // Keep anything typed before the saved copy finished loading.
        setChatByLeague(prev => ({ ...prev, [chatKey]: [...safeMessages, ...(prev[chatKey] ?? [])] }));
        // Old messages count as read.
        setSeenBotByLeague(prev => ({
          ...prev,
          [chatKey]: (prev[chatKey] ?? 0) + safeMessages.filter(m => m.role === "bot").length,
        }));
      } catch (err) {
        console.error("Failed to restore chat history:", err);
      } finally {
        if (!cancelled) setLoadedChatKeys(prev => ({ ...prev, [storageKey]: true }));
      }
    };

    loadChat();
    return () => {
      cancelled = true;
    };
  }, [uid, chatKey]);

  // Load the saved favorite team name for the active league.
  // FantasyScreen rebuilds the full team from Sleeper once rosters load.
  useEffect(() => {
    let cancelled = false;
    setMyTeamState(null);
    setFavoriteTeam(null);

    const loadMyTeam = async () => {
      if (!user?.uid || !activeLeagueId) return;
      try {
        const snapshot = await AsyncStorage.getItem(myTeamStorageKey(user.uid, activeLeagueId));
        const parsed = snapshot ? (JSON.parse(snapshot) as MyFantasyTeam) : null;
        if (!cancelled && parsed && Array.isArray(parsed.players)) setMyTeamState(parsed);
      } catch (err) {
        console.warn("Failed to restore saved team snapshot:", err);
      }
      try {
        const saved = await getFavoriteTeamForLeague(user.uid, activeLeagueId);
        if (!cancelled) setFavoriteTeam(saved);
      } catch (err) {
        console.error("Failed to load my team from Firestore:", err);
      }
    };

    loadMyTeam();
    return () => {
      cancelled = true;
    };
  }, [user?.uid, activeLeagueId]);

  // Save each league's conversation after it changes (only once its saved copy has loaded,
  // so an empty list never overwrites history).
  useEffect(() => {
    if (!chatPersistenceEnabled) return;
    Object.entries(chatByLeague).forEach(([leagueKey, messages]) => {
      const storageKey = chatStorageKey(uid, leagueKey);
      if (!loadedChatKeys[storageKey]) return;
      AsyncStorage.setItem(storageKey, JSON.stringify(messages)).catch(err =>
        console.error("Failed to persist chat history:", err)
      );
    });
  }, [chatByLeague, chatPersistenceEnabled, loadedChatKeys, uid]);

  // =====================
  // Trade agent: load the last scan for this team, and rescan automatically when stale
  // =====================
  const tradeLeagueId = myTeam?.leagueId ?? null;
  const tradeRosterId = myTeam?.rosterId ?? null;

  const refreshTradeIdeas = async (force = false, untouchable = untouchablePlayerIds) => {
    if (!tradeLeagueId || tradeRosterId === null) return;
    const saved = force ? null : await loadSavedScan(tradeLeagueId, tradeRosterId);
    if (saved && !isScanStale(saved, Date.now(), untouchable)) {
      setTradeIdeas(saved.ideas);
      setTradeScanAt(saved.generatedAt);
      return;
    }

    setIsTradeScanning(true);
    setTradeScanError(null);
    try {
      const scan = await runTradeScan(
        { leagueId: tradeLeagueId, rosterId: tradeRosterId, ownerId: myTeam?.ownerId },
        untouchable
      );
      setTradeIdeas(scan.ideas);
      setTradeScanAt(scan.generatedAt);
    } catch (err: any) {
      console.warn("Trade agent scan failed:", err);
      setTradeScanError(err?.message || "Trade agent failed");
    } finally {
      setIsTradeScanning(false);
    }
  };

  useEffect(() => {
    setTradeIdeas([]);
    setTradeScanAt(null);
    setTradeScanError(null);
    setUntouchablesLoaded(false);
    if (!tradeLeagueId || tradeRosterId === null) return;

    let cancelled = false;
    (async () => {
      const [saved, seen, locked] = await Promise.all([
        loadSavedScan(tradeLeagueId, tradeRosterId),
        loadSeenIdeaIds(tradeLeagueId, tradeRosterId),
        loadUntouchables(tradeLeagueId, tradeRosterId),
      ]);
      if (cancelled) return;
      setSeenTradeIdeaIds(seen);
      setUntouchablePlayerIds(locked);
      setUntouchablesLoaded(true);
      if (saved) {
        setTradeIdeas(saved.ideas);
        setTradeScanAt(saved.generatedAt);
      }
      if (isScanStale(saved, Date.now(), locked)) refreshTradeIdeas(true, locked);
    })();

    return () => {
      cancelled = true;
    };
  }, [tradeLeagueId, tradeRosterId]);

  const unreadTradeIdeas = countUnseen(tradeIdeas, seenTradeIdeaIds);

  // Lock/unlock a player from trade ideas. Rescans shortly after the last change.
  const untouchableTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toggleUntouchable = (playerId: string) => {
    if (!tradeLeagueId || tradeRosterId === null || !untouchablesLoaded) return;
    const id = String(playerId);
    const next = untouchablePlayerIds.includes(id)
      ? untouchablePlayerIds.filter(p => p !== id)
      : [...untouchablePlayerIds, id];
    setUntouchablePlayerIds(next);
    saveUntouchables(tradeLeagueId, tradeRosterId, next);
    if (untouchableTimerRef.current) clearTimeout(untouchableTimerRef.current);
    untouchableTimerRef.current = setTimeout(() => refreshTradeIdeas(true, next), 1200);
  };

  const markTradeIdeasSeen = () => {
    if (!tradeLeagueId || tradeRosterId === null || unreadTradeIdeas === 0) return;
    const next = [...new Set([...seenTradeIdeaIds, ...tradeIdeas.map(i => i.id)])];
    setSeenTradeIdeaIds(next);
    saveSeenIdeaIds(tradeLeagueId, tradeRosterId, next);
  };

  // =====================
  // Load current-season player stats from backend
  // =====================
  // Replace the existing loadStats useEffect with this:
  useEffect(() => {
    const loadStats = async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/player-stats-all-weeks`);
        if (!res.ok) throw new Error("Failed to fetch stats");
        const data = await res.json();
        console.log("Loaded player stats:", data.length);
        setPlayerStats2025(data);
      } catch (err) {
        console.error("Failed to load stats", err);
      }
    };

    loadStats();
  }, []);

  // =====================
  // Add league
  // =====================
  const addLeague = async (leagueId: string) => {
    if (!user || !leagueId) return;
    if (leagues.some(l => l.leagueId === leagueId)) {
      setActiveLeagueId(leagueId);
      return;
    }
    try {
      const leagueData = await getLeague(leagueId);
      const leagueDoc: League = { leagueId, name: leagueData.name };
      await addLeagueForUser(user.uid, leagueId, leagueData.name);
      setLeagues(prev => [...prev, leagueDoc]);
      setActiveLeagueId(leagueId);
    } catch (err) {
      console.error("Error adding league:", err);
      throw err;
    }
  };

  // =====================
  // Delete league
  // =====================
  const deleteLeague = async (leagueId: string) => {
    if (!user) return;
    try {
      await removeLeagueForUser(user.uid, leagueId);
      setLeagues(prev => prev.filter(l => l.leagueId !== leagueId));

      if (activeLeagueId === leagueId) {
        setActiveLeagueId(leagues.find(l => l.leagueId !== leagueId)?.leagueId ?? null);
      }
    } catch (err) {
      console.error("Error deleting league:", err);
    }
  };

  const setMyTeam = async (team: MyFantasyTeam, { persist = true }: { persist?: boolean } = {}) => {
    setMyTeamState(team);
    if (user?.uid && activeLeagueId) {
      AsyncStorage.setItem(myTeamStorageKey(user.uid, activeLeagueId), JSON.stringify(team)).catch(err =>
        console.warn("Failed to save team snapshot:", err)
      );
    }
    if (!persist) return;
    const saved = { teamName: team.teamName, ownerId: team.ownerId };
    setFavoriteTeam(saved);
    if (!user?.uid || !activeLeagueId) return;
    try {
      await setFavoriteTeamForLeague(user.uid, activeLeagueId, saved);
    } catch (err) {
      console.error("Failed to save my team to Firestore:", err);
    }
  };

  const clearMyTeam = async () => {
    setMyTeamState(null);
    setFavoriteTeam(null);
    if (!user?.uid || !activeLeagueId) return;
    AsyncStorage.removeItem(myTeamStorageKey(user.uid, activeLeagueId)).catch(() => undefined);
    try {
      await setFavoriteTeamForLeague(user.uid, activeLeagueId, null);
    } catch (err) {
      console.error("Failed to clear my team in Firestore:", err);
    }
  };

  return (
    <FantasyContext.Provider
      value={{
        playerStats2025,
        setPlayerStats2025,
        matchups,
        setMatchups,
        selectedWeek,
        setSelectedWeek,
        leagues,
        activeLeagueId,
        addLeague,
        deleteLeague,
        setActiveLeagueId,
        chatMessages,
        isChatTyping,
        unreadBotMessages,
        markChatAsRead,
        clearChatHistory,
        chatPersistenceEnabled,
        setChatPersistenceEnabled,
        sendChatMessage,
        myTeam,
        favoriteTeam,
        setMyTeam,
        clearMyTeam,
        tradeIdeas,
        tradeScanAt,
        isTradeScanning,
        tradeScanError,
        unreadTradeIdeas,
        refreshTradeIdeas,
        markTradeIdeasSeen,
        untouchablePlayerIds,
        toggleUntouchable
      }}
    >
      {children}
    </FantasyContext.Provider>
  );
};

export const useFantasy = () => {
  const ctx = useContext(FantasyContext);
  if (!ctx) throw new Error("useFantasy must be used within FantasyProvider");
  return ctx;
};
