import { test } from "node:test";
import assert from "node:assert/strict";
import { gamesSummary, playedInWeek } from "../app/services/gamesPlayed";
import { historyEntriesFor, injuryForWeek } from "../app/services/injuryFormat";
import { proposalMessage, askAboutProposal } from "../app/services/tradeGrader";

test("a week he missed with an injury isn't a game, even though his team played", () => {
  const weeks = [
    { num: 1, data: { game_played: true, receptions: 5, team_status: "played" } },
    { num: 2, data: { team_status: "played", injury_status: "Out", primary_injury: "Ankle" } }, // out
    { num: 3, data: { team_status: "played", snap_count: 0, injury_status: "Questionable" } }, // inactive
    { num: 4, data: { team_status: "bye" } },
    { num: 5, data: { team_status: "played", snap_count: 12 } }, // played, no stats
    { num: 6, data: { team_status: "played", receiving_yards: 40 } },
  ];
  assert.deepEqual(gamesSummary(weeks), { played: 3, missed: 2 });
  assert.equal(playedInWeek(weeks[1].data), false);
  assert.equal(playedInWeek(weeks[4].data), true);
  // A team defense plays whenever its team plays.
  assert.equal(playedInWeek({ team_status: "played" }, { teamDefense: true }), true);
});

test("past-week injury history matches by Sleeper id, gsis id or name + team", () => {
  const history: any = {
    "12490": [{ date: "2026-10-01", day: "Wed", practice_status: "DNP" }],
    "00-0039999": [{ date: "2024-10-04", day: "Fri", practice_status: "LP", game_status: "QUESTIONABLE", injury: "Hamstring", name: "Puka Nacua", team: "LA" }],
    "00-0031111": [{ date: "2024-10-04", day: "Fri", game_status: "OUT", name: "Mike Williams", team: "NYJ" }],
  };
  assert.equal(historyEntriesFor(history, { player_id: "12490" })?.[0].practice_status, "DNP");
  assert.equal(historyEntriesFor(history, { player_id: "x", gsis_id: "00-0039999" })?.[0].injury, "Hamstring");
  assert.equal(historyEntriesFor(history, { player_id: "y", full_name: "Mike Williams", team: "NYJ" })?.[0].game_status, "OUT");
  assert.equal(historyEntriesFor(history, { player_id: "z", full_name: "Nobody Here" }), null);

  const file: any = { generated_at: "", season: 2026, week: 9, players: [] };
  const wk = injuryForWeek({ file, history, player: { player_id: "p", gsis_id: "00-0039999" }, season: 2024, week: 5 });
  assert.equal(wk.status, "QUESTIONABLE");
  assert.equal(wk.injury, "Hamstring");
});

test("trade proposal message and AI question", () => {
  const idea: any = { give: [{ name: "A" }], get: [{ name: "B" }, { name: "C" }], myGain: 2, theirGain: 1.2 };
  assert.equal(proposalMessage("Team 2", idea), "Hey Team 2, would you do my A for your B and C? By my numbers it makes your starting lineup about 1.2 points a week better. Let me know!");
  assert.match(askAboutProposal("Team 2", ["A"], ["B"]), /Should I send it as is, or change it/);
});
