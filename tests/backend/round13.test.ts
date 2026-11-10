import { test } from "node:test";
import assert from "node:assert/strict";
import { projectionFor, SLEEPER_DEFAULT_SCORING } from "../../app/backend/services/liveMatchup";
import { compareLineups } from "../../app/backend/services/lineupCheck";
import { sleeperLineToRow } from "../../app/backend/services/statsStore";

const proj = { pts_ppr: 16.47, pts_half_ppr: 13.97, pts_std: 11.47, rec: 5, rec_yd: 70.2, rec_td: 0.45, pass_td: 0, rush_yd: 3 };

test("Sleeper projection: a standard league gets Sleeper's own total, unchanged", () => {
  assert.equal(projectionFor(proj, SLEEPER_DEFAULT_SCORING), 16.47);
  assert.equal(projectionFor(proj, { ...SLEEPER_DEFAULT_SCORING, rec: 0.5 }), 13.97);
  assert.equal(projectionFor(proj, 1), 16.47);
});

test("Sleeper projection: custom scoring adds only what differs from Sleeper's preset", () => {
  // TE premium (+0.5 per catch) on 5 projected catches, 6-point passing TDs on 1.5 TDs
  assert.equal(projectionFor(proj, { ...SLEEPER_DEFAULT_SCORING, bonus_rec_te: 0.5, bonus_rec_te_x: 0 }), 16.47);
  assert.equal(projectionFor({ ...proj, bonus_rec_te: 5 }, { ...SLEEPER_DEFAULT_SCORING, bonus_rec_te: 0.5 }), 18.97);
  assert.equal(projectionFor({ pts_ppr: 20, pass_td: 1.5 }, { ...SLEEPER_DEFAULT_SCORING, pass_td: 6 }), 23);
});

const P = (id: string, position: string, value: number) => ({ id, name: id, position, value, projection: value });

test("Lineup check: totals are plain sums of the Sleeper numbers shown", () => {
  const players = [P("qb", "QB", 18.4), P("wr1", "WR", 12.31), P("wr2", "WR", 9.02), P("wrB", "WR", 11.5)];
  const r = compareLineups(players, ["qb", "wr1", "wr2"], ["QB", "WR", "WR"] as any);
  assert.equal(r.currentPoints, 39.73);
  assert.equal(r.bestPoints, 42.21);
  assert.equal(r.swaps.length, 1);
  assert.equal(r.swaps[0].gain, 2.48);
  assert.equal(Math.round((r.bestPoints - r.currentPoints) * 100) / 100, r.swaps[0].gain);
});

test("Lineup check: a tie keeps the current starter and adds nothing to totals", () => {
  const players = [P("wr1", "WR", 10), P("wrB", "WR", 10)];
  const r = compareLineups(players, ["wr1"], ["WR"] as any);
  assert.equal(r.swaps.length, 0);
  assert.equal(r.currentPoints, 10);
  assert.equal(r.bestPoints, 10);
});

test("Stats fallback: a Sleeper stat line becomes an nfl-data style row", () => {
  const row = sleeperLineToRow(
    {
      player_id: "3294",
      team: "DAL",
      opponent: "IND",
      player: { first_name: "Dak", last_name: "Prescott", position: "QB" },
      stats: { gp: 1, pts_ppr: 19.5, pass_cmp: 21, pass_att: 34, pass_yd: 335, pass_td: 2, rush_att: 2, rush_yd: 1 },
    },
    2026,
    9,
    { "3294": "00-0033077" }
  );
  assert.equal(row.player_id, "00-0033077");
  assert.equal(row.player_name, "Dak Prescott");
  assert.equal(row.passing_yards, 335);
  assert.equal(row.fantasy_points_ppr, 19.5);
  assert.equal(row.opponent_team, "IND");
  const def = sleeperLineToRow({ player_id: "JAX", team: "JAX", player: { position: "DEF" }, stats: { gp: 1, pts_ppr: 11, int: 2 } }, 2026, 9);
  assert.equal(def.player_id, "DEF_JAX");
  assert.equal(def.def_interceptions, 2);
  // Rostered but didn't play: no row
  assert.equal(sleeperLineToRow({ player_id: "1", player: { position: "WR" }, stats: {} }, 2026, 9), null);
});

import { excerptAbout, parsePlayerFeed, plainText } from "../../app/backend/services/playerInsights";

test("Expert takes: RotoWire updates and ESPN columns, newest first", () => {
  const items = parsePlayerFeed(
    {
      feed: [
        { id: 1, type: "Story", headline: "Lineup conundrums", byline: "Liz Loza", published: "2026-11-05T23:52:34Z", description: "Summary",
          story: "<p><photo1></p><p>Intro about the week.</p><p>Dak Prescott, QB: he bailed managers out with a rushing score.</p>", links: { web: { href: "https://espn.com/a" } } },
        { id: 2, type: "Rotowire", headline: "Prescott threw for 335 yards.", story: "Third 300-yard game.", published: "2026-11-08T22:51:35Z", links: { mobile: { href: "x" } } },
      ],
    },
    "Dak Prescott"
  );
  assert.equal(items[0].kind, "update");
  assert.equal(items[0].source, "RotoWire");
  assert.equal(items[0].analysis, "Third 300-yard game.");
  assert.equal(items[0].link, null);
  assert.equal(items[1].kind, "article");
  assert.equal(items[1].author, "Liz Loza");
  assert.equal(items[1].analysis, "Dak Prescott, QB: he bailed managers out with a rushing score.");
});

test("Expert takes: HTML cleanup and excerpt fallback", () => {
  assert.equal(plainText("<p>A &amp; B</p><p>C</p>"), "A & B\n\nC");
  assert.equal(excerptAbout("Nothing here.\n\nAlso nothing.", "Dak Prescott"), "");
  assert.equal(excerptAbout("First.\n\nPrescott was great.", "Dak Prescott"), "Prescott was great.");
});
