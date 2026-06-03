// services/FantasyChatbot.ts

// ---- Types ----
export type PlayerStats = any[];      // must be array (not null)
export type MatchupData = any[];      // same here
export type TeamPlayerPayload = {
  playerId: string;
  fullName: string;
  position: string;
  team: string;
  isStarter: boolean;
};

export type MyTeamPayload = {
  leagueId: string;
  ownerId: string;
  rosterId: number;
  teamName: string;
  players: TeamPlayerPayload[];
  starters: string[];
  starterSlotsByPosition?: Partial<Record<"QB" | "RB" | "WR" | "TE" | "K" | "DEF", number>>;
};

// ---- Chatbot Function ----
export async function fantasyChatResponse(
  userMessage: string,
  playerStats: PlayerStats = [],     // kept for compatibility; not sent
  matchupData: MatchupData = [],     // kept for compatibility; not sent
  selectedWeek?: number,
  myTeam?: MyTeamPayload | null
): Promise<string> {
  try {
    const res = await fetch("http://127.0.0.1:4000/fantasy-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: userMessage,
        selectedWeek,
        myTeam,
      }),
    });

    if (!res.ok) {
      console.error("Backend response error:", res.status, await res.text());
      return "⚠️ Failed to reach chatbot.";
    }

    const data = await res.json() as { reply?: string };

    return data.reply ?? "⚠️ No reply from chatbot.";
  } catch (err) {
    console.error("Chatbot fetch error:", err);
    return "⚠️ Failed to reach chatbot.";
  }
}
