import { test } from "node:test";
import assert from "node:assert/strict";
import { sleeperLeagueUrl } from "../app/services/externalLinks";
import { isVideoArticle } from "../app/services/newsDiversity";

test("links out to Sleeper", () => {
  assert.equal(sleeperLeagueUrl("1402843174556143616"), "https://sleeper.com/leagues/1402843174556143616");
});

test("video articles", () => {
  assert.equal(isVideoArticle({ video: true }), true);
  assert.equal(isVideoArticle({ link: "https://www.youtube.com/watch?v=abc" }), true);
  assert.equal(isVideoArticle({ url: "https://www.nfl.com/videos/allgeier-td" }), true);
  assert.equal(isVideoArticle({ url: "https://www.espn.com/nfl/story/_/id/1" }), false);
});

import { groupFollowing, injuryTag } from "../app/services/following";

test("Following: players grouped by your team / free agents / other teams, best projection first", () => {
  const players = {
    a: { full_name: "Dak Prescott", position: "QB", team: "DAL" },
    b: { full_name: "Jalen Coker", position: "WR", team: "CAR", injury_status: "Questionable" },
    c: { full_name: "CeeDee Lamb", position: "WR", team: "DAL" },
    d: { full_name: "Some Backup", position: "WR", team: "CAR" },
  };
  const own = new Map([
    ["a", { rosterId: 1, teamName: "Me", mine: true }],
    ["c", { rosterId: 2, teamName: "Mike's team", mine: false }],
  ]);
  const groups = groupFollowing(["a", "b", "c", "d"], players, own, { a: 19.2, b: 9.8, c: 20.5, d: null });
  assert.deepEqual(groups.map(g => g.key), ["mine", "free", "others"]);
  assert.deepEqual(groups[1].players.map(p => p.id), ["b", "d"]);
  assert.equal(groups[1].players[0].injury, "Q");
  assert.equal(groups[2].players[0].owner?.teamName, "Mike's team");
  // Position filter drops empty groups
  assert.deepEqual(groupFollowing(["a", "b", "c"], players, own, {}, "QB").map(g => g.key), ["mine"]);
  // No league open: one list
  assert.deepEqual(groupFollowing(["a", "c"], players, null, { a: 1, c: 2 }).map(g => g.players.map(p => p.id)), [["c", "a"]]);
  assert.equal(injuryTag("Injured Reserve"), "IR");
  assert.equal(injuryTag("ACTIVE"), "");
});
