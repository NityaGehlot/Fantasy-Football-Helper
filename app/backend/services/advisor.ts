// app/backend/services/advisor.ts
// Handles roster-wide chatbot questions (lineup, waivers, trades, draft, general).
// Each handler returns the LLM prompt plus a plain-text fallback answer built from the same
// pre-computed numbers, which is shown if the local model is unavailable.

import { DEFAULT_SLOTS, SLOT_ELIGIBILITY } from "./lineup";
import { getLineupCheck } from "./lineupCheck";
import { evaluateTrade, generateTradeIdeas, LeagueTeam, TradePlayer } from "./tradeEngine";
import { rankDropCandidates, suggestPickups } from "./waiver";
import { gradeProposal, tradeForPlayer } from "./tradeGrade";
import { openRosterSpots, type OpenSpots } from "./irAdvice";
import { buildWaiverAdvice } from "./waiverAdvice";
import { buildDraftBoard } from "./draft";
import { getLeagueContext, getValueContext, LeagueContext, weeklyValue } from "./leagueContext";
import { getDraftPicks, getNflState, getRosters } from "./sleeperServer";
import { getTeamsPlaying } from "./schedule";
import { isOutStatus } from "./playerValues";
import { buildMatchupContext, matchupAdjustment } from "./matchupContext";
import { annotatePlayoffs } from "./playoffSchedule";
import { balanceSummary, positionTargets } from "./positionBalance";

/** Add fantasy-playoff schedule strength to every rostered player and the best free agents. */
export async function addPlayoffSchedules(ctx: LeagueContext): Promise<void> {
  const state = await getNflState().catch(() => null);
  const week = Number(state?.week) || 1;
  const topFreeAgents = [...ctx.freeAgents].sort((a, b) => b.value - a.value).slice(0, 200);
  await annotatePlayoffs(ctx.league, ctx.values.season, week, ctx.values.rows, [...ctx.teams.map(t => t.players), topFreeAgents]).catch(
    err => console.warn("Playoff schedule unavailable:", err?.message ?? err)
  );
}
import { normalizePlayerName, playerKey } from "../utils/names";
import { ChatIntent } from "./intent";
import {
  buildDraftPrompt,
  buildDropForTargetPrompt,
  buildGeneralPrompt,
  buildLineupPrompt,
  buildOpenSpotPrompt,
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

// prefix: computed text shown before the AI's explanation (e.g. the full lineup), so nothing in
// it depends on the model getting every line right.
export type AdvisorResult = { prompt?: string; reply?: string; fallback: string; prefix?: string };

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

  // Defenses: "Texans", "Houston", "HOU" or "Houston D/ST" all mean the Houston Texans defense.
  // A bare team word counts only when the question is about a defense or names nobody else
  // ("Texans WR Nico Collins" is about Collins, not the Texans defense).
  const aboutDefense = / (defense|defence|def|d st|dst) /.test(text) || found.size === 0;
  for (const p of pool) {
    if (p.position !== "DEF" || found.has(p.id) || !aboutDefense) continue;
    const words = normalizePlayerName(p.name).split(" ").filter(w => w.length > 2);
    const aliases = [...words, String(p.team ?? p.id).toLowerCase()];
    const at = Math.min(...aliases.map(a => text.indexOf(` ${a} `)).filter(i => i >= 0));
    if (Number.isFinite(at)) found.set(p.id, { player: p, at });
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

async function currentWeekTeamsPlaying(season: number, weekOverride?: number): Promise<{ week: number; teams: Set<string> | null }> {
  const state = await getNflState().catch(() => null);
  const week = weekOverride || Number(state?.week) || 1;
  if (!state || Number(state.season) !== season || String(state.season_type) !== "regular") return { week, teams: null };
  // If the schedule can't be loaded, skip bye detection rather than failing the answer.
  const teams = await getTeamsPlaying(season, week).catch(() => null);
  return { week, teams };
}

// ---------- Lineup ----------
/**
 * This week's expected points for each of your players: usual points per game, zero when he's
 * out or on bye, scaled by his matchup, weather and the injuries around him.
 */
export async function weeklyAdjustedPlayers(ctx: LeagueContext, me: LeagueTeam, weekOverride?: number) {
  const { week, teams: teamsPlaying } = await currentWeekTeamsPlaying(ctx.values.season, weekOverride);
  // Scale each player's usual points for this week's matchup, weather and injuries around him.
  const matchups = new Map<string, ReturnType<typeof matchupAdjustment>>();
  await Promise.all(
    me.players
      .filter(p => p.position in SLOT_ELIGIBILITY || ["QB", "RB", "WR", "TE", "K", "DEF"].includes(p.position))
      .map(async p => {
        const mctx = await buildMatchupContext({
          playerName: p.name,
          position: p.position,
          team: p.team ?? null,
          season: ctx.values.season,
          week,
          statsRows: ctx.values.rows,
        }).catch(() => null);
        matchups.set(p.id, matchupAdjustment(p.position, mctx));
      })
  );
  const weekly = me.players.map(p => {
    const adj = matchups.get(p.id);
    return { ...p, value: Math.round(weeklyValue(p, teamsPlaying) * (adj?.multiplier ?? 1) * 100) / 100 };
  });
  return { week, teamsPlaying, matchups, weekly };
}

async function handleLineup(message: string, ctx: LeagueContext, me: LeagueTeam, leagueId: string): Promise<AdvisorResult> {
  // Same numbers and lineup as the lineup check (Sleeper's projections, fewest swaps), listed
  // slot by slot in the order Sleeper shows them.
  const check = await getLineupCheck(leagueId, me.rosterId, me.ownerId);
  const notes: string[] = [...check.problems];
  me.players.forEach(p => {
    const status = String(p.injuryStatus ?? "").toUpperCase();
    if ((status === "IR" || status === "INJURED RESERVE") && !check.lineup.some(l => l.player?.id === p.id))
      notes.push(`${p.name} is on IR — move him to an IR spot in Sleeper so his roster spot can go to a waiver pickup.`);
  });
  const listing = lineupListing(check);
  return {
    prefix: `${listing}\n\n`,
    prompt: buildLineupPrompt(message, check.lineup, check.bench, notes, check.matchupNotes, check.injuryNotes, check.closeCalls),
    fallback: [
      ...(notes.length ? ["Heads up:", ...notes.map(n => `• ${n}`)] : []),
      ...(check.injuryNotes.length ? ["", "Injuries:", ...check.injuryNotes.map(n => `• ${n}`)] : []),
    ].join("\n"),
  };
}

/** The best lineup in Sleeper's slot order, with the changes from the lineup set in Sleeper. */
type ListedPlayer = { name: string; value: number; projection?: number; reasons?: string[] };
type ListingInput = {
  week: number;
  lineup: { label: string; player: ListedPlayer | null; changed: boolean; locked: boolean }[];
  swaps: { slot: string; start: ListedPlayer; bench: ListedPlayer | null; movesTo?: string; from?: string; gain: number }[];
  closeCalls?: { slot: string; starter: ListedPlayer; bench: ListedPlayer; diff: number }[];
};

const shown = (p: ListedPlayer) => (p.projection ?? p.value).toFixed(2);
// The reason that matters most after the projection itself (defense / injuries / weather).
const keyReason = (p: ListedPlayer) => (p.reasons ?? []).find(r => !r.startsWith("Projected"));

/** The best lineup in Sleeper's slot order, the changes to make, and the close calls. */
export function lineupListing(check: ListingInput): string {
  const lines = check.lineup.map(l => {
    if (!l.player) return `• ${l.label}: EMPTY (nobody on your roster can play here)`;
    const tag = l.locked ? " (game started, locked)" : l.changed ? " ← change" : "";
    const why = keyReason(l.player);
    return `• ${l.label}: ${l.player.name} — ${shown(l.player)} pts${tag}${why ? `\n    ${why}` : ""}`;
  });
  const changes = check.swaps
    .filter(s => !s.from)
    .map(
      s =>
        `• Start ${s.start.name}${s.bench ? ` instead of ${s.bench.name}${s.movesTo ? ` (${s.bench.name} moves to ${s.movesTo})` : ""}` : ` in your empty ${s.slot} spot`} (+${s.gain.toFixed(2)} after matchup and injuries)`
    );
  const close = (check.closeCalls ?? []).map(
    c => `• ${c.slot}: ${c.starter.name} (${shown(c.starter)}) over ${c.bench.name} (${shown(c.bench)}), ${c.diff.toFixed(2)} apart${keyReason(c.bench) ? ` · ${c.bench.name}: ${keyReason(c.bench)}` : ""}`
  );
  return [
    `Best lineup for week ${check.week} (same order as Sleeper; points are Sleeper's projections):`,
    ...lines,
    "",
    changes.length ? "Changes to make in Sleeper:" : "No changes needed: this is already your lineup in Sleeper.",
    ...changes,
    ...(close.length ? ["", "Close calls (only between players who can play that spot):", ...close] : []),
  ].join("\n");
}

// ---------- Waivers ----------
/** Your open roster spots (bench included) and pickups for them, from Sleeper's roster. */
async function openSpotsFor(ctx: LeagueContext, me: LeagueTeam): Promise<OpenSpots | null> {
  const rosters = await getRosters(String(ctx.league?.league_id ?? "")).catch(() => null);
  const roster = (rosters ?? []).find((r: any) => Number(r.roster_id) === me.rosterId);
  if (!roster) return null;
  const away = new Set([...(roster.reserve ?? []), ...(roster.taxi ?? [])].map(String));
  return openRosterSpots({
    rosterPositions: ctx.league?.roster_positions,
    activePlayers: me.players.filter(p => !away.has(p.id)),
    freeAgents: ctx.freeAgents,
    slots: ctx.slots,
  });
}

async function handleWaiver(message: string, ctx: LeagueContext, me: LeagueTeam): Promise<AdvisorResult> {
  const spots = await openSpotsFor(ctx, me);
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

    // With an open roster spot there's nothing to drop.
    if (spots && spots.open > 0) {
      const balance = balanceSummary(me.players, positionTargets(ctx.slots));
      return {
        prompt: buildOpenSpotPrompt(message, spots, me.players, balance, target),
        fallback: `You have ${spots.open} open roster spot${spots.open === 1 ? "" : "s"}, so just add ${target.name}: no drop needed.`,
      };
    }

    // How waivers work in this league (FAAB bid or claim priority), for the AI to mention.
    const waiver = await buildWaiverAdvice(ctx, String(ctx.league?.league_id ?? ""), target.id).catch(() => null);

    let options = rankDropCandidates(me.players, target, ctx.slots);
    // If the user named one of their own players ("drop X for Y"), show that option first.
    const named = mentioned.find(p => myIds.has(p.id));
    if (named) options = [...options.filter(o => o.drop.id === named.id), ...options.filter(o => o.drop.id !== named.id)];

    const best = options[0];
    const balance = balanceSummary(me.players, positionTargets(ctx.slots));
    const fallback = best
      ? `Add ${target.name} (${target.value.toFixed(2)} pts/g) and drop ${best.drop.name} (${best.drop.value.toFixed(2)} pts/g). Lineup change: ${pts(best.netGain)} pts/week.${
          best.notes?.length ? `\n${best.notes.join("\n")}` : ""
        }\n\nOther drop options:\n${options
          .slice(1, 3)
          .map(o => `• ${o.drop.name} (${pts(o.netGain)} pts/week)`)
          .join("\n")}`
      : `Your roster is empty, so just add ${target.name}.`;
    return {
      prompt: buildDropForTargetPrompt(message, target, options, me.players, balance, waiver?.summary ?? ""),
      fallback: waiver?.summary ? `${fallback}\n\n${waiver.summary}` : fallback,
    };
  }

  if (spots && spots.open > 0) {
    const balance = balanceSummary(me.players, positionTargets(ctx.slots));
    const fallback = [
      `You have ${spots.open} open roster spot${spots.open === 1 ? "" : "s"}: no drop needed.${spots.needs.length ? ` You're short at ${spots.needs.join(", ")}.` : ""}`,
      ...spots.pickups.map(p => `• Add ${p.add.name} (${p.add.position}, ${p.add.value.toFixed(2)} pts/g): ${p.reason}`),
    ].join("\n");
    return { prompt: buildOpenSpotPrompt(message, spots, me.players, balance), fallback };
  }

  const suggestions = suggestPickups(me.players, ctx.freeAgents, ctx.slots, 5);
  const balance = balanceSummary(me.players, positionTargets(ctx.slots));
  const fallback = suggestions.length
    ? `Top waiver pickups for you:\n${suggestions
        .map(s => `• Add ${s.add.name} (${s.add.value.toFixed(2)}) / drop ${s.drop.name} (${s.drop.value.toFixed(2)}): ${pts(s.netGain)} pts/week`)
        .join("\n")}`
    : "No free agent projects better than the players on your roster right now.";
  return { prompt: buildPickupPrompt(message, suggestions, me.players, balance), fallback };
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
      // "Should I send this?" (a trade the user built) vs "should I accept this?" (an offer).
      if (/\b(send|sending|propose|proposing|offer him|offer them|pitch)\b/i.test(message) && !/offered me|sent me|got an offer/i.test(message)) {
        const p = gradeProposal(me, partner, give, get, ctx.slots);
        return {
          prompt: buildTradeEvaluationPrompt(message, p.idea, { headline: p.headline, edits: p.counters }),
          fallback: [p.headline, ...p.counters.map(c => `• ${c.summary}`)].join("\n"),
        };
      }
      const idea = evaluateTrade(me, partner, give, get, ctx.slots);
      return { prompt: buildTradeEvaluationPrompt(message, idea), fallback: describeTradeIdea(idea) };
    }
    return {
      reply: "Those players are on different teams. Ask about a trade with one team at a time.",
      fallback: "",
    };
  }

  // "Who should I trade to get X?": every idea must include X (the same offers as the
  // "Build a trade offer" button on his page).
  if (get.length === 1 && give.length === 0) {
    const target = get[0];
    const owner = others.find(t => t.players.some(p => p.id === target.id));
    if (owner) {
      const offers = tradeForPlayer(me, owner, target.id, ctx.slots, 3);
      const fallback = offers.length
        ? offers.map((idea, i) => describeTradeIdea(idea, i)).join("\n\n")
        : `I couldn't put together an offer for ${target.name} from your roster.`;
      return { prompt: buildTradeIdeasPrompt(message, offers, me.players, target.name), fallback };
    }
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

  if (intent === "waiver" || intent === "trade") await addPlayoffSchedules(ctx);

  switch (intent) {
    case "waiver":
      return await handleWaiver(message, ctx, me);
    case "trade":
      return handleTrade(message, ctx, me);
    case "draft":
      return handleDraft(message, ctx, me);
    case "start_sit":
      return handleLineup(message, ctx, me, String(team!.leagueId));
    default:
      return { prompt: buildGeneralPrompt(message, me.players), fallback: "" };
  }
}
