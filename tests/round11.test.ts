import { test } from "node:test";
import assert from "node:assert/strict";
import { projectedPoints, projectedStatLine, scoringLabel } from "../app/services/projections";

// Devin Singletary's week-10 entry, as nfl-data saves it from Sleeper.
const entry = { name: "Devin Singletary", pos: "RB", team: "NYG", opp: "WAS", ppr: 8.2, half: 7.3, std: 6.4, stats: { rush_att: 7.51, rush_yd: 29, rush_td: 0.22, rec_tgt: 2.25, rec: 1.8, rec_yd: 13.52, rec_td: 0.15 } };

test("projected points follow the league's scoring", () => {
  assert.equal(projectedPoints(entry, 1), 8.2);
  assert.equal(projectedPoints(entry, 0.5), 7.3);
  assert.equal(projectedPoints(entry, 0), 6.4);
  assert.equal(scoringLabel(1), "PPR");
  assert.equal(scoringLabel(0.5), "Half PPR");
  assert.equal(scoringLabel(0), "Standard");
});

test("projected stat line", () => {
  assert.deepEqual(projectedStatLine("RB", entry.stats), ["7.5 car, 29 yd, 0.2 TD", "1.8 rec (2.3 tgt), 13.5 yd, 0.1 TD"]);
  assert.deepEqual(projectedStatLine("QB", { pass_cmp: 21.4, pass_att: 32.1, pass_yd: 251.3, pass_td: 1.7, pass_int: 0.6 }), ["21.4/32.1 cmp, 251.3 yd, 1.7 TD, 0.6 INT"]);
  assert.deepEqual(projectedStatLine("K", { fgm: 1.8, fga: 2.1, xpm: 2.4 }), ["1.8 FG of 2.1, 2.4 XP"]);
  assert.deepEqual(projectedStatLine("DEF", { def_sack: 2.4, def_int: 0.8, pts_allow: 21 }), ["2.4 sacks, 0.8 INT, 21 pts allowed"]);
  assert.deepEqual(projectedStatLine("WR", {}), []);
});
