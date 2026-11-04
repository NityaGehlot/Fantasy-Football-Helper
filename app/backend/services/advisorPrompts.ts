// app/backend/services/advisorPrompts.ts
// Prompts for roster-wide questions: full lineups, waiver adds/drops, trades, drafts and
// general strategy. All numbers are computed in code first; the model only explains them.

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
  }${p.rank ? ` · ${p.rank.points.toFixed(2)} pts this season, ${p.rank.pos}${p.rank.position} / #${p.rank.overall} overall` : ""}${
    p.playoff && p.playoff.label !== "unknown" ? ` {${playoffNote(p.playoff)}}` : ""
  }`;

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
type LineupPlayerLike = { id: string; name: string; position: string; team?: string; value: number; projection?: number; reasons?: string[] };
type LineupSlotLike = { label: string; player: LineupPlayerLike | null; changed: boolean; locked: boolean };

export function buildLineupPrompt(
  question: string,
  lineup: LineupSlotLike[],
  bench: LineupPlayerLike[],
  notes: string[],
  matchupNotes: Record<string, string> = {},
  injuryNotes: string[] = [],
  closeCalls: { slot: string; starter: LineupPlayerLike; bench: LineupPlayerLike; diff: number }[] = []
): string {
  // Each player's reasons (projection, defense weighed by his rank, injuries around him, weather).
  const why = (p: LineupPlayerLike) => {
    const reasons = (p.reasons ?? []).length ? p.reasons! : matchupNotes[p.id] ? [matchupNotes[p.id]] : [];
    return reasons.map(r => `\n    ↳ ${r}`).join("");
  };
  const pts = (p: LineupPlayerLike) => `${(p.projection ?? p.value).toFixed(2)} projected pts (decision score ${p.value.toFixed(2)})`;
  const lineupText = lineup
    .map(l =>
      l.player
        ? `• ${l.label}: ${l.player.name} (${l.player.position}${l.player.team ? `, ${l.player.team}` : ""}) — ${pts(l.player)}${l.locked ? " [game started]" : l.changed ? " [CHANGE from current Sleeper lineup]" : ""}${why(l.player)}`
        : `• ${l.label}: EMPTY — nobody on the roster can play here`
    )
    .join("\n");
  const benchText = bench.map(p => `• ${p.name} (${p.position}${p.team ? `, ${p.team}` : ""}) — ${pts(p)}${why(p)}`).join("\n");
  const closeText = closeCalls.length
    ? closeCalls.map(c => `• ${c.slot}: ${c.starter.name} over ${c.bench.name} (${c.diff.toFixed(2)} apart)`).join("\n")
    : "• None";
  const labels = lineup.map(l => l.label);
  const data = `BEST LINEUP — ${lineup.length} starting slots, in Sleeper's order (pre-computed from Sleeper's projections for THIS week; the user already sees this list)
${lineupText}

BENCH
${bench.length ? benchText : "• (none)"}

INJURIES (Sleeper designation, official practice report and latest injury news)
${injuryNotes.length ? injuryNotes.map(n => `• ${n}`).join("\n") : "• No injuries reported for any of your players."}

NOTES
${notes.length ? notes.map(n => `• ${n}`).join("\n") : "• No bye weeks or empty slots."}

CLOSE CALLS (pre-computed: the ONLY swaps worth mentioning; each bench player can legally play that slot)
${closeText}

HOW THE DECISION WAS MADE: Sleeper's projection is the main factor. It is then adjusted for the defense he faces (a tough defense matters little for an elite player at his position, more for a low-ranked one; a weak defense is a plus for anyone), injuries on his team and the opponent's (e.g. a backup QB hurts his receivers; the lead RB out means more carries for the next RB; a starting WR out means more targets for the others), weather, and his own injury. Defense ranks: 1 = toughest, 32 = easiest.
RULES: Never suggest moving a player into a slot his position can't play (a QB can't play RB/WR/TE/FLEX; only SUPERFLEX takes a QB). A questionable starter is normally fine to start: just say to check his status before kickoff.`;

  return assemble("YOUR LINEUP", data, question, `
${DIVIDER}
▶ WHY THESE STARTERS
${DIVIDER}
Write exactly ${lineup.length} bullets, one per slot, in this order: ${labels.join(", ")}.
• [slot label]: [player] — [projection, then the most important ↳ reason in plain words: the defense (and whether his rank makes it matter), injuries around him, weather]

${DIVIDER}
▶ INJURIES TO WATCH
${DIVIDER}
• [every player listed under INJURIES, with what it means for this week; or "No injuries on your roster"]

${DIVIDER}
▶ CLOSE CALLS
${DIVIDER}
• [only the pairs under CLOSE CALLS, and what separates them; if it says None, write "None"]
`);
}

// ---------- Waivers ----------
export function buildDropForTargetPrompt(
  question: string,
  target: TradePlayer,
  options: DropOption[],
  roster: TradePlayer[],
  balance = ""
): string {
  const best = options[0];
  const top = options.slice(0, 3).map(
    (o, i) =>
      `${i + 1}. Drop ${fmt(o.drop)} → lineup change ${o.netGain >= 0 ? "+" : ""}${o.netGain.toFixed(2)} pts/week${
        o.notes?.length ? `\n   ${o.notes.join("\n   ")}` : ""
      }`
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
${rosterBlock(roster)}

ROSTER BALANCE (players per position vs what this league's lineup needs)
${balance}`;

  return assemble("WAIVER DECISION", data, question, `
${DIVIDER}
▶ VERDICT
${DIVIDER}
• [restate the PRE-COMPUTED VERDICT in one sentence]

${DIVIDER}
▶ WHY
${DIVIDER}
• [2-3 bullets comparing the add and the drop using the pts/g shown]
• [if the drop is from a position you have too many of, say so; if a ⚠️ warning is listed for the chosen drop, repeat it]

${DIVIDER}
▶ OTHER DROP OPTIONS
${DIVIDER}
• [options 2 and 3 from the list, one line each]
`);
}

export function buildOpenSpotPrompt(
  question: string,
  spots: { open: number; size: number; used: number; needs: string[]; pickups: { add: TradePlayer; netGain: number; reason: string }[] },
  roster: TradePlayer[],
  balance = "",
  target?: TradePlayer
): string {
  const lines = spots.pickups.length
    ? spots.pickups.map((p, i) => `${i + 1}. ADD ${fmt(p.add)} → ${p.reason}${p.netGain > 0 ? ` (lineup +${p.netGain.toFixed(2)} pts/week)` : ""}`)
    : ["No healthy free agent with points this season is available."];
  return assemble("OPEN ROSTER SPOTS", `YOU HAVE ${spots.open} EMPTY ROSTER SPOT${spots.open === 1 ? "" : "S"} (${spots.used} of ${spots.size} used). NO DROP IS NEEDED: just add a player.
${target ? `THE USER ASKED ABOUT ADDING ${fmt(target)}: tell them they can add him without dropping anyone.\n` : ""}SHORT AT: ${spots.needs.length ? spots.needs.join(", ") : "nothing (roster is balanced)"}

BEST PICKUPS FOR WHAT YOUR TEAM NEEDS (pre-computed, best first)
${lines.join("\n")}

${balance ? `ROSTER BALANCE\n${balance}\n\n` : ""}YOUR ROSTER
${rosterBlock(roster)}`, question, `
${DIVIDER}
▶ OPEN SPOTS
${DIVIDER}
• [how many open spots, and that no drop is needed]

${DIVIDER}
▶ PICK UP
${DIVIDER}
• [each pickup from the list, in order, with its reason in plain words]
`);
}

export function buildPickupPrompt(question: string, suggestions: PickupSuggestion[], roster: TradePlayer[], balance = ""): string {
  const lines = suggestions.length
    ? suggestions.map(
        (s, i) =>
          `${i + 1}. ADD ${fmt(s.add)} / DROP ${fmt(s.drop)} → lineup change ${s.netGain >= 0 ? "+" : ""}${s.netGain.toFixed(2)} pts/week${
            s.notes?.length ? `\n   ${s.notes.join("\n   ")}` : ""
          }`
      )
    : ["No free agent currently projects better than the players on your roster."];

  return assemble("WAIVER WIRE", `TOP PICKUPS FOR YOUR TEAM (pre-computed, best first)
${lines.join("\n")}

YOUR ROSTER
${rosterBlock(roster)}

ROSTER BALANCE (players per position vs what this league's lineup needs)
${balance}

Mention any ⚠️ roster-balance warning next to the move it belongs to.`, question, `
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

export function buildTradeIdeasPrompt(question: string, ideas: TradeIdea[], roster: TradePlayer[], target?: string): string {
  const data = ideas.length
    ? `${target ? `EVERY OFFER BELOW GETS YOU ${target.toUpperCase()}. Only talk about these offers; do not suggest trades without ${target}.\n\n` : ""}${ideas
        .map((idea, i) => describeTradeIdea(idea, i))
        .join("\n\n")}`
    : target
      ? `No offer for ${target} could be built from your roster.`
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

export function buildTradeEvaluationPrompt(
  question: string,
  idea: TradeIdea,
  // A trade the user built and would send: whether to send it, and edits that get a yes
  proposal?: { headline: string; edits: { summary: string; idea: TradeIdea }[] }
): string {
  const verdict = proposal
    ? proposal.headline
    : idea.myGain > 0.5
      ? "ACCEPT / PROPOSE: it improves your starting lineup."
      : idea.myGain >= -0.5
        ? "NEUTRAL: your starting lineup barely changes. Only do it for depth or bye-week reasons."
        : "DECLINE: it makes your starting lineup worse.";
  const edits = proposal?.edits.length
    ? `\n\nSUGGESTED EDITS (pre-computed; each still helps the user and doesn't cost the other team)\n${proposal.edits
        .map(e => `• ${e.summary}: you +${e.idea.myGain.toFixed(1)} pts/week, them ${e.idea.theirGain >= 0 ? "+" : ""}${e.idea.theirGain.toFixed(1)}`)
        .join("\n")}`
    : "";

  return assemble("TRADE EVALUATION (pre-computed)", `${describeTradeIdea(idea)}

PRE-COMPUTED VERDICT
• ${verdict}${edits}`, question, `
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
${proposal ? `
${DIVIDER}
▶ SEND IT OR EDIT IT
${DIVIDER}
• [say clearly: send as is, or which SUGGESTED EDIT to make and why]
` : ""}`);
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
