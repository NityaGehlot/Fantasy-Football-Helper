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
  type FavoriteTeam,
} from "../services/userService";

const CHAT_STORAGE_KEY = "fantasy_chat_messages_v1";
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
  setActiveLeagueId: (id: string) => void;
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
  const [activeLeagueId, setActiveLeagueId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatTyping, setIsChatTyping] = useState(false);
  const [seenBotMessageCount, setSeenBotMessageCount] = useState(0);
  const [chatPersistenceEnabled, setChatPersistenceEnabledState] = useState(true);
  const [hasLoadedChatStorage, setHasLoadedChatStorage] = useState(false);
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

  const totalBotMessages = useMemo(
    () => chatMessages.filter(msg => msg.role === "bot").length,
    [chatMessages]
  );

  const unreadBotMessages = Math.max(0, totalBotMessages - seenBotMessageCount);

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

  const updateBotMessage = (messageId: string, text: string) => {
    setChatMessages(prev =>
      prev.map(msg => (msg.id === messageId ? { ...msg, text } : msg))
    );
  };

  // Reveal a non-streamed reply quickly (whole answer in about a second at most),
  // instead of one character every 15ms, which made long answers take 30+ seconds to show.
  const revealBotReply = (messageId: string, reply: string) => {
    stopTypingInterval();
    if (!reply) {
      setIsChatTyping(false);
      return;
    }
    const step = Math.max(8, Math.ceil(reply.length / 60));
    let idx = 0;
    typingIntervalRef.current = setInterval(() => {
      idx = Math.min(reply.length, idx + step);
      updateBotMessage(messageId, reply.slice(0, idx));
      if (idx >= reply.length) {
        stopTypingInterval();
        setIsChatTyping(false);
      }
    }, 16);
  };

  const sendChatMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isChatTyping) return;

    const userMessageId = nextChatMessageId();
    const botMessageId = nextChatMessageId();

    setChatMessages(prev => [
      ...prev,
      { id: userMessageId, role: "user", text: trimmed },
      { id: botMessageId, role: "bot", text: "" }
    ]);
    setIsChatTyping(true);

    try {
      let streamedUpdates = 0;
      const reply = await streamFantasyChatResponse(
        trimmed,
        textSoFar => {
          streamedUpdates += 1;
          updateBotMessage(botMessageId, textSoFar);
        },
        selectedWeek,
        myTeam
      );
      if (streamedUpdates > 0) {
        // Streamed live: text is already on screen.
        updateBotMessage(botMessageId, reply);
        setIsChatTyping(false);
      } else {
        revealBotReply(botMessageId, reply);
      }
    } catch (err) {
      console.error("Failed to send chat message:", err);
      updateBotMessage(botMessageId, "⚠️ Failed to reach AI.");
      setIsChatTyping(false);
    }
  };

  const markChatAsRead = () => {
    setSeenBotMessageCount(totalBotMessages);
  };

  const clearChatHistory = async () => {
    stopTypingInterval();
    setChatMessages([]);
    setIsChatTyping(false);
    setSeenBotMessageCount(0);

    if (chatPersistenceEnabled) {
      try {
        await AsyncStorage.removeItem(CHAT_STORAGE_KEY);
      } catch (err) {
        console.error("Failed to clear saved chat history:", err);
      }
    }
  };

  const setChatPersistenceEnabled = async (enabled: boolean) => {
    setChatPersistenceEnabledState(enabled);

    try {
      await AsyncStorage.setItem(CHAT_PERSISTENCE_FLAG_KEY, enabled ? "1" : "0");
      if (enabled) {
        await AsyncStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatMessages));
      } else {
        await AsyncStorage.removeItem(CHAT_STORAGE_KEY);
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
        const loaded = await listUserLeagues(user.uid);
        setLeagues(loaded as League[]);

        setActiveLeagueId(prev =>
          loaded.some((l: League) => l.leagueId === prev) ? prev : loaded[0]?.leagueId ?? null
        );
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
    const loadChatPersistence = async () => {
      try {
        const savedFlag = await AsyncStorage.getItem(CHAT_PERSISTENCE_FLAG_KEY);
        const enabled = savedFlag !== "0";
        setChatPersistenceEnabledState(enabled);

        if (!enabled) {
          setHasLoadedChatStorage(true);
          return;
        }

        const savedMessages = await AsyncStorage.getItem(CHAT_STORAGE_KEY);
        if (!savedMessages) {
          setHasLoadedChatStorage(true);
          return;
        }

        const parsed = JSON.parse(savedMessages) as ChatMessage[];
        if (Array.isArray(parsed)) {
          const safeMessages = parsed.filter(
            m =>
              m &&
              typeof m.id === "string" &&
              (m.role === "user" || m.role === "bot") &&
              typeof m.text === "string"
          );
          setChatMessages(safeMessages);
        }
      } catch (err) {
        console.error("Failed to restore chat history:", err);
      } finally {
        setHasLoadedChatStorage(true);
      }
    };

    loadChatPersistence();
  }, []);

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

  useEffect(() => {
    if (!hasLoadedChatStorage || !chatPersistenceEnabled) return;

    const persistChat = async () => {
      try {
        await AsyncStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatMessages));
      } catch (err) {
        console.error("Failed to persist chat history:", err);
      }
    };

    persistChat();
  }, [chatMessages, chatPersistenceEnabled, hasLoadedChatStorage]);

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

      setActiveLeagueId(prev => prev === leagueId ? leagues.find(l => l.leagueId !== leagueId)?.leagueId ?? null : prev);
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
