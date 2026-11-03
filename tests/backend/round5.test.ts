import { test } from "node:test";
import assert from "node:assert/strict";
import { percentile, playedPoints, pointRange } from "../../app/backend/utils/pointRange";
import { playoffOutlook, playoffWeeks, playoffNote, playoffTradeNote } from "../../app/backend/services/playoffSchedule";
import { computeDefenseRankings } from "../../app/backend/services/defenseRankings";
import { gradeFromGain, gradeTrade, pendingTradesFor } from "../../app/backend/services/tradeGrade";
import { compareLineups } from "../../app/backend/services/lineupCheck";
import { countTouchdowns } from "../../app/backend/services/liveMatchup";
import { moveNote } from "../../app/backend/services/irAdvice";

test("weekly range: floor, ceiling and label", () => {
  assert.equal(percentile([1, 2, 3, 4, 5], 0.5), 3);
  const safe = pointRange([12, 13, 14, 12, 13, 15, 14]);
  assert.equal(safe.label, "safe");
  assert.ok(safe.floor >= 12 && safe.ceiling <= 15);
  const boom = pointRange([3, 25, 4, 30, 2, 22, 5, 28]);
  assert.equal(boom.label, "boom/bust");
  assert.match(boom.summary, /boom or bust/);
  assert.equal(pointRange([10, 12]).label, "not enough games");
  assert.equal(pointRange(Array.from({ length: 15 }, (_, i) => i)).games, 10); // last 10 only
  // Bye weeks and games he didn't play are left out, in week order.
  assert.deepEqual(
    playedPoints([
      { week: 3, fantasy_points_ppr: 9, game_played: true },
      { week: 1, fantasy_points_ppr: 12, game_played: true },
      { week: 2, fantasy_points_ppr: 0, game_played: false },
      { week: 4, fantasy_points_ppr: 0, team_status: "bye" },
    ]),
    [12, 9]
  );
});

const rows = [
  { week: 1, opponent_team: "BUF", position: "WR", fantasy_points_ppr: 40 },
  { week: 1, opponent_team: "MIA", position: "WR", fantasy_points_ppr: 30 },
  { week: 1, opponent_team: "KC", position: "WR", fantasy_points_ppr: 10 },
];
const defense = computeDefenseRankings(rows, 2026);
const opponents = new Map([
  [15, new Map([["NYJ", { opponent: "BUF", home: true }]])],
  [16, new Map([["NYJ", { opponent: "MIA", home: false }]])],
  [17, new Map([["DAL", { opponent: "KC", home: true }]])], // NYJ missing = bye
]);

test("playoff schedule: weeks, outlook and trade note", () => {
  assert.deepEqual(playoffWeeks({ settings: { playoff_week_start: 15 } }), [15, 16, 17]);
  assert.deepEqual(playoffWeeks({}), [15, 16, 17]);
  assert.deepEqual(playoffWeeks({ settings: { playoff_week_start: 17 } }), [17, 18]);
  const nyj = playoffOutlook("NYJ", "WR", opponents, defense);
  assert.equal(nyj.label, "easy"); // BUF and MIA allow the most WR points
  assert.match(nyj.summary, /W15 vs BUF \(3rd\) · W16 @ MIA \(2nd\) · W17 BYE/);
  const dal = playoffOutlook("DAL", "WR", opponents, defense);
  assert.equal(dal.label, "tough");
  assert.equal(playoffOutlook(undefined, "WR", opponents, defense).label, "unknown");
  assert.match(playoffNote(nyj), /playoffs easy/);
  const p = (name: string, avgRank: number) => ({ id: name, name, position: "WR", value: 10, playoff: { label: "average" as const, avgRank, summary: "" } });
  assert.match(playoffTradeNote([p("a", 8)], [p("b", 26)])!, /players you get have easier matchups/);
  assert.equal(playoffTradeNote([p("a", 15)], [p("b", 17)]), null);
});

const pl = (id: string, position: string, value: number, injuryStatus = "ACTIVE") => ({ id, name: `P${id}`, position, team: "KC", injuryStatus, value });
const me = { rosterId: 1, ownerId: "u1", teamName: "Me", players: [pl("1", "RB", 15), pl("2", "RB", 5), pl("3", "WR", 12), pl("4", "WR", 4)] };
const them = { rosterId: 2, ownerId: "u2", teamName: "Them", players: [pl("5", "RB", 9), pl("6", "WR", 18), pl("7", "WR", 6), pl("8", "RB", 7)] };
const slots = ["RB", "WR", "FLEX"] as any;

test("trade grades", () => {
  assert.deepEqual([3, 1, 0, -1, -3].map(gradeFromGain), ["A", "B", "C", "D", "F"]);
  const good = gradeTrade(me, them, [me.players[1]], [them.players[1]], slots);
  assert.ok(["A", "B"].includes(good.grade), good.grade);
  assert.equal(good.verdict, "accept");
  const bad = gradeTrade(me, them, [me.players[0], me.players[2]], [them.players[3]], slots);
  assert.equal(bad.verdict, "decline");
  assert.match(bad.notes.join(" "), /fewer players than you give/);
});

test("pending trades are read from Sleeper transactions", () => {
  const offers = pendingTradesFor(
    [
      { type: "trade", status: "pending", transaction_id: "t1", creator: "u2", roster_ids: [2, 1], adds: { "6": 1, "2": 2 }, drops: { "6": 2, "2": 1 } },
      { type: "trade", status: "complete", roster_ids: [1, 2] },
      { type: "waiver", status: "pending", roster_ids: [1] },
    ],
    1,
    "u1"
  );
  assert.equal(offers.length, 1);
  assert.deepEqual(offers[0], { transactionId: "t1", status: "pending", direction: "received", partnerRosterId: 2, give: ["2"], get: ["6"] });
});

test("lineup check: swaps to the best lineup, leaving locked players alone", () => {
  const players = [pl("1", "RB", 15), pl("2", "RB", 2, "OUT"), pl("3", "WR", 12), pl("4", "WR", 9), pl("9", "RB", 11)];
  const out = compareLineups(players, ["1", "3", "2"], slots);
  assert.equal(out.currentPoints, 29);
  assert.equal(out.bestPoints, 38);
  assert.equal(out.swaps.length, 1);
  assert.equal(out.swaps[0].start.id, "9");
  assert.equal(out.swaps[0].bench?.id, "2");
  // If the out player's game already started, he's locked: nothing to swap.
  const locked = compareLineups(players, ["1", "3", "2"], slots, new Set(["2"]));
  assert.equal(locked.swaps.length, 0);
});

test("touchdowns are counted from live stats", () => {
  assert.equal(countTouchdowns({ pass_td: 2, rush_td: 1, rec_td: 0 }), 3);
  assert.equal(countTouchdowns(null), 0);
});

test("IR move notes depend on how long he's out", () => {
  assert.match(moveNote("IR"), /long-term/);
  assert.match(moveNote("OUT"), /week-to-week/);
  assert.match(moveNote("DOUBTFUL"), /sometimes play/);
});
