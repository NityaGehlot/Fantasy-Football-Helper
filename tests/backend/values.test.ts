import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePlayerName, playerKey } from "../../app/backend/utils/names";
import { buildValueIndex, valueForSleeperPlayer, injuryMultiplier } from "../../app/backend/services/playerValues";
import { normalizeRows } from "../../app/backend/services/statsStore";
import { getCurrentNFLSeason } from "../../app/backend/utils/season";
import { statRow } from "./fixtures";

test("player names normalize across Sleeper and nflverse spellings", () => {
  assert.equal(normalizePlayerName("Kenneth Walker III"), "kenneth walker");
  assert.equal(normalizePlayerName("Amon-Ra St. Brown"), "amon ra st brown");
  assert.equal(normalizePlayerName("D'Andre Swift"), "d andre swift");
  assert.equal(normalizePlayerName("Marvin Harrison Jr."), "marvin harrison");
  assert.equal(playerKey("Josh Allen", "QB"), "QB|josh allen");
  assert.notEqual(playerKey("Josh Allen", "QB"), playerKey("Josh Allen", "LB"));
  assert.equal(playerKey("ARI DEF", "DEF", "ARI"), "DEF|ARI");
  assert.equal(playerKey("Arizona", "DEF", "ARI"), "DEF|ARI");
});

test("current NFL season rolls over in March", () => {
  assert.equal(getCurrentNFLSeason(new Date(2026, 9, 31)), 2026);
  assert.equal(getCurrentNFLSeason(new Date(2027, 0, 15)), 2026);
  assert.equal(getCurrentNFLSeason(new Date(2027, 2, 1)), 2027);
});

test("value blends season and last-3 averages and skips weeks not played", () => {
  const rows = [
    statRow("Josh Allen", "QB", 1, 30),
    statRow("Josh Allen", "QB", 2, 0, { game_played: false }), // bye
    statRow("Josh Allen", "QB", 3, 20),
    statRow("Josh Allen", "QB", 4, 10),
    statRow("Josh Allen", "QB", 5, 15),
  ];
  const v = buildValueIndex(rows).get("QB|josh allen")!;
  assert.equal(v.gamesPlayed, 4);
  assert.equal(v.seasonAvg, 18.75);
  assert.equal(v.last3Avg, 15);
  assert.equal(v.value, 17.25); // 0.6 * 18.75 + 0.4 * 15
});

test("players with fewer than 3 games are stabilized with last season", () => {
  const current = [statRow("Rookie Guy", "WR", 1, 20)];
  const prior = [statRow("Rookie Guy", "WR", 1, 8), statRow("Rookie Guy", "WR", 2, 12)];
  const v = buildValueIndex(current, prior).get("WR|rookie guy")!;
  // base 20, blended (1*20 + 2*10) / 3
  assert.equal(v.value, 13.33);
});

test("injury status discounts value and Sleeper's live status wins", () => {
  const rows = [statRow("Hurt Guy", "RB", 1, 20, { injury_status: "QUESTIONABLE" })];
  const index = buildValueIndex(rows);
  assert.equal(index.get("RB|hurt guy")!.value, 19);
  const healthy = valueForSleeperPlayer(index, { full_name: "Hurt Guy", position: "RB", injury_status: null })!;
  assert.equal(healthy.value, 20);
  assert.equal(healthy.injuryStatus, "ACTIVE");
  const ir = valueForSleeperPlayer(index, { full_name: "Hurt Guy", position: "RB", injury_status: "IR" })!;
  assert.equal(ir.value, 8);
  assert.equal(injuryMultiplier("Doubtful"), 0.85);
});

test("team defenses match Sleeper DEF ids", () => {
  const rows = [{ ...statRow("ARI DEF", "DEF", 1, 9, { team: "ARI" }), player_id: "DEF_ARI" }];
  const index = buildValueIndex(rows);
  assert.equal(valueForSleeperPlayer(index, { player_id: "ARI", position: "DEF", team: "ARI", first_name: "Arizona", last_name: "Cardinals" })?.value, 9);
});

test("stat rows keep zero-filled numeric fields and fill missing seasons", () => {
  const rows = normalizeRows({ 1: [{ week: " 3", season: null, player_name: "X", position: "WR", receptions: "4" }] }, 2026);
  assert.equal(rows[0].week, 3);
  assert.equal(rows[0].season, 2026);
  assert.equal(rows[0].receptions, 4);
  assert.equal(rows[0].fg_made, 0);
  const def = normalizeRows([{ week: 1, def_sacks: "3" }], 2026, "defense");
  assert.equal(def[0].def_sacks, 3);
  assert.equal(def[0].def_tds, 0);
});

import { getPlayerInjuryStatus, getInjuredTeammates } from "../../app/backend/utils/playerExtraction";
import { setInjuryRecords } from "../../app/backend/services/injuryStore";

test("upcoming week injury status comes from the daily injury file, not a healthy default", () => {
  setInjuryRecords([
    { player_id: "1", full_name: "Romeo Doubs", team: "GB", position: "WR", status: "IR", injury: "Hamstring" },
    { player_id: "2", full_name: "Jordan Love", team: "GB", position: "QB", status: "QUESTIONABLE", practice_status: "LP", injury: "Ankle" },
  ]);
  const rows = [statRow("Jordan Love", "QB", 7, 20, { team: "GB" })];
  const love = getPlayerInjuryStatus("jordan love", "QB", rows, 8);
  assert.equal(love.status, "QUESTIONABLE");
  assert.equal(love.practiceStatus, "Limited");
  const unknown = getPlayerInjuryStatus("someone else", "QB", rows, 8);
  assert.equal(unknown.status, "No designation");
  // Completed weeks keep the status recorded in that week's stats file
  assert.equal(getPlayerInjuryStatus("jordan love", "QB", rows, 7).status, "ACTIVE");
  const teammates = getInjuredTeammates("GB", rows, 8, "QB");
  assert.deepEqual(teammates.map(t => [t.name, t.status]), [["romeo doubs", "IR"]]);
  setInjuryRecords([]);
});
