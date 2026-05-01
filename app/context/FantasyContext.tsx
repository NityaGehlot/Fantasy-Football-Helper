import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect
} from "react";
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

interface League {
  leagueId: string;
  name: string;
}

interface FantasyContextType {
  playerStats2025: any[];
  setPlayerStats2025: React.Dispatch<React.SetStateAction<any[]>>;
  matchups: any[];
  setMatchups: React.Dispatch<React.SetStateAction<any[]>>;
  leagues: League[];
  activeLeagueId: string | null;
  addLeague: (leagueId: string) => Promise<void>;
  deleteLeague: (leagueId: string) => Promise<void>;
  setActiveLeagueId: (id: string) => void;
}

const FantasyContext = createContext<FantasyContextType | undefined>(undefined);

export const FantasyProvider = ({ children }: { children: ReactNode }) => {
  const [playerStats2025, setPlayerStats2025] = useState<any[]>([]);
  const [matchups, setMatchups] = useState<any[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [activeLeagueId, setActiveLeagueId] = useState<string | null>(null);

  const user = auth.currentUser;

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
        leagues,
        activeLeagueId,
        addLeague,
        deleteLeague,
        setActiveLeagueId
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
