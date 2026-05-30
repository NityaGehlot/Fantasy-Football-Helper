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
import {
  collection,
  getDocs,
  setDoc,
  doc,
  deleteDoc,
  serverTimestamp
} from "firebase/firestore";
import { db } from "../services/firebase";
import { getLeague } from "../services/sleeperAPI";
import { fantasyChatResponse } from "../services/FantasyChatbot";

const CHAT_STORAGE_KEY = "fantasy_chat_messages_v1";
const CHAT_PERSISTENCE_FLAG_KEY = "fantasy_chat_persistence_enabled_v1";

export type ChatMessage = {
  id: string;
  role: "user" | "bot";
  text: string;
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

  const streamBotReply = (messageId: string, reply: string) => {
    stopTypingInterval();

    if (!reply) {
      setIsChatTyping(false);
      return;
    }

    let idx = 0;
    typingIntervalRef.current = setInterval(() => {
      idx += 1;
      updateBotMessage(messageId, reply.slice(0, idx));

      if (idx >= reply.length) {
        stopTypingInterval();
        setIsChatTyping(false);
      }
    }, 15);
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
      const reply = await fantasyChatResponse(
        trimmed,
        playerStats2025,
        matchups,
        selectedWeek
      );
      streamBotReply(botMessageId, reply);
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
        const snap = await getDocs(
          collection(db, "users", user.uid, "leagues")
        );
        const loaded: League[] = snap.docs.map(d => d.data() as League);
        setLeagues(loaded);

        setActiveLeagueId(prev =>
          loaded.some(l => l.leagueId === prev) ? prev : loaded[0]?.leagueId ?? null
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
  // Load 2025 player stats from backend
  // =====================
  // Replace the existing loadStats useEffect with this:
  useEffect(() => {
    const loadStats = async () => {
      try {
        const res = await fetch("http://127.0.0.1:4000/player-stats-all-weeks");
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
    try {
      const leagueData = await getLeague(leagueId);
      const leagueDoc: League = { leagueId, name: leagueData.name };

      await setDoc(
        doc(db, "users", user.uid, "leagues", leagueId),
        { ...leagueDoc, createdAt: serverTimestamp() }
      );

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
      await deleteDoc(doc(db, "users", user.uid, "leagues", leagueId));
      setLeagues(prev => prev.filter(l => l.leagueId !== leagueId));

      setActiveLeagueId(prev =>
        prev === leagueId ? leagues.find(l => l.leagueId !== leagueId)?.leagueId ?? null : prev
      );
    } catch (err) {
      console.error("Error deleting league:", err);
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
        sendChatMessage
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
