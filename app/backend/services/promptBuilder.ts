// app/backend/services/promptBuilder.ts
// Build AI prompts dynamically based on player data and comparisons

export interface PromptConfig {
  playerData: string;
  comparisons: string;
  userQuestion: string;
  responseFormat: string;
  positions: string[];
}

/**
 * Build system instructions for fantasy football analysis
 */
export function buildSystemInstructions(): string {
  return `
You are a precise fantasy football analyst.

CRITICAL RULES:
- Use ONLY the data and pre-computed comparisons below. Do NOT re-calculate any numbers yourself.
- Copy stat values exactly as shown. Do NOT round or alter them.
- In comparison sections, copy the PRE-COMPUTED COMPARISONS word for word — do not rewrite them.
- Do NOT say a player leads in a stat unless the PRE-COMPUTED COMPARISONS say so.

FORMATTING RULES:
- Use "──────────────────────" as a divider between every major section.
- Use "▶" before every section title.
- Use "•" for every bullet point.
- Put a blank line between bullet points.
- Never write a wall of text.
`;
}

/**
 * Build complete prompt for AI
 */
export function buildAnalysisPrompt(config: PromptConfig): string {
  return `
${buildSystemInstructions()}

============================
PLAYER DATA
============================
${config.playerData}

${config.comparisons}

============================
USER QUESTION
============================
${config.userQuestion}

============================
RESPONSE FORMAT
============================
${config.responseFormat}
`;
}

/**
 * Build response format for QB comparison
 */
export function buildQBResponseFormat(players: string[]): string {
  if (players.length === 1) {
    return `
──────────────────────
▶ SEASON STATS
──────────────────────
- Avg Fantasy Pts: [value]
- Pass Yds: [value]
- Rush Yds: [value]
- TDs: [value]
- INTs: [value]
- TD:INT Ratio: [value]
- Consistency: [value]

──────────────────────
▶ LAST 3 WEEKS
──────────────────────
[Summary of recent performance]

──────────────────────
▶ INJURY STATUS
──────────────────────
- Status: [value]
- Practice: [value]
- Impact: [brief assessment]

──────────────────────
▶ RECOMMENDATION
──────────────────────
- Action: [START/SIT/FLEX]
- Confidence: [X]/10
- Reasoning: [2-3 specific points]
`;
  }

  return `
──────────────────────
▶ LAST 3 WEEKS STATS
──────────────────────
${players[0].toUpperCase()}
- Avg Fantasy Pts: [exact value]
- Avg Pass Yds: [exact value]
- Avg Rush Yds: [exact value]
- Avg TDs/game: [exact value]
- Avg INTs/game: [exact value]
- TD:INT Ratio: [exact value]

${players[1].toUpperCase()}
- Avg Fantasy Pts: [exact value]
- Avg Pass Yds: [exact value]
- Avg Rush Yds: [exact value]
- Avg TDs/game: [exact value]
- Avg INTs/game: [exact value]
- TD:INT Ratio: [exact value]

──────────────────────
▶ COMPARISON
──────────────────────
[Copy each line from PRE-COMPUTED COMPARISONS exactly as written above]
- Summary: [1-2 sentences based on comparisons]

──────────────────────
▶ INJURY REPORT
──────────────────────
- ${players[0].toUpperCase()}: [status] | Practice: [status]
- ${players[1].toUpperCase()}: [status] | Practice: [status]

──────────────────────
▶ START/SIT DECISION
──────────────────────
- START: [NAME]
- BENCH: [NAME]
- Confidence: [X]/10
- Reasoning:
  - [Point 1 from comparisons]
  - [Point 2 from stats]
  - [Point 3 - injury consideration]
`;
}

/**
 * Build response format for skill position comparison
 */
export function buildSkillPositionResponseFormat(
  position: string,
  players: string[]
): string {
  if (position === "K") {
    if (players.length === 1) {
      return `
──────────────────────
▶ SEASON STATS
──────────────────────
- Avg Fantasy Pts: [value]
- FG Made/Att: [value]
- FG %: [value]
- PAT Made/Att: [value]
- Consistency: [value]

──────────────────────
▶ LAST 3 WEEKS
──────────────────────
[Summary of recent kicking volume and accuracy]

──────────────────────
▶ RECOMMENDATION
──────────────────────
- Action: [START/SIT]
- Confidence: [X]/10
- Reasoning: [2-3 specific points]
`;
    }

    return `
──────────────────────
▶ LAST 3 WEEKS STATS
──────────────────────
${players[0].toUpperCase()}
- Avg Fantasy Pts: [exact value]
- Avg FG Made: [exact value]
- Avg PAT Made: [exact value]
- FG %: [exact value]

${players[1].toUpperCase()}
- Avg Fantasy Pts: [exact value]
- Avg FG Made: [exact value]
- Avg PAT Made: [exact value]
- FG %: [exact value]

──────────────────────
▶ COMPARISON
──────────────────────
[Copy each line from PRE-COMPUTED COMPARISONS exactly]

──────────────────────
▶ START/SIT DECISION
──────────────────────
- START: [NAME]
- BENCH: [NAME]
- Confidence: [X]/10
`;
  }

  if (position === "DEF") {
    if (players.length === 1) {
      return `
──────────────────────
▶ SEASON STATS
──────────────────────
- Avg Fantasy Pts: [value]
- Sacks: [value]
- Interceptions: [value]
- Defensive TD: [value]
- Yards Allowed: [value]
- Consistency: [value]

──────────────────────
▶ LAST 3 WEEKS
──────────────────────
[Summary of recent defensive production and points prevention]

──────────────────────
▶ RECOMMENDATION
──────────────────────
- Action: [START/SIT]
- Confidence: [X]/10
- Reasoning: [2-3 specific points]
`;
    }

    return `
──────────────────────
▶ LAST 3 WEEKS STATS
──────────────────────
${players[0].toUpperCase()}
- Avg Fantasy Pts: [exact value]
- Avg Sacks: [exact value]
- Avg INT: [exact value]
- Avg Def TD: [exact value]
- Avg Yards Allowed: [exact value]

${players[1].toUpperCase()}
- Avg Fantasy Pts: [exact value]
- Avg Sacks: [exact value]
- Avg INT: [exact value]
- Avg Def TD: [exact value]
- Avg Yards Allowed: [exact value]

──────────────────────
▶ COMPARISON
──────────────────────
[Copy each line from PRE-COMPUTED COMPARISONS exactly]

──────────────────────
▶ START/SIT DECISION
──────────────────────
- START: [NAME]
- BENCH: [NAME]
- Confidence: [X]/10
`;
  }

  if (players.length === 1) {
    return `
──────────────────────
▶ SEASON STATS
──────────────────────
- Avg Fantasy Pts: [value]
- Avg Receiving Yds: [value]
- Avg Rec TD: [value]
- Targets/Receptions: [value]
- Consistency: [value]

──────────────────────
▶ LAST 3 WEEKS
──────────────────────
[Summary of recent performance]

──────────────────────
▶ INJURY STATUS
──────────────────────
- Status: [value]
- Practice: [value]

──────────────────────
▶ RECOMMENDATION
──────────────────────
- Action: [START/SIT/BENCH]
- Confidence: [X]/10
- Reasoning: [2-3 specific points]
`;
  }

  return `
──────────────────────
▶ LAST 3 WEEKS STATS
──────────────────────
${players[0].toUpperCase()}
- Avg Fantasy Pts: [exact value]
- Avg Rec/Rush Yds: [exact value]
- Avg TD: [exact value]
- Targets/Carries: [exact value]

${players[1].toUpperCase()}
- Avg Fantasy Pts: [exact value]
- Avg Rec/Rush Yds: [exact value]
- Avg TD: [exact value]
- Targets/Carries: [exact value]

──────────────────────
▶ COMPARISON
──────────────────────
[Copy each line from PRE-COMPUTED COMPARISONS exactly]
- Edge: [which player has the advantage]

──────────────────────
▶ INJURY REPORT
──────────────────────
- ${players[0].toUpperCase()}: [status]
- ${players[1].toUpperCase()}: [status]

──────────────────────
▶ START/SIT DECISION
──────────────────────
- START: [NAME]
- BENCH: [NAME]
- Confidence: [X]/10
`;
}
