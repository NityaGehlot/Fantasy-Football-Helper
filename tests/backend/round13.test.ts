import { test } from "node:test";
import assert from "node:assert/strict";
import { projectionFor } from "../../app/backend/services/liveMatchup";
import { parsePlayerNews, resolveEspnId } from "../../app/backend/services/playerNotes";

test("projections use the league's own scoring, like Sleeper's app", () => {
  // A kicker: Sleeper's generic PPR total vs a league that scores kicks differently.
  const kicker = { fgm_0_19: 0.05, fgm_20_29: 0.5, fgm_30_39: 0.6, fgm_40_49: 0.45, fgm_50p: 0.25, xpm: 2.3, fgmiss: 0.3, pts_ppr: 8.57 };
  const leagueScoring = { fgm_0_19: 3, fgm_20_29: 3, fgm_30_39: 3, fgm_40_49: 4, fgm_50p: 5, xpm: 1, fgmiss: -1, rec: 1 };
  assert.equal(projectionFor(kicker, leagueScoring), 8.5); // 0.15+1.5+1.8+1.8+1.25+2.3-0.3
  assert.equal(projectionFor(kicker, 1), 8.57); // just points per catch: Sleeper's PPR total
  // A QB with a 40+ yard TD bonus.
  const qb = { pass_yd: 250, pass_td: 1.8, pass_int: 0.6, pass_td_40p: 0.3, rush_yd: 20, pts_ppr: 18.6 };
  assert.equal(projectionFor(qb, { pass_yd: 0.04, pass_td: 4, pass_int: -1, pass_td_40p: 2, rush_yd: 0.1, rec: 1 }), 19.2);
  // No projection from Sleeper: null (the lineup check counts it as 0).
  assert.equal(projectionFor(undefined, leagueScoring), null);
});

test("latest analysis: RotoWire notes and ESPN columns that mention him", () => {
  const feed = {
    feed: [
      { type: "Rotowire", headline: "Allgeier is slated to work as Arizona's No. 1 running back.", story: "<p>After previously leading the backfield...</p>", published: "2026-11-04T10:00:00Z" },
      { type: "Story", headline: "Rest-of-season rankings", description: "Big movers", story: "<p>Tyler Allgeier jumps up</p>", published: "2026-11-03T10:00:00Z", byline: "Eric Karabell", links: { web: { href: "https://espn.com/x" } } },
      { type: "Story", headline: "Unrelated column", description: "About someone else", story: "<p>Nothing here</p>", published: "2026-11-05T10:00:00Z" },
      { type: "Rotowire", headline: "Premium note", story: "x", published: "2026-11-06T10:00:00Z", premium: true },
    ],
  };
  const notes = parsePlayerNews(feed, "Tyler Allgeier");
  assert.deepEqual(notes.map(n => n.kind), ["note", "article"]);
  assert.equal(notes[0].analysis, "After previously leading the backfield...");
  assert.equal(notes[0].source, "RotoWire");
  assert.equal(notes[1].source, "ESPN · Eric Karabell");
  assert.equal(notes[1].link, "https://espn.com/x");
});

test("players are matched to ESPN by id, or by name + team", () => {
  const index = new Map([["tyler allgeier|ARI", "4373626"], ["tyler allgeier", "4373626"], ["jayden daniels|WAS", "4426348"]]);
  assert.equal(resolveEspnId(index, { espnId: "999", name: "Anyone" }), "999");
  assert.equal(resolveEspnId(index, { name: "Tyler Allgeier", team: "ARI" }), "4373626");
  assert.equal(resolveEspnId(index, { name: "Jayden Daniels", team: "WSH" }), "4426348"); // ESPN's WSH = Sleeper's WAS
  assert.equal(resolveEspnId(index, { name: "Nobody Known", team: "KC" }), null);
});

test("following: grouped by position (best projection first), by team, or A-Z", () => {
  const { groupFollowed, opponentsFromProjections, rosterToFollow } = require("../../app/services/following");
  const ps = [
    { id: "1", name: "Bijan Robinson", position: "RB", team: "ATL", projection: 18 },
    { id: "2", name: "Josh Allen", position: "QB", team: "BUF", projection: 22 },
    { id: "3", name: "Kyren Williams", position: "RB", team: "LAR", projection: 15 },
    { id: "4", name: "Drake London", position: "WR", team: "ATL", projection: null },
  ];
  assert.deepEqual(groupFollowed(ps, "position").map((s: any) => s.title), ["QB", "RB", "WR"]);
  assert.deepEqual(groupFollowed(ps, "position")[1].players.map((p: any) => p.id), ["1", "3"]);
  assert.deepEqual(groupFollowed(ps, "team")[0].players.map((p: any) => p.id), ["1", "4"]); // ATL: RB before WR
  assert.deepEqual(groupFollowed(ps, "name")[0].players.map((p: any) => p.name)[0], "Bijan Robinson");
  assert.equal(opponentsFromProjections({ a: { team: "atl", opp: "no" } }).get("ATL"), "NO");
  assert.deepEqual(rosterToFollow(["1", "5", "5", "0"], ["1"]), ["5"]);
});
