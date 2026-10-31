import { test } from "node:test";
import assert from "node:assert/strict";
import { getLineupAlerts } from "../app/services/lineupAlerts";
import { buildTradeMessage, tradeSteps, sleeperLeagueUrl, type TradeIdea } from "../app/services/tradeFormat";
import { countUnseen, isScanStale } from "../app/services/tradeFormat";

const players = {
  "1": { full_name: "Josh Allen", team: "BUF", injury_status: null },
  "2": { full_name: "Saquon Barkley", team: "PHI", injury_status: "Questionable" },
  "3": { full_name: "CeeDee Lamb", team: "DAL", injury_status: "Out" },
  "4": { full_name: "Travis Kelce", team: "KC", injury_status: null },
  "5": { full_name: "Mark Andrews", team: "BAL", injury_status: "IR" },
  "6": { full_name: "Bijan Robinson", team: "ATL", injury_status: "Doubtful" },
};

test("lineup alerts flag empty slots, injuries and byes, most severe first", () => {
  const alerts = getLineupAlerts({
    starterIds: ["1", "2", "3", "4", "0", "6"],
    rosterPositions: ["QB", "RB", "WR", "TE", "FLEX", "RB", "BN"],
    playersById: players,
    teamsPlaying: new Set(["BUF", "PHI", "DAL", "ATL"]), // KC on bye
    week: 9,
  });
  assert.deepEqual(alerts.map(a => a.kind), ["empty", "out", "bye", "doubtful", "questionable"]);
  assert.equal(alerts[0].slot, "FLEX");
  assert.match(alerts[2].message, /Travis Kelce \(KC\) is on bye in week 9/);
});

test("no bye alerts when the schedule is unknown, and healthy lineups have no alerts", () => {
  const alerts = getLineupAlerts({ starterIds: ["1", "4"], playersById: players, teamsPlaying: null, week: 9 });
  assert.deepEqual(alerts, []);
  const ir = getLineupAlerts({ starterIds: ["5"], playersById: players, teamsPlaying: null, week: 9 });
  assert.equal(ir[0].kind, "out");
});

const idea: TradeIdea = {
  id: "2:a>b",
  partner: { rosterId: 2, ownerId: "o2", teamName: "Team Two" },
  give: [{ id: "a", name: "Blake Corum", position: "RB", value: 12 }],
  get: [{ id: "b", name: "George Pickens", position: "WR", value: 16 }],
  myGain: 3.7,
  theirGain: 2.05,
  fairness: 0.77,
  reasons: [],
};

test("trade message and steps describe the trade for Sleeper", () => {
  assert.equal(
    buildTradeMessage(idea),
    "Trade offer for Team Two: my Blake Corum (RB) for your George Pickens (WR). By my numbers it makes your starting lineup about 2.1 pts/week better. Interested?"
  );
  assert.match(tradeSteps(idea)[1], /George Pickens/);
  assert.equal(sleeperLeagueUrl("123"), "https://sleeper.com/leagues/123");
});

test("trade agent counts unseen ideas and rescans after 6 hours", () => {
  assert.equal(countUnseen([idea, { ...idea, id: "x" }], ["2:a>b"]), 1);
  const now = Date.parse("2026-10-31T12:00:00Z");
  assert.equal(isScanStale(null, now), true);
  assert.equal(isScanStale({ generatedAt: "2026-10-31T07:00:00Z", leagueId: "1", rosterId: 1, ideas: [] }, now), false);
  assert.equal(isScanStale({ generatedAt: "2026-10-31T05:00:00Z", leagueId: "1", rosterId: 1, ideas: [] }, now), true);
});
