import { test } from "node:test";
import assert from "node:assert/strict";
import { countSpots, rosterSignature, samePlayers } from "../app/services/rosterSpots";
import { pruneResolved, notificationsFromState } from "../app/services/notifications";
import { withPlayerDetails } from "../app/services/sleeperAPI";
import { norm, pickTeamNews, teamNewsScore } from "../app/services/teamNews";

// Goongent's settings: 10 starters + 6 bench spots + 3 IR spots.
const GOONGENT = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "FLEX", "K", "DEF", "BN", "BN", "BN", "BN", "BN", "BN", "IR", "IR", "IR"];
const starters = ["11560", "9221", "12490", "8137", "10232", "8130", "11834", "8132", "11786", "NE"];
const bench = ["b1", "b2", "b3", "b4", "b5", "b6"];

test("a full roster (16 active + 1 on IR) has no open spots", () => {
  const spots = countSpots({ rosterPositions: GOONGENT, players: [...starters, ...bench, "12489"], starters, reserve: ["12489"] });
  assert.deepEqual(spots, { size: 16, active: 16, open: 0, emptyStarters: 0, openBench: 0, benchSpots: 6 });
});

test("the old bug: a fresh matchup with the new player + a stale roster without him looked like an empty spot", () => {
  // Allgeier (8132) was just added and is starting at FLEX. The stale roster's players list
  // doesn't have him yet; counting from it with the fresh starters made one bench spot "open".
  const staleRosterPlayers = [...starters.filter(id => id !== "8132"), ...bench, "12489"];
  assert.equal(samePlayers(staleRosterPlayers, [...starters, ...bench, "12489"]), false); // -> refetch
  const fromMatchup = countSpots({ rosterPositions: GOONGENT, players: [...starters, ...bench, "12489"], starters, reserve: ["12489"] });
  assert.equal(fromMatchup.openBench, 0);
});

test("open spots after a drop, and empty starting spots", () => {
  const dropped = countSpots({ rosterPositions: GOONGENT, players: [...starters, ...bench.slice(1)], starters });
  assert.equal(dropped.open, 1);
  assert.equal(dropped.openBench, 1);
  const emptyStarter = countSpots({ rosterPositions: GOONGENT, players: [...starters.slice(1), ...bench], starters: ["0", ...starters.slice(1)] });
  assert.equal(emptyStarter.emptyStarters, 1);
  assert.equal(emptyStarter.openBench, 0);
  assert.equal(emptyStarter.open, 1);
});

test("roster signature changes on adds, drops, trades and lineup moves", () => {
  const before = rosterSignature([{ roster_id: 2, players: ["a", "b"], starters: ["a"] }]);
  assert.equal(before, rosterSignature([{ roster_id: 2, players: ["b", "a"], starters: ["a"] }])); // order doesn't matter
  assert.notEqual(before, rosterSignature([{ roster_id: 2, players: ["a", "b", "c"], starters: ["a"] }]));
  assert.notEqual(before, rosterSignature([{ roster_id: 2, players: ["a", "b"], starters: ["b"] }]));
});

test("the open-spot notification goes away once the roster is full", () => {
  const list = notificationsFromState({ leagueId: "G", leagueName: "Goongent", week: 9, openSpots: { open: 1, used: 15, needs: [] }, now: "2026-11-05T12:00:00Z" });
  assert.equal(list.length, 1);
  assert.equal(pruneResolved(list, "G", { openSpots: 0 }).length, 0);
  assert.equal(pruneResolved(list, "G", { openSpots: 1 }).length, 1);
  assert.equal(pruneResolved(list, "OTHER", { openSpots: 0 }).length, 1);
  assert.equal(pruneResolved(list, "G", { openSpots: null }).length, 1); // unknown: keep
});

test("live trending rows get names, positions and teams from the player file", () => {
  const rows = withPlayerDetails([{ player_id: "11625", count: 1214168 }, { player_id: "DET", count: 632880 }], {
    "11625": { full_name: "Adonai Mitchell", position_for_FFHelper: "WR", team: "NYJ", count: 5 },
  });
  assert.equal(rows[0].full_name, "Adonai Mitchell");
  assert.equal(rows[0].count, 1214168); // Sleeper's live count wins
  assert.equal(rows[1].player_id, "DET");
});

test("team news: about 10 stories, most relevant to the player first", () => {
  const now = Date.parse("2026-11-05T12:00:00Z");
  const day = (d: number) => new Date(now - d * 86_400_000).toISOString().slice(0, 10);
  const teammates = new Map([
    [norm("Kyler Murray"), { name: "Kyler Murray", position: "QB", depthOrder: 1 }],
    [norm("Trey Benson"), { name: "Trey Benson", position: "RB", depthOrder: 2 }],
    [norm("Some Lineman"), { name: "Some Lineman", position: "OT", depthOrder: 2 }],
    [norm("Backup Safety"), { name: "Backup Safety", position: "S", depthOrder: 3 }],
  ]);
  const opts = { playerName: "Tyler Allgeier", position: "RB", teammates, now };
  const articles = [
    { title: "Backup safety recap", player: "Backup Safety", category: "general", impact: "neutral", published: day(1) },
    { title: "Kyler Murray (ankle) ruled out", player: "Kyler Murray", category: "injury", impact: "negative", published: day(1) },
    { title: "Trey Benson injury opens door for Tyler Allgeier", player: "Trey Benson", category: "injury", impact: "negative", published: day(2) },
    { title: "Old Kyler Murray fantasy take", player: "Kyler Murray", category: "fantasy_advice", impact: "neutral", published: day(30) },
    ...Array.from({ length: 12 }, (_, i) => ({ title: `Lineman note ${i} about blocking drills number ${i}`, player: "Some Lineman", category: "general", impact: "neutral", published: day(4) })),
  ];
  assert.ok(teamNewsScore(articles[2], opts) > teamNewsScore(articles[0], opts));
  const picked = pickTeamNews(articles, opts, 10);
  assert.ok(picked.length <= 10);
  assert.equal(picked[0].title, "Trey Benson injury opens door for Tyler Allgeier"); // names him + his RB room
  assert.equal(picked[1].title, "Kyler Murray (ankle) ruled out"); // his QB, big news
  assert.ok(picked.filter(a => a.player === "Some Lineman").length <= 2, "at most 2 per teammate");
});
