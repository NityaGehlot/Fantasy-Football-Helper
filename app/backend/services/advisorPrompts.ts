// app/backend/services/advisorPrompts.ts
// Prompts for roster-wide questions: full lineups, waiver adds/drops, trades, drafts and
// general strategy. All numbers are computed in code first; the model only explains them.

import type { LineupAssignment } from "./lineup";
import type { TradeIdea, TradePlayer } from "./tradeEngine";
import type { DropOption, PickupSuggestion } from "./waiver";
import type { DraftBoardEntry } from "./draft";
import { playoffNote } from "./playoffSchedule";

const DIVIDER = "──────────────────────";

export function buildAdvisorInstructions(): string {
  return `
You are a precise, friendly fantasy football advisor helping a manager in their Sleeper league.

CRITICAL RULES:
- Use ONLY the data and pre-computed results below. Do NOT invent stats, injuries, or news.
- "pts/g" values are projected PPR points per game computed from this season's stats (injury-adjusted).
- The pre-computed recommendation is the answer. Explain it; do not reverse it.
- If the data says a result is close (within ~1 pt/g), say it is close.
- Copy numbers exactly as shown. Do not round or recalculate them.
- Keep it concise: short bullets, no walls of text.

FORMATTING RULES:
- Use "${DIVIDER}" as a divider between every major section.
- Use "▶" before every section title.
- {playoffs easy/average/tough ...} after a player = his fantasy-playoff matchups (weeks 15-17). When two options are close, prefer easier playoff schedules for a team that will make the playoffs, and say so.
- Use "•" for every bullet point.
`;
}

const fmt = (p: TradePlayer) =>
  `${p.name} (${p.position}${p.team ? `, ${p.team}` : ""}) — ${p.value.toFixed(2)} pts/g${
    p.injuryStatus && p.injuryStatus !== "ACTIVE" ? ` [${p.injuryStatus}]` : ""
  }${p.playoff && p.playoff.label !== "unknown" ? ` {${playoffNote(p.playoff)}}` : ""}`;

function assemble(title: string, data: string, question: string, format: string): string {
  return `
${buildAdvisorInstructions()}

============================
${title}
============================
${data}

============================
USER QUESTION
============================
${question}

============================
RESPONSE FORMAT
============================
${format}
`;
}

export function rosterBlock(players: TradePlayer[]): string {
  return [...players]
    .sort((a, b) => b.value - a.value)
    .map(p => `• ${fmt(p)}`)
    .join("\n");
}

// ---------- Full lineup ----------
export function buildLineupPrompt(
  question: string,
  lineup: LineupAssignment[],
  bench: TradePlayer[],
  notes: string[],
  matchupNotes: Record<string, string> = {}
): string {
  const withMatchup = (p: TradePlayer) => (matchupNotes[p.id] ? `\n    ↳ ${matchupNotes[p.id]}` : "");
  const lineupText = lineup
    .map(a => `• ${a.slot}: ${a.player ? fmt(a.player as TradePlayer) + withMatchup(a.player as TradePlayer) : "EMPTY — no eligible player"}`)
    .join("\n");
  const benchText = bench.map(p => `• ${fmt(p)}${withMatchup(p)}`).join("\n");
  const data = `RECOMMENDED STARTERS (pre-computed: points per game for THIS week, already adjusted for the opponent defense, weather and injuries shown under each player)
${lineupText}

BENCH
${bench.length ? benchText : "• (none)"}

HOW TO READ "x1.08": his usual points per game times 1.08 = 8% more this week. Defense ranks: 1 = toughest, 32 = easiest.

NOTES
${notes.length ? notes.map(n => `• ${n}`).join("\n") : "• No bye weeks or injury problems among your players."}`;

  return assemble("YOUR LINEUP", data, question, `
${DIVIDER}
▶ START THESE
${DIVIDER}
• [slot]: [player] — [pts/g shown, plus the matchup/weather/injury reason from his ↳ line in plain words]
(one bullet per starter, in the order given)

${DIVIDER}
▶ WATCH OUT
${DIVIDER}
• [bye weeks, injuries or empty slots from NOTES, or "Nothing to worry about this week"]

${DIVIDER}
▶ CLOSE CALLS
${DIVIDER}
• [any bench player within ~1 pt/g of a starter at an eligible slot, explaining which matchup, weather or injury factor separates them, or "None"]
`);
}

// ---------- Waivers ----------
export function buildDropForTargetPrompt(
  question: string,
  target: TradePlayer,
  options: DropOption[],
  roster: TradePlayer[]
): string {
  const best = options[0];
  const top = options.slice(0, 3).map(
    (o, i) => `${i + 1}. Drop ${fmt(o.drop)} → lineup change ${o.netGain >= 0 ? "+" : ""}${o.netGain.toFixed(2)} pts/week`
  );
  const verdict =
    best && best.netGain > 0
      ? `ADD ${target.name}, DROP ${best.drop.name}: your starting lineup improves by ${best.netGain.toFixed(2)} pts/week.`
      : best && target.value > best.drop.value
      ? `ADD ${target.name}, DROP ${best.drop.name}: lineup is unchanged this week, but ${target.name} (${target.value.toFixed(2)} pts/g) is a better bench stash than ${best.drop.name} (${best.drop.value.toFixed(2)} pts/g).`
      : `PASS on ${target.name}: he would not beat anyone on your roster (lowest-impact player is ${best?.drop.name ?? "n/a"}).`;

  const data = `PLAYER TO ADD
• ${fmt(target)}

BEST DROP OPTIONS (pre-computed)
${top.join("\n")}

PRE-COMPUTED VERDICT
• ${verdict}

YOUR ROSTER
${rosterBlock(roster)}`;

  return assemble("WAIVER DECISION", data, question, `
${DIVIDER}
▶ VERDICT
${DIVIDER}
• [restate the PRE-COMPUTED VERDICT in one sentence]

${DIVIDER}
▶ WHY
${DIVIDER}
• [2-3 bullets comparing the add and the drop using the pts/g shown]

${DIVIDER}
▶ OTHER DROP OPTIONS
${DIVIDER}
• [options 2 and 3 from the list, one line each]
`);
}

export function buildPickupPrompt(question: string, suggestions: PickupSuggestion[], roster: TradePlayer[]): string {
  const lines = suggestions.length
    ? suggestions.map(
        (s, i) =>
          `${i + 1}. ADD ${fmt(s.add)} / DROP ${fmt(s.drop)} → lineup change ${s.netGain >= 0 ? "+" : ""}${s.netGain.toFixed(2)} pts/week`
      )
    : ["No free agent currently projects better than the players on your roster."];

  return assemble("WAIVER WIRE", `TOP PICKUPS FOR YOUR TEAM (pre-computed, best first)
${lines.join("\n")}

YOUR ROSTER
${rosterBlock(roster)}`, question, `
${DIVIDER}
▶ TOP PICKUPS
${DIVIDER}
• [for each pickup in order: ADD x / DROP y — one short reason using the pts/g shown]

${DIVIDER}
▶ PRIORITY
${DIVIDER}
• [which single move to make first and why, or say there are no worthwhile moves]
`);
}

// ---------- Trades ----------
export function describeTradeIdea(idea: TradeIdea, index?: number): string {
  const label = index !== undefined ? `TRADE IDEA ${index + 1}` : "TRADE";
  return `${label} with ${idea.partner.teamName}
• You give: ${idea.give.map(fmt).join("; ")}
• You get: ${idea.get.map(fmt).join("; ")}
• Your starting lineup change: ${idea.myGain >= 0 ? "+" : ""}${idea.myGain.toFixed(2)} pts/week
• Their starting lineup change: ${idea.theirGain >= 0 ? "+" : ""}${idea.theirGain.toFixed(2)} pts/week
• Value balance: ${(idea.fairness * 100).toFixed(0)}% (100% = equal value on both sides)
${idea.reasons.map(r => `• ${r}`).join("\n")}`;
}

export function buildTradeIdeasPrompt(question: string, ideas: TradeIdea[], roster: TradePlayer[]): string {
  const data = ideas.length
    ? ideas.map((idea, i) => describeTradeIdea(idea, i)).join("\n\n")
    : "No trade was found that improves your lineup without hurting the other team's lineup.";

  return assemble("TRADE IDEAS (pre-computed)", `${data}

YOUR ROSTER
${rosterBlock(roster)}`, question, `
${DIVIDER}
▶ BEST TRADE TARGETS
${DIVIDER}
• [for each idea: Give x → Get y from TEAM (+N pts/week for you) — one short reason]

${DIVIDER}
▶ HOW TO PITCH IT
${DIVIDER}
• [one sentence per idea on why the other manager should say yes, using "Their starting lineup change"]
`);
}

export function buildTradeEvaluationPrompt(question: string, idea: TradeIdea): string {
  const verdict =
    idea.myGain > 0.5
      ? "ACCEPT / PROPOSE: it improves your starting lineup."
      : idea.myGain >= -0.5
      ? "NEUTRAL: your starting lineup barely changes. Only do it for depth or bye-week reasons."
      : "DECLINE: it makes your starting lineup worse.";

  return assemble("TRADE EVALUATION (pre-computed)", `${describeTradeIdea(idea)}

PRE-COMPUTED VERDICT
• ${verdict}`, question, `
${DIVIDER}
▶ VERDICT
${DIVIDER}
• [restate the PRE-COMPUTED VERDICT]

${DIVIDER}
▶ BREAKDOWN
${DIVIDER}
• [what you give up vs. what you get, using the pts/g shown]
• [effect on your starting lineup]
• [whether the other team is likely to accept, based on their lineup change]
`);
}

// ---------- Draft ----------
export function buildDraftPrompt(question: string, board: DraftBoardEntry[], seasonLabel: string, notes: string[]): string {
  const lines = board.map(
    (p, i) =>
      `${i + 1}. ${p.name} (${p.position}${p.positionRank}, ${p.team || "FA"}) — ${p.value.toFixed(2)} pts/g, value over replacement ${p.vor.toFixed(2)}${
        p.fillsNeed ? " — FILLS A NEED" : ""
      }`
  );

  return assemble("DRAFT BOARD (pre-computed)", `Ranked by value over replacement using ${seasonLabel} stats.
${lines.join("\n")}

NOTES
${notes.map(n => `• ${n}`).join("\n")}`, question, `
${DIVIDER}
▶ TOP PICK
${DIVIDER}
• [the best player for this manager: prefer #1 unless a player within ~1 VOR "FILLS A NEED"]

${DIVIDER}
▶ NEXT BEST
${DIVIDER}
• [3-5 more names from the board, one short reason each]

${DIVIDER}
▶ STRATEGY
${DIVIDER}
• [1-2 bullets on which positions to target next, based on the board and needs]
`);
}

// ---------- General ----------
export function buildGeneralPrompt(question: string, roster: TradePlayer[] | null): string {
  return `
${buildAdvisorInstructions()}
- This is a general question. Give practical fantasy football advice.
- Only mention specific stats if they appear in YOUR ROSTER below.
- If the question needs data you don't have, say what the user can ask instead (for example
  "Who should I start this week?", "Who should I drop to pick up [player]?",
  "Give me trade ideas", or "Who should I draft?").

============================
YOUR ROSTER
============================
${roster && roster.length ? rosterBlock(roster) : "Not set. (Pick your team on the Fantasy tab for roster-specific advice.)"}

============================
USER QUESTION
============================
${question}
`;
}
