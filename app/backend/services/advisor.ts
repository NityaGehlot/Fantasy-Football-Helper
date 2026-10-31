// app/backend/services/advisor.ts
// Handles roster-wide chatbot questions (lineup, waivers, trades, draft, general).
// Each handler returns the LLM prompt plus a plain-text fallback answer built from the same
// pre-computed numbers, which is shown if the local model is unavailable.

import { DEFAULT_SLOTS, optimizeLineup, SLOT_ELIGIBILITY } from "./lineup";
import { evaluateTrade, generateTradeIdeas, LeagueTeam, TradePlayer } from "./tradeEngine";
import { rankDropCandidates, suggestPickups } from "./waiver";
import { buildDraftBoard } from "./draft";
import { getLeagueContext, getValueContext, LeagueContext, weeklyValue } from "./leagueContext";
import { getDraftPicks, getNflState } from "./sleeperServer";
import { getTeamsPlaying } from "./schedule";
import { isOutStatus } from "./playerValues";
import { normalizePlayerName, playerKey } from "../utils/names";
import { ChatIntent } from "./intent";
import {
  buildDraftPrompt,
  buildDropForTargetPrompt,
  buildGeneralPrompt,
  buildLineupPrompt,
  buildPickupPrompt,
  buildTradeEvaluationPrompt,
  buildTradeIdeasPrompt,
  describeTradeIdea,
} from "./advisorPrompts";

export type AdvisorTeamPayload = {
  leagueId?: string;
  rosterId?: number;
  ownerId?: string;
  teamName?: string;
};

export type AdvisorResult = { prompt?: string; reply?: string; fallback: string };

const NEED_TEAM =
  "⚠️ I need to know your team for that. Go to the Fantasy tab, pick your team, and tap 'Set Viewed Team As My Team'.";

const pts = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}`;

/**
 * Find players named in the message. Full names match anywhere in the league; last names
 * also match for players on your own roster when that last name is unique on it.
 */
export function findMentionedPlayers(message: string, pool: TradePlayer[], myRoster: TradePlayer[] = []): TradePlayer[] {
  const text = ` ${normalizePlayerName(message)} `;
  const found = new Map<string, { player: TradePlayer; at: number }>();

  for (const p of pool) {
    const name = normalizePlayerName(p.name);
    if (name.split(" ").length < 2) continue;
    const at = text.indexOf(` ${name} `);
    if (at >= 0 && !found.has(p.id)) found.set(p.id, { player: p, at });
  }

  const lastNameCounts = new Map<string, number>();
  myRoster.forEach(p => {
    const last = normalizePlayerName(p.name).split(" ").pop() ?? "";
    lastNameCounts.set(last, (lastNameCounts.get(last) ?? 0) + 1);
  });
  for (const p of myRoster) {
    const last = normalizePlayerName(p.name).split(" ").pop() ?? "";
    if (last.length < 3 || lastNameCounts.get(last) !== 1 || found.has(p.id)) continue;
    const at = text.indexOf(` ${last} `);
    if (at >= 0) found.set(p.id, { player: p, at });
  }

  return [...found.values()].sort((a, b) => a.at - b.at).map(f => f.player);
}

async function currentWeekTeamsPlaying(season: number): Promise<{ week: number; teams: Set<string> | null }> {
  const state = await getNflState().catch(() => null);
  const week = Number(state?.week) || 1;
  if (!state || Number(state.season) !== season || String(state.season_type) !== "regular") return { week, teams: null };
  // If the schedule can't be loaded, skip bye detection rather than failing the answer.
  const teams = await getTeamsPlaying(season, week).catch(() => null);
  return { week, teams };
}

// ---------- Lineup ----------
async function handleLineup(message: string, ctx: LeagueContext, me: LeagueTeam): Promise<AdvisorResult> {
  const { week, teams: teamsPlaying } = await currentWeekTeamsPlaying(ctx.values.season);
  const weekly = me.players.map(p => ({ ...p, value: weeklyValue(p, teamsPlaying) }));
  const lineup = optimizeLineup(weekly, ctx.slots);
  const starters = new Set(lineup.flatMap(a => (a.player ? [a.player.id] : [])));
  const bench = weekly.filter(p => !starters.has(p.id) && p.position in SLOT_ELIGIBILITY);

  const notes: string[] = [];
  me.players.forEach(p => {
    if (isOutStatus(p.injuryStatus)) notes.push(`${p.name} is ${p.injuryStatus} — do not start him.`);
    else if (teamsPlaying && p.team && teamsPlaying.size > 0 && !teamsPlaying.has(p.team))
      notes.push(`${p.name} (${p.team}) is on bye in week ${week}.`);
  });
  lineup.filter(a => !a.player).forEach(a => notes.push(`No eligible player for your ${a.slot} slot — pick one up.`));

  const fallback = [
    `Recommended lineup for week ${week}:`,
    ...lineup.map(a => `• ${a.slot}: ${a.player ? `${a.player.name} (${a.player.value.toFixed(2)} pts/g)` : "EMPTY"}`),
    ...(notes.length ? ["", "Heads up:", ...notes.map(n => `• ${n}`)] : []),
  ].join("\n");

  return { prompt: buildLineupPrompt(message, lineup, bench, notes), fallback };
}

// ---------- Waivers ----------
function handleWaiver(message: string, ctx: LeagueContext, me: LeagueTeam): AdvisorResult {
  const rostered = ctx.teams.flatMap(t => t.players.map(p => ({ p, team: t })));
  const pool = [...ctx.freeAgents, ...rostered.map(r => r.p)];
  const mentioned = findMentionedPlayers(message, pool, me.players);
  const myIds = new Set(me.players.map(p => p.id));
  const target = mentioned.find(p => !myIds.has(p.id));

  if (target) {
    const owner = rostered.find(r => r.p.id === target.id && r.team.rosterId !== me.rosterId);
    if (owner) {
      return {
        reply: `${target.name} is already on ${owner.team.teamName}'s roster, so you can't pick him up. Try asking: "What would it take to trade for ${target.name}?"`,
        fallback: "",
      };
    }

    let options = rankDropCandidates(me.players, target, ctx.slots);
    // If the user named one of their own players ("drop X for Y"), show that option first.
    const named = mentioned.find(p => myIds.has(p.id));
    if (named) options = [...options.filter(o => o.drop.id === named.id), ...options.filter(o => o.drop.id !== named.id)];

    const best = options[0];
    const fallback = best
      ? `Add ${target.name} (${target.value.toFixed(2)} pts/g) and drop ${best.drop.name} (${best.drop.value.toFixed(2)} pts/g). Lineup change: ${pts(best.netGain)} pts/week.\n\nOther drop options:\n${options
          .slice(1, 3)
          .map(o => `• ${o.drop.name} (${pts(o.netGain)} pts/week)`)
          .join("\n")}`
      : `Your roster is empty, so just add ${target.name}.`;
    return { prompt: buildDropForTargetPrompt(message, target, options, me.players), fallback };
  }

  const suggestions = suggestPickups(me.players, ctx.freeAgents, ctx.slots, 5);
  const fallback = suggestions.length
    ? `Top waiver pickups for you:\n${suggestions
        .map(s => `• Add ${s.add.name} (${s.add.value.toFixed(2)}) / drop ${s.drop.name} (${s.drop.value.toFixed(2)}): ${pts(s.netGain)} pts/week`)
        .join("\n")}`
    : "No free agent projects better than the players on your roster right now.";
  return { prompt: buildPickupPrompt(message, suggestions, me.players), fallback };
}

// ---------- Trades ----------
function handleTrade(message: string, ctx: LeagueContext, me: LeagueTeam): AdvisorResult {
  const others = ctx.teams.filter(t => t.rosterId !== me.rosterId);
  const pool = ctx.teams.flatMap(t => t.players);
  const mentioned = findMentionedPlayers(message, pool, me.players);
  const myIds = new Set(me.players.map(p => p.id));
  const give = mentioned.filter(p => myIds.has(p.id));
  const get = mentioned.filter(p => !myIds.has(p.id));

  // A specific proposal: "should I trade A for B?"
  if (give.length > 0 && get.length > 0) {
    const partner = others.find(t => get.every(g => t.players.some(p => p.id === g.id)));
    if (partner) {
      const idea = evaluateTrade(me, partner, give, get, ctx.slots);
      return { prompt: buildTradeEvaluationPrompt(message, idea), fallback: describeTradeIdea(idea) };
    }
    return {
      reply: "Those players are on different teams. Ask about a trade with one team at a time.",
      fallback: "",
    };
  }

  const ideas = generateTradeIdeas(me, others, ctx.slots, {
    maxIdeas: 3,
    mustGive: give.map(p => p.id),
    mustGet: get.map(p => p.id),
    minGain: give.length || get.length ? -5 : 0.5,
  });
  const fallback = ideas.length
    ? ideas.map((idea, i) => describeTradeIdea(idea, i)).join("\n\n")
    : "I couldn't find a trade that helps your lineup without hurting the other team's lineup.";
  return { prompt: buildTradeIdeasPrompt(message, ideas, me.players), fallback };
}

// ---------- Draft ----------
async function handleDraft(message: string, ctx: LeagueContext | null, me: LeagueTeam | null): Promise<AdvisorResult> {
  const values = ctx?.values ?? (await getValueContext());
  const slots = ctx?.slots ?? DEFAULT_SLOTS;
  const exclude = new Set<string>();
  const myCounts: Record<string, number> | undefined = me ? {} : undefined;
  const notes: string[] = [];

  if (ctx) {
    // Players already on a roster can't be drafted.
    ctx.teams.forEach(t => t.players.forEach(p => exclude.add(playerKey(p.name, p.position, p.team))));
    me?.players.forEach(p => (myCounts![p.position] = (myCounts![p.position] ?? 0) + 1));

    const draftId = ctx.league?.draft_id;
    if (draftId && ["pre_draft", "drafting"].includes(String(ctx.league?.status))) {
      try {
        const picks = await getDraftPicks(String(draftId));
        picks.forEach(pick => {
          const meta = pick?.metadata ?? {};
          exclude.add(playerKey(`${meta.first_name ?? ""} ${meta.last_name ?? ""}`, meta.position, meta.team));
          if (me && myCounts && String(pick?.picked_by) === me.ownerId && meta.position) {
            myCounts[meta.position] = (myCounts[meta.position] ?? 0) + 1;
          }
        });
        notes.push(`${picks.length} picks already made in your draft were removed from the board.`);
      } catch {
        notes.push("Could not load live draft picks; the board may include players already drafted.");
      }
    }
  } else {
    notes.push("No league set, so a standard 12-team PPR lineup was assumed.");
  }

  const teams = Number(ctx?.league?.total_rosters) || 12;
  const board = buildDraftBoard([...values.index.values()], { teams, slots, excludeKeys: exclude, myPositionCounts: myCounts });
  notes.push(`League size: ${teams} teams.`);

  const fallback = board.length
    ? `Best available (value over replacement, ${values.season} stats):\n${board
        .slice(0, 8)
        .map((p, i) => `${i + 1}. ${p.name} (${p.position}${p.positionRank}) — ${p.value.toFixed(2)} pts/g, VOR ${p.vor.toFixed(2)}${p.fillsNeed ? " ★ need" : ""}`)
        .join("\n")}`
    : "No draftable players found.";
  return { prompt: buildDraftPrompt(message, board, `${values.season}`, notes), fallback };
}

/**
 * Answer a roster-wide question. Returns null when the message should go through the
 * classic player-by-player start/sit flow instead.
 */
export async function handleAdvisorQuestion(
  intent: ChatIntent,
  message: string,
  team: AdvisorTeamPayload | null,
  { wholeLineup }: { wholeLineup: boolean }
): Promise<AdvisorResult | null> {
  if (intent === "start_sit" && !wholeLineup) return null;

  const hasTeam = Boolean(team?.leagueId);
  if (!hasTeam && intent === "draft") return handleDraft(message, null, null);
  if (!hasTeam && intent === "general") return { prompt: buildGeneralPrompt(message, null), fallback: "" };
  if (!hasTeam) return { reply: NEED_TEAM, fallback: "" };

  const ctx = await getLeagueContext(String(team!.leagueId), team!.rosterId, team!.ownerId);
  const me = ctx.me;
  if (!me) return { reply: NEED_TEAM, fallback: "" };

  switch (intent) {
    case "waiver":
      return handleWaiver(message, ctx, me);
    case "trade":
      return handleTrade(message, ctx, me);
    case "draft":
      return handleDraft(message, ctx, me);
    case "start_sit":
      return handleLineup(message, ctx, me);
    default:
      return { prompt: buildGeneralPrompt(message, me.players), fallback: "" };
  }
}
