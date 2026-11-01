import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateTrade, generateTradeIdeas } from "../../app/backend/services/tradeEngine";
import { rankDropCandidates, suggestPickups } from "../../app/backend/services/waiver";
import type { SlotName } from "../../app/backend/services/lineup";
import { p, team } from "./fixtures";

const SLOTS: SlotName[] = ["QB", "RB", "RB", "WR", "WR"];

// I'm deep at RB but weak at WR; they are deep at WR but weak at RB.
const me = team(1, "Me", [p("myqb", "QB", 18), p("rbA", "RB", 16), p("rbB", "RB", 15), p("rbC", "RB", 14), p("wrA", "WR", 9), p("wrB", "WR", 6)]);
const them = team(2, "Them", [p("theirqb", "QB", 17), p("rbX", "RB", 8), p("rbY", "RB", 5), p("wrX", "WR", 15), p("wrY", "WR", 14), p("wrZ", "WR", 13)]);
const rich = team(3, "Rich", [p("richqb", "QB", 25), p("rbR", "RB", 20), p("rbS", "RB", 19), p("wrR", "WR", 18), p("wrS", "WR", 17)]);

test("evaluateTrade reports lineup changes for both sides", () => {
  const idea = evaluateTrade(me, them, [me.players[3]], [them.players[5]], SLOTS);
  // I start wrZ (13) instead of wrB (6): +7. They start rbC (14) instead of rbY (5) and lose wrZ who didn't start: +9.
  assert.equal(idea.myGain, 7);
  assert.equal(idea.theirGain, 9);
  assert.ok(idea.reasons.some(r => r.includes("starts instead of")));
});

test("trade ideas are win-win and come from the team that has what I need", () => {
  const ideas = generateTradeIdeas(me, [them, rich], SLOTS);
  assert.ok(ideas.length > 0);
  for (const idea of ideas) {
    assert.ok(idea.myGain >= 0.5, "helps me");
    assert.ok(idea.theirGain >= 0, "doesn't hurt them");
    assert.ok(idea.fairness >= 0.65, "not lopsided");
  }
  assert.equal(ideas[0].partner.teamName, "Them");
  assert.ok(ideas[0].give.every(g => g.position === "RB"));
  assert.ok(ideas[0].get.some(g => g.position === "WR"));
});

test("mustGet limits ideas to trades for a specific player", () => {
  const ideas = generateTradeIdeas(me, [them, rich], SLOTS, { mustGet: ["wrX"], minGain: -5 });
  assert.ok(ideas.length > 0);
  assert.ok(ideas.every(i => i.get.some(g => g.id === "wrX") && i.partner.rosterId === 2));
});

test("no ideas when nobody benefits", () => {
  const balanced = team(4, "Balanced", [p("q", "QB", 10), p("r1", "RB", 10), p("r2", "RB", 10), p("w1", "WR", 10), p("w2", "WR", 10)]);
  assert.deepEqual(generateTradeIdeas(balanced, [balanced, { ...balanced, rosterId: 5 }], SLOTS), []);
});

test("drop candidates prefer the player who doesn't hurt the lineup", () => {
  const target = p("newWR", "WR", 12);
  const options = rankDropCandidates(me.players, target, SLOTS);
  // Dropping the 3rd RB or the worst WR keeps the best lineup; wrB (6) is the lower-value of those.
  assert.equal(options[0].drop.id, "wrB");
  assert.equal(options[0].netGain, 6);
  // Dropping the only QB is the worst option.
  assert.equal(options[options.length - 1].drop.id, "myqb");
});

test("pickup suggestions only include players who help", () => {
  const fa = [p("faWR", "WR", 11), p("faRB", "RB", 3), p("faQB", "QB", 0)];
  const picks = suggestPickups(me.players, fa, SLOTS);
  assert.equal(picks[0].add.id, "faWR");
  assert.equal(picks[0].drop.id, "wrB");
  assert.ok(!picks.some(s => s.add.id === "faQB"));
});

test("pickup suggestions are capped at two per position", () => {
  const fa = [p("k1", "K", 9), p("k2", "K", 8.5), p("k3", "K", 8), p("faWR", "WR", 11)];
  const roster = [...me.players]; // no kicker, so every K helps
  const picks = suggestPickups(roster, fa, [...SLOTS, "K"]);
  assert.equal(picks.filter(s => s.add.position === "K").length, 2);
  assert.ok(picks.some(s => s.add.id === "faWR"));
});

test("untouchable players are never offered", () => {
  const all = generateTradeIdeas(me, [them, rich], SLOTS);
  const offered = new Set(all.flatMap(i => i.give.map(p => p.id)));
  const lockId = [...offered][0];
  const locked = generateTradeIdeas(me, [them, rich], SLOTS, { untouchable: [lockId] });
  assert.ok(locked.every(i => i.give.every(p => p.id !== lockId)));
});

test("ideas report structured lineup changes for both sides", () => {
  const idea = evaluateTrade(me, them, [me.players[3]], [them.players[5]], SLOTS);
  assert.equal(idea.myLineup[0].in?.id, "wrZ");
  assert.equal(idea.myLineup[0].out?.id, "wrB");
  assert.equal(idea.theirLineup[0].in?.id, "rbC");
});
