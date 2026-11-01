// services/FantasyChatbot.ts

import { getApiBaseUrl } from "./apiBaseUrl";

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
    const res = await fetch(`${getApiBaseUrl()}/fantasy-chat`, {
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

/**
 * Ask the chatbot and receive the answer as it's written. onText gets the full text so far
 * while streaming; quick JSON replies (and errors) are only returned, not passed to onText.
 * Streams on web (where fetch exposes a readable body); elsewhere it falls back to one reply.
 */
export async function streamFantasyChatResponse(
  userMessage: string,
  onText: (textSoFar: string) => void,
  selectedWeek?: number,
  myTeam?: MyTeamPayload | null
): Promise<string> {
  const canStream = typeof (globalThis as any).ReadableStream !== "undefined" && typeof TextDecoder !== "undefined";
  try {
    const res = await fetch(`${getApiBaseUrl()}/fantasy-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userMessage, selectedWeek, myTeam, stream: canStream }),
    });

    const type = res.headers.get("content-type") || "";
    const reader = (res as any).body?.getReader?.();
    if (!type.includes("text/plain") || !reader) {
      // JSON reply (quick answers, errors, or no streaming support)
      const data = (await res.json().catch(() => ({}))) as { reply?: string };
      return data.reply ?? (res.ok ? "⚠️ No reply from chatbot." : "⚠️ Failed to reach chatbot.");
    }

    const decoder = new TextDecoder();
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      onText(text);
    }
    text += decoder.decode();
    onText(text);
    return text || "⚠️ No reply from chatbot.";
  } catch (err) {
    console.error("Chatbot fetch error:", err);
    return "⚠️ Failed to reach chatbot.";
  }
}
