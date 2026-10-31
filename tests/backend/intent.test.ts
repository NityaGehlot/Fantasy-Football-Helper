import { test } from "node:test";
import assert from "node:assert/strict";
import { detectIntent } from "../../app/backend/services/intent";
import { buildDraftBoard, startersPerTeam } from "../../app/backend/services/draft";
import { findMentionedPlayers } from "../../app/backend/services/advisor";
import { buildDropForTargetPrompt, buildTradeEvaluationPrompt } from "../../app/backend/services/advisorPrompts";
import { evaluateTrade } from "../../app/backend/services/tradeEngine";
import { rankDropCandidates } from "../../app/backend/services/waiver";
import type { PlayerValue } from "../../app/backend/services/playerValues";
import { p, team } from "./fixtures";

test("intent detection covers the main question types", () => {
  assert.equal(detectIntent("Who should I start this week?"), "start_sit");
  assert.equal(detectIntent("Josh Allen or Jalen Hurts?"), "start_sit");
  assert.equal(detectIntent("Who should I drop to pick up Rico Dowdle?"), "waiver");
  assert.equal(detectIntent("Any good waiver pickups?"), "waiver");
  assert.equal(detectIntent("Who should I trade for?"), "trade");
  assert.equal(detectIntent("Should I trade Bijan for Chase?"), "trade");
  assert.equal(detectIntent("Who should I draft first overall?"), "draft");
  assert.equal(detectIntent("How does PPR scoring work?"), "general");
});

const pv = (name: string, position: string, value: number): PlayerValue => ({
  key: `${position}|${name.toLowerCase()}`, name, position, team: "KC", gamesPlayed: 8,
  seasonAvg: value, last3Avg: value, priorSeasonAvg: null, injuryStatus: "ACTIVE", value,
});

test("draft board uses value over replacement and respects exclusions and needs", () => {
  const players = [
    pv("QB1", "QB", 24), pv("QB2", "QB", 22), pv("QB3", "QB", 21),
    pv("RB1", "RB", 20), pv("RB2", "RB", 14), pv("RB3", "RB", 9), pv("RB4", "RB", 6),
  ];
  const board = buildDraftBoard(players, { teams: 2, slots: ["QB", "RB", "RB"], excludeKeys: new Set(["RB|rb1"]), myPositionCounts: { QB: 1 } });
  // Replacement QB = QB2 (2 teams x 1 QB), replacement RB = RB4 (2 teams x 2 RB, RB1 drafted)
  assert.equal(board[0].name, "RB2");
  assert.equal(board[0].vor, 8);
  assert.ok(!board.some(b => b.name === "RB1"));
  assert.equal(board.find(b => b.name === "QB1")!.fillsNeed, false);
  assert.equal(board.find(b => b.name === "RB2")!.fillsNeed, true);
  assert.equal(startersPerTeam(["FLEX"]).RB, 0.45);
});

test("mentioned players are found by full name, and by unique last name on my roster", () => {
  const mine = [p("1", "WR", 10, { name: "Garrett Wilson" }), p("2", "RB", 10, { name: "Kenneth Walker III" })];
  const others = [p("3", "WR", 12, { name: "Ja'Marr Chase" }), p("4", "RB", 3, { name: "Rico Dowdle" })];
  const found = findMentionedPlayers("Should I trade Wilson for Ja'Marr Chase?", [...mine, ...others], mine);
  assert.deepEqual(found.map(f => f.id), ["1", "3"]);
  const waiver = findMentionedPlayers("drop kenneth walker to pick up rico dowdle", [...mine, ...others], mine);
  assert.deepEqual(waiver.map(f => f.id), ["2", "4"]);
});

test("prompts carry the pre-computed verdicts", () => {
  const roster = [p("a", "WR", 5, { name: "Bench Guy" }), p("b", "WR", 15, { name: "Star Guy" })];
  const target = p("t", "WR", 10, { name: "Hot Pickup" });
  const prompt = buildDropForTargetPrompt("who do I drop?", target, rankDropCandidates(roster, target, ["WR"]), roster);
  assert.match(prompt, /ADD Hot Pickup, DROP Bench Guy/);

  const me = team(1, "Me", roster);
  const them = team(2, "Them", [target]);
  const evalPrompt = buildTradeEvaluationPrompt("good trade?", evaluateTrade(me, them, [roster[1]], [target], ["WR"]));
  assert.match(evalPrompt, /DECLINE/);
});

test("draft board doesn't flag needs when the roster is unknown", () => {
  const board = buildDraftBoard([pv("QB1", "QB", 24), pv("QB2", "QB", 20)], { teams: 1, slots: ["QB"] });
  assert.ok(board.every(b => !b.fillsNeed));
});
