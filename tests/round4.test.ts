import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLeagueId, pickStartingLeague, LEAGUE_ID_STEPS } from "../app/services/leagueInput";
import { slotsFor, sharedSlots, swapOptions, describeSlots, startSitQuestion } from "../app/services/startSit";
import { getLineupAlerts } from "../app/services/lineupAlerts";
import { mergeNotifications, notificationsFromState, MAX_NOTIFICATIONS } from "../app/services/notifications";
import { oddsPercents, summarizePositions } from "../app/services/liveMatchup";
import { applyImages, type LeagueNewsFeed } from "../app/services/leagueNews";
import { irStatusWord } from "../app/services/irAdvice";

test("league IDs are read from a bare number or any Sleeper link", () => {
  assert.equal(parseLeagueId("1262118513326182400"), "1262118513326182400");
  assert.equal(parseLeagueId("  1262118513326182400 "), "1262118513326182400");
  assert.equal(parseLeagueId("https://sleeper.com/leagues/1262118513326182400/team"), "1262118513326182400");
  assert.equal(parseLeagueId("sleeper.com/leagues/1262118513326182400/matchup"), "1262118513326182400");
  assert.equal(parseLeagueId("https://sleeper.app/leagues/1262118513326182400"), "1262118513326182400");
  assert.equal(parseLeagueId("my league"), null);
  assert.equal(parseLeagueId("123"), null);
  assert.equal(parseLeagueId(""), null);
  assert.match(LEAGUE_ID_STEPS.join(" "), /sleeper\.com\/leagues\//);
});

test("the last league you used is reopened when it still exists", () => {
  assert.equal(pickStartingLeague(["a", "b"], null, "b", "a"), "b");
  assert.equal(pickStartingLeague(["a", "b"], null, "gone", "a"), "a");
  assert.equal(pickStartingLeague(["a", "b"], null, null, null), "a");
  assert.equal(pickStartingLeague([], "a"), null);
});

const SLOTS = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF", "BN", "BN", "IR"];
test("start/sit picker only offers players who can take the spot", () => {
  assert.deepEqual(slotsFor("RB", SLOTS), ["RB", "FLEX"]);
  assert.deepEqual(slotsFor("QB", SLOTS), ["QB"]);
  assert.deepEqual(sharedSlots("RB", "WR", SLOTS), ["FLEX"]);
  assert.deepEqual(sharedSlots("QB", "RB", SLOTS), []);
  assert.deepEqual(sharedSlots("QB", "RB", [...SLOTS, "SUPER_FLEX"]), ["SUPER_FLEX"]);
  assert.deepEqual(sharedSlots("WR", "TE", ["WR", "TE", "REC_FLEX"]), ["REC_FLEX"]);
  assert.deepEqual(slotsFor("RB", null), ["RB", "FLEX"]); // default lineup when unknown

  const roster = [
    { playerId: "1", position: "QB" }, { playerId: "2", position: "QB" },
    { playerId: "3", position: "RB" }, { playerId: "4", position: "WR" }, { playerId: "5", position: "K" },
  ];
  const qb = swapOptions(roster[0], roster, SLOTS);
  assert.deepEqual(qb.eligible.map(o => o.player.playerId), ["2"]);
  assert.deepEqual(qb.ineligible.map(p => p.playerId), ["3", "4", "5"]);
  const rb = swapOptions(roster[2], roster, SLOTS);
  assert.deepEqual(rb.eligible.map(o => [o.player.playerId, o.slots]), [["4", ["FLEX"]]]);
  const k = swapOptions(roster[4], roster, SLOTS);
  assert.equal(k.eligible.length, 0);
  assert.equal(describeSlots("RB", SLOTS), "RB or FLEX (RB/WR/TE)");
  assert.equal(startSitQuestion("A", "B"), "Should I start A or B this week?");
});

const players = {
  "1": { full_name: "Drake London", team: "ATL", injury_status: "Questionable", injury_body_part: "Hip" },
  "2": { full_name: "Bijan Robinson", team: "ATL", injury_status: "Out", injury_body_part: "Ankle" },
  "3": { full_name: "Josh Allen", team: "BUF", injury_status: null },
};

test("lineup alerts: before kickoff vs after his game started", () => {
  const before = getLineupAlerts({ starterIds: ["1"], playersById: players, teamsPlaying: null, week: 8, gameStates: { "1": "pre" } });
  assert.equal(before[0].kind, "questionable");
  assert.match(before[0].message, /Drake London \(Hip\) is questionable — check before kickoff/);

  const during = getLineupAlerts({ starterIds: ["1"], playersById: players, teamsPlaying: null, week: 8, gameStates: { "1": "in" } });
  assert.equal(during[0].kind, "hurt_in_game");
  assert.equal(during[0].locked, true);
  assert.doesNotMatch(during[0].message, /kickoff/);
  assert.match(during[0].message, /questionable to return/);

  // Out after scoring points = hurt during the game; Out with no points = never played.
  const after = getLineupAlerts({ starterIds: ["2"], playersById: players, teamsPlaying: null, week: 8, gameStates: { "2": "post" }, pointsById: { "2": 4.5 } });
  assert.match(after[0].message, /got hurt in his game \(out\)/);
  const never = getLineupAlerts({ starterIds: ["2"], playersById: players, teamsPlaying: null, week: 8, gameStates: { "2": "post" } });
  assert.equal(never[0].kind, "out");
  assert.equal(never[0].locked, true);
  assert.match(never[0].message, /isn't playing, but he was left in your lineup/);
  const ir = getLineupAlerts({
    starterIds: ["9"], playersById: { "9": { full_name: "On IR", team: "DET", injury_status: "IR" } }, teamsPlaying: null, week: 8,
    gameStates: { "9": "post" }, pointsById: { "9": 0 },
  });
  assert.match(ir[0].message, /on injured reserve and isn't playing/);

  // Healthy player whose game started: nothing to say. Bye from game state.
  assert.deepEqual(getLineupAlerts({ starterIds: ["3"], playersById: players, teamsPlaying: null, week: 8, gameStates: { "3": "in" } }), []);
  assert.equal(getLineupAlerts({ starterIds: ["3"], playersById: players, teamsPlaying: null, week: 8, gameStates: { "3": "bye" } })[0].kind, "bye");
});

test("notifications: one per problem, never repeated", () => {
  const alerts = getLineupAlerts({ starterIds: ["1", "0"], rosterPositions: ["WR", "FLEX"], playersById: players, teamsPlaying: null, week: 8 });
  const first = notificationsFromState({
    leagueId: "L", leagueName: "My League", week: 8, alerts,
    irMoves: [{ id: "9", name: "Hurt Guy", status: "IR" }], newTradeIdeas: 2, tradeScanAt: "2026-11-01T00:00:00Z",
    board: { week: 8, isFinal: true, me: { teamName: "Me", points: 101.5 }, opponent: { teamName: "You", points: 99.25 } },
    now: "2026-11-02T00:00:00Z",
  });
  assert.deepEqual(first.map(n => n.kind).sort(), ["ir", "lineup", "lineup", "result", "trade"]);
  assert.ok(first.find(n => n.kind === "result")!.body.includes("You won 101.50 to 99.25"));
  assert.equal(first.find(n => n.kind === "trade")!.target, "Trades");

  const a = mergeNotifications([], first);
  assert.equal(a.added.length, 5);
  const b = mergeNotifications(a.list, first);
  assert.equal(b.added.length, 0);
  // Questionable -> Out for the same player is new.
  const worse = notificationsFromState({ leagueId: "L", leagueName: "", week: 8, alerts: [{ kind: "out", playerId: "1", slot: "WR", message: "out" }] });
  assert.equal(mergeNotifications(b.list, worse).added.length, 1);
  const many = Array.from({ length: 80 }, (_, i) => ({ ...first[0], id: `x${i}`, createdAt: `2026-11-0${1 + (i % 9)}T00:00:00Z` }));
  assert.equal(mergeNotifications([], many).list.length, MAX_NOTIFICATIONS);
});

test("win odds and yet-to-play summaries", () => {
  assert.deepEqual(oddsPercents(0.495), [50, 50]);
  assert.deepEqual(oddsPercents(0.734), [73, 27]);
  assert.equal(summarizePositions(["WR", "QB", "WR", "DEF", "RB"]), "QB, RB, 2 WR, DEF");
  assert.equal(summarizePositions([]), "");
});

test("news cards get images filled in by link", () => {
  const article = (id: string, image: string | null) => ({
    id, headline: id, description: "", published: "", image, link: `https://x/${id}`, category: "other" as const, label: "", players: [],
  });
  const feed: LeagueNewsFeed = { top: [article("a", null)], pool: [article("a", null), article("b", "keep.jpg")], updatedAt: null, source: "espn" };
  const filled = applyImages(feed, { "https://x/a": "new.jpg", "https://x/b": "other.jpg" });
  assert.equal(filled.top[0].image, "new.jpg");
  assert.equal(filled.pool[1].image, "keep.jpg");
});

test("IR status words", () => {
  assert.equal(irStatusWord("IR"), "on IR");
  assert.equal(irStatusWord("Out"), "out");
  assert.equal(irStatusWord("NA"), "not active");
});
