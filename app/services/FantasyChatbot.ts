// services/FantasyChatbot.ts

// ---- Types ----
export type PlayerStats = any[];      // must be array (not null)
export type MatchupData = any[];      // same here

// ---- Chatbot Function ----
export async function fantasyChatResponse(
  userMessage: string,
  playerStats: PlayerStats = [],     // default if null sent
  matchupData: MatchupData = []      // default if null sent
): Promise<string> {
  try {
    const res = await fetch("http://localhost:4000/fantasy-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: userMessage,
        playerStats,
        matchupData,
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
