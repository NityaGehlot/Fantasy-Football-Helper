import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRosterSlots, optimizeLineup, lineupValue, DEFAULT_SLOTS } from "../../app/backend/services/lineup";
import { p } from "./fixtures";

test("roster positions ignore bench/IR/taxi and fall back to defaults", () => {
  assert.deepEqual(parseRosterSlots(["QB", "RB", "WR", "FLEX", "BN", "BN", "IR", "TAXI"]), ["QB", "RB", "WR", "FLEX"]);
  assert.deepEqual(parseRosterSlots(undefined), DEFAULT_SLOTS);
});

test("lineup fills position slots first, then the flex with the best leftover", () => {
  const roster = [p("qb", "QB", 20), p("rb1", "RB", 15), p("rb2", "RB", 12), p("rb3", "RB", 11), p("wr1", "WR", 14), p("wr2", "WR", 9), p("te", "TE", 8)];
  const lineup = optimizeLineup(roster, ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX"]);
  const flex = lineup.find(a => a.slot === "FLEX")!;
  assert.equal(flex.player?.id, "rb3");
  assert.equal(lineupValue(roster, ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX"]), 89);
});

test("empty slots are reported when nobody is eligible", () => {
  const lineup = optimizeLineup([p("qb", "QB", 20)], ["QB", "K"]);
  assert.equal(lineup.find(a => a.slot === "K")!.player, null);
});

test("super flex prefers a second QB when he scores more", () => {
  const roster = [p("qb1", "QB", 22), p("qb2", "QB", 18), p("wr", "WR", 10), p("wr2", "WR", 9)];
  const lineup = optimizeLineup(roster, ["QB", "WR", "SUPER_FLEX"]);
  assert.equal(lineup.find(a => a.slot === "SUPER_FLEX")!.player?.id, "qb2");
});
