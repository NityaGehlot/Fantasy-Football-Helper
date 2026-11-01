import { test } from "node:test";
import assert from "node:assert/strict";
import { getLineupAlerts } from "../app/services/lineupAlerts";
import { buildTradeMessage, tradeSteps, sleeperLeagueUrl, summarizeIdea, type TradeIdea } from "../app/services/tradeFormat";
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
  myLineup: [{ in: { id: "b", name: "George Pickens", position: "WR", value: 16 }, out: { id: "a", name: "Blake Corum", position: "RB", value: 12.26 } }],
  theirLineup: [{ in: { id: "a", name: "Blake Corum", position: "RB", value: 12.26 }, out: { id: "j", name: "Jeremiyah Love", position: "RB", value: 10.2 } }],
};

test("trade message pitches what the other team gains", () => {
  const msg = buildTradeMessage(idea);
  assert.match(msg, /^Hey! Trade idea: my Blake Corum for your George Pickens\./);
  assert.match(msg, /Blake Corum would start for you over Jeremiyah Love \(12\.3 vs 10\.2 pts\/game\)/);
  assert.match(msg, /about 2\.1 points a week better/);
  assert.match(msg, /shore up WR/);
  // Older saved scans without lineup details still produce a sensible message
  assert.match(buildTradeMessage({ ...idea, myLineup: undefined, theirLineup: undefined }), /adds depth/);
});

test("card summary and Sleeper steps", () => {
  assert.equal(
    summarizeIdea(idea),
    "George Pickens replaces Blake Corum in your lineup (+3.7 pts/week), and Team Two starts Blake Corum over Jeremiyah Love."
  );
  const steps = tradeSteps(idea);
  assert.ok(steps.some(s => s.includes('"Propose Trade"')));
  assert.ok(steps.some(s => /direct message/.test(s)));
  assert.ok(!steps.some(s => /drop/.test(s)), "1-for-1 needs no drop step");
  assert.ok(tradeSteps({ ...idea, give: [...idea.give, idea.give[0]] }).some(s => /dropped/.test(s)));
  assert.equal(sleeperLeagueUrl("123"), "https://sleeper.com/leagues/123");
});

test("trade agent counts unseen ideas and rescans after 6 hours", () => {
  assert.equal(countUnseen([idea, { ...idea, id: "x" }], ["2:a>b"]), 1);
  const now = Date.parse("2026-10-31T12:00:00Z");
  assert.equal(isScanStale(null, now), true);
  assert.equal(isScanStale({ generatedAt: "2026-10-31T07:00:00Z", leagueId: "1", rosterId: 1, ideas: [] }, now), false);
  assert.equal(isScanStale({ generatedAt: "2026-10-31T05:00:00Z", leagueId: "1", rosterId: 1, ideas: [] }, now), true);
  // Changing untouchable players forces a fresh scan
  const fresh = { generatedAt: "2026-10-31T11:00:00Z", leagueId: "1", rosterId: 1, ideas: [], untouchableKey: "5,9" };
  assert.equal(isScanStale(fresh, now, ["9", "5"]), false);
  assert.equal(isScanStale(fresh, now, ["5"]), true);
});
