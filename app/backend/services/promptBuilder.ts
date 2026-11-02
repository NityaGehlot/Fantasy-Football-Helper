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
- Defense ranks: 1 = the defense allows the LEAST (toughest matchup), 32 = allows the MOST (easiest matchup). A bigger rank number is GOOD for the player.
- Use the right defense number for the position: QBs, WRs and TEs care about "vs the pass" and fantasy points allowed to their position; RBs care about "vs the run" and points allowed to RBs; kickers care about points allowed to Ks.
- Weather and injury effects are already scored from -3 (big downgrade) to +3 (big boost). Use those numbers and the reasons given; don't invent new ones.
- The verdict must weigh ALL of it together: recent form, matchup, weather, his own health and injuries around him.

EXPLAIN THE NUMBERS:
- Every number you mention gets a few plain words saying what it means, e.g. "allows 31.2 pts/game to WRs (28th of 32, one of the easiest matchups)" or "net injury effect +1.5 (his WR teammate is out, so more targets)".
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
• Matchup: [opponent's rank vs the pass and fantasy points allowed to QBs, and what that means]
• Weather: [conditions at kickoff and the effect number, or "indoors"]
• Injuries: [his own status, then each injury around him with its + or - and why; end with the net effect]
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
• Matchup: ${a} [opponent rank vs the pass, pts allowed to QBs] vs ${b} [same]; say which is easier
• Weather: ${a} [conditions, effect] / ${b} [conditions, effect]
• Injuries: ${a} [net injury effect and the main reason] / ${b} [net injury effect and the main reason]
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
  const matchupHint =
    pos === "RB"
      ? "opponent's rank vs the run and fantasy points allowed to RBs, and what that means"
      : pos === "K"
      ? "fantasy points the opponent allows to kickers and its rank"
      : pos === "DEF"
      ? "the opposing offense, especially an injured QB or linemen"
      : `opponent's rank vs the pass and fantasy points allowed to ${pos}s, and what that means`;

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
• Matchup: [${matchupHint}]
• Weather: [conditions at kickoff and the effect number, or "indoors"]
• Injuries: [his own status, then each injury around him with its + or - and why; end with the net effect]
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
• Usage: [${statHint} for each]
• Consistency: [consistency score for each]
• Matchup: ${a} [${matchupHint}] vs ${b} [same]; say which is easier
• Weather: ${a} [conditions, effect] / ${b} [conditions, effect]
• Injuries: ${a} [net injury effect and the main reason] / ${b} [net injury effect and the main reason]
${DIVIDER}
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
• 1. [NAME] — [last 3 avg pts], [one key usage stat], [matchup rank], [weather effect], [net injury effect]
(one line per candidate, best to worst)
${DIVIDER}
▶ WHY
• [2-4 bullets tied to exact numbers explaining the cut line between the last starter and first bench player]

RULES: START must list exactly ${startCount} player(s). Every candidate appears once in START or BENCH. Only use the candidates listed.
`;
}
