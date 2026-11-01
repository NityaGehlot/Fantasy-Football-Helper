import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildLiveSide, formatStatLine, fractionRemaining, normalCdf, projectionFor, winProbability,
} from "../../app/backend/services/liveMatchup";
import { parseScoreboardEvent, type GameState } from "../../app/backend/services/schedule";

const game = (over: Partial<GameState>): GameState => ({
  team: "KC", opponent: "BUF", homeAway: "home", state: "in", period: 1, clock: "15:00",
  detail: "", kickoff: null, teamScore: 0, opponentScore: 0, ...over,
});

test("fraction of game remaining follows the clock", () => {
  assert.equal(fractionRemaining(game({ state: "pre" })), 1);
  assert.equal(fractionRemaining(game({ state: "post" })), 0);
  assert.equal(fractionRemaining(undefined), 0); // bye
  assert.equal(fractionRemaining(game({ period: 1, clock: "15:00" })), 1);
  assert.equal(fractionRemaining(game({ period: 2, clock: "0:00" })), 0.5); // halftime
  assert.equal(fractionRemaining(game({ period: 4, clock: "7:30" })), 0.125);
  assert.equal(fractionRemaining(game({ period: 5, clock: "8:00" })), 0.02); // OT
});

test("projection matches league reception scoring", () => {
  const s = { pts_ppr: 15, pts_half_ppr: 12.5, pts_std: 10 };
  assert.equal(projectionFor(s, 1), 15);
  assert.equal(projectionFor(s, 0.5), 12.5);
  assert.equal(projectionFor(s, 0), 10);
  assert.equal(projectionFor(null, 1), null);
});

test("normal CDF and win probability behave sensibly", () => {
  assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-6);
  assert.ok(Math.abs(normalCdf(1.96) - 0.975) < 1e-3);
  assert.equal(winProbability({ projectedFinal: 100, stdDev: 10 }, { projectedFinal: 100, stdDev: 10 }), 0.5);
  const favored = winProbability({ projectedFinal: 110, stdDev: 10 }, { projectedFinal: 100, stdDev: 10 });
  assert.ok(favored > 0.7 && favored < 0.8);
  assert.equal(winProbability({ projectedFinal: 101, stdDev: 0 }, { projectedFinal: 100, stdDev: 0 }), 1);
  assert.equal(winProbability({ projectedFinal: 99, stdDev: 0 }, { projectedFinal: 100, stdDev: 0 }), 0);
});

test("stat lines read naturally per position", () => {
  assert.equal(formatStatLine("QB", { pass_cmp: 18, pass_att: 27, pass_yd: 241, pass_td: 2, rush_yd: 12 }), "18/27, 241 YD, 2 TD, 12 RUSH YD");
  assert.equal(formatStatLine("WR", { rec: 6, rec_tgt: 8, rec_yd: 84, rec_td: 1 }), "6/8 REC, 84 YD, 1 TD");
  assert.equal(formatStatLine("RB", {}), "");
});

test("live side combines current points with the remaining projection", () => {
  const games = new Map<string, GameState>([
    ["KC", game({ team: "KC", state: "in", period: 3, clock: "15:00", detail: "3rd 15:00" })], // half left
    ["BUF", game({ team: "BUF", state: "post", detail: "Final" })],
    ["DAL", game({ team: "DAL", state: "pre", detail: "Sun 4:25 PM" })],
  ]);
  const side = buildLiveSide({
    matchup: { roster_id: 1, starters: ["a", "b", "c", "0"], players_points: { a: 10, b: 20, c: 0 } },
    teamName: "Me",
    rosterPositions: ["QB", "RB", "WR", "FLEX"],
    players: {
      a: { full_name: "KC Guy", position: "QB", team: "KC" },
      b: { full_name: "BUF Guy", position: "RB", team: "BUF" },
      c: { full_name: "DAL Guy", position: "WR", team: "DAL" },
    },
    projections: { a: { pts_ppr: 20 }, c: { pts_ppr: 12 } },
    stats: { a: { pass_cmp: 10, pass_att: 15, pass_yd: 120 } },
    games,
    receptionPoints: 1,
    fallbackProjection: () => 9,
  });
  // points 30; remaining = 20*0.5 (a) + 9*0 (b, final, fallback proj) + 12*1 (c) = 22
  assert.equal(side.points, 30);
  assert.equal(side.projectedFinal, 52);
  assert.equal(side.playersInProgress, 1);
  assert.equal(side.playersYetToPlay, 1);
  assert.equal(side.starters[3].name, "Empty slot");
  assert.equal(side.starters[3].slot, "FLEX");
  assert.equal(side.starters[0].statLine, "10/15, 120 YD");
  assert.ok(side.stdDev > 0);
});

test("ESPN scoreboard events become per-team game states", () => {
  const states = parseScoreboardEvent({
    date: "2026-11-01T17:00Z",
    competitions: [{
      status: { period: 2, displayClock: "4:12", type: { state: "in", shortDetail: "4:12 - 2nd" } },
      competitors: [
        { homeAway: "home", score: "14", team: { abbreviation: "WSH" } },
        { homeAway: "away", score: "10", team: { abbreviation: "DAL" } },
      ],
    }],
  });
  assert.equal(states.length, 2);
  assert.equal(states[0].team, "WAS");
  assert.equal(states[0].opponent, "DAL");
  assert.equal(states[0].teamScore, 14);
  assert.equal(states[1].homeAway, "away");
  assert.equal(states[1].state, "in");
});

test("without the schedule, remaining points = projection minus points scored", () => {
  const side = buildLiveSide({
    matchup: { roster_id: 1, starters: ["a", "b"], players_points: { a: 15, b: 25 } },
    teamName: "Me", rosterPositions: ["WR", "WR"],
    players: { a: { full_name: "A", position: "WR", team: "KC" }, b: { full_name: "B", position: "WR", team: "BUF" } },
    projections: { a: { pts_ppr: 20 }, b: { pts_ppr: 20 } }, stats: {}, games: null,
    receptionPoints: 1, fallbackProjection: () => 0,
  });
  assert.equal(side.projectedFinal, 45); // 40 scored + 5 left for A + 0 left for B
});

test("every player gets a live projected final, bench included", () => {
  const games = new Map<string, GameState>([["KC", game({ team: "KC", state: "in", period: 3, clock: "15:00" })]]);
  const side = buildLiveSide({
    matchup: { roster_id: 1, starters: ["a"], players: ["a", "b"], players_points: { a: 10, b: 4 } },
    teamName: "Me", rosterPositions: ["QB"],
    players: { a: { full_name: "A", position: "QB", team: "KC" }, b: { full_name: "B", position: "WR", team: "KC" } },
    projections: { a: { pts_ppr: 20 }, b: { pts_ppr: 12 } }, stats: {}, games,
    receptionPoints: 1, fallbackProjection: () => 0,
  });
  assert.equal(side.starters[0].projectedFinal, 20); // 10 scored + 20 * half the game left
  assert.equal(side.bench.length, 1);
  assert.equal(side.bench[0].slot, "BN");
  assert.equal(side.bench[0].projectedFinal, 10); // 4 + 12 * 0.5
  assert.equal(side.points, 10, "bench points don't count toward the team");
});
