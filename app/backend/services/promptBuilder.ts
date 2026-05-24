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
- Every analysis claim must be explicitly supported by the numbers shown in the response.
- Never make narrative claims that are not directly tied to provided numeric values.
- If a numeric comparison is close or mixed, say it is close/mixed; do not overstate an edge.
- Before final answer, run a consistency check: each "higher/lower/better/worse" statement must match the exact numbers shown.
- If any statement conflicts with the shown numbers, rewrite it to match the numbers.
- For QB matchup analysis, a lower opponent defense strength score is better for the QB and is a positive factor in start/sit decisions.
- For QB matchup analysis, a higher opponent defense strength score means a tougher defense and is a negative factor in start/sit decisions.
- Never recommend starting a QB because he faces a stronger defense; that only counts against the QB unless stronger stats elsewhere outweigh it.
- Defense score interpretation is strict: HIGHER score = stronger defense = WORSE matchup for the QB.
- Defense score interpretation is strict: LOWER score = weaker defense = BETTER matchup for the QB.
- If QB A defense score is lower than QB B defense score, QB A has the more favorable matchup.

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
▶ PASS-CATCHER INJURY CHECK (WR/TE)
──────────────────────
- Injured or possibly out WR/TE: [list names + status, or "None"]
- Impact on QB outlook: [quick analysis]

──────────────────────
▶ OPPOSING DEFENSE (LAST 3 WEEKS)
──────────────────────
- Opponent Defense Team: [team name]
- Rushing Yards Allowed: [exact value]
- Passing Yards Allowed: [exact value]
- Rushing TDs Allowed: [exact value]
- Passing TDs Allowed: [exact value]
- Interceptions: [exact value]
- Fumbles Forced: [exact value]
- Analysis: [quick analysis of matchup strength; lower defense score = better matchup for the QB]

──────────────────────
▶ DEFENSE STRENGTH SCORE (0-100)
──────────────────────
- Score: [0-100, where higher = stronger defense]
- Explanation: [1-2 sentences tied directly to the 3-week stats above; explicitly state whether this is a favorable or unfavorable matchup for the QB]

──────────────────────
▶ RECOMMENDATION
──────────────────────
- Action: [START/SIT/FLEX]
- Confidence: [X]/10
- Reasoning: [2-4 specific points including QB form, WR/TE injury impact, and defense strength score; treat a lower defense score as a plus for the QB]
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
- Summary: [1-2 sentences using only the shown numbers and exact comparison lines; do not reverse higher/lower values, and do not say a player is higher in a stat unless the displayed number is actually higher]
- Summary: [1-2 sentences using only the shown numbers and exact comparison lines; do not reverse higher/lower values, and do not say a player is higher in a stat unless the displayed number is actually higher]

──────────────────────
▶ INJURY REPORT
──────────────────────
- ${players[0].toUpperCase()}: [status] | Practice: [status]
- ${players[1].toUpperCase()}: [status] | Practice: [status]

──────────────────────
▶ PASS-CATCHER INJURY CHECK (WR/TE)
──────────────────────
- ${players[0].toUpperCase()} WR/TE injuries: [list names + status, or "None"]
- ${players[0].toUpperCase()} impact: [quick analysis using only listed injury statuses and available numeric context]
- ${players[1].toUpperCase()} WR/TE injuries: [list names + status, or "None"]
- ${players[1].toUpperCase()} impact: [quick analysis using only listed injury statuses and available numeric context]

──────────────────────
▶ OPPOSING DEFENSE (LAST 3 WEEKS)
──────────────────────
${players[0].toUpperCase()} OPPONENT DEFENSE
- Team: [team name]
- Rushing Yards Allowed: [exact value]
- Passing Yards Allowed: [exact value]
- Rushing TDs Allowed: [exact value]
- Passing TDs Allowed: [exact value]
- Interceptions: [exact value]
- Fumbles Forced: [exact value]

${players[1].toUpperCase()} OPPONENT DEFENSE
- Team: [team name]
- Rushing Yards Allowed: [exact value]
- Passing Yards Allowed: [exact value]
- Rushing TDs Allowed: [exact value]
- Passing TDs Allowed: [exact value]
- Interceptions: [exact value]
- Fumbles Forced: [exact value]

──────────────────────
▶ DEFENSE STRENGTH SCORE (0-100)
──────────────────────
- ${players[0].toUpperCase()} opponent defense score: [0-100, higher = stronger defense]
- ${players[1].toUpperCase()} opponent defense score: [0-100, higher = stronger defense]
- Score analysis: [explain which defense is tougher and why, based only on the listed 3-week stats and the two scores; explicitly identify easier QB matchup using this rule: lower defense score = easier matchup for the QB]

──────────────────────
▶ START/SIT DECISION
──────────────────────
- START: [NAME]
- BENCH: [NAME]
- Confidence: [X]/10
- Reasoning:
  - [Point 1 from comparisons, numerically accurate]
  - [Point 2 from QB recent stats, numerically accurate]
  - [Point 3 from WR/TE injury impact, tied to listed statuses and numbers only]
  - [Point 4 from opponent defense strength score and matchup, numerically accurate, where lower defense score is a plus for the QB and higher defense score is a minus]

CONSISTENCY CHECK (REQUIRED BEFORE FINAL OUTPUT)
- Verify every comparative phrase (higher/lower/better/worse/tougher/easier) matches the shown numbers.
- Do not claim a player has "higher" value if the displayed number is lower.
- Do not claim a QB has a better matchup if his opponent defense score is higher.
- If one QB has the lower opponent defense score, treat that as the easier matchup and a positive point for that QB.
- Mandatory defense-score check: if scoreA < scoreB, then QB A must be labeled easier matchup and QB B tougher matchup.
- If evidence is mixed, explicitly say mixed and explain with numbers.
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
