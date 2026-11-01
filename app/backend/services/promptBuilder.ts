// app/backend/services/promptBuilder.ts
// Build AI prompts dynamically based on player data and comparisons.
//
// Speed vs. quality: the model's answer length is what makes a local model slow, so the
// formats ask for a verdict first and a few evidence bullets instead of re-typing every stat.
// The accuracy rules stay strict: use only the numbers given, never contradict the
// pre-computed comparisons, and say "close" when it is close.

export interface PromptConfig {
  playerData: string;
  comparisons: string;
  userQuestion: string;
  responseFormat: string;
  positions: string[];
}

const DIVIDER = "──────────────────────";

/**
 * Build system instructions for fantasy football analysis
 */
export function buildSystemInstructions(positions: string[] = []): string {
  const qbRule = positions.includes("QB")
    ? `
- Opponent defense strength score: HIGHER = tougher defense = WORSE matchup for the QB; LOWER = easier matchup (a plus).`
    : "";

  return `
You are a precise, concise fantasy football analyst. Answer the user's question directly.

ACCURACY RULES (most important):
- Use ONLY the numbers in PLAYER DATA and PRE-COMPUTED COMPARISONS. Never invent or recalculate stats.
- Copy numbers exactly as shown. Never claim a player leads a stat unless the numbers show it.
- If the evidence is close or mixed, say so plainly instead of overstating an edge.
- "Last 3" means each player's last 3 games actually played (bye weeks are excluded).
- If something is "Not available", don't guess; just leave it out.${qbRule}
- Before answering, check that every "higher/lower/better/worse" you wrote matches the numbers.

STYLE:
- Lead with the decision. Keep each bullet to one line with a number in it.
- Use "▶" before section titles, "•" for bullets and "${DIVIDER}" between sections.
- No filler, no repeating the question, no long stat dumps.
`;
}

/**
 * Build complete prompt for AI
 */
export function buildAnalysisPrompt(config: PromptConfig): string {
  return `${buildSystemInstructions(config.positions)}
============================
PLAYER DATA
============================
${config.playerData.replace(/\n{3,}/g, "\n\n").trim()}
${config.comparisons ? `\n${config.comparisons.trim()}\n` : ""}
============================
USER QUESTION
============================
${config.userQuestion}

============================
RESPONSE FORMAT
============================
${config.responseFormat.trim()}
`;
}

const upper = (s: string) => s.toUpperCase();

/**
 * Build response format for QB comparison
 */
export function buildQBResponseFormat(players: string[]): string {
  if (players.length === 1) {
    const p = upper(players[0]);
    return `
${DIVIDER}
▶ VERDICT: [START / SIT / FLEX] ${p} — Confidence [X]/10
• [one sentence with the main reason, using a number]
${DIVIDER}
▶ WHY
• Recent form: [last 3 avg fantasy pts vs season avg, plus one passing/rushing number]
• Efficiency: [TD:INT ratio and completion %]
• Matchup: [opponent defense score and whether it's an easy or tough matchup; skip if not available]
• Health: [his status/practice, and any injured WR/TE teammates that matter]
${DIVIDER}
▶ RISK
• [one thing that could make this call wrong]
`;
  }

  const [a, b] = players.map(upper);
  return `
${DIVIDER}
▶ VERDICT: START [NAME] over [NAME] — Confidence [X]/10
• [one sentence with the deciding reason, using numbers]
${DIVIDER}
▶ HEAD TO HEAD
• Recent form (last 3): ${a} [avg pts] vs ${b} [avg pts]
• Season: ${a} [avg pts, consistency] vs ${b} [avg pts, consistency]
• Efficiency: [TD:INT ratio for each, from the comparisons]
• Matchup: [each QB's opponent defense score; lower score = easier matchup; skip if not available]
• Health: [status/practice for each, plus injured WR/TE teammates if any]
${DIVIDER}
▶ RISK
• [what would flip this decision, or "Close call" if the numbers are near even]
`;
}

/**
 * Build response format for skill position comparison
 */
export function buildSkillPositionResponseFormat(position: string, players: string[]): string {
  const pos = position.toUpperCase();
  const statHint =
    pos === "K"
      ? "FG made and FG %, PAT made"
      : pos === "DEF"
      ? "sacks, INTs, defensive TDs, yards allowed"
      : pos === "RB"
      ? "carries, rush yards, receptions, TDs"
      : "targets, receptions, receiving yards, TDs";

  if (players.length === 1) {
    const p = upper(players[0]);
    return `
${DIVIDER}
▶ VERDICT: [START / SIT] ${p} — Confidence [X]/10
• [one sentence with the main reason, using a number]
${DIVIDER}
▶ WHY
• Recent form: [last 3 avg fantasy pts vs season avg]
• Usage: [${statHint}]
• Consistency: [consistency score and what it means]
${pos === "K" || pos === "DEF" ? "" : "• Health: [status and practice]\n"}${DIVIDER}
▶ RISK
• [one thing that could make this call wrong]
`;
  }

  const [a, b] = players.map(upper);
  return `
${DIVIDER}
▶ VERDICT: START [NAME] over [NAME] — Confidence [X]/10
• [one sentence with the deciding reason, using numbers]
${DIVIDER}
▶ HEAD TO HEAD
• Recent form (last 3): ${a} [avg pts] vs ${b} [avg pts]
• Usage: [${statHint} for each]
• Consistency: [consistency score for each]
${pos === "K" || pos === "DEF" ? "" : `• Health: ${a} [status] / ${b} [status]\n`}${DIVIDER}
▶ RISK
• [what would flip this decision, or "Close call" if the numbers are near even]
`;
}

/**
 * Build response format for roster-driven start decisions where all candidates at a
 * position are included and the model must select an exact number of starters.
 */
export function buildRosterDecisionResponseFormat(
  position: string,
  players: string[],
  startCount: number
): string {
  const normalizedPosition = position.toUpperCase();
  const benchCount = Math.max(players.length - startCount, 0);

  return `
Candidates (${normalizedPosition}): ${players.map(upper).join(", ")}

${DIVIDER}
▶ START (${startCount}): [comma-separated names] — Confidence [X]/10
▶ BENCH (${benchCount}): [comma-separated names]
${DIVIDER}
▶ RANKING
• 1. [NAME] — [last 3 avg pts], [one key usage stat], [health${normalizedPosition === "QB" ? ", matchup score" : ""}]
(one line per candidate, best to worst)
${DIVIDER}
▶ WHY
• [2-4 bullets tied to exact numbers explaining the cut line between the last starter and first bench player]

RULES: START must list exactly ${startCount} player(s). Every candidate appears once in START or BENCH. Only use the candidates listed.
`;
}
