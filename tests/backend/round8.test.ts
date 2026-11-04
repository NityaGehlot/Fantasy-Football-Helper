import { test } from "node:test";
import assert from "node:assert/strict";
import { compareLineups, slotLabels } from "../../app/backend/services/lineupCheck";
import { findMentionedPlayers, lineupListing } from "../../app/backend/services/advisor";
import { buildLineupPrompt } from "../../app/backend/services/advisorPrompts";
import { injuryNote } from "../../app/backend/services/injuryStore";
import { computeRanks, leaguePoints } from "../../app/backend/services/playerRanks";
import { rankDropCandidates } from "../../app/backend/services/waiver";
import { openRosterSpots } from "../../app/backend/services/irAdvice";
import { describeMoves } from "../../app/backend/services/leagueMoves";
import { tradeForPlayer } from "../../app/backend/services/tradeGrade";

const pl = (id: string, name: string, position: string, value: number, extra: Record<string, any> = {}) => ({
  id,
  name,
  position,
  team: "X",
  injuryStatus: "ACTIVE",
  value,
  ...extra,
});

test("slot labels number repeated slots like Sleeper's list", () => {
  assert.deepEqual(slotLabels(["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "FLEX", "K", "DEF"]), [
    "QB", "RB 1", "RB 2", "WR 1", "WR 2", "TE", "FLEX 1", "FLEX 2", "K", "DEF",
  ]);
});

test("best lineup is listed slot by slot in Sleeper's order, both FLEX spots included", () => {
  const players = [
    pl("qb", "Quarter Back", "QB", 18),
    pl("rb1", "Run One", "RB", 15),
    pl("rb2", "Run Two", "RB", 12),
    pl("wr1", "Wide One", "WR", 14),
    pl("wr2", "Wide Two", "WR", 11),
    pl("te", "Tight End", "TE", 9),
    pl("f1", "Flex One", "WR", 10),
    pl("f2", "Flex Two", "RB", 8),
    pl("bn", "Bench Guy", "WR", 3),
  ];
  const slots = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "FLEX"] as any;
  const out = compareLineups(players, ["qb", "rb1", "rb2", "wr1", "wr2", "te", "f1", "bn"], slots);
  assert.deepEqual(out.lineup.map(l => l.label), ["QB", "RB 1", "RB 2", "WR 1", "WR 2", "TE", "FLEX 1", "FLEX 2"]);
  assert.equal(out.lineup[7].player?.name, "Flex Two");
  assert.equal(out.lineup[7].changed, true);
  assert.equal(out.lineup[6].changed, false);

  const text = lineupListing({ week: 9, lineup: out.lineup, swaps: out.swaps });
  assert.match(text, /FLEX 1: Flex One/);
  assert.match(text, /FLEX 2: Flex Two — 8\.00 pts ← change/);
  assert.ok(text.indexOf("QB:") < text.indexOf("RB 1:") && text.indexOf("TE:") < text.indexOf("FLEX 1:"));
  assert.match(text, /Start Flex Two instead of Bench Guy/);

  const prompt = buildLineupPrompt("Who should I start?", out.lineup, [], [], {}, ["Run Two is questionable (ankle)."]);
  assert.match(prompt, /Write exactly 8 bullets, one per slot, in this order: QB, RB 1, RB 2, WR 1, WR 2, TE, FLEX 1, FLEX 2/);
  assert.match(prompt, /Run Two is questionable \(ankle\)/);
});

test("injury note combines designation, practice news and the latest headline", () => {
  const note = injuryNote(
    { name: "Bhayshul Tuten", injuryStatus: "Questionable" },
    {
      player_id: "1",
      full_name: "Bhayshul Tuten",
      team: "JAX",
      position: "RB",
      status: "QUESTIONABLE",
      injury: "Ankle",
      practice_status: "DNP",
      practice_source: "news",
      latest_news: { title: "Bhayshul Tuten not spotted at practice", published: "2026-11-04" },
    }
  );
  assert.match(note!, /Bhayshul Tuten is questionable \(ankle\)/);
  assert.match(note!, /did not practice today per news reports/);
  assert.match(note!, /not spotted at practice/);
  // Sleeper says questionable, no report: still mentioned.
  assert.match(injuryNote({ name: "A", injuryStatus: "Questionable" }, null)!, /A is questionable/);
  assert.equal(injuryNote({ name: "B", injuryStatus: "ACTIVE" }, null), null);
});

test("ranks use league scoring and share ties, overall and by position", () => {
  const scoring = { rec: 1, rec_yd: 0.1, rush_yd: 0.1, pass_yd: 0.04, pass_td: 4 };
  assert.equal(leaguePoints({ rec: 5, rec_yd: 60 }, scoring), 11);
  // No stat matches the scoring keys: fall back to Sleeper's total for that format (half PPR).
  assert.equal(leaguePoints({ pts_half_ppr: 9.5, pts_ppr: 12 }, { rec: 0.5 } as any), 9.5);
  assert.equal(leaguePoints({ pts_half_ppr: 9.5, pts_ppr: 12 }, null), 12);
  const ranks = computeRanks(
    [
      { id: "qb", position: "QB", stats: { pass_yd: 3000, pass_td: 20, gp: 9 } }, // 200
      { id: "wr1", position: "WR", stats: { rec: 60, rec_yd: 900 } }, // 150
      { id: "wr2", position: "WR", stats: { rec: 50, rec_yd: 1000 } }, // 150
      { id: "rb", position: "RB", stats: { rush_yd: 700, rec: 10, rec_yd: 50 } }, // 85
      { id: "ol", position: "OL", stats: { rec: 1 } },
    ],
    scoring
  );
  assert.equal(ranks.qb.overall, 1);
  assert.equal(ranks.wr1.overall, 2);
  assert.equal(ranks.wr2.overall, 2);
  assert.equal(ranks.wr2.position, 1);
  assert.equal(ranks.rb.overall, 4);
  assert.equal(ranks.rb.position, 1);
  assert.equal(ranks.wr1.positionCount, 2);
  assert.equal(ranks.ol, undefined);
});

test("at a position you have too many of, the lowest scorer is the drop", () => {
  const rank = (points: number, position: number) => ({ points, games: 9, overall: 100, position, pos: "QB", positionCount: 40 });
  const roster = [
    pl("qb1", "Starter QB", "QB", 20, { rank: rank(180, 5) }),
    pl("qb2", "Backup A", "QB", 6, { rank: rank(40, 30) }),
    pl("qb3", "Backup B", "QB", 6, { rank: rank(12, 38) }),
    pl("qb4", "Backup C", "QB", 6, { rank: rank(25, 34) }),
    pl("rb1", "RB1", "RB", 14), pl("rb2", "RB2", "RB", 12), pl("rb3", "RB3", "RB", 7),
    pl("wr1", "WR1", "WR", 13), pl("wr2", "WR2", "WR", 11), pl("wr3", "WR3", "WR", 7),
    pl("te", "TE", "TE", 8),
  ];
  const target = pl("new", "New WR", "WR", 6.5);
  const [best] = rankDropCandidates(roster as any, target as any, ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX"] as any);
  assert.equal(best.drop.name, "Backup B");
  assert.ok(best.notes?.some(n => /Lowest scorer of your 4 QBs: 12\.00 pts this season \(QB38\)/.test(n)));
});

test("open roster spots: counts bench spots and picks for what the team needs", () => {
  const slots = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF"] as any;
  const rosterPositions = [...slots, "BN", "BN", "BN", "BN", "BN", "IR"];
  const active = [
    pl("qb", "QB", "QB", 18), pl("rb1", "RB1", "RB", 14), pl("rb2", "RB2", "RB", 12), pl("rb3", "RB3", "RB", 6),
    pl("wr1", "WR1", "WR", 13), pl("wr2", "WR2", "WR", 11), pl("wr3", "WR3", "WR", 8), pl("wr4", "WR4", "WR", 5),
    pl("te", "TE", "TE", 8), pl("k", "K", "K", 7), pl("def", "DEF", "DEF", 6), pl("rb4", "RB4", "RB", 4), pl("wr5", "WR5", "WR", 3),
  ];
  const free = [pl("fte", "Free TE", "TE", 6), pl("fwr", "Free WR", "WR", 9), pl("fk", "Free K", "K", 8), pl("hurt", "Hurt WR", "WR", 12, { injuryStatus: "OUT" })];
  const spots = openRosterSpots({ rosterPositions, activePlayers: active as any, freeAgents: free as any, slots });
  assert.equal(spots.size, 14);
  assert.equal(spots.used, 13);
  assert.equal(spots.open, 1);
  assert.deepEqual(spots.needs, []);
  assert.equal(spots.pickups[0].add.name, "Free WR");
  assert.ok(!spots.pickups.some(p => p.add.name === "Free K" || p.add.name === "Hurt WR"));

  // No tight end at all: that comes first.
  const noTe = openRosterSpots({ rosterPositions, activePlayers: active.filter(p => p.id !== "te") as any, freeAgents: free as any, slots });
  assert.deepEqual(noTe.needs, ["TE"]);
  assert.equal(noTe.pickups[0].add.name, "Free TE");
  assert.match(noTe.pickups[0].reason, /no TE/);

  const full = openRosterSpots({ rosterPositions, activePlayers: [...active, pl("x", "X", "WR", 1)] as any, freeAgents: free as any, slots });
  assert.equal(full.open, 0);
  assert.equal(full.pickups.length, 0);
});

test("league moves: completed trades and adds/drops, newest first; pending offers left out", () => {
  const players = {
    "1": { full_name: "Rico Dowdle", position: "RB", team: "CAR" },
    "2": { full_name: "Ty Johnson", position: "RB", team: "BUF" },
    "3": { full_name: "Deebo Samuel", position: "WR", team: "WAS" },
    "4": { full_name: "Jahmyr Gibbs", position: "RB", team: "DET" },
    HOU: { first_name: "Houston", last_name: "Texans", position: "DEF", team: "HOU" },
  };
  const moves = describeMoves(
    [
      { transaction_id: "a", type: "waiver", status: "complete", status_updated: 100, adds: { "1": 2 }, drops: { "2": 2 }, roster_ids: [2], settings: { waiver_bid: 14 }, leg: 9 },
      { transaction_id: "b", type: "trade", status: "complete", status_updated: 300, adds: { "3": 1, "4": 3 }, drops: { "3": 3, "4": 1 }, roster_ids: [1, 3], draft_picks: [{ season: "2027", round: 2, roster_id: 3, owner_id: 1, previous_owner_id: 3 }], leg: 9 },
      { transaction_id: "c", type: "trade", status: "pending", status_updated: 400, adds: { "1": 1 }, drops: { "1": 2 }, roster_ids: [1, 2] },
      { transaction_id: "d", type: "free_agent", status: "complete", status_updated: 200, adds: { HOU: 4 }, roster_ids: [4], leg: 9 },
      { transaction_id: "e", type: "waiver", status: "failed", adds: { "2": 4 }, roster_ids: [4] },
    ],
    { 1: "Nitya", 2: "Team 2", 3: "Goon Squad", 4: "Team 4" },
    players,
    1
  );
  assert.deepEqual(moves.map(m => m.id), ["b", "d", "a"]);
  assert.equal(moves[0].summary, "Trade: Nitya gets Deebo Samuel, 2027 round 2 (Goon Squad's); Goon Squad gets Jahmyr Gibbs");
  assert.equal(moves[0].involvesYou, true);
  assert.equal(moves[1].summary, "Team 4 added Houston Texans");
  assert.equal(moves[2].summary, "Team 2 claimed Rico Dowdle ($14) and dropped Ty Johnson");
  assert.equal(moves[2].involvesYou, false);
});

test("trading for a defense: every offer includes him, and the chat finds 'Houston Texans'", () => {
  const slots = ["QB", "RB", "WR", "TE", "K", "DEF"] as any;
  const me = {
    rosterId: 1, ownerId: "u1", teamName: "Me",
    players: [pl("qb", "My QB", "QB", 18), pl("rb", "My RB", "RB", 14), pl("rb2", "My RB2", "RB", 7), pl("wr", "My WR", "WR", 13), pl("wr2", "My WR2", "WR", 6), pl("te", "My TE", "TE", 8), pl("k", "My K", "K", 7), pl("def", "Cleveland Browns", "DEF", 5, { team: "CLE" })],
  };
  const owner = {
    rosterId: 2, ownerId: "u2", teamName: "Them",
    players: [pl("qb2", "Their QB", "QB", 17), pl("rb3", "Their RB", "RB", 13), pl("wr3", "Their WR", "WR", 12), pl("te2", "Their TE", "TE", 7), pl("k2", "Their K", "K", 8), pl("HOU", "Houston Texans", "DEF", 9, { team: "HOU" })],
  };
  const offers = tradeForPlayer(me as any, owner as any, "HOU", slots, 3);
  assert.ok(offers.length > 0);
  assert.ok(offers.every(o => o.get.some(p => p.id === "HOU")));

  const pool = [...me.players, ...owner.players] as any;
  const found = findMentionedPlayers("Who should I trade to Them to get Houston Texans?", pool, me.players as any);
  assert.deepEqual(found.map(p => p.id), ["HOU"]);
  assert.deepEqual(findMentionedPlayers("Should I trade for the Texans defense?", pool, me.players as any).map(p => p.id), ["HOU"]);
});
